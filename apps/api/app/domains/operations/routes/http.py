from __future__ import annotations

from fastapi import APIRouter

from .confirmations import router as confirmations_router
from .deliveries import router as deliveries_router
from .operations import router as operations_router
from .shipments import router as shipments_router

router = APIRouter()
router.include_router(confirmations_router)
router.include_router(deliveries_router)
router.include_router(operations_router)
router.include_router(shipments_router)

__all__ = [
    "router",
    "confirmations_router",
    "deliveries_router",
    "operations_router",
    "shipments_router",
]
