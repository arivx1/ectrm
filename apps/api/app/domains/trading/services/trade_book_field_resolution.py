from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_defaults import DEFAULT_SOURCE_SYSTEM
from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_instrument_type,
    normalize_optional_number,
    normalize_optional_text,
    normalize_trade_nature,
    normalize_trade_structure,
    parse_execution_timestamp,
    parse_optional_date,
)
from apps.api.app.domains.trading.services.trade_reference_validation import (
    require_active_book,
    require_active_commodity,
    require_active_counterparty,
    require_active_currency,
    require_active_location,
    require_active_portfolio,
    require_active_price_index,
)
from apps.api.app.domains.trading.services.trade_unit_resolution import (
    resolve_trade_price_unit,
    resolve_trade_quantity_unit,
)
from apps.api.app.domains.trading.services.trade_write_rules import (
    validate_trade_structure_payload,
)
from apps.api.app.shared.enums import (
    TradeInstrumentType,
    TradeNature,
)


@dataclass(frozen=True)
class BookTradeFieldResolution:
    instrument_type: str
    trade_nature: str
    trade_structure: str
    trade_side: str | None
    legs_payload: list[dict[str, object]]
    book: str
    commodity_class: str
    commodity: str
    price: float | None
    volume: float | None
    external_trade_id: str | None
    source_system: str
    execution_timestamp: datetime | None
    trade_date: date
    effective_start_date: date | None
    effective_end_date: date | None
    quality_spec: str | None
    unit_of_measure: str
    trade_currency_code: str | None
    location_code: str | None
    delivery_start: date | None
    delivery_end: date | None
    price_unit_code: str | None
    counterparty: str | None
    portfolio: str | None
    pricing_type: str
    price_index_code: str | None
    trader_user: str | None


def resolve_book_trade_fields(
    db: Session,
    *,
    payload_data: dict[str, object],
    occurred_at: datetime | None,
    checked_at: datetime | None,
) -> BookTradeFieldResolution:
    instrument_type = normalize_instrument_type(payload_data.get("instrument_type"))
    trade_nature_value = payload_data.get("trade_nature")
    if instrument_type == TradeInstrumentType.OPTION.value and trade_nature_value in {None, ""}:
        trade_nature_value = TradeNature.FINANCIAL.value
    trade_nature = normalize_trade_nature(trade_nature_value)
    trade_structure = normalize_trade_structure(payload_data.get("trade_structure"))
    trade_side, legs_payload = validate_trade_structure_payload(
        trade_structure,
        payload_data.get("trade_side"),
        payload_data.get("legs"),
    )
    book = require_active_book(db, payload_data.get("book"))
    commodity_class, commodity = require_active_commodity(
        db,
        payload_data.get("commodity_class"),
        payload_data.get("commodity"),
    )
    price = normalize_optional_number(
        payload_data.get("price"),
        field_name="Price Differential",
    )
    volume = normalize_optional_number(
        payload_data.get("volume"),
        field_name="Volume",
    )
    pricing_type, price_index_code = require_active_price_index(
        db,
        payload_data.get("pricing_type"),
        payload_data.get("price_index_code"),
    )
    external_trade_id = normalize_optional_text(payload_data.get("external_trade_id"))
    source_system = (
        normalize_optional_text(payload_data.get("source_system"), uppercase=True)
        or DEFAULT_SOURCE_SYSTEM
    )
    execution_timestamp = parse_execution_timestamp(payload_data.get("execution_timestamp"))
    trade_date = _resolve_book_trade_date(
        payload_data,
        execution_timestamp=execution_timestamp,
        occurred_at=occurred_at,
        checked_at=checked_at,
    )
    effective_start_date = parse_optional_date(
        payload_data.get("effective_start_date"),
        field_name="effective_start_date",
    )
    effective_end_date = parse_optional_date(
        payload_data.get("effective_end_date"),
        field_name="effective_end_date",
    )
    quality_spec = normalize_optional_text(payload_data.get("quality_spec"))
    unit_of_measure = resolve_trade_quantity_unit(
        db,
        payload_data.get("unit_of_measure"),
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    trade_currency_code = require_active_currency(
        db,
        payload_data.get("trade_currency_code"),
    )
    location_code = require_active_location(db, payload_data.get("location_code"))
    delivery_start = parse_optional_date(
        payload_data.get("delivery_start"),
        field_name="delivery_start",
    )
    delivery_end = parse_optional_date(
        payload_data.get("delivery_end"),
        field_name="delivery_end",
    )
    price_unit_code = resolve_trade_price_unit(
        db,
        payload_data.get("price_unit_code"),
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    counterparty = require_active_counterparty(db, payload_data.get("counterparty"))
    portfolio = require_active_portfolio(
        db,
        payload_data.get("portfolio"),
        book_code=book,
    )
    trader_user = normalize_optional_text(payload_data.get("trader_user"))

    return BookTradeFieldResolution(
        instrument_type=instrument_type,
        trade_nature=trade_nature,
        trade_structure=trade_structure,
        trade_side=trade_side,
        legs_payload=legs_payload,
        book=book,
        commodity_class=commodity_class,
        commodity=commodity,
        price=price,
        volume=volume,
        external_trade_id=external_trade_id,
        source_system=source_system,
        execution_timestamp=execution_timestamp,
        trade_date=trade_date,
        effective_start_date=effective_start_date,
        effective_end_date=effective_end_date,
        quality_spec=quality_spec,
        unit_of_measure=unit_of_measure,
        trade_currency_code=trade_currency_code,
        location_code=location_code,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        price_unit_code=price_unit_code,
        counterparty=counterparty,
        portfolio=portfolio,
        pricing_type=pricing_type,
        price_index_code=price_index_code,
        trader_user=trader_user,
    )


def _resolve_book_trade_date(
    payload_data: dict[str, object],
    *,
    execution_timestamp: datetime | None,
    occurred_at: datetime | None,
    checked_at: datetime | None,
) -> date:
    trade_date = parse_optional_date(
        payload_data.get("trade_date"),
        field_name="trade_date",
    )
    if trade_date is not None:
        return trade_date

    basis_timestamp = execution_timestamp or occurred_at or checked_at or datetime.utcnow()
    return basis_timestamp.date()
