from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.schemas.shipment import DeliveryObligationOut

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.get("", response_model=list[DeliveryObligationOut])
def list_deliveries(db: Session = Depends(get_db)) -> list[DeliveryObligationOut]:
    return list_delivery_obligations_for_operations(db)
