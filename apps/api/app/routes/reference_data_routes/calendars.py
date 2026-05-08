from __future__ import annotations

from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.http import (
    NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    VALIDATION_ERROR_STATUS_CODES,
    execute_http_action,
)
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.calendar_business_days import (
    add_business_days,
    business_days_between,
    evaluate_calendar_day,
    next_business_day,
    normalize_calendar_closure_type,
    normalize_calendar_observance_shift,
    normalize_calendar_rule_type,
    resolve_calendar_source_codes,
    validate_calendar_rule_configuration,
)
from apps.api.app.domains.reference_data.services.calendar_imports import (
    import_calendar_holidays_from_csv,
)
from apps.api.app.domains.reference_data.services.records import get_reference_record, normalize_code
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule
from apps.api.app.schemas.reference_data import (
    CalendarBusinessDayCountOut,
    CalendarBusinessDayDateOut,
    CalendarBusinessDayMatchOut,
    CalendarBusinessDayStatusOut,
    CalendarCreate,
    CalendarHolidayCreate,
    CalendarHolidayImportRequest,
    CalendarHolidayImportSummaryOut,
    CalendarHolidayOut,
    CalendarHolidayStatusUpdate,
    CalendarHolidayUpdate,
    CalendarOverlayCreate,
    CalendarOverlayOut,
    CalendarOverlayStatusUpdate,
    CalendarOverlayUpdate,
    CalendarOut,
    CalendarRuleCreate,
    CalendarRuleOut,
    CalendarRuleStatusUpdate,
    CalendarRuleUpdate,
    CalendarStatusUpdate,
    CalendarUpdate,
)

from .common import clean_optional_code, clean_optional_text, ensure_calendar_not_in_active_use
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _normalize_calendar_type(value: str) -> str:
    return value.strip().upper()


def _build_calendar_create_values(_db: Session, payload: CalendarCreate) -> dict[str, object]:
    return {
        "calendar_type": _normalize_calendar_type(payload.calendar_type),
        "market": clean_optional_text(payload.market),
        "timezone": clean_optional_text(payload.timezone),
    }


def _update_calendar_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "calendar_type" in provided_fields and payload.calendar_type is not None:
        record.calendar_type = _normalize_calendar_type(payload.calendar_type)
    if "market" in provided_fields:
        record.market = clean_optional_text(payload.market)
    if "timezone" in provided_fields:
        record.timezone = clean_optional_text(payload.timezone)


CALENDAR_SPEC = ReferenceDataCrudSpec(
    model=ReferenceCalendar,
    out_schema_cls=CalendarOut,
    duplicate_detail="Calendar already exists",
    build_create_extra_values=_build_calendar_create_values,
    update_extra_fields=_update_calendar_fields,
    validate_deactivate=ensure_calendar_not_in_active_use,
)


