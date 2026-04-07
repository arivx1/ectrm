from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
    DEFAULT_COUNTERPARTY_CREDIT_STATUS,
    DEFAULT_COUNTERPARTY_TYPE,
    list_counterparty_credit_breach_actions,
    list_counterparty_credit_statuses,
    list_counterparty_types,
    normalize_counterparty_credit_breach_action,
    normalize_counterparty_credit_status,
    normalize_counterparty_type,
    normalize_counterparty_type_filter,
)
from apps.api.app.domains.reference_data.services.location_standards import normalize_country_code
from apps.api.app.domains.reference_data.services.records import (
    create_reference_record,
    get_reference_record,
    list_reference_records,
    normalize_code,
    set_reference_active_state,
    update_reference_record,
)
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import (
    ReferenceCounterpartyCreditProfile,
)
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.schemas.reference_data import (
    CounterpartyCreate,
    CounterpartyCreditProfileOut,
    CounterpartyCreditProfileUpsert,
    CounterpartyExternalCreditPromotionRequest,
    CounterpartyExternalCreditSnapshotOut,
    CounterpartyOut,
    CounterpartyStandardsOut,
    CounterpartyStatusUpdate,
    CounterpartyUpdate,
)

from .common import (
    clean_optional_code,
    clean_optional_text,
    normalize_duns_number,
    normalize_lei_code,
    normalize_ticker_symbol,
    to_out,
)

router = APIRouter()


def _update_counterparty_fields(record, payload, provided_fields: set[str]) -> None:
    if "short_name" in provided_fields:
        record.short_name = clean_optional_text(payload.short_name)
    if "legal_entity_name" in provided_fields:
        record.legal_entity_name = clean_optional_text(payload.legal_entity_name)
    if "counterparty_type" in provided_fields and payload.counterparty_type is not None:
        record.counterparty_type = normalize_counterparty_type(payload.counterparty_type)
    if "country_code" in provided_fields:
        record.country_code = normalize_country_code(payload.country_code)
    if "lei_code" in provided_fields:
        record.lei_code = normalize_lei_code(payload.lei_code)
    if "duns_number" in provided_fields:
        record.duns_number = normalize_duns_number(payload.duns_number)
    if "ticker_symbol" in provided_fields:
        record.ticker_symbol = normalize_ticker_symbol(payload.ticker_symbol)
    if "credit_status" in provided_fields:
        record.credit_status = normalize_counterparty_credit_status(payload.credit_status)


