"""Compatibility shim for settlement routes."""

from apps.api.app.domains.settlement.routes.http import get_trade_invoices
from apps.api.app.domains.settlement.routes.http import get_trade_payments
from apps.api.app.domains.settlement.routes.http import patch_trade_invoice
from apps.api.app.domains.settlement.routes.http import patch_trade_payment
from apps.api.app.domains.settlement.routes.http import post_trade_invoice
from apps.api.app.domains.settlement.routes.http import post_trade_invoice_void
from apps.api.app.domains.settlement.routes.http import post_trade_payment
from apps.api.app.domains.settlement.routes.http import post_trade_payment_reverse
from apps.api.app.domains.settlement.routes import router

__all__ = [
    "router",
    "get_trade_invoices",
    "post_trade_invoice",
    "patch_trade_invoice",
    "post_trade_invoice_void",
    "get_trade_payments",
    "post_trade_payment",
    "patch_trade_payment",
    "post_trade_payment_reverse",
]
