"""Compatibility shim for delivery routes."""

from apps.api.app.domains.operations.routes.deliveries import list_deliveries
from apps.api.app.domains.operations.routes.deliveries import patch_delivery
from apps.api.app.domains.operations.routes.deliveries import patch_delivery_logistics_details
from apps.api.app.domains.operations.routes.deliveries import patch_delivery_pipeline_details
from apps.api.app.domains.operations.routes.deliveries import patch_delivery_power_details
from apps.api.app.domains.operations.routes.deliveries import post_delivery_event
from apps.api.app.domains.operations.routes.deliveries import post_delivery_sync
from apps.api.app.domains.operations.routes import deliveries_router as router

__all__ = [
    "router",
    "list_deliveries",
    "post_delivery_sync",
    "post_delivery_event",
    "patch_delivery",
    "patch_delivery_logistics_details",
    "patch_delivery_pipeline_details",
    "patch_delivery_power_details",
]