def _to_counterparty_credit_profile_out(
    record: ReferenceCounterpartyCreditProfile,
) -> CounterpartyCreditProfileOut:
    return CounterpartyCreditProfileOut(
        counterparty_code=record.counterparty_code,
        credit_rating=record.credit_rating,
        review_due_at=record.review_due_at,
        limit_currency_code=record.limit_currency_code,
        limit_amount=float(record.limit_amount) if record.limit_amount is not None else None,
        breach_action=record.breach_action,
        notes=record.notes,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _to_counterparty_external_credit_snapshot_out(
    record: ReferenceCounterpartyExternalCreditSnapshot,
) -> CounterpartyExternalCreditSnapshotOut:
    return CounterpartyExternalCreditSnapshotOut(
        id=record.id,
        counterparty_code=record.counterparty_code,
        provider=record.provider,
        source_entity_id=record.source_entity_id,
        source_entity_name=record.source_entity_name,
        match_basis=record.match_basis,
        matched_identifier_value=record.matched_identifier_value,
        as_of_date=record.as_of_date,
        rating_scale=record.rating_scale,
        rating_value=record.rating_value,
        rating_outlook=record.rating_outlook,
        credit_score=float(record.credit_score) if record.credit_score is not None else None,
        probability_of_default=(
            float(record.probability_of_default)
            if record.probability_of_default is not None
            else None
        ),
        recommended_limit_currency_code=record.recommended_limit_currency_code,
        recommended_limit_amount=(
            float(record.recommended_limit_amount)
            if record.recommended_limit_amount is not None
            else None
        ),
        commentary=record.commentary,
        downloaded_at=record.downloaded_at,
        run_id=record.run_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        version=record.version,
    )


def _build_external_credit_promotion_note(
    record: ReferenceCounterpartyExternalCreditSnapshot,
) -> str:
    parts = [f"{record.provider} snapshot {record.as_of_date.isoformat()} promoted"]
    if record.rating_value:
        parts.append(f"rating {record.rating_value}")
    if record.recommended_limit_amount is not None and record.recommended_limit_currency_code:
        parts.append(
            f"limit {record.recommended_limit_currency_code} "
            f"{float(record.recommended_limit_amount):,.2f}"
        )
    note = "; ".join(parts) + "."
    if record.commentary:
        return f"{note} {record.commentary}"
    return note


def _resolve_counterparty_credit_profile_values(
    db: Session,
    payload: CounterpartyCreditProfileUpsert,
    *,
    existing_record: ReferenceCounterpartyCreditProfile | None = None,
) -> dict[str, object]:
    provided_fields = payload.model_fields_set
    credit_rating = (
        clean_optional_text(payload.credit_rating)
        if "credit_rating" in provided_fields
        else existing_record.credit_rating if existing_record is not None else None
    )
    review_due_at = (
        payload.review_due_at
        if "review_due_at" in provided_fields
        else existing_record.review_due_at if existing_record is not None else None
    )
    limit_currency_code = (
        clean_optional_code(payload.limit_currency_code)
        if "limit_currency_code" in provided_fields
        else existing_record.limit_currency_code if existing_record is not None else None
    )
    limit_amount = (
        payload.limit_amount
        if "limit_amount" in provided_fields
        else float(existing_record.limit_amount)
        if existing_record and existing_record.limit_amount is not None
        else None
    )
    breach_action = normalize_counterparty_credit_breach_action(
        payload.breach_action
        if "breach_action" in provided_fields
        else existing_record.breach_action
        if existing_record is not None
        else DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION
    )
    notes = (
        clean_optional_text(payload.notes)
        if "notes" in provided_fields
        else existing_record.notes if existing_record is not None else None
    )

    if (limit_currency_code is None) != (limit_amount is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="limit_currency_code and limit_amount must be provided together",
        )

    if limit_amount is not None and limit_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="limit_amount must be greater than 0",
        )

    if limit_currency_code is not None:
        currency = db.execute(
            select(ReferenceCurrency).where(
                ReferenceCurrency.code == limit_currency_code,
                ReferenceCurrency.is_active.is_(True),
            )
        ).scalars().first()
        if currency is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Limit currency '{limit_currency_code}' must be an active currency",
            )

    return {
        "credit_rating": credit_rating,
        "review_due_at": review_due_at,
        "limit_currency_code": limit_currency_code,
        "limit_amount": limit_amount,
        "breach_action": breach_action,
        "notes": notes,
    }


@router.get("/counterparties", response_model=List[CounterpartyOut])
def list_counterparties(
    q: Optional[str] = None,
    counterparty_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CounterpartyOut]:
    extra_filters = []
    if counterparty_type:
        extra_filters.append(
            ReferenceCounterparty.counterparty_type
            == normalize_counterparty_type_filter(counterparty_type)
        )
    rows = list_reference_records(
        db,
        ReferenceCounterparty,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
    )
    return [to_out(row, CounterpartyOut) for row in rows]


@router.get("/counterparties/standards", response_model=CounterpartyStandardsOut)
def list_counterparty_standards() -> CounterpartyStandardsOut:
    return CounterpartyStandardsOut(
        default_counterparty_type=DEFAULT_COUNTERPARTY_TYPE,
        counterparty_types=list_counterparty_types(),
        default_counterparty_credit_status=DEFAULT_COUNTERPARTY_CREDIT_STATUS,
        counterparty_credit_statuses=list_counterparty_credit_statuses(),
        default_counterparty_credit_breach_action=DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
        counterparty_credit_breach_actions=list_counterparty_credit_breach_actions(),
    )


