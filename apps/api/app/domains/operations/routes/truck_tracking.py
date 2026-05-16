from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.truck_tracking import cancel_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import cancel_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import create_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import create_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import get_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import list_delivery_truck_movements
from apps.api.app.domains.operations.services.truck_tracking import skip_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import update_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import update_delivery_truck_stop
from apps.api.app.schemas.shipment import DeliveryTruckMovementCancelWrite
from apps.api.app.schemas.shipment import DeliveryTruckMovementCreate
from apps.api.app.schemas.shipment import DeliveryTruckMovementOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementSummaryOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementUpdate
from apps.api.app.schemas.shipment import DeliveryTruckStopCancelWrite
from apps.api.app.schemas.shipment import DeliveryTruckStopCreate
from apps.api.app.schemas.shipment import DeliveryTruckStopSkipWrite
from apps.api.app.schemas.shipment import DeliveryTruckStopUpdate
from .framework import OperationalQuerySpec
from .framework import build_role_mutation_spec
from .framework import execute_operational_mutation
from .framework import execute_operational_patch_mutation
from .framework import execute_operational_query_spec

router = APIRouter(tags=["truck-tracking"])

TRUCK_TRACKING_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_operations_role,
    detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage truck tracking.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
TRUCK_MOVEMENT_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_delivery_truck_movements)
TRUCK_MOVEMENT_QUERY_SPEC = OperationalQuerySpec(load=get_delivery_truck_movement)


@router.get(
    "/deliveries/{delivery_id}/truck-movements",
    response_model=list[DeliveryTruckMovementSummaryOut],
)
def list_truck_movements_for_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
) -> list[DeliveryTruckMovementSummaryOut]:
    return execute_operational_query_spec(
        TRUCK_MOVEMENT_LIST_QUERY_SPEC,
        db,
        delivery_id=delivery_id,
    )


@router.post(
    "/deliveries/{delivery_id}/truck-movements",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_movement_for_delivery(
    delivery_id: str,
    payload: DeliveryTruckMovementCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: create_delivery_truck_movement(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            payload=payload,
        ),
    )


@router.get("/truck-movements/{movement_id}", response_model=DeliveryTruckMovementOut)
def get_truck_movement(
    movement_id: str,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_query_spec(
        TRUCK_MOVEMENT_QUERY_SPEC,
        db,
        movement_id=movement_id,
    )


@router.patch("/truck-movements/{movement_id}", response_model=DeliveryTruckMovementOut)
def patch_truck_movement(
    movement_id: str,
    payload: DeliveryTruckMovementUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_patch_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_truck_movement(
            db,
            movement_id=movement_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one truck movement field must be provided.",
    )


@router.post(
    "/truck-movements/{movement_id}/cancel",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_movement_cancel(
    movement_id: str,
    payload: DeliveryTruckMovementCancelWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: cancel_delivery_truck_movement(
            db,
            movement_id=movement_id,
            actor_id=actor.actor_id,
            cancel_reason=payload.cancel_reason,
        ),
    )


@router.post(
    "/truck-movements/{movement_id}/stops",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_movement_stop(
    movement_id: str,
    payload: DeliveryTruckStopCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: create_delivery_truck_stop(
            db,
            movement_id=movement_id,
            actor_id=actor.actor_id,
            payload=payload,
        ),
    )


@router.patch("/truck-stops/{stop_id}", response_model=DeliveryTruckMovementOut)
def patch_truck_stop(
    stop_id: str,
    payload: DeliveryTruckStopUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_patch_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_truck_stop(
            db,
            stop_id=stop_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one truck stop field must be provided.",
    )


@router.post(
    "/truck-stops/{stop_id}/skip",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_stop_skip(
    stop_id: str,
    payload: DeliveryTruckStopSkipWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: skip_delivery_truck_stop(
            db,
            stop_id=stop_id,
            actor_id=actor.actor_id,
            skip_reason=payload.skip_reason,
        ),
    )


@router.post(
    "/truck-stops/{stop_id}/cancel",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_stop_cancel(
    stop_id: str,
    payload: DeliveryTruckStopCancelWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: cancel_delivery_truck_stop(
            db,
            stop_id=stop_id,
            actor_id=actor.actor_id,
            cancel_reason=payload.cancel_reason,
        ),
    )


__all__ = [
    "router",
    "list_truck_movements_for_delivery",
    "post_truck_movement_for_delivery",
    "get_truck_movement",
    "patch_truck_movement",
    "post_truck_movement_cancel",
    "post_truck_movement_stop",
    "patch_truck_stop",
    "post_truck_stop_skip",
    "post_truck_stop_cancel",
]
