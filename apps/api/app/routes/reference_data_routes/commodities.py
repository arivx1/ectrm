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
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.schemas.reference_data import (
    CommodityCreate,
    CommodityOut,
    CommodityStatusUpdate,
    CommodityUpdate,
)

from .common import ensure_commodity_not_in_active_use, to_out

router = APIRouter()


def _update_commodity_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields and payload.commodity_class is not None:
        record.commodity_class = normalize_code(payload.commodity_class)


@router.get("/commodities", response_model=List[CommodityOut])
def list_commodities(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CommodityOut]:
    rows = list_reference_records(db, ReferenceCommodity, q, is_active, limit, offset)
    if commodity_class:
        rows = [row for row in rows if row.commodity_class == normalize_code(commodity_class)]
    return [to_out(row, CommodityOut) for row in rows]


@router.post("/commodities", response_model=CommodityOut, status_code=201)
def create_commodity(payload: CommodityCreate, db: Session = Depends(get_db)) -> CommodityOut:
    existing = db.execute(
        select(ReferenceCommodity).where(ReferenceCommodity.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Commodity already exists")

    record = create_reference_record(
        db,
        ReferenceCommodity,
        payload,
        extra_values={"commodity_class": normalize_code(payload.commodity_class)},
    )
    return to_out(record, CommodityOut)


@router.get("/commodities/{code}", response_model=CommodityOut)
def get_commodity(code: str, db: Session = Depends(get_db)) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    return to_out(record, CommodityOut)


@router.put("/commodities/{code}", response_model=CommodityOut)
def update_commodity(
    code: str,
    payload: CommodityUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_commodity_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)


@router.post("/commodities/{code}/deactivate", response_model=CommodityOut)
def deactivate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    ensure_commodity_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)


@router.post("/commodities/{code}/activate", response_model=CommodityOut)
def activate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)
