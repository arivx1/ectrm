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
def list_trades(limit: int = 50, db: Session = Depends(get_db)) -> List[TradeOut]:
    limit = max(1, min(limit, 500))
    rows = db.execute(
        select(Trade).order_by(Trade.updated_at.desc()).limit(limit)
    ).scalars().all()

    return [
        TradeOut(
            trade_id=r.trade_id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            commodity=r.commodity,
            price=float(r.price) if r.price is not None else None,
            volume=float(r.volume) if r.volume is not None else None,
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
        created_at=r.created_at,
        updated_at=r.updated_at,
        commodity=r.commodity,
        price=float(r.price) if r.price is not None else None,
        volume=float(r.volume) if r.volume is not None else None,
        status=r.status,
        last_event_id=r.last_event_id,
    )
