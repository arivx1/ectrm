from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.schemas.reference_data import (
    CurrencyCreate,
    CurrencyOut,
    CurrencyStatusUpdate,
    CurrencyUpdate,
)

from .common import clean_optional_text, ensure_currency_not_in_active_use
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_currency_create_values(_db: Session, payload: CurrencyCreate) -> dict[str, object]:
    return {"symbol": clean_optional_text(payload.symbol)}


def _update_currency_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "symbol" in provided_fields:
        record.symbol = clean_optional_text(payload.symbol)


CURRENCY_SPEC = ReferenceDataCrudSpec(
    model=ReferenceCurrency,
    out_schema_cls=CurrencyOut,
    duplicate_detail="Currency already exists",
    build_create_extra_values=_build_currency_create_values,
    update_extra_fields=_update_currency_fields,
    validate_deactivate=ensure_currency_not_in_active_use,
)


@router.get("/currencies", response_model=List[CurrencyOut])
def list_currencies(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[CurrencyOut]:
    return list_reference_collection(
        CURRENCY_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )


@router.post("/currencies", response_model=CurrencyOut, status_code=201)
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)) -> CurrencyOut:
    return create_reference_resource(CURRENCY_SPEC, payload, db=db)


@router.get("/currencies/{code}", response_model=CurrencyOut)
def get_currency(code: str, db: Session = Depends(get_db)) -> CurrencyOut:
    return get_reference_resource(CURRENCY_SPEC, code, db=db)


@router.put("/currencies/{code}", response_model=CurrencyOut)
def update_currency(code: str, payload: CurrencyUpdate, db: Session = Depends(get_db)) -> CurrencyOut:
    return update_reference_resource(CURRENCY_SPEC, code, payload, db=db)


@router.post("/currencies/{code}/deactivate", response_model=CurrencyOut)
def deactivate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    return set_reference_resource_active(
        CURRENCY_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/currencies/{code}/activate", response_model=CurrencyOut)
def activate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    return set_reference_resource_active(
        CURRENCY_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
