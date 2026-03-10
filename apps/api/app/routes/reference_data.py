from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.reference_data import (
    BookCreate,
    BookOut,
    BookStatusUpdate,
    BookUpdate,
    CommodityCreate,
    CommodityOut,
    CommodityStatusUpdate,
    CommodityUpdate,
)

router = APIRouter(prefix="/reference", tags=["reference-data"])

ModelT = TypeVar("ModelT", ReferenceBook, ReferenceCommodity)


def to_out(record: ModelT, schema_cls):
    payload = dict(
        code=record.code,
        name=record.name,
        description=record.description,
        is_active=record.is_active,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
    if isinstance(record, ReferenceCommodity):
        payload["commodity_class"] = record.commodity_class

    return schema_cls(**payload)


def normalize_code(value: str) -> str:
    return value.strip().upper()


def list_reference_records(
    db: Session,
    model,
    q: Optional[str],
    is_active: Optional[bool],
    limit: int,
    offset: int,
) -> list[ModelT]:
    stmt = select(model).order_by(model.code.asc()).limit(limit).offset(offset)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                model.code.ilike(pattern),
                model.name.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(model.is_active == is_active)

    return db.execute(stmt).scalars().all()


def get_reference_record(db: Session, model, code: str):
    record = db.execute(select(model).where(model.code == code)).scalars().first()
    if record is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return record


def create_reference_record(db: Session, model, payload):
    now = datetime.now(timezone.utc)
    values = dict(
        code=normalize_code(payload.code),
        name=payload.name.strip(),
        description=payload.description,
        is_active=True,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        created_at=now,
        created_by=payload.created_by,
        updated_at=now,
        updated_by=payload.created_by,
        version=1,
    )
    if model is ReferenceCommodity:
        values["commodity_class"] = normalize_code(payload.commodity_class)

    record = model(**values)
    db.add(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(record)
    return record


def update_reference_record(record, payload):
    provided_fields = payload.model_fields_set

    if "name" in provided_fields and payload.name is not None:
        record.name = payload.name.strip()
    if "description" in provided_fields:
        record.description = payload.description
    if "effective_from" in provided_fields:
        record.effective_from = payload.effective_from
    if "effective_to" in provided_fields:
        record.effective_to = payload.effective_to
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = payload.updated_by
    record.version += 1


def ensure_book_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.book == code,
            Trade.status != "CANCELLED",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Book cannot be deactivated while active trades reference it",
        )


def ensure_commodity_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.commodity == code,
            Trade.status != "CANCELLED",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commodity cannot be deactivated while active trades reference it",
        )


def set_reference_active_state(record, is_active: bool, updated_by: str) -> None:
    record.is_active = is_active
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = updated_by
    record.version += 1


@router.get("/books", response_model=List[BookOut])
def list_books(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[BookOut]:
    rows = list_reference_records(db, ReferenceBook, q, is_active, limit, offset)
    return [to_out(row, BookOut) for row in rows]


@router.post("/books", response_model=BookOut, status_code=201)
def create_book(payload: BookCreate, db: Session = Depends(get_db)) -> BookOut:
    existing = db.execute(
        select(ReferenceBook).where(ReferenceBook.code == payload.code.strip().upper())
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Book already exists")

    record = create_reference_record(db, ReferenceBook, payload)
    return to_out(record, BookOut)


@router.get("/books/{code}", response_model=BookOut)
def get_book(code: str, db: Session = Depends(get_db)) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    return to_out(record, BookOut)


@router.put("/books/{code}", response_model=BookOut)
def update_book(code: str, payload: BookUpdate, db: Session = Depends(get_db)) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    update_reference_record(record, payload)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.post("/books/{code}/deactivate", response_model=BookOut)
def deactivate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    ensure_book_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.post("/books/{code}/activate", response_model=BookOut)
def activate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.get("/commodities", response_model=List[CommodityOut])
def list_commodities(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
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

    record = create_reference_record(db, ReferenceCommodity, payload)
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
    if payload.commodity_class is not None:
        record.commodity_class = normalize_code(payload.commodity_class)
    update_reference_record(record, payload)
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
