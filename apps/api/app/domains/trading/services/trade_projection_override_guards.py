from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.actualizations import trade_has_actualization_record
from apps.api.app.domains.operations.services.settlement_invoices import trade_has_invoice_record
from apps.api.app.domains.operations.services.settlement_payments import trade_has_payment_records
from apps.api.app.domains.operations.services.trade_confirmations import trade_has_confirmation_record


def reject_invoice_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    payload_fields = set(payload_data)

    if {"invoice_status", "settlement_status"} & payload_fields and trade_has_invoice_record(
        db,
        trade_id=trade_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Invoice and settlement statuses are now derived from settlement invoices for this trade. "
                "Update the invoice record from the Settlement workspace instead of amending the trade header."
            ),
        )

    if "payment_status" in payload_fields and trade_has_payment_records(db, trade_id=trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Payment status is now derived from settlement payments for this trade. "
                "Update the payment record from the Settlement workspace instead of amending the trade header."
            ),
        )


def reject_confirmation_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    if "confirmation_status" not in payload_data:
        return
    if not trade_has_confirmation_record(db, trade_id=trade_id):
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Confirmation status is now derived from managed confirmation records for this trade. "
            "Update the current confirmation from Operations instead of amending the trade header."
        ),
    )


def reject_actualization_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    if "actualization_status" not in payload_data:
        return
    if not trade_has_actualization_record(db, trade_id=trade_id):
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Actualization status is now derived from recorded delivery actualizations for this trade. "
            "Update the shipment actualization instead of amending the trade header."
        ),
    )
