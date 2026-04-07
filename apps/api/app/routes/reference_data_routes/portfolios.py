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
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.schemas.reference_data import (
    PortfolioCreate,
    PortfolioOut,
    PortfolioStatusUpdate,
    PortfolioUpdate,
)

from .common import ensure_active_book_exists, to_out

router = APIRouter()


def _update_portfolio_fields(record, payload, provided_fields: set[str]) -> None:
    if "book_code" in provided_fields and payload.book_code is not None:
        record.book_code = normalize_code(payload.book_code)
    if "owner" in provided_fields:
        record.owner = payload.owner.strip() if payload.owner is not None else None
    if "strategy" in provided_fields:
        record.strategy = payload.strategy.strip() if payload.strategy is not None else None
    if "trader_persona" in provided_fields:
        record.trader_persona = payload.trader_persona.strip() if payload.trader_persona is not None else None
    if "risk_archetype" in provided_fields:
        record.risk_archetype = (
            normalize_code(payload.risk_archetype)
            if payload.risk_archetype is not None
            else None
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
    rows = list_reference_records(
        db,
        ReferencePortfolio,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
    )
    return [to_out(row, PortfolioOut) for row in rows]


@router.post("/portfolios", response_model=PortfolioOut, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)) -> PortfolioOut:
    existing = db.execute(
        select(ReferencePortfolio).where(ReferencePortfolio.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Portfolio already exists")

    book_code = ensure_active_book_exists(db, payload.book_code)
    record = create_reference_record(
        db,
        ReferencePortfolio,
        payload,
        extra_values={
            "book_code": book_code,
            "owner": payload.owner.strip() if payload.owner is not None else None,
            "strategy": payload.strategy.strip() if payload.strategy is not None else None,
            "trader_persona": payload.trader_persona.strip() if payload.trader_persona is not None else None,
            "risk_archetype": (
                normalize_code(payload.risk_archetype)
                if payload.risk_archetype is not None
                else None
            ),
        },
    )
    return to_out(record, PortfolioOut)


@router.get("/portfolios/{code}", response_model=PortfolioOut)
def get_portfolio(code: str, db: Session = Depends(get_db)) -> PortfolioOut:
    record = get_reference_record(db, ReferencePortfolio, code.strip().upper())
    return to_out(record, PortfolioOut)


@router.put("/portfolios/{code}", response_model=PortfolioOut)
def update_portfolio(code: str, payload: PortfolioUpdate, db: Session = Depends(get_db)) -> PortfolioOut:
    record = get_reference_record(db, ReferencePortfolio, code.strip().upper())
    if "book_code" in payload.model_fields_set and payload.book_code is not None:
        ensure_active_book_exists(db, payload.book_code)
    update_reference_record(record, payload, extra_updates=_update_portfolio_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, PortfolioOut)


@router.post("/portfolios/{code}/deactivate", response_model=PortfolioOut)
def deactivate_portfolio(
    code: str,
    payload: PortfolioStatusUpdate,
    db: Session = Depends(get_db),
) -> PortfolioOut:
    record = get_reference_record(db, ReferencePortfolio, code.strip().upper())
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PortfolioOut)


@router.post("/portfolios/{code}/activate", response_model=PortfolioOut)
def activate_portfolio(
    code: str,
    payload: PortfolioStatusUpdate,
    db: Session = Depends(get_db),
) -> PortfolioOut:
    record = get_reference_record(db, ReferencePortfolio, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PortfolioOut)
