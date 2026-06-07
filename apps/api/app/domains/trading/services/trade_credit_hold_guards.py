from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_credit_hold import (
    CREDIT_HOLD_GATED_TRADE_FIELDS,
    format_trade_credit_hold_message,
    get_trade_credit_hold_state,
)
from apps.api.app.models.trade import Trade

CREDIT_HOLD_FIELD_LABELS = {
    "confirmation_status": "confirmation",
    "nomination_status": "nomination",
    "allocation_status": "allocation",
    "actualization_status": "actualization",
    "invoice_status": "invoice",
    "payment_status": "payment",
    "settlement_status": "settlement",
}


def requested_credit_hold_blocked_fields(
    trade: Trade,
    payload_data: dict[str, object],
) -> list[str]:
    blocked_fields: list[str] = []
    for field_name in CREDIT_HOLD_GATED_TRADE_FIELDS:
        if field_name not in payload_data:
            continue
        next_value = payload_data.get(field_name)
        if next_value is None:
            continue
        normalized_next_value = str(next_value).strip().upper()
        current_value = str(getattr(trade, field_name) or "").strip().upper()
        if normalized_next_value and normalized_next_value != current_value:
            blocked_fields.append(CREDIT_HOLD_FIELD_LABELS[field_name])
    return blocked_fields


def reject_credit_hold_lifecycle_status_changes(
    db: Session,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> None:
    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
    blocked_fields = (
        requested_credit_hold_blocked_fields(trade, payload_data)
        if credit_hold_state.hold_active
        else []
    )
    if blocked_fields:
        field_summary = ", ".join(blocked_fields)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=format_trade_credit_hold_message(
                trade.trade_id,
                credit_hold_state,
                blocked_action=(
                    f"Changing {field_summary} lifecycle status is blocked until credit approves "
                    "the trade or the trade is amended back within limit."
                ),
            ),
        )
