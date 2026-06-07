from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_reference_validation import (
    require_active_book,
    require_active_commodity,
    require_active_counterparty,
    require_active_currency,
    require_active_location,
    require_active_portfolio,
    require_active_price_index,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import TradeStructure


def resolve_amend_book(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
) -> str:
    if "book" in payload_data and payload_data["book"] is not None:
        return require_active_book(db, payload_data["book"])
    return trade.book


def resolve_amend_currency(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
) -> str | None:
    if "trade_currency_code" in payload_data:
        return require_active_currency(db, payload_data.get("trade_currency_code"))
    return trade.trade_currency_code


def resolve_amend_location(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
) -> str | None:
    if "location_code" in payload_data:
        return require_active_location(db, payload_data.get("location_code"))
    return trade.location_code


def resolve_amend_commodity(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
    *,
    trade_structure: str,
    legs_payload: list[dict[str, object]] | None,
    should_sync_legs: bool,
) -> tuple[str, str, bool]:
    commodity_class = trade.commodity_class
    commodity = trade.commodity
    if (
        "commodity" in payload_data and payload_data["commodity"] is not None
    ) or (
        "commodity_class" in payload_data and payload_data["commodity_class"] is not None
    ):
        commodity_class, commodity = require_active_commodity(
            db,
            payload_data.get("commodity_class", trade.commodity_class),
            payload_data.get("commodity", trade.commodity),
        )
        if trade_structure == TradeStructure.SINGLE.value or legs_payload is not None:
            should_sync_legs = True

    return commodity_class, commodity, should_sync_legs


def resolve_amend_price_index(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
) -> tuple[str, str | None]:
    pricing_type = trade.pricing_type
    price_index_code = trade.price_index_code
    if (
        "pricing_type" in payload_data and payload_data["pricing_type"] is not None
    ) or ("price_index_code" in payload_data):
        return require_active_price_index(
            db,
            payload_data.get("pricing_type", trade.pricing_type),
            payload_data.get("price_index_code", trade.price_index_code),
        )
    return pricing_type, price_index_code


def resolve_amend_counterparty(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
) -> str | None:
    if "counterparty" in payload_data:
        return require_active_counterparty(
            db,
            payload_data.get("counterparty"),
        )
    return require_active_counterparty(db, trade.counterparty)


def resolve_amend_portfolio(
    db: Session,
    trade: Trade,
    payload_data: dict[str, object],
    *,
    book: str,
) -> str | None:
    if "portfolio" in payload_data or "book" in payload_data:
        return require_active_portfolio(
            db,
            payload_data.get("portfolio", trade.portfolio),
            book_code=book,
        )
    return trade.portfolio
