from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.actualizations import upsert_trade_actualization
from apps.api.app.domains.operations.services.shipments import list_shipments_for_operations
from apps.api.app.schemas.shipment import DeliveryActualizationOut
from apps.api.app.schemas.shipment import DeliveryActualizationWrite
from apps.api.app.schemas.shipment import DeliveryObligationOut
from .framework import build_role_mutation_spec
from .framework import execute_operational_mutation
from .framework import execute_operational_query_spec
from .framework import OperationalQuerySpec

router = APIRouter(prefix="/shipments", tags=["shipments"])

SHIPMENT_ACTUALIZATION_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_operations_role,
    detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage shipment actualization.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
SHIPMENT_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_shipments_for_operations)


@router.get("", response_model=list[DeliveryObligationOut])
def list_shipments(db: Session = Depends(get_db)) -> list[DeliveryObligationOut]:
    return execute_operational_query_spec(
        SHIPMENT_LIST_QUERY_SPEC,
        db,
    )


@router.put("/{trade_id}/actualization", response_model=DeliveryActualizationOut)
def put_trade_actualization(
    trade_id: str,
    payload: DeliveryActualizationWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryActualizationOut:
    return execute_operational_mutation(
        SHIPMENT_ACTUALIZATION_MUTATION_SPEC,
        request,
        db,
        lambda actor: upsert_trade_actualization(
            db,
            trade_id=trade_id,
            actual_quantity=payload.actual_quantity,
            actualized_at=payload.actualized_at,
            source=payload.source,
            notes=payload.notes,
            actor_id=actor.actor_id,
        )
    )


@router.put("/{trade_id}/legs/{leg_no}/actualization", response_model=DeliveryActualizationOut)
def put_trade_leg_actualization(
    trade_id: str,
    leg_no: int,
    payload: DeliveryActualizationWrite,
    request: Request,
    db: Session = Depends(get_db),
) -> DeliveryActualizationOut:
    return execute_operational_mutation(
        SHIPMENT_ACTUALIZATION_MUTATION_SPEC,
        request,
        db,
        lambda actor: upsert_trade_actualization(
            db,
            trade_id=trade_id,
            leg_no=leg_no,
            actual_quantity=payload.actual_quantity,
            actualized_at=payload.actualized_at,
            source=payload.source,
            notes=payload.notes,
            actor_id=actor.actor_id,
        )
    )


__all__ = [
    "router",
    "list_shipments",
    "put_trade_actualization",
    "put_trade_leg_actualization",
]
