from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.schemas.trade import TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


def _to_trade_out(row: Trade) -> TradeOut:
    return TradeOut(
        trade_id=row.trade_id,
        originating_option_trade_id=row.originating_option_trade_id,
        external_trade_id=row.external_trade_id,
        source_system=row.source_system,
        created_at=row.created_at,
        updated_at=row.updated_at,
        execution_timestamp=row.execution_timestamp,
        trade_date=row.trade_date,
        effective_start_date=row.effective_start_date,
        effective_end_date=row.effective_end_date,
        quality_spec=row.quality_spec,
        unit_of_measure=row.unit_of_measure,
        trade_currency_code=row.trade_currency_code,
        location_code=row.location_code,
        delivery_start=row.delivery_start,
        delivery_end=row.delivery_end,
        price_unit_code=row.price_unit_code,
        instrument_type=row.instrument_type,
        option_type=row.option_type,
        option_style=row.option_style,
        option_strike_price=float(row.option_strike_price) if row.option_strike_price is not None else None,
        option_expiration_date=row.option_expiration_date,
        trade_nature=row.trade_nature,
        trade_structure=row.trade_structure,
        trade_side=row.trade_side,
        book=row.book,
        portfolio=row.portfolio,
        counterparty=row.counterparty,
        commodity_class=row.commodity_class,
        commodity=row.commodity,
        pricing_type=row.pricing_type,
        pricing_status=row.pricing_status,
        confirmation_status=row.confirmation_status,
        nomination_status=row.nomination_status,
        allocation_status=row.allocation_status,
        actualization_status=row.actualization_status,
        price_index_code=row.price_index_code,
        price=float(row.price) if row.price is not None else None,
        volume=float(row.volume) if row.volume is not None else None,
        invoice_status=row.invoice_status,
        payment_status=row.payment_status,
        settlement_status=row.settlement_status,
        trader_user=row.trader_user,
        status=row.status,
        last_event_id=row.last_event_id,
    )


@router.get("", response_model=List[TradeOut])
def list_trades(
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[TradeOut]:
    rows = db.execute(
        select(Trade)
        .order_by(*trade_recency_order())
        .offset(offset)
        .limit(limit)
    ).scalars().all()
    return [_to_trade_out(row) for row in rows]


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: str, db: Session = Depends(get_db)) -> TradeOut:
    r = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()

    if r is None:
        raise HTTPException(status_code=404, detail="Trade not found")

    return _to_trade_out(r)