def _to_calendar_holiday_out(record: ReferenceCalendarHoliday) -> CalendarHolidayOut:
    return CalendarHolidayOut(
        calendar_code=record.calendar_code,
        holiday_date=record.holiday_date,
        name=record.name,
        closure_type=record.closure_type,
        is_provisional=record.is_provisional,
        description=record.description,
        is_active=record.is_active,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _get_calendar_holiday_record(
    db: Session,
    *,
    code: str,
    holiday_date: date,
) -> ReferenceCalendarHoliday:
    normalized_code = normalize_code(code)
    record = db.execute(
        select(ReferenceCalendarHoliday).where(
            ReferenceCalendarHoliday.calendar_code == normalized_code,
            ReferenceCalendarHoliday.holiday_date == holiday_date,
        )
    ).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar holiday not found")
    return record


def _to_calendar_rule_out(record: ReferenceCalendarRule) -> CalendarRuleOut:
    return CalendarRuleOut(
        id=record.id,
        calendar_code=record.calendar_code,
        name=record.name,
        rule_type=record.rule_type,
        closure_type=record.closure_type,
        month=record.month,
        day=record.day,
        weekday=record.weekday,
        occurrence=record.occurrence,
        offset_days=record.offset_days,
        observance_shift=record.observance_shift,
        is_provisional=record.is_provisional,
        description=record.description,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        is_active=record.is_active,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _to_calendar_overlay_out(record: ReferenceCalendarOverlay) -> CalendarOverlayOut:
    return CalendarOverlayOut(
        id=record.id,
        calendar_code=record.calendar_code,
        overlay_calendar_code=record.overlay_calendar_code,
        priority=record.priority,
        description=record.description,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        is_active=record.is_active,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _to_calendar_business_day_status_out(status_outcome) -> CalendarBusinessDayStatusOut:
    return CalendarBusinessDayStatusOut(
        calendar_code=status_outcome.calendar_code,
        evaluated_date=status_outcome.evaluated_date,
        is_business_day=status_outcome.is_business_day,
        closure_type=status_outcome.closure_type,
        source_calendar_codes=status_outcome.source_calendar_codes,
        matches=[
            CalendarBusinessDayMatchOut(
                calendar_code=match.calendar_code,
                source_kind=match.source_kind,
                source_key=match.source_key,
                name=match.name,
                closure_type=match.closure_type,
                is_provisional=match.is_provisional,
            )
            for match in status_outcome.matches
        ],
    )


def _get_calendar_rule_record(db: Session, *, code: str, rule_id: int) -> ReferenceCalendarRule:
    normalized_code = normalize_code(code)
    record = db.execute(
        select(ReferenceCalendarRule).where(
            ReferenceCalendarRule.calendar_code == normalized_code,
            ReferenceCalendarRule.id == rule_id,
        )
    ).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar rule not found")
    return record


def _get_calendar_overlay_record(db: Session, *, code: str, overlay_id: int) -> ReferenceCalendarOverlay:
    normalized_code = normalize_code(code)
    record = db.execute(
        select(ReferenceCalendarOverlay).where(
            ReferenceCalendarOverlay.calendar_code == normalized_code,
            ReferenceCalendarOverlay.id == overlay_id,
        )
    ).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar overlay not found")
    return record


def _validate_effective_window(effective_from: datetime | None, effective_to: datetime | None) -> None:
    if effective_from is not None and effective_to is not None and effective_from > effective_to:
        raise ValueError("effective_from must be on or before effective_to")


def _normalize_holiday_closure_type(value: str | None) -> str:
    return normalize_calendar_closure_type(value or "FULL_CLOSED")


def _calendar_rule_values_from_payload(payload, existing: ReferenceCalendarRule | None = None) -> dict[str, object]:
    provided_fields = payload.model_fields_set if existing is not None else set()
    name = (
        payload.name.strip()
        if existing is None or ("name" in provided_fields and payload.name is not None)
        else existing.name
    )
    rule_type = normalize_calendar_rule_type(
        payload.rule_type
        if existing is None or ("rule_type" in provided_fields and payload.rule_type is not None)
        else existing.rule_type
    )
    closure_type = normalize_calendar_closure_type(
        payload.closure_type
        if existing is None or ("closure_type" in provided_fields and payload.closure_type is not None)
        else existing.closure_type
    )
    month = payload.month if existing is None or "month" in provided_fields else existing.month
    day = payload.day if existing is None or "day" in provided_fields else existing.day
    weekday = payload.weekday if existing is None or "weekday" in provided_fields else existing.weekday
    occurrence = (
        payload.occurrence
        if existing is None or "occurrence" in provided_fields
        else existing.occurrence
    )
    offset_days = (
        payload.offset_days
        if existing is None or "offset_days" in provided_fields
        else existing.offset_days
    )
    observance_shift = normalize_calendar_observance_shift(
        payload.observance_shift
        if existing is None or "observance_shift" in provided_fields
        else existing.observance_shift
    )
    is_provisional = (
        payload.is_provisional
        if existing is None or "is_provisional" in provided_fields
        else existing.is_provisional
    )
    description = (
        clean_optional_text(payload.description)
        if existing is None or "description" in provided_fields
        else existing.description
    )
    effective_from = (
        payload.effective_from
        if existing is None or "effective_from" in provided_fields
        else existing.effective_from
    )
    effective_to = (
        payload.effective_to
        if existing is None or "effective_to" in provided_fields
        else existing.effective_to
    )

    _validate_effective_window(effective_from, effective_to)
    validate_calendar_rule_configuration(
        rule_type=rule_type,
        closure_type=closure_type,
        month=month,
        day=day,
        weekday=weekday,
        occurrence=occurrence,
        offset_days=offset_days,
        observance_shift=observance_shift,
    )
    return {
        "name": name,
        "rule_type": rule_type,
        "closure_type": closure_type,
        "month": month,
        "day": day,
        "weekday": weekday,
        "occurrence": occurrence,
        "offset_days": offset_days,
        "observance_shift": observance_shift,
        "is_provisional": bool(is_provisional),
        "description": description,
        "effective_from": effective_from,
        "effective_to": effective_to,
    }


def _calendar_rule_duplicate_key(values: dict[str, object]) -> tuple[object, ...]:
    return (
        values["name"],
        values["rule_type"],
        values["closure_type"],
        values["month"],
        values["day"],
        values["weekday"],
        values["occurrence"],
        values["offset_days"],
        values["observance_shift"],
    )


def _ensure_calendar_rule_is_unique(
    db: Session,
    *,
    calendar_code: str,
    values: dict[str, object],
    ignore_rule_id: int | None = None,
) -> None:
    existing_rules = db.execute(
        select(ReferenceCalendarRule).where(ReferenceCalendarRule.calendar_code == calendar_code)
    ).scalars().all()
    candidate_key = _calendar_rule_duplicate_key(values)
    for existing_rule in existing_rules:
        if ignore_rule_id is not None and existing_rule.id == ignore_rule_id:
            continue
        existing_key = _calendar_rule_duplicate_key(
            {
                "name": existing_rule.name,
                "rule_type": existing_rule.rule_type,
                "closure_type": existing_rule.closure_type,
                "month": existing_rule.month,
                "day": existing_rule.day,
                "weekday": existing_rule.weekday,
                "occurrence": existing_rule.occurrence,
                "offset_days": existing_rule.offset_days,
                "observance_shift": existing_rule.observance_shift,
            }
        )
        if existing_key == candidate_key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Calendar rule already exists",
            )


def _normalize_overlay_calendar_code(value: str | None) -> str:
    cleaned = clean_optional_code(value)
    if cleaned is None:
        raise ValueError("overlay_calendar_code is required")
    return cleaned


def _ensure_overlay_edge_is_valid(
    db: Session,
    *,
    calendar_code: str,
    overlay_calendar_code: str,
    ignore_overlay_id: int | None = None,
) -> None:
    if calendar_code == overlay_calendar_code:
        raise ValueError("Calendar cannot overlay itself")
    get_reference_record(db, ReferenceCalendar, overlay_calendar_code)

    existing_pairs = db.execute(select(ReferenceCalendarOverlay)).scalars().all()
    for overlay_row in existing_pairs:
        if ignore_overlay_id is not None and overlay_row.id == ignore_overlay_id:
            continue
        if (
            overlay_row.calendar_code == calendar_code
            and overlay_row.overlay_calendar_code == overlay_calendar_code
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Calendar overlay already exists",
            )

    adjacency: dict[str, list[str]] = {}
    for overlay_row in existing_pairs:
        if ignore_overlay_id is not None and overlay_row.id == ignore_overlay_id:
            continue
        adjacency.setdefault(overlay_row.calendar_code, []).append(overlay_row.overlay_calendar_code)
    adjacency.setdefault(calendar_code, []).append(overlay_calendar_code)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(code: str) -> None:
        if code in visited:
            return
        if code in visiting:
            raise ValueError("Calendar overlay hierarchy cannot contain cycles")
        visiting.add(code)
        for child_code in adjacency.get(code, []):
            visit(child_code)
        visiting.remove(code)
        visited.add(code)

    visit(calendar_code)


@router.get("/calendars", response_model=List[CalendarOut])
def list_calendars(
    q: Optional[str] = None,
    calendar_type: Optional[str] = None,
    market: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CalendarOut]:
    extra_filters = []
    if calendar_type:
        extra_filters.append(ReferenceCalendar.calendar_type == _normalize_calendar_type(calendar_type))
    cleaned_market = clean_optional_text(market)
    if cleaned_market:
        extra_filters.append(ReferenceCalendar.market == cleaned_market)
    return list_reference_collection(
        CALENDAR_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferenceCalendar.code,
            ReferenceCalendar.name,
            ReferenceCalendar.market,
            ReferenceCalendar.timezone,
        ],
    )


@router.post("/calendars", response_model=CalendarOut, status_code=201)
def create_calendar(payload: CalendarCreate, db: Session = Depends(get_db)) -> CalendarOut:
    return create_reference_resource(CALENDAR_SPEC, payload, db=db)


@router.get("/calendars/{code}", response_model=CalendarOut)
def get_calendar(code: str, db: Session = Depends(get_db)) -> CalendarOut:
    return get_reference_resource(CALENDAR_SPEC, code, db=db)


@router.put("/calendars/{code}", response_model=CalendarOut)
def update_calendar(
    code: str,
    payload: CalendarUpdate,
    db: Session = Depends(get_db),
) -> CalendarOut:
    return update_reference_resource(CALENDAR_SPEC, code, payload, db=db)


@router.post("/calendars/{code}/deactivate", response_model=CalendarOut)
def deactivate_calendar(
    code: str,
    payload: CalendarStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarOut:
    return set_reference_resource_active(
        CALENDAR_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/calendars/{code}/activate", response_model=CalendarOut)
def activate_calendar(
    code: str,
    payload: CalendarStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarOut:
    return set_reference_resource_active(
        CALENDAR_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )


@router.get("/calendars/{code}/holidays", response_model=List[CalendarHolidayOut])
def list_calendar_holidays(
    code: str,
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CalendarHolidayOut]:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must be on or before end_date",
        )

    stmt = (
        select(ReferenceCalendarHoliday)
        .where(ReferenceCalendarHoliday.calendar_code == normalized_code)
        .order_by(ReferenceCalendarHoliday.holiday_date.asc())
        .limit(limit)
        .offset(offset)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ReferenceCalendarHoliday.name.ilike(pattern),
                ReferenceCalendarHoliday.description.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(ReferenceCalendarHoliday.is_active == is_active)
    if start_date is not None:
        stmt = stmt.where(ReferenceCalendarHoliday.holiday_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(ReferenceCalendarHoliday.holiday_date <= end_date)

    rows = db.execute(stmt).scalars().all()
    return [_to_calendar_holiday_out(row) for row in rows]


@router.post("/calendars/{code}/holidays", response_model=CalendarHolidayOut, status_code=201)
def create_calendar_holiday(
    code: str,
    payload: CalendarHolidayCreate,
    db: Session = Depends(get_db),
) -> CalendarHolidayOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)
    existing = db.execute(
        select(ReferenceCalendarHoliday).where(
            ReferenceCalendarHoliday.calendar_code == normalized_code,
            ReferenceCalendarHoliday.holiday_date == payload.holiday_date,
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Calendar holiday already exists",
        )

    actor_id = resolve_audit_actor_id(payload.created_by)
    now = datetime.now(timezone.utc)
    record = ReferenceCalendarHoliday(
        calendar_code=normalized_code,
        holiday_date=payload.holiday_date,
        name=payload.name.strip(),
        closure_type=_normalize_holiday_closure_type(payload.closure_type),
        is_provisional=payload.is_provisional,
        description=payload.description,
        is_active=True,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )

    def create_record() -> ReferenceCalendarHoliday:
        db.add(record)
        return record

    created_record = execute_http_action(db, create_record, commit=True)
    db.refresh(created_record)
    return _to_calendar_holiday_out(created_record)


@router.post("/calendars/{code}/holidays/import", response_model=CalendarHolidayImportSummaryOut)
def import_calendar_holidays(
    code: str,
    payload: CalendarHolidayImportRequest,
    db: Session = Depends(get_db),
) -> CalendarHolidayImportSummaryOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)
    actor_id = resolve_audit_actor_id(payload.requested_by)
    summary = execute_http_action(
        db,
        lambda: import_calendar_holidays_from_csv(
            db,
            calendar_code=normalized_code,
            csv_text=payload.csv_text,
            actor_id=actor_id,
            replace_existing=payload.replace_existing,
            deactivate_missing=payload.deactivate_missing,
            now=datetime.now(timezone.utc),
        ),
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    return CalendarHolidayImportSummaryOut(
        calendar_code=summary.calendar_code,
        requested_by=actor_id,
        total_rows=summary.total_rows,
        created_count=summary.created_count,
        updated_count=summary.updated_count,
        deactivated_count=summary.deactivated_count,
        skipped_count=summary.skipped_count,
    )


@router.get("/calendars/{code}/holidays/{holiday_date}", response_model=CalendarHolidayOut)
def get_calendar_holiday(
    code: str,
    holiday_date: date,
    db: Session = Depends(get_db),
) -> CalendarHolidayOut:
    record = _get_calendar_holiday_record(db, code=code, holiday_date=holiday_date)
    return _to_calendar_holiday_out(record)


@router.put("/calendars/{code}/holidays/{holiday_date}", response_model=CalendarHolidayOut)
def update_calendar_holiday(
    code: str,
    holiday_date: date,
    payload: CalendarHolidayUpdate,
    db: Session = Depends(get_db),
) -> CalendarHolidayOut:
    record = _get_calendar_holiday_record(db, code=code, holiday_date=holiday_date)

    def mutate_record() -> ReferenceCalendarHoliday:
        provided_fields = payload.model_fields_set
        if "name" in provided_fields and payload.name is not None:
            record.name = payload.name.strip()
        if "closure_type" in provided_fields and payload.closure_type is not None:
            record.closure_type = _normalize_holiday_closure_type(payload.closure_type)
        if "is_provisional" in provided_fields and payload.is_provisional is not None:
            record.is_provisional = payload.is_provisional
        if "description" in provided_fields:
            record.description = payload.description
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_holiday_out(updated_record)


@router.get("/calendars/{code}/rules", response_model=List[CalendarRuleOut])
def list_calendar_rules(
    code: str,
    q: Optional[str] = None,
    rule_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CalendarRuleOut]:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)

    stmt = (
        select(ReferenceCalendarRule)
        .where(ReferenceCalendarRule.calendar_code == normalized_code)
        .order_by(ReferenceCalendarRule.id.asc())
        .limit(limit)
        .offset(offset)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ReferenceCalendarRule.name.ilike(pattern),
                ReferenceCalendarRule.description.ilike(pattern),
                ReferenceCalendarRule.rule_type.ilike(pattern),
            )
        )
    if rule_type:
        stmt = stmt.where(ReferenceCalendarRule.rule_type == normalize_calendar_rule_type(rule_type))
    if is_active is not None:
        stmt = stmt.where(ReferenceCalendarRule.is_active == is_active)

    return [_to_calendar_rule_out(row) for row in db.execute(stmt).scalars().all()]


@router.post("/calendars/{code}/rules", response_model=CalendarRuleOut, status_code=201)
def create_calendar_rule(
    code: str,
    payload: CalendarRuleCreate,
    db: Session = Depends(get_db),
) -> CalendarRuleOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)
    values = _calendar_rule_values_from_payload(payload)
    _ensure_calendar_rule_is_unique(db, calendar_code=normalized_code, values=values)

    now = datetime.now(timezone.utc)
    record = ReferenceCalendarRule(
        calendar_code=normalized_code,
        name=values["name"],
        rule_type=values["rule_type"],
        closure_type=values["closure_type"],
        month=values["month"],
        day=values["day"],
        weekday=values["weekday"],
        occurrence=values["occurrence"],
        offset_days=values["offset_days"],
        observance_shift=values["observance_shift"],
        is_provisional=values["is_provisional"],
        description=values["description"],
        is_active=True,
        effective_from=values["effective_from"],
        effective_to=values["effective_to"],
        created_at=now,
        created_by=resolve_audit_actor_id(payload.created_by),
        updated_at=now,
        updated_by=resolve_audit_actor_id(payload.created_by),
        version=1,
    )

    def create_record() -> ReferenceCalendarRule:
        db.add(record)
        return record

    created_record = execute_http_action(
        db,
        create_record,
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    db.refresh(created_record)
    return _to_calendar_rule_out(created_record)


@router.get("/calendars/{code}/rules/{rule_id}", response_model=CalendarRuleOut)
def get_calendar_rule(
    code: str,
    rule_id: int,
    db: Session = Depends(get_db),
) -> CalendarRuleOut:
    return _to_calendar_rule_out(_get_calendar_rule_record(db, code=code, rule_id=rule_id))


@router.put("/calendars/{code}/rules/{rule_id}", response_model=CalendarRuleOut)
def update_calendar_rule(
    code: str,
    rule_id: int,
    payload: CalendarRuleUpdate,
    db: Session = Depends(get_db),
) -> CalendarRuleOut:
    record = _get_calendar_rule_record(db, code=code, rule_id=rule_id)

    def mutate_record() -> ReferenceCalendarRule:
        values = _calendar_rule_values_from_payload(payload, existing=record)
        _ensure_calendar_rule_is_unique(
            db,
            calendar_code=record.calendar_code,
            values=values,
            ignore_rule_id=record.id,
        )
        record.name = values["name"]
        record.rule_type = values["rule_type"]
        record.closure_type = values["closure_type"]
        record.month = values["month"]
        record.day = values["day"]
        record.weekday = values["weekday"]
        record.occurrence = values["occurrence"]
        record.offset_days = values["offset_days"]
        record.observance_shift = values["observance_shift"]
        record.is_provisional = values["is_provisional"]
        record.description = values["description"]
        record.effective_from = values["effective_from"]
        record.effective_to = values["effective_to"]
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(
        db,
        mutate_record,
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    db.refresh(updated_record)
    return _to_calendar_rule_out(updated_record)


@router.post("/calendars/{code}/rules/{rule_id}/deactivate", response_model=CalendarRuleOut)
def deactivate_calendar_rule(
    code: str,
    rule_id: int,
    payload: CalendarRuleStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarRuleOut:
    record = _get_calendar_rule_record(db, code=code, rule_id=rule_id)

    def mutate_record() -> ReferenceCalendarRule:
        record.is_active = False
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_rule_out(updated_record)


@router.post("/calendars/{code}/rules/{rule_id}/activate", response_model=CalendarRuleOut)
def activate_calendar_rule(
    code: str,
    rule_id: int,
    payload: CalendarRuleStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarRuleOut:
    record = _get_calendar_rule_record(db, code=code, rule_id=rule_id)

    def mutate_record() -> ReferenceCalendarRule:
        record.is_active = True
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_rule_out(updated_record)


@router.get("/calendars/{code}/overlays", response_model=List[CalendarOverlayOut])
def list_calendar_overlays(
    code: str,
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CalendarOverlayOut]:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)

    stmt = (
        select(ReferenceCalendarOverlay)
        .where(ReferenceCalendarOverlay.calendar_code == normalized_code)
        .order_by(
            ReferenceCalendarOverlay.priority.asc(),
            ReferenceCalendarOverlay.overlay_calendar_code.asc(),
        )
        .limit(limit)
        .offset(offset)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ReferenceCalendarOverlay.overlay_calendar_code.ilike(pattern),
                ReferenceCalendarOverlay.description.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(ReferenceCalendarOverlay.is_active == is_active)

    return [_to_calendar_overlay_out(row) for row in db.execute(stmt).scalars().all()]


@router.post("/calendars/{code}/overlays", response_model=CalendarOverlayOut, status_code=201)
def create_calendar_overlay(
    code: str,
    payload: CalendarOverlayCreate,
    db: Session = Depends(get_db),
) -> CalendarOverlayOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCalendar, normalized_code)
    overlay_calendar_code = _normalize_overlay_calendar_code(payload.overlay_calendar_code)
    _validate_effective_window(payload.effective_from, payload.effective_to)
    _ensure_overlay_edge_is_valid(
        db,
        calendar_code=normalized_code,
        overlay_calendar_code=overlay_calendar_code,
    )

    now = datetime.now(timezone.utc)
    record = ReferenceCalendarOverlay(
        calendar_code=normalized_code,
        overlay_calendar_code=overlay_calendar_code,
        priority=payload.priority,
        description=clean_optional_text(payload.description),
        is_active=True,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        created_at=now,
        created_by=resolve_audit_actor_id(payload.created_by),
        updated_at=now,
        updated_by=resolve_audit_actor_id(payload.created_by),
        version=1,
    )

    def create_record() -> ReferenceCalendarOverlay:
        db.add(record)
        return record

    created_record = execute_http_action(
        db,
        create_record,
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    db.refresh(created_record)
    return _to_calendar_overlay_out(created_record)


@router.get("/calendars/{code}/overlays/{overlay_id}", response_model=CalendarOverlayOut)
def get_calendar_overlay(
    code: str,
    overlay_id: int,
    db: Session = Depends(get_db),
) -> CalendarOverlayOut:
    return _to_calendar_overlay_out(_get_calendar_overlay_record(db, code=code, overlay_id=overlay_id))


@router.put("/calendars/{code}/overlays/{overlay_id}", response_model=CalendarOverlayOut)
def update_calendar_overlay(
    code: str,
    overlay_id: int,
    payload: CalendarOverlayUpdate,
    db: Session = Depends(get_db),
) -> CalendarOverlayOut:
    record = _get_calendar_overlay_record(db, code=code, overlay_id=overlay_id)

    def mutate_record() -> ReferenceCalendarOverlay:
        provided_fields = payload.model_fields_set
        priority = payload.priority if "priority" in provided_fields and payload.priority is not None else record.priority
        description = (
            clean_optional_text(payload.description)
            if "description" in provided_fields
            else record.description
        )
        effective_from = (
            payload.effective_from
            if "effective_from" in provided_fields
            else record.effective_from
        )
        effective_to = (
            payload.effective_to
            if "effective_to" in provided_fields
            else record.effective_to
        )
        _validate_effective_window(effective_from, effective_to)
        _ensure_overlay_edge_is_valid(
            db,
            calendar_code=record.calendar_code,
            overlay_calendar_code=record.overlay_calendar_code,
            ignore_overlay_id=record.id,
        )
        record.priority = priority
        record.description = description
        record.effective_from = effective_from
        record.effective_to = effective_to
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(
        db,
        mutate_record,
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    db.refresh(updated_record)
    return _to_calendar_overlay_out(updated_record)


@router.post("/calendars/{code}/overlays/{overlay_id}/deactivate", response_model=CalendarOverlayOut)
def deactivate_calendar_overlay(
    code: str,
    overlay_id: int,
    payload: CalendarOverlayStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarOverlayOut:
    record = _get_calendar_overlay_record(db, code=code, overlay_id=overlay_id)

    def mutate_record() -> ReferenceCalendarOverlay:
        record.is_active = False
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_overlay_out(updated_record)


@router.post("/calendars/{code}/overlays/{overlay_id}/activate", response_model=CalendarOverlayOut)
def activate_calendar_overlay(
    code: str,
    overlay_id: int,
    payload: CalendarOverlayStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarOverlayOut:
    record = _get_calendar_overlay_record(db, code=code, overlay_id=overlay_id)

    def mutate_record() -> ReferenceCalendarOverlay:
        record.is_active = True
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_overlay_out(updated_record)


@router.get("/calendars/{code}/business-day", response_model=CalendarBusinessDayStatusOut)
def get_calendar_business_day_status(
    code: str,
    evaluated_date: date,
    db: Session = Depends(get_db),
) -> CalendarBusinessDayStatusOut:
    status_outcome = execute_http_action(
        db,
        lambda: evaluate_calendar_day(
            db,
            calendar_code=code,
            evaluated_date=evaluated_date,
        ),
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
    return _to_calendar_business_day_status_out(status_outcome)


@router.get("/calendars/{code}/next-business-day", response_model=CalendarBusinessDayDateOut)
def get_next_calendar_business_day(
    code: str,
    start_date: date,
    include_start: bool = False,
    db: Session = Depends(get_db),
) -> CalendarBusinessDayDateOut:
    result_date = execute_http_action(
        db,
        lambda: next_business_day(
            db,
            calendar_code=code,
            start_date=start_date,
            include_start=include_start,
        ),
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
    return CalendarBusinessDayDateOut(
        calendar_code=normalize_code(code),
        start_date=start_date,
        result_date=result_date,
        include_start=include_start,
    )


@router.get("/calendars/{code}/add-business-days", response_model=CalendarBusinessDayDateOut)
def add_calendar_business_days(
    code: str,
    start_date: date,
    business_days: int,
    include_start: bool = False,
    db: Session = Depends(get_db),
) -> CalendarBusinessDayDateOut:
    result_date = execute_http_action(
        db,
        lambda: add_business_days(
            db,
            calendar_code=code,
            start_date=start_date,
            business_days=business_days,
            include_start=include_start,
        ),
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
    return CalendarBusinessDayDateOut(
        calendar_code=normalize_code(code),
        start_date=start_date,
        result_date=result_date,
        include_start=include_start,
        business_days=business_days,
    )


@router.get("/calendars/{code}/business-days-between", response_model=CalendarBusinessDayCountOut)
def count_calendar_business_days(
    code: str,
    start_date: date,
    end_date: date,
    include_start: bool = True,
    include_end: bool = False,
    db: Session = Depends(get_db),
) -> CalendarBusinessDayCountOut:
    business_day_count = execute_http_action(
        db,
        lambda: business_days_between(
            db,
            calendar_code=code,
            start_date=start_date,
            end_date=end_date,
            include_start=include_start,
            include_end=include_end,
        ),
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
    return CalendarBusinessDayCountOut(
        calendar_code=normalize_code(code),
        start_date=start_date,
        end_date=end_date,
        include_start=include_start,
        include_end=include_end,
        business_day_count=business_day_count,
    )


@router.post("/calendars/{code}/holidays/{holiday_date}/deactivate", response_model=CalendarHolidayOut)
def deactivate_calendar_holiday(
    code: str,
    holiday_date: date,
    payload: CalendarHolidayStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarHolidayOut:
    record = _get_calendar_holiday_record(db, code=code, holiday_date=holiday_date)

    def mutate_record() -> ReferenceCalendarHoliday:
        record.is_active = False
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_holiday_out(updated_record)


@router.post("/calendars/{code}/holidays/{holiday_date}/activate", response_model=CalendarHolidayOut)
def activate_calendar_holiday(
    code: str,
    holiday_date: date,
    payload: CalendarHolidayStatusUpdate,
    db: Session = Depends(get_db),
) -> CalendarHolidayOut:
    record = _get_calendar_holiday_record(db, code=code, holiday_date=holiday_date)

    def mutate_record() -> ReferenceCalendarHoliday:
        record.is_active = True
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, mutate_record, commit=True)
    db.refresh(updated_record)
    return _to_calendar_holiday_out(updated_record)
