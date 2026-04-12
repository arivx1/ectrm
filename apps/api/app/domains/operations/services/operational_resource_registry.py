from __future__ import annotations

from apps.api.app.domains.operations.services.settlement_invoices import (
    TRADE_INVOICE_RESOURCE_DESCRIPTOR,
)
from apps.api.app.domains.operations.services.settlement_payments import (
    TRADE_PAYMENT_RESOURCE_DESCRIPTOR,
)
from apps.api.app.domains.operations.services.shipments import DELIVERY_RESOURCE_DESCRIPTOR
from apps.api.app.domains.operations.services.shipments import SHIPMENT_RESOURCE_DESCRIPTOR
from apps.api.app.domains.operations.services.trade_confirmations import (
    CONFIRMATION_RESOURCE_DESCRIPTOR,
)
from apps.api.app.domains.operations.services.workflow_items import (
    WORKFLOW_ITEM_RESOURCE_DESCRIPTOR,
)

OPERATIONAL_RESOURCE_DESCRIPTORS = {
    descriptor.resource_key: descriptor
    for descriptor in (
        CONFIRMATION_RESOURCE_DESCRIPTOR,
        DELIVERY_RESOURCE_DESCRIPTOR,
        SHIPMENT_RESOURCE_DESCRIPTOR,
        TRADE_INVOICE_RESOURCE_DESCRIPTOR,
        TRADE_PAYMENT_RESOURCE_DESCRIPTOR,
        WORKFLOW_ITEM_RESOURCE_DESCRIPTOR,
    )
}

__all__ = ["OPERATIONAL_RESOURCE_DESCRIPTORS"]
