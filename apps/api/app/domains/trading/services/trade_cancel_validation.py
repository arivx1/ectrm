from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_trade_status,
    trade_status_is_active,
)
from apps.api.app.models.trade import Trade


def validate_cancel_trade_write(trade: Trade) -> None:
    if not trade_status_is_active(trade.status):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{normalize_trade_status(trade.status)} and cannot be cancelled"
            ),
        )
