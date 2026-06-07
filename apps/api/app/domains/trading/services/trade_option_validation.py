from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_instrument_type,
    normalize_optional_number,
    normalize_optional_text,
    normalize_trade_side,
    normalize_trade_status,
    parse_optional_date,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    OptionStyle,
    OptionType,
    PricingType,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStatus,
    TradeStructure,
)

OPTION_LIFECYCLE_EVENT_TO_STATUS = {
    "OptionExercised": TradeStatus.EXERCISED.value,
    "OptionExpired": TradeStatus.EXPIRED.value,
    "OptionAssigned": TradeStatus.ASSIGNED.value,
}
OPTION_LIFECYCLE_EVENT_TYPES = set(OPTION_LIFECYCLE_EVENT_TO_STATUS)


def normalize_option_type(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_type.value for option_type in OptionType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_option_style(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_style.value for option_style in OptionStyle}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option style '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def validate_option_fields(
    *,
    instrument_type: str,
    trade_nature: str,
    trade_structure: str,
    pricing_type: str,
    option_type: object | None,
    option_style: object | None,
    option_strike_price: object | None,
    option_expiration_date: object | None,
) -> tuple[str | None, str | None, float | None, date | None]:
    normalized_option_type = normalize_option_type(option_type)
    normalized_option_style = normalize_option_style(option_style)
    normalized_option_strike_price = normalize_optional_number(
        option_strike_price,
        field_name="Option strike price",
    )
    normalized_option_expiration_date = parse_optional_date(
        option_expiration_date,
        field_name="option_expiration_date",
    )

    if instrument_type != TradeInstrumentType.OPTION.value:
        if any(
            value is not None
            for value in (
                normalized_option_type,
                normalized_option_style,
                normalized_option_strike_price,
                normalized_option_expiration_date,
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Option fields can only be set when instrument_type is OPTION",
            )
        return None, None, None, None

    if trade_nature != TradeNature.FINANCIAL.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options must be booked as FINANCIAL trades",
        )
    if trade_structure != TradeStructure.SINGLE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently support SINGLE structure only",
        )
    if pricing_type != PricingType.FIXED.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently require FIXED pricing for premium capture",
        )
    if normalized_option_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_type is required when instrument_type is OPTION",
        )
    if normalized_option_strike_price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_strike_price is required when instrument_type is OPTION",
        )
    if normalized_option_expiration_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_expiration_date is required when instrument_type is OPTION",
        )

    return (
        normalized_option_type,
        normalized_option_style or OptionStyle.AMERICAN.value,
        normalized_option_strike_price,
        normalized_option_expiration_date,
    )


def validate_option_lifecycle_transition(
    trade: Trade,
    *,
    event_type: str,
    occurred_at: datetime,
) -> str:
    if normalize_instrument_type(trade.instrument_type) != TradeInstrumentType.OPTION.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{event_type} can only be recorded for OPTION trades",
        )

    current_status = normalize_trade_status(trade.status)
    if current_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as {current_status} and cannot record "
                f"{event_type}"
            ),
        )

    if trade.option_expiration_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Trade {trade.trade_id} is missing option_expiration_date",
        )

    effective_event_date = occurred_at.date()
    expiration_date = trade.option_expiration_date
    option_style = normalize_option_style(trade.option_style) or OptionStyle.AMERICAN.value
    trade_side = normalize_trade_side(trade.trade_side)

    if event_type == "OptionExpired":
        if effective_event_date < expiration_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"OptionExpired cannot be recorded before expiration date "
                    f"{expiration_date.isoformat()}"
                ),
            )
        return OPTION_LIFECYCLE_EVENT_TO_STATUS[event_type]

    if event_type == "OptionExercised" and trade_side != TradeSide.BUY.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only BUY option trades can be exercised. Use OptionAssigned for short options.",
        )
    if event_type == "OptionAssigned" and trade_side != TradeSide.SELL.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only SELL option trades can be assigned. Use OptionExercised for long options.",
        )

    if option_style == OptionStyle.EUROPEAN.value:
        if effective_event_date != expiration_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{event_type} can only be recorded on expiration date "
                    f"{expiration_date.isoformat()} for EUROPEAN options"
                ),
            )
    elif effective_event_date > expiration_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{event_type} must be recorded on or before expiration date "
                f"{expiration_date.isoformat()} for {option_style} options"
            ),
        )

    return OPTION_LIFECYCLE_EVENT_TO_STATUS[event_type]
