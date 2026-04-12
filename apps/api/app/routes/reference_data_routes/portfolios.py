from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.schemas.reference_data import (
    PortfolioCreate,
    PortfolioOut,
    PortfolioStatusUpdate,
    PortfolioUpdate,
)

from .common import clean_optional_code, clean_optional_text, ensure_active_book_exists
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_portfolio_create_values(db: Session, payload: PortfolioCreate) -> dict[str, object]:
    return {
        "book_code": ensure_active_book_exists(db, payload.book_code),
        "owner": clean_optional_text(payload.owner),
        "strategy": clean_optional_text(payload.strategy),
        "trader_persona": clean_optional_text(payload.trader_persona),
        "risk_archetype": clean_optional_code(payload.risk_archetype),
    }


def _update_portfolio_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "book_code" in provided_fields and payload.book_code is not None:
        record.book_code = normalize_code(payload.book_code)
    if "owner" in provided_fields:
        record.owner = clean_optional_text(payload.owner)
    if "strategy" in provided_fields:
        record.strategy = clean_optional_text(payload.strategy)
    if "trader_persona" in provided_fields:
        record.trader_persona = clean_optional_text(payload.trader_persona)
    if "risk_archetype" in provided_fields:
        record.risk_archetype = clean_optional_code(payload.risk_archetype)


def _validate_portfolio_update(db: Session, payload: PortfolioUpdate) -> None:
    if "book_code" in payload.model_fields_set and payload.book_code is not None:
        ensure_active_book_exists(db, payload.book_code)


PORTFOLIO_SPEC = ReferenceDataCrudSpec(
    model=ReferencePortfolio,
    out_schema_cls=PortfolioOut,
    duplicate_detail="Portfolio already exists",
    build_create_extra_values=_build_portfolio_create_values,
    validate_update=_validate_portfolio_update,
    update_extra_fields=_update_portfolio_fields,
)


@router.get("/portfolios", response_model=List[PortfolioOut])
def list_portfolios(
    q: Optional[str] = None,
    book_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[PortfolioOut]:
    extra_filters = []
    if book_code:
        extra_filters.append(ReferencePortfolio.book_code == normalize_code(book_code))
    return list_reference_collection(
        PORTFOLIO_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


@router.post("/portfolios", response_model=PortfolioOut, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)) -> PortfolioOut:
    return create_reference_resource(PORTFOLIO_SPEC, payload, db=db)


@router.get("/portfolios/{code}", response_model=PortfolioOut)
def get_portfolio(code: str, db: Session = Depends(get_db)) -> PortfolioOut:
    return get_reference_resource(PORTFOLIO_SPEC, code, db=db)


@router.put("/portfolios/{code}", response_model=PortfolioOut)
def update_portfolio(code: str, payload: PortfolioUpdate, db: Session = Depends(get_db)) -> PortfolioOut:
    return update_reference_resource(PORTFOLIO_SPEC, code, payload, db=db)


@router.post("/portfolios/{code}/deactivate", response_model=PortfolioOut)
def deactivate_portfolio(
    code: str,
    payload: PortfolioStatusUpdate,
    db: Session = Depends(get_db),
) -> PortfolioOut:
    return set_reference_resource_active(
        PORTFOLIO_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/portfolios/{code}/activate", response_model=PortfolioOut)
def activate_portfolio(
    code: str,
    payload: PortfolioStatusUpdate,
    db: Session = Depends(get_db),
) -> PortfolioOut:
    return set_reference_resource_active(
        PORTFOLIO_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
