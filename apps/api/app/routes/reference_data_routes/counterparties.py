from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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
    normalize_code,
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
)
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource
from .subresources import get_scoped_subresource_record
from .subresources import list_owned_reference_collection
from .subresources import list_reference_collection_query
from .subresources import OwnedReferenceSubresourceSpec
from .subresources import ReferenceCollectionQuerySpec
from .subresources import require_owned_reference_parent_code
from .subresources import upsert_owned_reference_record

router = APIRouter()


def _update_counterparty_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
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


def _build_counterparty_create_values(
    _db: Session,
    payload: CounterpartyCreate,
) -> dict[str, object]:
    return {
        "short_name": clean_optional_text(payload.short_name),
        "legal_entity_name": clean_optional_text(payload.legal_entity_name),
        "counterparty_type": normalize_counterparty_type(payload.counterparty_type),
        "country_code": normalize_country_code(payload.country_code),
        "lei_code": normalize_lei_code(payload.lei_code),
        "duns_number": normalize_duns_number(payload.duns_number),
        "ticker_symbol": normalize_ticker_symbol(payload.ticker_symbol),
        "credit_status": normalize_counterparty_credit_status(payload.credit_status),
    }


COUNTERPARTY_SPEC = ReferenceDataCrudSpec(
    model=ReferenceCounterparty,
    out_schema_cls=CounterpartyOut,
    duplicate_detail="Counterparty already exists",
    build_create_extra_values=_build_counterparty_create_values,
    update_extra_fields=_update_counterparty_fields,
)


