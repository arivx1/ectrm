from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_amend_reference_resolution import (
    resolve_amend_book,
    resolve_amend_commodity,
    resolve_amend_counterparty,
    resolve_amend_currency,
    resolve_amend_location,
    resolve_amend_portfolio,
    resolve_amend_price_index,
)
from apps.api.app.domains.trading.services.trade_amend_scalar_resolution import (
    resolve_amend_instrument_type,
    resolve_amend_option_field_inputs,
    resolve_amend_optional_date_field,
    resolve_amend_optional_number_field,
    resolve_amend_optional_text_field,
    resolve_amend_structure_fields,
    resolve_amend_trade_nature,
    resolve_amend_trade_structure,
)
from apps.api.app.domains.trading.services.trade_payload_normalization import (
    parse_execution_timestamp,
)
from apps.api.app.domains.trading.services.trade_unit_resolution import (
    resolve_trade_price_unit,
    resolve_trade_quantity_unit,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import TradeStructure


@dataclass(frozen=True)
class AmendTradeFieldResolution:
    instrument_type: str
    trade_nature: str
    trade_structure: str
    trade_side: str | None
    legs_payload: list[dict[str, object]] | None
    should_sync_legs: bool
    book: str
    external_trade_id: str | None
    source_system: str | None
    execution_timestamp: datetime | None
    trade_date: date | None
    effective_start_date: date | None
    effective_end_date: date | None
    quality_spec: str | None
    unit_of_measure: str | None
    trade_currency_code: str | None
    location_code: str | None
    delivery_start: date | None
    delivery_end: date | None
    price_unit_code: str | None
    commodity_class: str
    commodity: str
    pricing_type: str
    price_index_code: str | None
    price: float | None
    volume: float | None
    counterparty: str | None
    portfolio: str | None
    trader_user: str | None
    option_type_value: object | None
    option_style_value: object | None
    option_strike_price_value: object | None
    option_expiration_date_value: object | None


def resolve_amend_trade_fields(
    db: Session,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> AmendTradeFieldResolution:
    instrument_type = resolve_amend_instrument_type(trade, payload_data)
    trade_nature = resolve_amend_trade_nature(trade, payload_data)
    trade_structure = resolve_amend_trade_structure(trade, payload_data)
    trade_side, legs_payload, should_sync_legs = resolve_amend_structure_fields(
        trade,
        payload_data,
        trade_structure=trade_structure,
    )

    book = resolve_amend_book(db, trade, payload_data)
    external_trade_id = resolve_amend_optional_text_field(
        trade.external_trade_id,
        payload_data,
        field_name="external_trade_id",
    )
    source_system = resolve_amend_optional_text_field(
        trade.source_system,
        payload_data,
        field_name="source_system",
        uppercase=True,
    )
    execution_timestamp = (
        parse_execution_timestamp(payload_data.get("execution_timestamp"))
        if "execution_timestamp" in payload_data
        else trade.execution_timestamp
    )
    trade_date = resolve_amend_optional_date_field(
        trade.trade_date,
        payload_data,
        field_name="trade_date",
    )
    effective_start_date = resolve_amend_optional_date_field(
        trade.effective_start_date,
        payload_data,
        field_name="effective_start_date",
    )
    effective_end_date = resolve_amend_optional_date_field(
        trade.effective_end_date,
        payload_data,
        field_name="effective_end_date",
    )
    quality_spec = resolve_amend_optional_text_field(
        trade.quality_spec,
        payload_data,
        field_name="quality_spec",
    )

    unit_of_measure_input = (
        payload_data.get("unit_of_measure")
        if "unit_of_measure" in payload_data
        else trade.unit_of_measure
    )
    trade_currency_code = resolve_amend_currency(db, trade, payload_data)
    location_code = resolve_amend_location(db, trade, payload_data)
    if "location_code" in payload_data:
        should_sync_legs = True
    delivery_start = resolve_amend_optional_date_field(
        trade.delivery_start,
        payload_data,
        field_name="delivery_start",
    )
    if "delivery_start" in payload_data:
        should_sync_legs = True
    delivery_end = resolve_amend_optional_date_field(
        trade.delivery_end,
        payload_data,
        field_name="delivery_end",
    )
    if "delivery_end" in payload_data:
        should_sync_legs = True
    price_unit_code_input = (
        payload_data.get("price_unit_code")
        if "price_unit_code" in payload_data
        else trade.price_unit_code
    )

    commodity_class, commodity, should_sync_legs = resolve_amend_commodity(
        db,
        trade,
        payload_data,
        trade_structure=trade_structure,
        legs_payload=legs_payload,
        should_sync_legs=should_sync_legs,
    )
    pricing_type, price_index_code = resolve_amend_price_index(db, trade, payload_data)
    unit_of_measure = resolve_trade_quantity_unit(
        db,
        unit_of_measure_input,
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    if unit_of_measure != trade.unit_of_measure:
        should_sync_legs = True

    price_unit_code = resolve_trade_price_unit(
        db,
        price_unit_code_input,
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    price = resolve_amend_optional_number_field(
        trade.price,
        payload_data,
        field_name="price",
        display_name="Price Differential",
    )
    volume = resolve_amend_optional_number_field(
        trade.volume,
        payload_data,
        field_name="volume",
        display_name="Volume",
    )
    if "volume" in payload_data and trade_structure == TradeStructure.SINGLE.value:
        should_sync_legs = True

    counterparty = resolve_amend_counterparty(db, trade, payload_data)
    portfolio = resolve_amend_portfolio(db, trade, payload_data, book=book)
    trader_user = resolve_amend_optional_text_field(
        trade.trader_user,
        payload_data,
        field_name="trader_user",
    )
    (
        option_type_value,
        option_style_value,
        option_strike_price_value,
        option_expiration_date_value,
    ) = resolve_amend_option_field_inputs(
        trade,
        payload_data,
        instrument_type=instrument_type,
    )

    return AmendTradeFieldResolution(
        instrument_type=instrument_type,
        trade_nature=trade_nature,
        trade_structure=trade_structure,
        trade_side=trade_side,
        legs_payload=legs_payload,
        should_sync_legs=should_sync_legs,
        book=book,
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
        commodity_class=commodity_class,
        commodity=commodity,
        pricing_type=pricing_type,
        price_index_code=price_index_code,
        price=price,
        volume=volume,
        counterparty=counterparty,
        portfolio=portfolio,
        trader_user=trader_user,
        option_type_value=option_type_value,
        option_style_value=option_style_value,
        option_strike_price_value=option_strike_price_value,
        option_expiration_date_value=option_expiration_date_value,
    )
