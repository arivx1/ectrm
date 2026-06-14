from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.shipments import append_delivery_event
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.domains.operations.services.shipments import reverse_delivery_event
from apps.api.app.domains.operations.services.shipments import synchronize_delivery_obligations_from_trades
from apps.api.app.domains.operations.services.shipments import update_delivery_logistics_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_obligation
from apps.api.app.domains.operations.services.shipments import update_delivery_pipeline_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_power_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_rail_detail
from apps.api.app.domains.operations.services.shipments import update_delivery_truck_detail
from apps.api.app.schemas.shipment import DeliveryEventReverseWrite
from apps.api.app.schemas.shipment import DeliveryEventWrite
from apps.api.app.schemas.shipment import DeliveryLogisticsDetailUpdate
from apps.api.app.schemas.shipment import DeliveryObligationOut
from apps.api.app.schemas.shipment import DeliveryObligationUpdate
from apps.api.app.schemas.shipment import DeliveryPipelineDetailUpdate
from apps.api.app.schemas.shipment import DeliveryPowerDetailUpdate
from apps.api.app.schemas.shipment import DeliveryRailDetailUpdate
from apps.api.app.schemas.shipment import DeliverySyncResultOut
from apps.api.app.schemas.shipment import DeliveryTruckDetailUpdate
from .framework import execute_operational_mutation
from .framework import execute_operational_patch_mutation
from .framework import build_role_mutation_spec
from .framework import execute_operational_query_spec
from .framework import OperationalQuerySpec

router = APIRouter(prefix="/deliveries", tags=["deliveries"])

DELIVERY_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_operations_role,
    detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
DELIVERY_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_delivery_obligations_for_operations)


@router.get("", response_model=list[DeliveryObligationOut])
def list_deliveries(
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[DeliveryObligationOut]:
    return execute_operational_query_spec(
        DELIVERY_LIST_QUERY_SPEC,
        db,
        limit=limit,
        offset=offset,
    )


@router.post("/sync-from-trades", response_model=DeliverySyncResultOut)
def post_delivery_sync(
    request: Request,
    db: Session = Depends(get_db),
) -> DeliverySyncResultOut:
    return execute_operational_mutation(
        DELIVERY_MUTATION_SPEC,
        request,
        db,
        lambda actor: synchronize_delivery_obligations_from_trades(
            db,
            actor_id=actor.actor_id,
        )
    )


@router.post("/{delivery_id}/events", response_model=DeliveryObligationOut, status_code=status.HTTP_201_CREATED)
def post_delivery_event(
    delivery_id: str,
    payload: DeliveryEventWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_mutation(
        DELIVERY_MUTATION_SPEC,
        request,
        db,
        lambda actor: append_delivery_event(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
            location_code=payload.location_code,
            reference_code=payload.reference_code,
            source=payload.source,
            notes=payload.notes,
        )
    )


@router.post(
    "/{delivery_id}/events/{event_id}/reverse",
    response_model=DeliveryObligationOut,
    status_code=status.HTTP_201_CREATED,
)
def post_delivery_event_reversal(
    delivery_id: str,
    event_id: int,
    payload: DeliveryEventReverseWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_mutation(
        DELIVERY_MUTATION_SPEC,
        request,
        db,
        lambda actor: reverse_delivery_event(
            db,
            delivery_id=delivery_id,
            event_id=event_id,
            actor_id=actor.actor_id,
            reversal_reason=payload.reversal_reason,
            reversed_at=payload.reversed_at,
            source=payload.source,
            notes=payload.notes,
        )
    )


@router.patch("/{delivery_id}", response_model=DeliveryObligationOut)
def patch_delivery(
    delivery_id: str,
    payload: DeliveryObligationUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_obligation(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one delivery field must be provided.",
    )


@router.patch("/{delivery_id}/logistics-details", response_model=DeliveryObligationOut)
def patch_delivery_logistics_details(
    delivery_id: str,
    payload: DeliveryLogisticsDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_logistics_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one logistics detail field must be provided.",
    )


@router.patch("/{delivery_id}/truck-details", response_model=DeliveryObligationOut)
def patch_delivery_truck_details(
    delivery_id: str,
    payload: DeliveryTruckDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_truck_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one truck detail field must be provided.",
    )


@router.patch("/{delivery_id}/pipeline-details", response_model=DeliveryObligationOut)
def patch_delivery_pipeline_details(
    delivery_id: str,
    payload: DeliveryPipelineDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_pipeline_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one pipeline detail field must be provided.",
    )


@router.patch("/{delivery_id}/rail-details", response_model=DeliveryObligationOut)
def patch_delivery_rail_details(
    delivery_id: str,
    payload: DeliveryRailDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_rail_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one rail detail field must be provided.",
    )


@router.patch("/{delivery_id}/power-details", response_model=DeliveryObligationOut)
def patch_delivery_power_details(
    delivery_id: str,
    payload: DeliveryPowerDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryObligationOut:
    return execute_operational_patch_mutation(
        DELIVERY_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_power_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one power detail field must be provided.",
    )


__all__ = [
    "router",
    "list_deliveries",
    "post_delivery_sync",
    "post_delivery_event",
    "post_delivery_event_reversal",
    "patch_delivery",
    "patch_delivery_logistics_details",
    "patch_delivery_truck_details",
    "patch_delivery_pipeline_details",
    "patch_delivery_rail_details",
    "patch_delivery_power_details",
]
