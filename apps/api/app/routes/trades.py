from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.trade import TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("", response_model=List[TradeOut])
def list_trades(db: Session = Depends(get_db)) -> List[TradeOut]:
    rows = db.execute(select(Trade).order_by(Trade.updated_at.desc())).scalars().all()

    return [
        TradeOut(
            trade_id=r.trade_id,
            external_trade_id=r.external_trade_id,
            source_system=r.source_system,
            created_at=r.created_at,
            updated_at=r.updated_at,
            execution_timestamp=r.execution_timestamp,
            trade_nature=r.trade_nature,
            trade_structure=r.trade_structure,
            trade_side=r.trade_side,
            book=r.book,
            portfolio=r.portfolio,
            counterparty=r.counterparty,
            commodity_class=r.commodity_class,
            commodity=r.commodity,
            pricing_type=r.pricing_type,
            pricing_status=r.pricing_status,
            price_index_code=r.price_index_code,
            price=float(r.price) if r.price is not None else None,
            volume=float(r.volume) if r.volume is not None else None,
            settlement_status=r.settlement_status,
            trader_user=r.trader_user,
            status=r.status,
            last_event_id=r.last_event_id,
        )
        for r in rows
    ]


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: str, db: Session = Depends(get_db)) -> TradeOut:
    r = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()

    if r is None:
        raise HTTPException(status_code=404, detail="Trade not found")

    return TradeOut(
        trade_id=r.trade_id,
        external_trade_id=r.external_trade_id,
        source_system=r.source_system,
        created_at=r.created_at,
        updated_at=r.updated_at,
        execution_timestamp=r.execution_timestamp,
        trade_nature=r.trade_nature,
        trade_structure=r.trade_structure,
        trade_side=r.trade_side,
        book=r.book,
        portfolio=r.portfolio,
        counterparty=r.counterparty,
        commodity_class=r.commodity_class,
        commodity=r.commodity,
        pricing_type=r.pricing_type,
        pricing_status=r.pricing_status,
        price_index_code=r.price_index_code,
        price=float(r.price) if r.price is not None else None,
        volume=float(r.volume) if r.volume is not None else None,
        settlement_status=r.settlement_status,
        trader_user=r.trader_user,
        status=r.status,
        last_event_id=r.last_event_id,
    )
