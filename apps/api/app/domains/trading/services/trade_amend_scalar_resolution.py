from __future__ import annotations

from datetime import date

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_instrument_type,
    normalize_optional_number,
    normalize_optional_text,
    normalize_trade_nature,
    normalize_trade_structure,
    parse_optional_date,
)
from apps.api.app.domains.trading.services.trade_write_rules import (
    validate_trade_structure_payload,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    TradeInstrumentType,
    TradeStructure,
)


def resolve_amend_instrument_type(
    trade: Trade,
    payload_data: dict[str, object],
) -> str:
    if "instrument_type" in payload_data and payload_data["instrument_type"] is not None:
        return normalize_instrument_type(payload_data["instrument_type"])
    return trade.instrument_type


def resolve_amend_trade_nature(
    trade: Trade,
    payload_data: dict[str, object],
) -> str:
    if "trade_nature" in payload_data and payload_data["trade_nature"] is not None:
        return normalize_trade_nature(payload_data["trade_nature"])
    return trade.trade_nature


def resolve_amend_trade_structure(
    trade: Trade,
    payload_data: dict[str, object],
) -> str:
    if "trade_structure" in payload_data and payload_data["trade_structure"] is not None:
        return normalize_trade_structure(payload_data["trade_structure"])
    return trade.trade_structure


def resolve_amend_structure_fields(
    trade: Trade,
    payload_data: dict[str, object],
    *,
    trade_structure: str,
) -> tuple[str | None, list[dict[str, object]] | None, bool]:
    trade_side = trade.trade_side
    legs_payload: list[dict[str, object]] | None = None
    should_sync_legs = False
    if not {"trade_structure", "trade_side", "legs"}.intersection(payload_data):
        return trade_side, legs_payload, should_sync_legs

    trade_side_value = (
        payload_data.get("trade_side")
        if "trade_side" in payload_data
        else (trade.trade_side if trade_structure == TradeStructure.SINGLE.value else None)
    )
    trade_side, legs_payload = validate_trade_structure_payload(
        trade_structure,
        trade_side_value,
        payload_data.get("legs"),
    )
    return trade_side, legs_payload, True


def resolve_amend_optional_text_field(
    current_value: str | None,
    payload_data: dict[str, object],
    *,
    field_name: str,
    uppercase: bool = False,
) -> str | None:
    if field_name in payload_data:
        return normalize_optional_text(payload_data.get(field_name), uppercase=uppercase)
    return current_value


def resolve_amend_optional_date_field(
    current_value: date | None,
    payload_data: dict[str, object],
    *,
    field_name: str,
) -> date | None:
    if field_name in payload_data:
        return parse_optional_date(payload_data.get(field_name), field_name=field_name)
    return current_value


def resolve_amend_optional_number_field(
    current_value: float | None,
    payload_data: dict[str, object],
    *,
    field_name: str,
    display_name: str,
) -> float | None:
    if field_name in payload_data:
        return normalize_optional_number(payload_data.get(field_name), field_name=display_name)
    return current_value


def resolve_amend_option_field_inputs(
    trade: Trade,
    payload_data: dict[str, object],
    *,
    instrument_type: str,
) -> tuple[object | None, object | None, object | None, object | None]:
    option_type_value = trade.option_type
    if "option_type" in payload_data:
        option_type_value = payload_data.get("option_type")
    option_style_value = trade.option_style
    if "option_style" in payload_data:
        option_style_value = payload_data.get("option_style")
    option_strike_price_value = trade.option_strike_price
    if "option_strike_price" in payload_data:
        option_strike_price_value = payload_data.get("option_strike_price")
    option_expiration_date_value = trade.option_expiration_date
    if "option_expiration_date" in payload_data:
        option_expiration_date_value = payload_data.get("option_expiration_date")
    if "instrument_type" in payload_data and instrument_type != TradeInstrumentType.OPTION.value:
        option_type_value = payload_data.get("option_type")
        option_style_value = payload_data.get("option_style")
        option_strike_price_value = payload_data.get("option_strike_price")
        option_expiration_date_value = payload_data.get("option_expiration_date")

    return (
        option_type_value,
        option_style_value,
        option_strike_price_value,
        option_expiration_date_value,
    )
