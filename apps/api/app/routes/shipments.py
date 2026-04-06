from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.shipments import list_shipments_for_operations
from apps.api.app.schemas.shipment import ShipmentOut

router = APIRouter(prefix="/shipments", tags=["shipments"])


@router.get("", response_model=list[ShipmentOut])
def list_shipments(db: Session = Depends(get_db)) -> list[ShipmentOut]:
    return list_shipments_for_operations(db)
