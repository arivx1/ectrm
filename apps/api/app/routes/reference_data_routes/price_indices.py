from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import (
    create_reference_record,
    get_reference_record,
    list_reference_records,
    normalize_code,
    set_reference_active_state,
    update_reference_record,
)
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.schemas.reference_data import (
    PriceIndexCreate,
    PriceIndexOut,
    PriceIndexStatusUpdate,
    PriceIndexUpdate,
)

from .common import (
    ensure_active_commodity_exists,
    ensure_active_currency_exists,
    ensure_active_location_exists,
    ensure_active_unit_exists,
    ensure_price_index_not_in_active_use,
    to_out,
)

router = APIRouter()


def _update_price_index_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_code" in provided_fields and payload.commodity_code is not None:
        record.commodity_code = normalize_code(payload.commodity_code)
    if "currency_code" in provided_fields and payload.currency_code is not None:
        record.currency_code = normalize_code(payload.currency_code)
    if "unit_code" in provided_fields and payload.unit_code is not None:
        record.unit_code = normalize_code(payload.unit_code)
    if "provider" in provided_fields and payload.provider is not None:
        record.provider = payload.provider.strip()
    if "market" in provided_fields:
        record.market = payload.market.strip() if payload.market is not None else None
    if "location_code" in provided_fields:
        record.location_code = normalize_code(payload.location_code) if payload.location_code else None
    if "calendar_code" in provided_fields:
        record.calendar_code = normalize_code(payload.calendar_code) if payload.calendar_code else None


@router.get("/price-indices", response_model=List[PriceIndexOut])
def list_price_indices(
    q: Optional[str] = None,
    commodity_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[PriceIndexOut]:
    extra_filters = []
    if commodity_code:
        extra_filters.append(ReferencePriceIndex.commodity_code == normalize_code(commodity_code))

    rows = list_reference_records(
        db,
        ReferencePriceIndex,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
    )
    return [to_out(row, PriceIndexOut) for row in rows]


@router.post("/price-indices", response_model=PriceIndexOut, status_code=201)
def create_price_index(payload: PriceIndexCreate, db: Session = Depends(get_db)) -> PriceIndexOut:
    existing = db.execute(
        select(ReferencePriceIndex).where(ReferencePriceIndex.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Price index already exists")

    commodity_code = ensure_active_commodity_exists(db, payload.commodity_code)
    currency_code = ensure_active_currency_exists(db, payload.currency_code)
    unit_code = ensure_active_unit_exists(db, payload.unit_code)
    location_code = ensure_active_location_exists(db, payload.location_code) if payload.location_code else None
    record = create_reference_record(
        db,
        ReferencePriceIndex,
        payload,
        extra_values={
            "commodity_code": commodity_code,
            "currency_code": currency_code,
            "unit_code": unit_code,
            "provider": payload.provider.strip(),
            "market": payload.market.strip() if payload.market is not None else None,
            "location_code": location_code,
            "calendar_code": normalize_code(payload.calendar_code) if payload.calendar_code else None,
        },
    )
    return to_out(record, PriceIndexOut)


@router.get("/price-indices/{code}", response_model=PriceIndexOut)
def get_price_index(code: str, db: Session = Depends(get_db)) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    return to_out(record, PriceIndexOut)


@router.put("/price-indices/{code}", response_model=PriceIndexOut)
def update_price_index(
    code: str,
    payload: PriceIndexUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    if "commodity_code" in payload.model_fields_set and payload.commodity_code is not None:
        ensure_active_commodity_exists(db, payload.commodity_code)
    if "currency_code" in payload.model_fields_set and payload.currency_code is not None:
        ensure_active_currency_exists(db, payload.currency_code)
    if "unit_code" in payload.model_fields_set and payload.unit_code is not None:
        ensure_active_unit_exists(db, payload.unit_code)
    if "location_code" in payload.model_fields_set and payload.location_code:
        ensure_active_location_exists(db, payload.location_code)
    update_reference_record(record, payload, extra_updates=_update_price_index_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)


@router.post("/price-indices/{code}/deactivate", response_model=PriceIndexOut)
def deactivate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    ensure_price_index_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)


@router.post("/price-indices/{code}/activate", response_model=PriceIndexOut)
def activate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)
