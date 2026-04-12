from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.schemas.reference_data import (
    CommodityCreate,
    CommodityOut,
    CommodityStatusUpdate,
    CommodityUpdate,
)

from .common import ensure_commodity_not_in_active_use
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_commodity_create_values(_db: Session, payload: CommodityCreate) -> dict[str, object]:
    return {"commodity_class": normalize_code(payload.commodity_class)}


def _update_commodity_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields and payload.commodity_class is not None:
        record.commodity_class = normalize_code(payload.commodity_class)


COMMODITY_SPEC = ReferenceDataCrudSpec(
    model=ReferenceCommodity,
    out_schema_cls=CommodityOut,
    duplicate_detail="Commodity already exists",
    build_create_extra_values=_build_commodity_create_values,
    update_extra_fields=_update_commodity_fields,
    validate_deactivate=ensure_commodity_not_in_active_use,
)


@router.get("/commodities", response_model=List[CommodityOut])
def list_commodities(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CommodityOut]:
    extra_filters = []
    if commodity_class:
        extra_filters.append(ReferenceCommodity.commodity_class == normalize_code(commodity_class))
    return list_reference_collection(
        COMMODITY_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


@router.post("/commodities", response_model=CommodityOut, status_code=201)
def create_commodity(payload: CommodityCreate, db: Session = Depends(get_db)) -> CommodityOut:
    return create_reference_resource(COMMODITY_SPEC, payload, db=db)


@router.get("/commodities/{code}", response_model=CommodityOut)
def get_commodity(code: str, db: Session = Depends(get_db)) -> CommodityOut:
    return get_reference_resource(COMMODITY_SPEC, code, db=db)


@router.put("/commodities/{code}", response_model=CommodityOut)
def update_commodity(
    code: str,
    payload: CommodityUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    return update_reference_resource(COMMODITY_SPEC, code, payload, db=db)


@router.post("/commodities/{code}/deactivate", response_model=CommodityOut)
def deactivate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    return set_reference_resource_active(
        COMMODITY_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/commodities/{code}/activate", response_model=CommodityOut)
def activate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    return set_reference_resource_active(
        COMMODITY_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
