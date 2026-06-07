from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_trade_header_status,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    PaymentStatus,
    PricingStatus,
    SettlementStatus,
)


@dataclass(frozen=True)
class TradeWorkflowStatuses:
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    invoice_status: str
    payment_status: str
    settlement_status: str


_STATUS_FIELDS = {
    "pricing_status": ("Pricing status", PricingStatus),
    "confirmation_status": ("Confirmation status", ConfirmationStatus),
    "nomination_status": ("Nomination status", NominationStatus),
    "allocation_status": ("Allocation status", AllocationStatus),
    "actualization_status": ("Actualization status", ActualizationStatus),
    "invoice_status": ("Invoice status", InvoiceStatus),
    "payment_status": ("Payment status", PaymentStatus),
    "settlement_status": ("Settlement status", SettlementStatus),
}


def normalize_book_trade_workflow_statuses(
    payload_data: Mapping[str, object],
    *,
    workflow_defaults: Mapping[str, str],
) -> TradeWorkflowStatuses:
    defaults = {
        "pricing_status": "PENDING",
        "confirmation_status": workflow_defaults["confirmation_status"],
        "nomination_status": workflow_defaults["nomination_status"],
        "allocation_status": workflow_defaults["allocation_status"],
        "actualization_status": workflow_defaults["actualization_status"],
        "invoice_status": workflow_defaults["invoice_status"],
        "payment_status": workflow_defaults["payment_status"],
        "settlement_status": "PENDING",
    }
    return _normalize_statuses(payload_data, defaults=defaults)


def normalize_amend_trade_workflow_statuses(
    payload_data: Mapping[str, object],
    *,
    trade: Trade,
) -> TradeWorkflowStatuses:
    values: dict[str, str] = {}
    for field_name in _STATUS_FIELDS:
        existing_value = getattr(trade, field_name)
        if field_name in payload_data:
            values[field_name] = _normalize_status(
                field_name,
                payload_data.get(field_name),
                default=existing_value,
            )
        else:
            values[field_name] = existing_value
    return TradeWorkflowStatuses(**values)


def _normalize_statuses(
    payload_data: Mapping[str, object],
    *,
    defaults: Mapping[str, str],
) -> TradeWorkflowStatuses:
    return TradeWorkflowStatuses(
        **{
            field_name: _normalize_status(
                field_name,
                payload_data.get(field_name),
                default=default,
            )
            for field_name, default in defaults.items()
        }
    )


def _normalize_status(
    field_name: str,
    value: object,
    *,
    default: str,
) -> str:
    label, enum_type = _STATUS_FIELDS[field_name]
    return normalize_trade_header_status(
        value,
        default=default,
        field_name=label,
        valid_values={item.value for item in enum_type},
    )
