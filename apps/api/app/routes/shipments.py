from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.actualizations import (
    upsert_trade_actualization,
)
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.schemas.shipment import DeliveryActualizationOut
from apps.api.app.schemas.shipment import DeliveryActualizationWrite
from apps.api.app.schemas.shipment import DeliveryObligationOut

router = APIRouter(prefix="/shipments", tags=["shipments"])


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id
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
    actor_id = _require_authenticated_actor(request)
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
    actor_id = _require_authenticated_actor(request)
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
