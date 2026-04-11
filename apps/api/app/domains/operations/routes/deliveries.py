from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import require_actor_role
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.shipments import append_delivery_event
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.domains.operations.services.shipments import synchronize_delivery_obligations_from_trades
from apps.api.app.domains.operations.services.shipments import update_delivery_logistics_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_obligation
from apps.api.app.domains.operations.services.shipments import update_delivery_pipeline_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_power_detail
from apps.api.app.schemas.shipment import DeliveryEventWrite
from apps.api.app.schemas.shipment import DeliveryLogisticsDetailUpdate
from apps.api.app.schemas.shipment import DeliveryObligationOut
from apps.api.app.schemas.shipment import DeliveryObligationUpdate
from apps.api.app.schemas.shipment import DeliveryPipelineDetailUpdate
from apps.api.app.schemas.shipment import DeliveryPowerDetailUpdate
from apps.api.app.schemas.shipment import DeliverySyncResultOut

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.get("", response_model=list[DeliveryObligationOut])
def list_deliveries(
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[DeliveryObligationOut]:
    return list_delivery_obligations_for_operations(db, limit=limit, offset=offset)


@router.post("/sync-from-trades", response_model=DeliverySyncResultOut)
def post_delivery_sync(
    request: Request,
    db: Session = Depends(get_db),
) -> DeliverySyncResultOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    try:
        result = synchronize_delivery_obligations_from_trades(
            db,
            actor_id=actor_id,
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post("/{delivery_id}/events", response_model=DeliveryObligationOut, status_code=status.HTTP_201_CREATED)
def post_delivery_event(
    delivery_id: str,
    payload: DeliveryEventWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    try:
        delivery = append_delivery_event(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
            location_code=payload.location_code,
            reference_code=payload.reference_code,
            source=payload.source,
            notes=payload.notes,
        )
        db.commit()
        return delivery
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{delivery_id}", response_model=DeliveryObligationOut)
def patch_delivery(
    delivery_id: str,
    payload: DeliveryObligationUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    changes = changes_from_payload(payload, empty_detail="At least one delivery field must be provided.")
    try:
        delivery = update_delivery_obligation(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return delivery
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{delivery_id}/logistics-details", response_model=DeliveryObligationOut)
def patch_delivery_logistics_details(
    delivery_id: str,
    payload: DeliveryLogisticsDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    changes = changes_from_payload(payload, empty_detail="At least one logistics detail field must be provided.")
    try:
        delivery = update_delivery_logistics_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return delivery
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{delivery_id}/pipeline-details", response_model=DeliveryObligationOut)
def patch_delivery_pipeline_details(
    delivery_id: str,
    payload: DeliveryPipelineDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    changes = changes_from_payload(payload, empty_detail="At least one pipeline detail field must be provided.")
    try:
        delivery = update_delivery_pipeline_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return delivery
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{delivery_id}/power-details", response_model=DeliveryObligationOut)
def patch_delivery_power_details(
    delivery_id: str,
    payload: DeliveryPowerDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    )
    changes = changes_from_payload(payload, empty_detail="At least one power detail field must be provided.")
    try:
        delivery = update_delivery_power_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return delivery
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
    "list_deliveries",
    "post_delivery_sync",
    "post_delivery_event",
    "patch_delivery",
    "patch_delivery_logistics_details",
    "patch_delivery_pipeline_details",
    "patch_delivery_power_details",
]
