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
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.schemas.reference_data import (
    CurrencyCreate,
    CurrencyOut,
    CurrencyStatusUpdate,
    CurrencyUpdate,
)

from .common import ensure_currency_not_in_active_use, to_out

router = APIRouter()


def _update_currency_fields(record, payload, provided_fields: set[str]) -> None:
    if "symbol" in provided_fields:
        record.symbol = payload.symbol.strip() if payload.symbol is not None else None


@router.get("/currencies", response_model=List[CurrencyOut])
def list_currencies(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CurrencyOut]:
    rows = list_reference_records(db, ReferenceCurrency, q, is_active, limit, offset)
    return [to_out(row, CurrencyOut) for row in rows]


@router.post("/currencies", response_model=CurrencyOut, status_code=201)
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)) -> CurrencyOut:
    existing = db.execute(
        select(ReferenceCurrency).where(ReferenceCurrency.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Currency already exists")

    record = create_reference_record(
        db,
        ReferenceCurrency,
        payload,
        extra_values={"symbol": payload.symbol.strip() if payload.symbol is not None else None},
    )
    return to_out(record, CurrencyOut)


@router.get("/currencies/{code}", response_model=CurrencyOut)
def get_currency(code: str, db: Session = Depends(get_db)) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    return to_out(record, CurrencyOut)


@router.put("/currencies/{code}", response_model=CurrencyOut)
def update_currency(code: str, payload: CurrencyUpdate, db: Session = Depends(get_db)) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_currency_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)


@router.post("/currencies/{code}/deactivate", response_model=CurrencyOut)
def deactivate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    ensure_currency_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)


@router.post("/currencies/{code}/activate", response_model=CurrencyOut)
def activate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)
