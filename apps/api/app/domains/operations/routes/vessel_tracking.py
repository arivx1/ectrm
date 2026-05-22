from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.vessel_tracking import get_delivery_vessel_detail
from apps.api.app.domains.operations.services.vessel_tracking import get_delivery_vessel_tracking_health
from apps.api.app.domains.operations.services.vessel_tracking import list_delivery_vessel_tracking_signals
from apps.api.app.domains.operations.services.vessel_tracking import record_delivery_vessel_tracking_signal
from apps.api.app.domains.operations.services.vessel_tracking import refresh_delivery_vessel_tracking_from_aisstream
from apps.api.app.domains.operations.services.vessel_tracking import update_delivery_vessel_detail
from apps.api.app.schemas.shipment import DeliveryTrackingSignalOut
from apps.api.app.schemas.shipment import DeliveryTrackingSignalWrite
from apps.api.app.schemas.shipment import DeliveryVesselAisstreamRefreshOut
from apps.api.app.schemas.shipment import DeliveryVesselDetailOut
from apps.api.app.schemas.shipment import DeliveryVesselDetailUpdate
from apps.api.app.schemas.shipment import DeliveryVesselTrackingHealthOut
from apps.api.app.schemas.shipment import DeliveryVesselTrackingSignalIngestResultOut
from .framework import OperationalQuerySpec
from .framework import build_role_mutation_spec
from .framework import execute_operational_mutation
from .framework import execute_operational_patch_mutation
from .framework import execute_operational_query_spec

router = APIRouter(tags=["vessel-tracking"])

VESSEL_TRACKING_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_operations_role,
    detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage vessel tracking.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
VESSEL_DETAIL_QUERY_SPEC = OperationalQuerySpec(load=get_delivery_vessel_detail)
VESSEL_TRACKING_HEALTH_QUERY_SPEC = OperationalQuerySpec(load=get_delivery_vessel_tracking_health)
VESSEL_TRACKING_SIGNAL_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_delivery_vessel_tracking_signals)


@router.get(
    "/deliveries/{delivery_id}/vessel-detail",
    response_model=DeliveryVesselDetailOut,
)
def get_vessel_detail_for_delivery(
    delivery_id: str,
    as_of: datetime | None = None,
    db: Session = Depends(get_db),
) -> DeliveryVesselDetailOut:
    return execute_operational_query_spec(
        VESSEL_DETAIL_QUERY_SPEC,
        db,
        delivery_id=delivery_id,
        as_of=as_of,
    )


@router.patch(
    "/deliveries/{delivery_id}/vessel-detail",
    response_model=DeliveryVesselDetailOut,
)
def patch_vessel_detail_for_delivery(
    delivery_id: str,
    payload: DeliveryVesselDetailUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryVesselDetailOut:
    return execute_operational_patch_mutation(
        VESSEL_TRACKING_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_delivery_vessel_detail(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one vessel detail field must be provided.",
    )


@router.get(
    "/deliveries/{delivery_id}/vessel-tracking-health",
    response_model=DeliveryVesselTrackingHealthOut,
)
def get_vessel_tracking_health_for_delivery(
    delivery_id: str,
    as_of: datetime | None = None,
    db: Session = Depends(get_db),
) -> DeliveryVesselTrackingHealthOut:
    return execute_operational_query_spec(
        VESSEL_TRACKING_HEALTH_QUERY_SPEC,
        db,
        delivery_id=delivery_id,
        as_of=as_of,
    )


@router.get(
    "/deliveries/{delivery_id}/vessel-tracking-signals",
    response_model=list[DeliveryTrackingSignalOut],
)
def list_vessel_tracking_signals_for_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
) -> list[DeliveryTrackingSignalOut]:
    return execute_operational_query_spec(
        VESSEL_TRACKING_SIGNAL_LIST_QUERY_SPEC,
        db,
        delivery_id=delivery_id,
    )


@router.post(
    "/deliveries/{delivery_id}/vessel-tracking-signals",
    response_model=DeliveryVesselTrackingSignalIngestResultOut,
    status_code=status.HTTP_201_CREATED,
)
def post_vessel_tracking_signal_for_delivery(
    delivery_id: str,
    payload: DeliveryTrackingSignalWrite,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> DeliveryVesselTrackingSignalIngestResultOut:
    result = execute_operational_mutation(
        VESSEL_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: record_delivery_vessel_tracking_signal(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            payload=payload,
        ),
    )
    if result.duplicate:
        response.status_code = status.HTTP_200_OK
    return result


@router.post(
    "/deliveries/{delivery_id}/vessel-tracking-signals/aisstream-refresh",
    response_model=DeliveryVesselAisstreamRefreshOut,
    status_code=status.HTTP_201_CREATED,
)
def post_vessel_tracking_signal_aisstream_refresh(
    delivery_id: str,
    request: Request,
    response: Response,
    timeout_seconds: int | None = None,
    db: Session = Depends(get_db),
) -> DeliveryVesselAisstreamRefreshOut:
    result = execute_operational_mutation(
        VESSEL_TRACKING_MUTATION_SPEC,
        request,
        db,
        lambda actor: refresh_delivery_vessel_tracking_from_aisstream(
            db,
            delivery_id=delivery_id,
            actor_id=actor.actor_id,
            timeout_seconds=timeout_seconds,
        ),
    )
    if result.duplicate:
        response.status_code = status.HTTP_200_OK
    return result


__all__ = [
    "router",
    "get_vessel_detail_for_delivery",
    "patch_vessel_detail_for_delivery",
    "get_vessel_tracking_health_for_delivery",
    "list_vessel_tracking_signals_for_delivery",
    "post_vessel_tracking_signal_for_delivery",
    "post_vessel_tracking_signal_aisstream_refresh",
]