def _build_counterparty_credit_profile_record(
    counterparty_code: str,
    now: datetime,
    actor_id: str,
) -> ReferenceCounterpartyCreditProfile:
    return ReferenceCounterpartyCreditProfile(
        counterparty_code=counterparty_code,
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


COUNTERPARTY_CREDIT_PROFILE_SPEC = OwnedReferenceSubresourceSpec(
    parent_model=ReferenceCounterparty,
    record_model=ReferenceCounterpartyCreditProfile,
    owner_field_name="counterparty_code",
    to_out=_to_counterparty_credit_profile_out,
    build_default_record=_build_counterparty_credit_profile_record,
    list_order_by=(ReferenceCounterpartyCreditProfile.counterparty_code.asc(),),
)


def _build_counterparty_external_credit_snapshot_stmt(
    *,
    db: Session,
    counterparty_code: str | None = None,
) -> object:
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
    return stmt


def _reduce_latest_counterparty_external_credit_snapshots(
    rows: list[ReferenceCounterpartyExternalCreditSnapshot],
) -> list[ReferenceCounterpartyExternalCreditSnapshot]:
    latest_rows: list[ReferenceCounterpartyExternalCreditSnapshot] = []
    seen_keys: set[tuple[str, str]] = set()
    for row in rows:
        key = (row.counterparty_code, row.provider)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        latest_rows.append(row)
    return latest_rows


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


COUNTERPARTY_EXTERNAL_CREDIT_SNAPSHOT_QUERY_SPEC = ReferenceCollectionQuerySpec(
    build_stmt=_build_counterparty_external_credit_snapshot_stmt,
    to_out=_to_counterparty_external_credit_snapshot_out,
    reduce_rows=_reduce_latest_counterparty_external_credit_snapshots,
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
    current_record: ReferenceCounterpartyCreditProfile,
) -> dict[str, object]:
    provided_fields = payload.model_fields_set
    credit_rating = (
        clean_optional_text(payload.credit_rating)
        if "credit_rating" in provided_fields
        else current_record.credit_rating
    )
    review_due_at = (
        payload.review_due_at
        if "review_due_at" in provided_fields
        else current_record.review_due_at
    )
    limit_currency_code = (
        clean_optional_code(payload.limit_currency_code)
        if "limit_currency_code" in provided_fields
        else current_record.limit_currency_code
    )
    limit_amount = (
        payload.limit_amount
        if "limit_amount" in provided_fields
        else float(current_record.limit_amount)
        if current_record.limit_amount is not None
        else None
    )
    breach_action = normalize_counterparty_credit_breach_action(
        payload.breach_action
        if "breach_action" in provided_fields
        else current_record.breach_action
    )
    notes = (
        clean_optional_text(payload.notes)
        if "notes" in provided_fields
        else current_record.notes
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


def _apply_counterparty_credit_profile_upsert(
    db: Session,
    record: ReferenceCounterpartyCreditProfile,
    payload: CounterpartyCreditProfileUpsert,
) -> None:
    next_values = _resolve_counterparty_credit_profile_values(
        db,
        payload,
        current_record=record,
    )
    for field_name, value in next_values.items():
        setattr(record, field_name, value)


def _apply_counterparty_external_credit_promotion(
    db: Session,
    counterparty_code: str,
    snapshot_id: int,
    record: ReferenceCounterpartyCreditProfile,
    payload: CounterpartyExternalCreditPromotionRequest,
) -> None:
    snapshot = get_scoped_subresource_record(
        db=db,
        model=ReferenceCounterpartyExternalCreditSnapshot,
        record_id=snapshot_id,
        owner_field_name="counterparty_code",
        owner_code=counterparty_code,
        not_found_detail="Counterparty external credit snapshot not found",
    )

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
    return list_reference_collection(
        COUNTERPARTY_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


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
    return list_owned_reference_collection(
        COUNTERPARTY_CREDIT_PROFILE_SPEC,
        db=db,
        limit=limit,
        offset=offset,
    )


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
    return list_reference_collection_query(
        COUNTERPARTY_EXTERNAL_CREDIT_SNAPSHOT_QUERY_SPEC,
        db=db,
        counterparty_code=counterparty_code,
        limit=limit,
        offset=offset,
    )


@router.post("/counterparties", response_model=CounterpartyOut, status_code=201)
def create_counterparty(payload: CounterpartyCreate, db: Session = Depends(get_db)) -> CounterpartyOut:
    return create_reference_resource(COUNTERPARTY_SPEC, payload, db=db)


@router.put("/counterparties/{code}/credit-profile", response_model=CounterpartyCreditProfileOut)
def upsert_counterparty_credit_profile(
    code: str,
    payload: CounterpartyCreditProfileUpsert,
    db: Session = Depends(get_db),
) -> CounterpartyCreditProfileOut:
    return upsert_owned_reference_record(
        COUNTERPARTY_CREDIT_PROFILE_SPEC,
        code,
        payload,
        db=db,
        mutate_record=_apply_counterparty_credit_profile_upsert,
    )


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
    normalized_code = require_owned_reference_parent_code(
        COUNTERPARTY_CREDIT_PROFILE_SPEC,
        code,
        db=db,
    )
    return upsert_owned_reference_record(
        COUNTERPARTY_CREDIT_PROFILE_SPEC,
        normalized_code,
        payload,
        db=db,
        owner_is_normalized=True,
        mutate_record=lambda current_db, record, current_payload: _apply_counterparty_external_credit_promotion(
            current_db,
            normalized_code,
            snapshot_id,
            record,
            current_payload,
        ),
    )


@router.get("/counterparties/{code}", response_model=CounterpartyOut)
def get_counterparty(code: str, db: Session = Depends(get_db)) -> CounterpartyOut:
    return get_reference_resource(COUNTERPARTY_SPEC, code, db=db)


@router.put("/counterparties/{code}", response_model=CounterpartyOut)
def update_counterparty(code: str, payload: CounterpartyUpdate, db: Session = Depends(get_db)) -> CounterpartyOut:
    return update_reference_resource(COUNTERPARTY_SPEC, code, payload, db=db)


@router.post("/counterparties/{code}/deactivate", response_model=CounterpartyOut)
def deactivate_counterparty(
    code: str,
    payload: CounterpartyStatusUpdate,
    db: Session = Depends(get_db),
) -> CounterpartyOut:
    return set_reference_resource_active(
        COUNTERPARTY_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/counterparties/{code}/activate", response_model=CounterpartyOut)
def activate_counterparty(
    code: str,
    payload: CounterpartyStatusUpdate,
    db: Session = Depends(get_db),
) -> CounterpartyOut:
    return set_reference_resource_active(
        COUNTERPARTY_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
