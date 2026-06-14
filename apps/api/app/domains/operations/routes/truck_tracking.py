from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.truck_tracking import cancel_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import cancel_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import create_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import create_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import get_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import get_delivery_truck_movement_tracking_health
from apps.api.app.domains.operations.services.truck_tracking import list_delivery_truck_movements
from apps.api.app.domains.operations.services.truck_tracking import list_delivery_truck_tracking_exceptions
from apps.api.app.domains.operations.services.truck_tracking import list_delivery_truck_tracking_signals
from apps.api.app.domains.operations.services.truck_tracking import record_delivery_truck_stop_checkpoint
from apps.api.app.domains.operations.services.truck_tracking import record_delivery_truck_tracking_signal
from apps.api.app.domains.operations.services.truck_tracking import reverse_delivery_truck_stop_checkpoint
from apps.api.app.domains.operations.services.truck_tracking import skip_delivery_truck_stop
from apps.api.app.domains.operations.services.truck_tracking import update_delivery_truck_movement
from apps.api.app.domains.operations.services.truck_tracking import update_delivery_truck_stop
from apps.api.app.schemas.shipment import DeliveryTrackingSignalIngestResultOut
from apps.api.app.schemas.shipment import DeliveryTrackingSignalOut
from apps.api.app.schemas.shipment import DeliveryTrackingSignalWrite
from apps.api.app.schemas.shipment import DeliveryTruckMovementCancelWrite
from apps.api.app.schemas.shipment import DeliveryTruckMovementCreate
from apps.api.app.schemas.shipment import DeliveryTruckMovementOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementSummaryOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementTrackingHealthOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementUpdate
from apps.api.app.schemas.shipment import DeliveryTruckTrackingExceptionOut
from apps.api.app.schemas.shipment import DeliveryTruckStopCancelWrite
from apps.api.app.schemas.shipment import DeliveryTruckStopCheckpointReverseWrite
from apps.api.app.schemas.shipment import DeliveryTruckStopCheckpointWrite
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
TRUCK_MOVEMENT_TRACKING_HEALTH_QUERY_SPEC = OperationalQuerySpec(load=get_delivery_truck_movement_tracking_health)
TRUCK_TRACKING_EXCEPTION_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_delivery_truck_tracking_exceptions)
TRUCK_TRACKING_SIGNAL_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_delivery_truck_tracking_signals)


@router.get(
    "/truck-tracking/exceptions",
    response_model=list[DeliveryTruckTrackingExceptionOut],
)
def list_truck_tracking_exceptions(
    include_clear: bool = False,
    severity: str | None = None,
    as_of: datetime | None = None,
    limit: int | None = 50,
    db: Session = Depends(get_db),
) -> list[DeliveryTruckTrackingExceptionOut]:
    return execute_operational_query_spec(
        TRUCK_TRACKING_EXCEPTION_LIST_QUERY_SPEC,
        db,
        include_clear=include_clear,
        severity=severity,
        as_of=as_of,
        limit=limit,
    )


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


@router.get(
    "/truck-movements/{movement_id}/tracking-health",
    response_model=DeliveryTruckMovementTrackingHealthOut,
)
def get_truck_movement_tracking_health(
    movement_id: str,
    as_of: datetime | None = None,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementTrackingHealthOut:
    return execute_operational_query_spec(
        TRUCK_MOVEMENT_TRACKING_HEALTH_QUERY_SPEC,
        db,
        movement_id=movement_id,
        as_of=as_of,
    )


@router.get(
    "/truck-movements/{movement_id}/tracking-signals",
    response_model=list[DeliveryTrackingSignalOut],
)
def list_truck_movement_tracking_signals(
    movement_id: str,
    db: Session = Depends(get_db),
) -> list[DeliveryTrackingSignalOut]:
    return execute_operational_query_spec(
        TRUCK_TRACKING_SIGNAL_LIST_QUERY_SPEC,
        db,
        movement_id=movement_id,
    )


@router.post(
    "/truck-movements/{movement_id}/tracking-signals",
    response_model=DeliveryTrackingSignalIngestResultOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_movement_tracking_signal(
    movement_id: str,
    payload: DeliveryTrackingSignalWrite,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> DeliveryTrackingSignalIngestResultOut:
    result = execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: record_delivery_truck_tracking_signal(
            db,
            movement_id=movement_id,
            actor_id=actor.actor_id,
            payload=payload,
        ),
    )
    if result.duplicate:
        response.status_code = status.HTTP_200_OK
    return result


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


@router.post(
    "/truck-stops/{stop_id}/checkpoints",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_stop_checkpoint(
    stop_id: str,
    payload: DeliveryTruckStopCheckpointWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: record_delivery_truck_stop_checkpoint(
            db,
            stop_id=stop_id,
            actor_id=actor.actor_id,
            checkpoint_code=payload.checkpoint_code,
            occurred_at=payload.occurred_at,
            notes=payload.notes,
        ),
    )


@router.post(
    "/truck-stops/{stop_id}/checkpoints/{event_id}/reverse",
    response_model=DeliveryTruckMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_truck_stop_checkpoint_reversal(
    stop_id: str,
    event_id: int,
    payload: DeliveryTruckStopCheckpointReverseWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryTruckMovementOut:
    return execute_operational_mutation(
        TRUCK_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: reverse_delivery_truck_stop_checkpoint(
            db,
            stop_id=stop_id,
            event_id=event_id,
            actor_id=actor.actor_id,
            reversal_reason=payload.reversal_reason,
            reversed_at=payload.reversed_at,
            notes=payload.notes,
        ),
    )


__all__ = [
    "router",
    "list_truck_tracking_exceptions",
    "list_truck_movements_for_delivery",
    "post_truck_movement_for_delivery",
    "get_truck_movement",
    "get_truck_movement_tracking_health",
    "list_truck_movement_tracking_signals",
    "post_truck_movement_tracking_signal",
    "patch_truck_movement",
    "post_truck_movement_cancel",
    "post_truck_movement_stop",
    "patch_truck_stop",
    "post_truck_stop_skip",
    "post_truck_stop_cancel",
    "post_truck_stop_checkpoint",
    "post_truck_stop_checkpoint_reversal",
]
