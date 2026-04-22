from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.schemas.reference_data import UnitCreate, UnitOut, UnitStatusUpdate, UnitUpdate

from .common import clean_optional_code, ensure_unit_not_in_active_use
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_unit_create_values(_db: Session, payload: UnitCreate) -> dict[str, object]:
    return {
        "commodity_class": clean_optional_code(payload.commodity_class),
        "dimension": normalize_code(payload.dimension),
        "base_unit_code": clean_optional_code(payload.base_unit_code),
        "conversion_factor": payload.conversion_factor,
        "precision": payload.precision,
    }


def _update_unit_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields:
        record.commodity_class = clean_optional_code(payload.commodity_class)
    if "dimension" in provided_fields and payload.dimension is not None:
        record.dimension = normalize_code(payload.dimension)
    if "base_unit_code" in provided_fields:
        record.base_unit_code = clean_optional_code(payload.base_unit_code)
    if "conversion_factor" in provided_fields:
        record.conversion_factor = payload.conversion_factor
    if "precision" in provided_fields and payload.precision is not None:
        record.precision = payload.precision


UNIT_SPEC = ReferenceDataCrudSpec(
    model=ReferenceUnit,
    out_schema_cls=UnitOut,
    duplicate_detail="Unit already exists",
    build_create_extra_values=_build_unit_create_values,
    update_extra_fields=_update_unit_fields,
    validate_deactivate=ensure_unit_not_in_active_use,
)


@router.get("/units", response_model=List[UnitOut])
def list_units(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    dimension: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[UnitOut]:
    extra_filters = []
    if commodity_class:
        extra_filters.append(ReferenceUnit.commodity_class == normalize_code(commodity_class))
    if dimension:
        extra_filters.append(ReferenceUnit.dimension == normalize_code(dimension))
    return list_reference_collection(
        UNIT_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(payload: UnitCreate, db: Session = Depends(get_db)) -> UnitOut:
    return create_reference_resource(UNIT_SPEC, payload, db=db)


@router.get("/units/{code}", response_model=UnitOut)
def get_unit(code: str, db: Session = Depends(get_db)) -> UnitOut:
    return get_reference_resource(UNIT_SPEC, code, db=db)


@router.put("/units/{code}", response_model=UnitOut)
def update_unit(code: str, payload: UnitUpdate, db: Session = Depends(get_db)) -> UnitOut:
    return update_reference_resource(UNIT_SPEC, code, payload, db=db)


@router.post("/units/{code}/deactivate", response_model=UnitOut)
def deactivate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    return set_reference_resource_active(
        UNIT_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/units/{code}/activate", response_model=UnitOut)
def activate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    return set_reference_resource_active(
        UNIT_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
