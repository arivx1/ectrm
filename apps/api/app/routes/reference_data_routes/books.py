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
    set_reference_active_state,
    update_reference_record,
)
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.schemas.reference_data import BookCreate, BookOut, BookStatusUpdate, BookUpdate

from .common import ensure_book_not_in_active_use, to_out

router = APIRouter()


@router.get("/books", response_model=List[BookOut])
def list_books(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
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
