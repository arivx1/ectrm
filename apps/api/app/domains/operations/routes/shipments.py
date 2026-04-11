from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import require_actor_role
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.actualizations import upsert_trade_actualization
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.schemas.shipment import DeliveryActualizationOut
from apps.api.app.schemas.shipment import DeliveryActualizationWrite
from apps.api.app.schemas.shipment import DeliveryObligationOut

router = APIRouter(prefix="/shipments", tags=["shipments"])


@router.get("", response_model=list[DeliveryObligationOut])
def list_shipments(db: Session = Depends(get_db)) -> list[DeliveryObligationOut]:
    return list_delivery_obligations_for_operations(db)


@router.put("/{trade_id}/actualization", response_model=DeliveryActualizationOut)
def put_trade_actualization(
    trade_id: str,
    payload: DeliveryActualizationWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryActualizationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage shipment actualization.",
    )
    try:
        actualization_out = upsert_trade_actualization(
            db,
            trade_id=trade_id,
            actual_quantity=payload.actual_quantity,
            actualized_at=payload.actualized_at,
            source=payload.source,
            notes=payload.notes,
            actor_id=actor_id,
        )
        db.commit()
        return actualization_out
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.put("/{trade_id}/legs/{leg_no}/actualization", response_model=DeliveryActualizationOut)
def put_trade_leg_actualization(
    trade_id: str,
    leg_no: int,
    payload: DeliveryActualizationWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryActualizationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage shipment actualization.",
    )
    try:
        actualization_out = upsert_trade_actualization(
            db,
            trade_id=trade_id,
            leg_no=leg_no,
            actual_quantity=payload.actual_quantity,
            actualized_at=payload.actualized_at,
            source=payload.source,
            notes=payload.notes,
            actor_id=actor_id,
        )
        db.commit()
        return actualization_out
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


__all__ = [
    "router",
    "list_shipments",
    "put_trade_actualization",
    "put_trade_leg_actualization",
]
