from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.trade_confirmations import create_trade_confirmation
from apps.api.app.domains.operations.services.trade_confirmations import issue_trade_confirmation
from apps.api.app.domains.operations.services.trade_confirmations import list_trade_confirmations
from apps.api.app.domains.operations.services.trade_confirmations import record_trade_confirmation_response
from apps.api.app.domains.operations.services.trade_confirmations import update_trade_confirmation
from apps.api.app.schemas.confirmation import TradeConfirmationCreate
from apps.api.app.schemas.confirmation import TradeConfirmationIssue
from apps.api.app.schemas.confirmation import TradeConfirmationOut
from apps.api.app.schemas.confirmation import TradeConfirmationResponse
from apps.api.app.schemas.confirmation import TradeConfirmationUpdate
from .framework import execute_operational_mutation
from .framework import execute_operational_patch_mutation
from .framework import build_role_mutation_spec
from .framework import execute_operational_query_spec
from .framework import OperationalQuerySpec

router = APIRouter(prefix="/confirmations", tags=["confirmations"])

CONFIRMATION_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_operations_role,
    detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
CONFIRMATION_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_trade_confirmations)


@router.get("", response_model=list[TradeConfirmationOut])
def get_trade_confirmations(
    trade_id: str | None = Query(default=None),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[TradeConfirmationOut]:
    return execute_operational_query_spec(
        CONFIRMATION_LIST_QUERY_SPEC,
        db,
        trade_id=trade_id,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TradeConfirmationOut, status_code=status.HTTP_201_CREATED)
def post_trade_confirmation(
    payload: TradeConfirmationCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    return execute_operational_mutation(
        CONFIRMATION_MUTATION_SPEC,
        request,
        db,
        lambda actor: create_trade_confirmation(
            db,
            trade_id=payload.trade_id,
            actor_id=actor.actor_id,
            source_document_id=payload.source_document_id,
            confirmation_number=payload.confirmation_number,
            status=payload.status,
            sent_at=payload.sent_at,
            confirmed_at=payload.confirmed_at,
            dispute_reason=payload.dispute_reason,
            notes=payload.notes,
            comparison_waiver_note=payload.comparison_waiver_note,
        )
    )


@router.patch("/{confirmation_id}", response_model=TradeConfirmationOut)
def patch_trade_confirmation(
    confirmation_id: int,
    payload: TradeConfirmationUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    return execute_operational_patch_mutation(
        CONFIRMATION_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_trade_confirmation(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor.actor_id,
            changes=changes,
        ),
        empty_detail="At least one confirmation field must be provided.",
    )


@router.post("/{confirmation_id}/issue", response_model=TradeConfirmationOut)
def post_trade_confirmation_issue(
    confirmation_id: int,
    payload: TradeConfirmationIssue,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    return execute_operational_mutation(
        CONFIRMATION_MUTATION_SPEC,
        request,
        db,
        lambda actor: issue_trade_confirmation(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor.actor_id,
            issue_method=payload.issue_method,
            issue_recipient=payload.issue_recipient,
            issue_note=payload.issue_note,
            issued_at=payload.issued_at,
        )
    )


@router.post("/{confirmation_id}/response", response_model=TradeConfirmationOut)
def post_trade_confirmation_response(
    confirmation_id: int,
    payload: TradeConfirmationResponse,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    return execute_operational_mutation(
        CONFIRMATION_MUTATION_SPEC,
        request,
        db,
        lambda actor: record_trade_confirmation_response(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor.actor_id,
            action=payload.action,
            received_at=payload.received_at,
            response_method=payload.response_method,
            response_reference=payload.response_reference,
            response_note=payload.response_note,
            dispute_reason=payload.dispute_reason,
        )
    )


__all__ = [
    "router",
    "get_trade_confirmations",
    "post_trade_confirmation",
    "patch_trade_confirmation",
    "post_trade_confirmation_issue",
    "post_trade_confirmation_response",
]
