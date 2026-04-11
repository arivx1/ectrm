"""Compatibility shim for shipment routes."""

from apps.api.app.domains.operations.routes.shipments import list_shipments
from apps.api.app.domains.operations.routes.shipments import put_trade_actualization
from apps.api.app.domains.operations.routes.shipments import put_trade_leg_actualization
from apps.api.app.domains.operations.routes import shipments_router as router

__all__ = [
    "router",
    "list_shipments",
    "put_trade_actualization",
    "put_trade_leg_actualization",
]
