from __future__ import annotations

"""Domain-owned HTTP routes for reporting APIs."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.counterparty_credit import (
    build_counterparty_credit_report,
)
from apps.api.app.domains.reports.services.pnl_history import (
    build_pnl_comparison_report,
    build_pnl_history_report,
)
from apps.api.app.domains.reports.services.overview import (
    build_activity_summary,
    build_exposure_summary,
    build_reporting_overview,
)
from apps.api.app.domains.reports.services.settlement import (
    build_cash_forecast_report,
    build_settlement_exception_report,
    build_settlement_filter_options,
    build_settlement_aging_report,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.report import (
    ActivitySummaryRow,
    CashForecastReport,
    CounterpartyCreditReportRow,
    ExposureSummaryRow,
    PnlHistoryReport,
    PnlComparisonReport,
    ReportingOverview,
    SettlementReportFilterOptions,
    SettlementReportFilters,
    SettlementReportPresetCreate,
    SettlementReportPresetOut,
    SettlementReportPresetUpdate,
    SettlementExceptionReport,
    SettlementAgingReport,
)

router = APIRouter(prefix="/reports", tags=["reports"])
SETTLEMENT_PRESET_KEY = "settlement"
SETTLEMENT_SHARED_OWNER_KEY = "__shared__"


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


def _authenticated_actor_role(request: Request) -> str | None:
    actor_role = getattr(request.state, "actor_role", None)
    if actor_role is None:
        return None
    normalized = str(actor_role).strip()
    return normalized or None


def _parse_settlement_common_filters(
    book: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    currency: str | None = Query(default=None),
) -> SettlementReportFilters:
    try:
        return SettlementReportFilters(
            book=book,
            counterparty=counterparty,
            currency=currency,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


def _parse_settlement_exception_filters(
    book: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    currency: str | None = Query(default=None),
    exception_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
) -> SettlementReportFilters:
    try:
        return SettlementReportFilters(
            book=book,
            counterparty=counterparty,
            currency=currency,
            exception_type=exception_type,
            severity=severity,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


def _settlement_preset_scope_owner_key(scope: str, *, actor_id: str) -> str:
    return SETTLEMENT_SHARED_OWNER_KEY if scope == "SHARED" else actor_id


def _preset_name_key(name: str) -> str:
    return name.strip().casefold()


def _can_manage_settlement_preset(record: ReportPreset, *, actor_id: str, actor_role: str | None) -> bool:
    return record.created_by == actor_id or is_admin_role(actor_role)


def _to_settlement_preset_out(
    record: ReportPreset,
    *,
    actor_id: str,
    actor_role: str | None,
) -> SettlementReportPresetOut:
    return SettlementReportPresetOut(
        preset_id=record.id,
        preset_key="settlement",
        name=record.name,
        scope=record.scope,
        filters=SettlementReportFilters.model_validate(record.filters_json or {}),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=_can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role),
    )


def _visible_settlement_presets_stmt(actor_id: str):
    return select(ReportPreset).where(
        ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
        or_(
            ReportPreset.scope_owner_key == actor_id,
            ReportPreset.scope_owner_key == SETTLEMENT_SHARED_OWNER_KEY,
        ),
    )


@router.get("/exposure-summary", response_model=list[ExposureSummaryRow])
def get_exposure_summary(db: Session = Depends(get_db)) -> list[ExposureSummaryRow]:
    return [ExposureSummaryRow(**row) for row in build_exposure_summary(db)]


@router.get("/activity-summary", response_model=list[ActivitySummaryRow])
def get_activity_summary(db: Session = Depends(get_db)) -> list[ActivitySummaryRow]:
    return [ActivitySummaryRow(**row) for row in build_activity_summary(db)]


@router.get("/overview", response_model=ReportingOverview)
def get_reporting_overview(db: Session = Depends(get_db)) -> ReportingOverview:
    return ReportingOverview(**build_reporting_overview(db))


@router.get("/counterparty-credit", response_model=list[CounterpartyCreditReportRow])
def get_counterparty_credit_report(
    db: Session = Depends(get_db),
) -> list[CounterpartyCreditReportRow]:
    return [CounterpartyCreditReportRow(**row) for row in build_counterparty_credit_report(db)]


@router.get("/pnl-history", response_model=PnlHistoryReport)
def get_pnl_history(
    as_of: date | None = Query(default=None),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PnlHistoryReport:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to",
        )

    return PnlHistoryReport(
        **build_pnl_history_report(
            db,
            as_of=as_of,
            book=book,
            portfolio=portfolio,
            commodity_class=commodity_class,
            date_from=date_from,
            date_to=date_to,
        )
    )


@router.get("/pnl-compare", response_model=PnlComparisonReport)
def get_pnl_comparison(
    from_as_of: date = Query(...),
    to_as_of: date = Query(...),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PnlComparisonReport:
    if from_as_of > to_as_of:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_as_of must be on or before to_as_of",
        )

    return PnlComparisonReport(
        **build_pnl_comparison_report(
            db,
            from_as_of=from_as_of,
            to_as_of=to_as_of,
            book=book,
            portfolio=portfolio,
            commodity_class=commodity_class,
        )
    )


@router.get("/settlement-aging", response_model=SettlementAgingReport)
def get_settlement_aging_report(
    as_of: date | None = Query(default=None),
    filters: SettlementReportFilters = Depends(_parse_settlement_common_filters),
    db: Session = Depends(get_db),
) -> SettlementAgingReport:
    return SettlementAgingReport(
        **build_settlement_aging_report(
            db,
            as_of=as_of,
            book=filters.book,
            counterparty=filters.counterparty,
            currency=filters.currency,
        )
    )


@router.get("/cash-forecast", response_model=CashForecastReport)
def get_cash_forecast(
    as_of: date | None = Query(default=None),
    horizon_days: int = Query(default=30),
    filters: SettlementReportFilters = Depends(_parse_settlement_common_filters),
    db: Session = Depends(get_db),
) -> CashForecastReport:
    try:
        return CashForecastReport(
            **build_cash_forecast_report(
                db,
                as_of=as_of,
                horizon_days=horizon_days,
                book=filters.book,
                counterparty=filters.counterparty,
                currency=filters.currency,
            )
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/settlement-exceptions", response_model=SettlementExceptionReport)
def get_settlement_exceptions(
    as_of: date | None = Query(default=None),
    filters: SettlementReportFilters = Depends(_parse_settlement_exception_filters),
    db: Session = Depends(get_db),
) -> SettlementExceptionReport:
    return SettlementExceptionReport(
        **build_settlement_exception_report(
            db,
            as_of=as_of,
            book=filters.book,
            counterparty=filters.counterparty,
            currency=filters.currency,
            exception_type_filter=filters.exception_type,
            severity_filter=filters.severity,
        )
    )


@router.get("/settlement-filter-options", response_model=SettlementReportFilterOptions)
def get_settlement_filter_options(
    as_of: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> SettlementReportFilterOptions:
    return SettlementReportFilterOptions(**build_settlement_filter_options(db, as_of=as_of))


@router.get("/settlement-presets", response_model=list[SettlementReportPresetOut])
def get_settlement_presets(
    request: Request,
    db: Session = Depends(get_db),
) -> list[SettlementReportPresetOut]:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    records = db.execute(_visible_settlement_presets_stmt(actor_id).order_by(ReportPreset.scope.asc(), ReportPreset.name.asc())).scalars().all()
    return [
        _to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)
        for record in records
    ]


@router.post("/settlement-presets", response_model=SettlementReportPresetOut, status_code=status.HTTP_201_CREATED)
def create_settlement_preset(
    payload: SettlementReportPresetCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> SettlementReportPresetOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    scope_owner_key = _settlement_preset_scope_owner_key(payload.scope, actor_id=actor_id)
    name_key = _preset_name_key(payload.name)
    existing = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
            ReportPreset.scope_owner_key == scope_owner_key,
            ReportPreset.name_key == name_key,
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Settlement preset '{payload.name}' already exists for this scope.",
        )

    now = datetime.now(timezone.utc)
    record = ReportPreset(
        preset_key=SETTLEMENT_PRESET_KEY,
        scope=payload.scope,
        scope_owner_key=scope_owner_key,
        name=payload.name,
        name_key=name_key,
        filters_json=payload.filters.model_dump(exclude_none=True),
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)


@router.patch("/settlement-presets/{preset_id}", response_model=SettlementReportPresetOut)
def update_settlement_preset(
    preset_id: int,
    payload: SettlementReportPresetUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> SettlementReportPresetOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    record = db.execute(_visible_settlement_presets_stmt(actor_id).where(ReportPreset.id == preset_id)).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settlement preset was not found.")
    if not _can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to edit this preset.")

    next_scope = payload.scope or record.scope
    next_name = payload.name or record.name
    next_scope_owner_key = _settlement_preset_scope_owner_key(next_scope, actor_id=actor_id)
    next_name_key = _preset_name_key(next_name)

    duplicate = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
            ReportPreset.scope_owner_key == next_scope_owner_key,
            ReportPreset.name_key == next_name_key,
            ReportPreset.id != record.id,
        )
    ).scalars().first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Settlement preset '{next_name}' already exists for this scope.",
        )

    if payload.name is not None:
        record.name = payload.name
        record.name_key = next_name_key
    if payload.scope is not None:
        record.scope = next_scope
        record.scope_owner_key = next_scope_owner_key
    if payload.filters is not None:
        record.filters_json = payload.filters.model_dump(exclude_none=True)

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)


@router.delete("/settlement-presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_settlement_preset(
    preset_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    record = db.execute(_visible_settlement_presets_stmt(actor_id).where(ReportPreset.id == preset_id)).scalars().first()
    if record is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if not _can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to delete this preset.")

    db.delete(record)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
