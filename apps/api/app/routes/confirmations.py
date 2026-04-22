"""Compatibility shim for confirmations routes."""

from apps.api.app.domains.operations.routes.confirmations import get_trade_confirmations
from apps.api.app.domains.operations.routes.confirmations import patch_trade_confirmation
from apps.api.app.domains.operations.routes.confirmations import post_trade_confirmation
from apps.api.app.domains.operations.routes.confirmations import post_trade_confirmation_issue
from apps.api.app.domains.operations.routes.confirmations import post_trade_confirmation_response
from apps.api.app.domains.operations.routes import confirmations_router as router

__all__ = [
    "router",
    "get_trade_confirmations",
    "post_trade_confirmation",
    "patch_trade_confirmation",
    "post_trade_confirmation_issue",
    "post_trade_confirmation_response",
]
