from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_instrument_type,
    normalize_optional_text,
    normalize_trade_side,
    normalize_trade_status,
    validate_date_range,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    PricingType,
    TradeInstrumentType,
    TradeStatus,
    TradeStructure,
)


def validate_trade_measurements(
    *,
    trade_structure: str,
    pricing_type: str,
    price: float | None,
    volume: float | None,
) -> None:
    if pricing_type in {PricingType.FIXED.value, PricingType.HYBRID.value} and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price Differential is required when pricing type is FIXED or HYBRID",
        )
    if trade_structure == TradeStructure.SINGLE.value and volume is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Volume is required for SINGLE trades",
        )


def validate_trade_date_ranges(
    *,
    effective_start_date: date | None,
    effective_end_date: date | None,
    delivery_start: date | None,
    delivery_end: date | None,
) -> None:
    validate_date_range(
        effective_start_date,
        effective_end_date,
        start_field="effective_start_date",
        end_field="effective_end_date",
    )
    validate_date_range(
        delivery_start,
        delivery_end,
        start_field="delivery_start",
        end_field="delivery_end",
    )


def validate_originating_option_trade_reference(
    db: Session,
    *,
    trade_id: str,
    instrument_type: str,
    originating_option_trade_id: object | None,
) -> str | None:
    normalized_originating_trade_id = normalize_optional_text(originating_option_trade_id)
    if normalized_originating_trade_id is None:
        return None

    if normalize_instrument_type(instrument_type) != TradeInstrumentType.LINEAR.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id can only be set on LINEAR trades",
        )
    if normalized_originating_trade_id == trade_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id cannot reference the trade being created",
        )

    originating_trade = db.execute(
        select(Trade).where(Trade.trade_id == normalized_originating_trade_id)
    ).scalars().first()
    if originating_trade is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"originating_option_trade_id '{normalized_originating_trade_id}' "
                "does not reference an existing trade"
            ),
        )
    if normalize_instrument_type(originating_trade.instrument_type) != TradeInstrumentType.OPTION.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id must reference an OPTION trade",
        )
    if normalize_trade_status(originating_trade.status) not in {
        TradeStatus.EXERCISED.value,
        TradeStatus.ASSIGNED.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"originating_option_trade_id '{normalized_originating_trade_id}' must reference an "
                "EXERCISED or ASSIGNED option trade"
            ),
        )

    existing_child_trade = db.execute(
        select(Trade).where(
            Trade.originating_option_trade_id == normalized_originating_trade_id,
            Trade.trade_id != trade_id,
        )
    ).scalars().first()
    if existing_child_trade is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Option trade '{normalized_originating_trade_id}' already has a resulting trade "
                f"'{existing_child_trade.trade_id}'"
            ),
        )

    return normalized_originating_trade_id


def validate_trade_structure_payload(
    trade_structure: str,
    trade_side: object | None,
    legs_payload: object | None,
) -> tuple[str | None, list[dict[str, object]]]:
    if legs_payload is None:
        legs = []
    elif isinstance(legs_payload, list):
        legs = [leg for leg in legs_payload if isinstance(leg, dict)]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="legs must be an array of objects when provided",
        )

    if trade_structure == TradeStructure.SINGLE.value:
        normalized_trade_side = normalize_trade_side(trade_side)
        return normalized_trade_side, legs

    if trade_side is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="trade_side cannot be set on SWAP trades; use legs instead",
        )
    if len(legs) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SWAP trades require at least two legs",
        )
    return None, legs
