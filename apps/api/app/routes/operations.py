"""Compatibility shim for operations routes."""

from apps.api.app.domains.operations.routes.operations import get_system_overview
from apps.api.app.domains.operations.routes.operations import get_work_items
from apps.api.app.domains.operations.routes.operations import get_workspace_bootstrap_summary
from apps.api.app.domains.operations.routes.operations import patch_work_item
from apps.api.app.domains.operations.routes.operations import post_work_item
from apps.api.app.domains.operations.routes.operations import post_work_item_book_underlying
from apps.api.app.domains.operations.routes import operations_router as router

__all__ = [
    "router",
    "get_system_overview",
    "get_workspace_bootstrap_summary",
    "get_work_items",
    "post_work_item",
    "patch_work_item",
    "post_work_item_book_underlying",
]
