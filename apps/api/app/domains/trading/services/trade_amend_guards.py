from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_credit_hold_guards import (
    reject_credit_hold_lifecycle_status_changes,
)
from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_instrument_type,
    normalize_optional_text,
    normalize_trade_status,
    trade_status_is_active,
)
from apps.api.app.domains.trading.services.trade_projection_override_guards import (
    reject_actualization_projection_override,
    reject_confirmation_projection_override,
    reject_invoice_projection_override,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import TradeInstrumentType


def enforce_amend_trade_guards(
    db: Session,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> None:
    _reject_closed_option_amend(trade)
    _reject_originating_option_mutation(trade, payload_data=payload_data)
    reject_invoice_projection_override(
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    reject_actualization_projection_override(
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    reject_credit_hold_lifecycle_status_changes(
        db,
        trade=trade,
        payload_data=payload_data,
    )
    reject_confirmation_projection_override(
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )


def _reject_closed_option_amend(trade: Trade) -> None:
    if (
        normalize_instrument_type(trade.instrument_type) == TradeInstrumentType.OPTION.value
        and not trade_status_is_active(trade.status)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{normalize_trade_status(trade.status)} and cannot be amended"
            ),
        )


def _reject_originating_option_mutation(
    trade: Trade,
    *,
    payload_data: dict[str, object],
) -> None:
    if "originating_option_trade_id" in payload_data:
        requested_originating_trade_id = normalize_optional_text(
            payload_data.get("originating_option_trade_id")
        )
        if requested_originating_trade_id != trade.originating_option_trade_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="originating_option_trade_id is immutable and can only be set when the trade is created",
            )

    if trade.originating_option_trade_id is None or "instrument_type" not in payload_data:
        return
    requested_instrument_type = normalize_instrument_type(payload_data.get("instrument_type"))
    if requested_instrument_type != TradeInstrumentType.LINEAR.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Trades linked from an originating_option_trade_id must remain LINEAR instruments",
        )