@router.get("/counterparties/credit-profiles", response_model=List[CounterpartyCreditProfileOut])
def list_counterparty_credit_profiles(
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CounterpartyCreditProfileOut]:
    rows = db.execute(
        select(ReferenceCounterpartyCreditProfile)
        .order_by(ReferenceCounterpartyCreditProfile.counterparty_code.asc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()
    return [_to_counterparty_credit_profile_out(row) for row in rows]


@router.get(
    "/counterparties/external-credit-snapshots",
    response_model=List[CounterpartyExternalCreditSnapshotOut],
)
def list_counterparty_external_credit_snapshots(
    counterparty_code: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CounterpartyExternalCreditSnapshotOut]:
    stmt = select(ReferenceCounterpartyExternalCreditSnapshot).order_by(
        ReferenceCounterpartyExternalCreditSnapshot.counterparty_code.asc(),
        ReferenceCounterpartyExternalCreditSnapshot.provider.asc(),
        ReferenceCounterpartyExternalCreditSnapshot.as_of_date.desc(),
        ReferenceCounterpartyExternalCreditSnapshot.downloaded_at.desc(),
        ReferenceCounterpartyExternalCreditSnapshot.id.desc(),
    )
    if counterparty_code:
        stmt = stmt.where(
            ReferenceCounterpartyExternalCreditSnapshot.counterparty_code
            == normalize_code(counterparty_code)
        )

    rows = db.execute(stmt).scalars().all()
    latest_rows: list[ReferenceCounterpartyExternalCreditSnapshot] = []
    seen_keys: set[tuple[str, str]] = set()
    for row in rows:
        key = (row.counterparty_code, row.provider)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        latest_rows.append(row)

    windowed_rows = latest_rows[offset : offset + limit]
    return [_to_counterparty_external_credit_snapshot_out(row) for row in windowed_rows]


@router.post("/counterparties", response_model=CounterpartyOut, status_code=201)
def create_counterparty(payload: CounterpartyCreate, db: Session = Depends(get_db)) -> CounterpartyOut:
    existing = db.execute(
        select(ReferenceCounterparty).where(ReferenceCounterparty.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Counterparty already exists")

    record = create_reference_record(
        db,
        ReferenceCounterparty,
        payload,
        extra_values={
            "short_name": payload.short_name.strip() if payload.short_name is not None else None,
            "legal_entity_name": (
                payload.legal_entity_name.strip()
                if payload.legal_entity_name is not None
                else None
            ),
            "counterparty_type": normalize_counterparty_type(payload.counterparty_type),
            "country_code": normalize_country_code(payload.country_code),
            "lei_code": normalize_lei_code(payload.lei_code),
            "duns_number": normalize_duns_number(payload.duns_number),
            "ticker_symbol": normalize_ticker_symbol(payload.ticker_symbol),
            "credit_status": normalize_counterparty_credit_status(payload.credit_status),
        },
    )
    return to_out(record, CounterpartyOut)


@router.put("/counterparties/{code}/credit-profile", response_model=CounterpartyCreditProfileOut)
def upsert_counterparty_credit_profile(
    code: str,
    payload: CounterpartyCreditProfileUpsert,
    db: Session = Depends(get_db),
) -> CounterpartyCreditProfileOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCounterparty, normalized_code)
    record = db.execute(
        select(ReferenceCounterpartyCreditProfile).where(
            ReferenceCounterpartyCreditProfile.counterparty_code == normalized_code
        )
    ).scalars().first()
    next_values = _resolve_counterparty_credit_profile_values(
        db,
        payload,
        existing_record=record,
    )
    now = datetime.now(timezone.utc)
    actor_id = resolve_audit_actor_id(payload.updated_by)

    if record is None:
        record = ReferenceCounterpartyCreditProfile(
            counterparty_code=normalized_code,
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
            **next_values,
        )
        db.add(record)
    else:
        for field_name, value in next_values.items():
            setattr(record, field_name, value)
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1

    db.commit()
    db.refresh(record)
    return _to_counterparty_credit_profile_out(record)


@router.post(
    "/counterparties/{code}/external-credit-snapshots/{snapshot_id}/promote",
    response_model=CounterpartyCreditProfileOut,
)
def promote_counterparty_external_credit_snapshot(
    code: str,
    snapshot_id: int,
    payload: CounterpartyExternalCreditPromotionRequest,
    db: Session = Depends(get_db),
) -> CounterpartyCreditProfileOut:
    normalized_code = normalize_code(code)
    get_reference_record(db, ReferenceCounterparty, normalized_code)
    snapshot = db.get(ReferenceCounterpartyExternalCreditSnapshot, snapshot_id)
    if snapshot is None or snapshot.counterparty_code != normalized_code:
        raise HTTPException(status_code=404, detail="Counterparty external credit snapshot not found")

    if (
        not payload.promote_rating
        and not payload.promote_limit
        and not payload.append_commentary_to_notes
        and payload.review_due_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select at least one credit field to promote",
        )

    record = db.execute(
        select(ReferenceCounterpartyCreditProfile).where(
            ReferenceCounterpartyCreditProfile.counterparty_code == normalized_code
        )
    ).scalars().first()
    now = datetime.now(timezone.utc)
    actor_id = resolve_audit_actor_id(payload.updated_by)
    if record is None:
        record = ReferenceCounterpartyCreditProfile(
            counterparty_code=normalized_code,
            credit_rating=None,
            review_due_at=None,
            limit_currency_code=None,
            limit_amount=None,
            breach_action=DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
            notes=None,
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
        )
        db.add(record)
    else:
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1

    if payload.promote_rating and snapshot.rating_value:
        record.credit_rating = snapshot.rating_value

    if payload.review_due_at is not None:
        record.review_due_at = payload.review_due_at

    if (
        payload.promote_limit
        and snapshot.recommended_limit_amount is not None
        and snapshot.recommended_limit_currency_code
    ):
        record.limit_currency_code = snapshot.recommended_limit_currency_code
        record.limit_amount = snapshot.recommended_limit_amount

    if payload.append_commentary_to_notes:
        next_note = _build_external_credit_promotion_note(snapshot)
        existing_notes = clean_optional_text(record.notes)
        if existing_notes:
            if next_note not in existing_notes:
                record.notes = f"{existing_notes}\n{next_note}"
        else:
            record.notes = next_note

    db.commit()
    db.refresh(record)
    return _to_counterparty_credit_profile_out(record)


@router.get("/counterparties/{code}", response_model=CounterpartyOut)
def get_counterparty(code: str, db: Session = Depends(get_db)) -> CounterpartyOut:
    record = get_reference_record(db, ReferenceCounterparty, code.strip().upper())
    return to_out(record, CounterpartyOut)


@router.put("/counterparties/{code}", response_model=CounterpartyOut)
def update_counterparty(code: str, payload: CounterpartyUpdate, db: Session = Depends(get_db)) -> CounterpartyOut:
    record = get_reference_record(db, ReferenceCounterparty, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_counterparty_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, CounterpartyOut)


@router.post("/counterparties/{code}/deactivate", response_model=CounterpartyOut)
def deactivate_counterparty(
    code: str,
    payload: CounterpartyStatusUpdate,
    db: Session = Depends(get_db),
) -> CounterpartyOut:
    record = get_reference_record(db, ReferenceCounterparty, code.strip().upper())
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CounterpartyOut)


@router.post("/counterparties/{code}/activate", response_model=CounterpartyOut)
def activate_counterparty(
    code: str,
    payload: CounterpartyStatusUpdate,
    db: Session = Depends(get_db),
) -> CounterpartyOut:
    record = get_reference_record(db, ReferenceCounterparty, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CounterpartyOut)
