from __future__ import annotations

from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    PaymentStatus,
    TradeNature,
)

DEFAULT_SOURCE_SYSTEM = "ETRM"


def default_trade_workflow_statuses(trade_nature: str) -> dict[str, str]:
    requires_physical_workflows = trade_nature == TradeNature.PHYSICAL.value
    return {
        "confirmation_status": ConfirmationStatus.PENDING.value,
        "nomination_status": (
            NominationStatus.PENDING.value
            if requires_physical_workflows
            else NominationStatus.NOT_REQUIRED.value
        ),
        "allocation_status": (
            AllocationStatus.PENDING.value
            if requires_physical_workflows
            else AllocationStatus.NOT_REQUIRED.value
        ),
        "actualization_status": (
            ActualizationStatus.PENDING.value
            if requires_physical_workflows
            else ActualizationStatus.NOT_REQUIRED.value
        ),
        "invoice_status": (
            InvoiceStatus.PENDING.value
            if requires_physical_workflows
            else InvoiceStatus.NOT_REQUIRED.value
        ),
        "payment_status": PaymentStatus.PENDING.value,
    }
