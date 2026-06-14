from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.shared.enums import (
    TradeInstrumentType,
    TradeSide,
    TradeStatus,
    TradeStructure,
)

ZERO = Decimal("0")


def normalize_trade_status_for_projection(
    value: object | None,
    *,
    default: str = TradeStatus.ACTIVE.value,
) -> str:
    normalized = str(value or default).strip().upper()
    valid_values = {trade_status.value for trade_status in TradeStatus}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade status '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def trade_status_is_active_for_projection(value: object | None) -> bool:
    return normalize_trade_status_for_projection(value) == TradeStatus.ACTIVE.value


def trade_snapshot(db: Session, trade: Trade | None) -> dict[str, object] | None:
    if trade is None:
        return None

    db.flush()
    legs = db.execute(
        select(TradeLeg)
        .where(TradeLeg.trade_id == trade.trade_id)
        .order_by(TradeLeg.leg_no.asc())
    ).scalars().all()

    return {
        "trade_id": trade.trade_id,
        "instrument_type": trade.instrument_type,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "trade_structure": trade.trade_structure,
        "trade_side": trade.trade_side,
        "trade_currency_code": trade.trade_currency_code,
        "price_unit_code": trade.price_unit_code,
        "price": Decimal(str(trade.price or 0)) if trade.price is not None else None,
        "volume": Decimal(str(trade.volume or 0)),
        "option_type": trade.option_type,
        "option_style": trade.option_style,
        "option_strike_price": Decimal(str(trade.option_strike_price))
        if trade.option_strike_price is not None
        else None,
        "option_expiration_date": trade.option_expiration_date,
        "status": trade.status,
        "updated_at": trade.updated_at,
        "legs": [
            {
                "commodity": leg.commodity_code,
                "side": leg.side,
                "volume": Decimal(str(leg.quantity or 0)),
            }
            for leg in legs
        ],
    }


def signed_volume(side: object | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    normalized_side = str(side or TradeSide.BUY.value).strip().upper()
    if normalized_side == TradeSide.SELL.value:
        return volume * Decimal("-1")
    return volume


def active_volume_by_commodity(trade: dict[str, object] | None) -> dict[str, Decimal]:
    instrument_type = (
        str(trade.get("instrument_type") or TradeInstrumentType.LINEAR.value).strip().upper()
        if trade is not None
        else None
    )
    if (
        trade is None
        or not trade_status_is_active_for_projection(trade.get("status"))
        or instrument_type == TradeInstrumentType.OPTION.value
    ):
        return {}

    if trade.get("trade_structure") == TradeStructure.SWAP.value:
        totals: dict[str, Decimal] = {}
        for leg in trade.get("legs", []):
            if not isinstance(leg, dict):
                continue
            commodity = str(leg.get("commodity") or "UNKNOWN")
            totals[commodity] = totals.get(commodity, ZERO) + signed_volume(
                leg.get("side"),
                leg.get("volume"),
            )
        return {
            commodity: quantity
            for commodity, quantity in totals.items()
            if quantity != ZERO
        }

    commodity = str(trade.get("commodity") or "UNKNOWN")
    volume = signed_volume(trade.get("trade_side"), trade.get("volume"))
    if volume == ZERO:
        return {}
    return {commodity: volume}


def apply_position_delta(db: Session, commodity: str, delta: Decimal, updated_at: datetime) -> None:
    if delta == ZERO:
        return

    existing = db.execute(
        select(Position).where(Position.commodity == commodity)
    ).scalars().first()

    if existing is None:
        if delta != ZERO:
            db.add(Position(commodity=commodity, net_volume=delta, updated_at=updated_at))
        return

    next_volume = Decimal(str(existing.net_volume)) + delta
    if next_volume == ZERO:
        db.delete(existing)
        return

    existing.net_volume = next_volume
    existing.updated_at = updated_at


def sync_positions_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_contrib = active_volume_by_commodity(before)
    after_contrib = active_volume_by_commodity(after)
    commodities = set(before_contrib) | set(after_contrib)

    for commodity in commodities:
        delta = after_contrib.get(commodity, ZERO) - before_contrib.get(commodity, ZERO)
        apply_position_delta(db, commodity, delta, updated_at)
