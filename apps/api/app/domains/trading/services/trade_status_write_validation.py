from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_trade_status,
)
from apps.api.app.shared.enums import TradeStatus


def validate_book_trade_status(value: object) -> str:
    requested_trade_status = normalize_trade_status(value)
    if requested_trade_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Trades must be created with ACTIVE status",
        )
    return requested_trade_status


def resolve_amend_trade_status(
    current_status: str,
    payload_data: dict[str, object],
) -> str:
    if "status" not in payload_data or payload_data["status"] is None:
        return current_status

    requested_status = normalize_trade_status(payload_data["status"])
    if requested_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Use TradeCancelled, OptionExercised, OptionExpired, or "
                "OptionAssigned events to close a trade"
            ),
        )
    return requested_status
