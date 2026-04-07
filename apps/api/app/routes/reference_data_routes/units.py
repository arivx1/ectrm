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
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.schemas.reference_data import UnitCreate, UnitOut, UnitStatusUpdate, UnitUpdate

from .common import ensure_unit_not_in_active_use, to_out

router = APIRouter()


def _update_unit_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields:
        record.commodity_class = normalize_code(payload.commodity_class) if payload.commodity_class else None
    if "dimension" in provided_fields and payload.dimension is not None:
        record.dimension = normalize_code(payload.dimension)
    if "base_unit_code" in provided_fields:
        record.base_unit_code = normalize_code(payload.base_unit_code) if payload.base_unit_code else None
    if "conversion_factor" in provided_fields:
        record.conversion_factor = payload.conversion_factor
    if "precision" in provided_fields and payload.precision is not None:
        record.precision = payload.precision


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
    rows = list_reference_records(
        db,
        ReferenceUnit,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
    )
    return [to_out(row, UnitOut) for row in rows]


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(payload: UnitCreate, db: Session = Depends(get_db)) -> UnitOut:
    existing = db.execute(
        select(ReferenceUnit).where(ReferenceUnit.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Unit already exists")

    record = create_reference_record(
        db,
        ReferenceUnit,
        payload,
        extra_values={
            "commodity_class": normalize_code(payload.commodity_class) if payload.commodity_class else None,
            "dimension": normalize_code(payload.dimension),
            "base_unit_code": normalize_code(payload.base_unit_code) if payload.base_unit_code else None,
            "conversion_factor": payload.conversion_factor,
            "precision": payload.precision,
        },
    )
    return to_out(record, UnitOut)


@router.get("/units/{code}", response_model=UnitOut)
def get_unit(code: str, db: Session = Depends(get_db)) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    return to_out(record, UnitOut)


@router.put("/units/{code}", response_model=UnitOut)
def update_unit(code: str, payload: UnitUpdate, db: Session = Depends(get_db)) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_unit_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)


@router.post("/units/{code}/deactivate", response_model=UnitOut)
def deactivate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    ensure_unit_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)


@router.post("/units/{code}/activate", response_model=UnitOut)
def activate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)
