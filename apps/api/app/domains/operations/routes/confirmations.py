from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import require_actor_role
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

router = APIRouter(prefix="/confirmations", tags=["confirmations"])


@router.get("", response_model=list[TradeConfirmationOut])
def get_trade_confirmations(
    trade_id: str | None = Query(default=None),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[TradeConfirmationOut]:
    try:
        return list_trade_confirmations(db, trade_id=trade_id, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("", response_model=TradeConfirmationOut, status_code=status.HTTP_201_CREATED)
def post_trade_confirmation(
    payload: TradeConfirmationCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
    )
    try:
        confirmation = create_trade_confirmation(
            db,
            trade_id=payload.trade_id,
            actor_id=actor_id,
            source_document_id=payload.source_document_id,
            confirmation_number=payload.confirmation_number,
            status=payload.status,
            sent_at=payload.sent_at,
            confirmed_at=payload.confirmed_at,
            dispute_reason=payload.dispute_reason,
            notes=payload.notes,
            comparison_waiver_note=payload.comparison_waiver_note,
        )
        db.commit()
        return confirmation
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{confirmation_id}", response_model=TradeConfirmationOut)
def patch_trade_confirmation(
    confirmation_id: int,
    payload: TradeConfirmationUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
    )
    changes = changes_from_payload(payload, empty_detail="At least one confirmation field must be provided.")
    try:
        confirmation = update_trade_confirmation(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return confirmation
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/{confirmation_id}/issue", response_model=TradeConfirmationOut)
def post_trade_confirmation_issue(
    confirmation_id: int,
    payload: TradeConfirmationIssue,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
    )
    try:
        confirmation = issue_trade_confirmation(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor_id,
            issue_method=payload.issue_method,
            issue_recipient=payload.issue_recipient,
            issue_note=payload.issue_note,
            issued_at=payload.issued_at,
        )
        db.commit()
        return confirmation
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/{confirmation_id}/response", response_model=TradeConfirmationOut)
def post_trade_confirmation_response(
    confirmation_id: int,
    payload: TradeConfirmationResponse,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeConfirmationOut:
    actor_id = require_actor_role(
        request,
        predicate=is_operations_role,
        detail="Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
    )
    try:
        confirmation = record_trade_confirmation_response(
            db,
            confirmation_id=confirmation_id,
            actor_id=actor_id,
            action=payload.action,
            received_at=payload.received_at,
            response_method=payload.response_method,
            response_reference=payload.response_reference,
            response_note=payload.response_note,
            dispute_reason=payload.dispute_reason,
        )
        db.commit()
        return confirmation
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
    "get_trade_confirmations",
    "post_trade_confirmation",
    "patch_trade_confirmation",
    "post_trade_confirmation_issue",
    "post_trade_confirmation_response",
]
