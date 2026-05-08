from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.schemas.reference_data import (
    PriceIndexCreate,
    PriceIndexOut,
    PriceIndexStatusUpdate,
    PriceIndexUpdate,
)

from .common import (
    ensure_active_commodity_exists,
    ensure_active_calendar_exists,
    ensure_active_currency_exists,
    ensure_active_location_exists,
    ensure_active_unit_exists,
    ensure_price_index_not_in_active_use,
    clean_optional_code,
    clean_optional_text,
)
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_price_index_create_values(db: Session, payload: PriceIndexCreate) -> dict[str, object]:
    return {
        "commodity_code": ensure_active_commodity_exists(db, payload.commodity_code),
        "currency_code": ensure_active_currency_exists(db, payload.currency_code),
        "unit_code": ensure_active_unit_exists(db, payload.unit_code),
        "provider": payload.provider.strip(),
        "market": clean_optional_text(payload.market),
        "location_code": (
            ensure_active_location_exists(db, payload.location_code)
            if payload.location_code
            else None
        ),
        "calendar_code": (
            ensure_active_calendar_exists(db, payload.calendar_code)
            if payload.calendar_code
            else None
        ),
    }


def _update_price_index_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "commodity_code" in provided_fields and payload.commodity_code is not None:
        record.commodity_code = normalize_code(payload.commodity_code)
    if "currency_code" in provided_fields and payload.currency_code is not None:
        record.currency_code = normalize_code(payload.currency_code)
    if "unit_code" in provided_fields and payload.unit_code is not None:
        record.unit_code = normalize_code(payload.unit_code)
    if "provider" in provided_fields and payload.provider is not None:
        record.provider = payload.provider.strip()
    if "market" in provided_fields:
        record.market = clean_optional_text(payload.market)
    if "location_code" in provided_fields:
        record.location_code = clean_optional_code(payload.location_code)
    if "calendar_code" in provided_fields:
        record.calendar_code = clean_optional_code(payload.calendar_code)


def _validate_price_index_update(db: Session, payload: PriceIndexUpdate) -> None:
    if "commodity_code" in payload.model_fields_set and payload.commodity_code is not None:
        ensure_active_commodity_exists(db, payload.commodity_code)
    if "currency_code" in payload.model_fields_set and payload.currency_code is not None:
        ensure_active_currency_exists(db, payload.currency_code)
    if "unit_code" in payload.model_fields_set and payload.unit_code is not None:
        ensure_active_unit_exists(db, payload.unit_code)
    if "location_code" in payload.model_fields_set and payload.location_code:
        ensure_active_location_exists(db, payload.location_code)
    if "calendar_code" in payload.model_fields_set and payload.calendar_code:
        ensure_active_calendar_exists(db, payload.calendar_code)


PRICE_INDEX_SPEC = ReferenceDataCrudSpec(
    model=ReferencePriceIndex,
    out_schema_cls=PriceIndexOut,
    duplicate_detail="Price index already exists",
    build_create_extra_values=_build_price_index_create_values,
    validate_update=_validate_price_index_update,
    update_extra_fields=_update_price_index_fields,
    validate_deactivate=ensure_price_index_not_in_active_use,
)


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
    return list_reference_collection(
        PRICE_INDEX_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


@router.post("/price-indices", response_model=PriceIndexOut, status_code=201)
def create_price_index(payload: PriceIndexCreate, db: Session = Depends(get_db)) -> PriceIndexOut:
    return create_reference_resource(PRICE_INDEX_SPEC, payload, db=db)


@router.get("/price-indices/{code}", response_model=PriceIndexOut)
def get_price_index(code: str, db: Session = Depends(get_db)) -> PriceIndexOut:
    return get_reference_resource(PRICE_INDEX_SPEC, code, db=db)


@router.put("/price-indices/{code}", response_model=PriceIndexOut)
def update_price_index(
    code: str,
    payload: PriceIndexUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    return update_reference_resource(PRICE_INDEX_SPEC, code, payload, db=db)


@router.post("/price-indices/{code}/deactivate", response_model=PriceIndexOut)
def deactivate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    return set_reference_resource_active(
        PRICE_INDEX_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/price-indices/{code}/activate", response_model=PriceIndexOut)
def activate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    return set_reference_resource_active(
        PRICE_INDEX_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
