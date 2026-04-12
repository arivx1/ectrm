from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.schemas.reference_data import BookCreate, BookOut, BookStatusUpdate, BookUpdate

from .common import ensure_book_not_in_active_use
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()

BOOK_SPEC = ReferenceDataCrudSpec(
    model=ReferenceBook,
    out_schema_cls=BookOut,
    duplicate_detail="Book already exists",
    validate_deactivate=ensure_book_not_in_active_use,
)


@router.get("/books", response_model=List[BookOut])
def list_books(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[BookOut]:
    return list_reference_collection(
        BOOK_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )


@router.post("/books", response_model=BookOut, status_code=201)
def create_book(payload: BookCreate, db: Session = Depends(get_db)) -> BookOut:
    return create_reference_resource(BOOK_SPEC, payload, db=db)


@router.get("/books/{code}", response_model=BookOut)
def get_book(code: str, db: Session = Depends(get_db)) -> BookOut:
    return get_reference_resource(BOOK_SPEC, code, db=db)


@router.put("/books/{code}", response_model=BookOut)
def update_book(code: str, payload: BookUpdate, db: Session = Depends(get_db)) -> BookOut:
    return update_reference_resource(BOOK_SPEC, code, payload, db=db)


@router.post("/books/{code}/deactivate", response_model=BookOut)
def deactivate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    return set_reference_resource_active(
        BOOK_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/books/{code}/activate", response_model=BookOut)
def activate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    return set_reference_resource_active(
        BOOK_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
