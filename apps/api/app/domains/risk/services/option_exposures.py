from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import OptionType, TradeInstrumentType, TradeSide, TradeStatus

ZERO = Decimal("0")


def _normalize_code(value: object | None, *, default: str | None = None) -> str | None:
    normalized = str(value or "").strip().upper()
    if normalized:
        return normalized
    return default


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _to_decimal_or_none(value: object | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


def _trade_sign(trade_side: object | None) -> Decimal:
    normalized_trade_side = _normalize_code(trade_side, default=TradeSide.BUY.value)
    if normalized_trade_side == TradeSide.SELL.value:
        return Decimal("-1")
    return Decimal("1")


def _option_sign(option_type: object | None) -> Decimal:
    normalized_option_type = _normalize_code(option_type, default=OptionType.CALL.value)
    if normalized_option_type == OptionType.PUT.value:
        return Decimal("-1")
    return Decimal("1")


def calculate_underlying_equivalent_volume(
    trade_side: object | None,
    option_type: object | None,
    contract_volume: object | None,
) -> Decimal:
    volume = _to_decimal_or_none(contract_volume) or ZERO
    return volume * _trade_sign(trade_side) * _option_sign(option_type)


def calculate_premium_cashflow(
    trade_side: object | None,
    premium_price: object | None,
    contract_volume: object | None,
) -> Decimal | None:
    normalized_premium_price = _to_decimal_or_none(premium_price)
    if normalized_premium_price is None:
        return None
    volume = _to_decimal_or_none(contract_volume) or ZERO
    return normalized_premium_price * volume * _trade_sign(trade_side)


def build_option_exposure_snapshot(
    trade: dict[str, object] | None,
    *,
    updated_at: datetime | None = None,
) -> dict[str, Any] | None:
    if trade is None:
        return None

    instrument_type = _normalize_code(
        trade.get("instrument_type"),
        default=TradeInstrumentType.LINEAR.value,
    )
    status = _normalize_code(trade.get("status"), default=TradeStatus.ACTIVE.value)
    if instrument_type != TradeInstrumentType.OPTION.value or status != TradeStatus.ACTIVE.value:
        return None

    trade_id = str(trade.get("trade_id") or "").strip()
    if not trade_id:
        return None

    contract_volume = _to_decimal_or_none(trade.get("volume")) or ZERO
    if contract_volume == ZERO:
        return None

    option_type = _normalize_code(trade.get("option_type"))
    if option_type is None:
        return None

    return {
        "trade_id": trade_id,
        "book": _normalize_code(trade.get("book"), default="UNKNOWN") or "UNKNOWN",
        "portfolio": _normalize_optional_text(trade.get("portfolio")),
        "counterparty": _normalize_code(trade.get("counterparty")),
        "commodity_class": _normalize_code(trade.get("commodity_class"), default="UNKNOWN") or "UNKNOWN",
        "commodity": _normalize_code(trade.get("commodity"), default="UNKNOWN") or "UNKNOWN",
        "trade_side": _normalize_code(trade.get("trade_side"), default=TradeSide.BUY.value)
        or TradeSide.BUY.value,
        "option_type": option_type,
        "option_style": _normalize_code(trade.get("option_style")),
        "option_strike_price": _to_decimal_or_none(trade.get("option_strike_price")),
        "option_expiration_date": trade.get("option_expiration_date"),
        "contract_volume": contract_volume,
        "premium_price": _to_decimal_or_none(trade.get("price")),
        "premium_cashflow": calculate_premium_cashflow(
            trade.get("trade_side"),
            trade.get("price"),
            trade.get("volume"),
        ),
        "underlying_equivalent_volume": calculate_underlying_equivalent_volume(
            trade.get("trade_side"),
            trade.get("option_type"),
            trade.get("volume"),
        ),
        "trade_currency_code": _normalize_code(trade.get("trade_currency_code")),
        "price_unit_code": _normalize_code(trade.get("price_unit_code")),
        "updated_at": updated_at
        or trade.get("updated_at")
        or datetime.now(timezone.utc),
    }


def build_option_exposure_snapshot_from_trade(trade: Trade) -> dict[str, Any] | None:
    return build_option_exposure_snapshot(
        {
            "trade_id": trade.trade_id,
            "instrument_type": trade.instrument_type,
            "status": trade.status,
            "book": trade.book,
            "portfolio": trade.portfolio,
            "counterparty": trade.counterparty,
            "commodity_class": trade.commodity_class,
            "commodity": trade.commodity,
            "trade_side": trade.trade_side,
            "option_type": trade.option_type,
            "option_style": trade.option_style,
            "option_strike_price": trade.option_strike_price,
            "option_expiration_date": trade.option_expiration_date,
            "volume": trade.volume,
            "price": trade.price,
            "trade_currency_code": trade.trade_currency_code,
            "price_unit_code": trade.price_unit_code,
            "updated_at": trade.updated_at,
        }
    )


def upsert_option_exposure(db: Session, snapshot: dict[str, Any]) -> None:
    existing = db.get(OptionExposure, snapshot["trade_id"])
    if existing is None:
        db.add(OptionExposure(**snapshot))
        return

    for field, value in snapshot.items():
        setattr(existing, field, value)


def sync_option_exposures_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_snapshot = build_option_exposure_snapshot(before, updated_at=updated_at)
    after_snapshot = build_option_exposure_snapshot(after, updated_at=updated_at)

    trade_id = None
    if after_snapshot is not None:
        trade_id = after_snapshot["trade_id"]
    elif before_snapshot is not None:
        trade_id = before_snapshot["trade_id"]
    elif after is not None:
        trade_id = str(after.get("trade_id") or "").strip() or None
    elif before is not None:
        trade_id = str(before.get("trade_id") or "").strip() or None

    if after_snapshot is None:
        if trade_id:
            existing = db.get(OptionExposure, trade_id)
            if existing is not None:
                db.delete(existing)
        return

    upsert_option_exposure(db, after_snapshot)


def rebuild_option_exposures_projection(db: Session) -> int:
    db.execute(text("DELETE FROM option_exposures"))
    db.flush()

    count = 0
    for trade in db.execute(select(Trade)).scalars():
        snapshot = build_option_exposure_snapshot_from_trade(trade)
        if snapshot is None:
            continue
        db.add(OptionExposure(**snapshot))
        count += 1

    return count
