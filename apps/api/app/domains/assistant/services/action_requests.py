from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_runtime import AssistantActionProposal
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.routes.events import (
    sync_option_exposures_for_trade_change,
    sync_positions_for_trade_change,
    trade_snapshot,
)
from apps.api.app.schemas.assistant import AssistantActionRequestOut


class AssistantActionRequestError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def create_action_requests(
    *,
    db: Session,
    run_id: int,
    user_id: str,
    session_id: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    proposals: Sequence[AssistantActionProposal],
) -> list[AssistantActionRequest]:
    created_at = datetime.now(timezone.utc)
    records = [
        AssistantActionRequest(
            run_id=run_id,
            status="PENDING",
            user_id=user_id,
            session_id=session_id,
            workspace=workspace,
            agent_id=agent_id,
            agent_name=agent_name,
            action_type=proposal.action_type,
            summary=proposal.summary,
            description=proposal.description,
            payload=proposal.payload,
            result=None,
            error_detail=None,
            created_at=created_at,
            decided_at=None,
            decided_by=None,
        )
        for proposal in proposals
    ]
    if not records:
        return []

    db.add_all(records)
    db.commit()
    for record in records:
        db.refresh(record)
    return records


def get_action_request(db: Session, action_request_id: int) -> AssistantActionRequest | None:
    return db.get(AssistantActionRequest, action_request_id)


def list_action_requests(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
    status: str | None = None,
) -> list[AssistantActionRequest]:
    stmt = select(AssistantActionRequest)
    if user_id is not None:
        stmt = stmt.where(AssistantActionRequest.user_id == user_id)
    if status is not None:
        stmt = stmt.where(AssistantActionRequest.status == status)
    stmt = (
        stmt.order_by(
            AssistantActionRequest.created_at.desc(),
            AssistantActionRequest.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return db.execute(stmt).scalars().all()


def list_action_requests_for_run(db: Session, run_id: int) -> list[AssistantActionRequest]:
    stmt = (
        select(AssistantActionRequest)
        .where(AssistantActionRequest.run_id == run_id)
        .order_by(AssistantActionRequest.id.asc())
    )
    return db.execute(stmt).scalars().all()


def reject_action_request(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be rejected.")

    record.status = "REJECTED"
    record.decided_at = datetime.now(timezone.utc)
    record.decided_by = actor_id
    record.error_detail = None
    db.commit()
    db.refresh(record)
    return record


def approve_action_request(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be approved.")

    decided_at = datetime.now(timezone.utc)

    try:
        result = _execute_action(db=db, record=record, actor_id=actor_id, decided_at=decided_at)
    except AssistantActionRequestError as exc:
        return _mark_action_request_failed(
            db=db,
            record_id=record.id,
            actor_id=actor_id,
            decided_at=decided_at,
            error_detail=exc.detail,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        return _mark_action_request_failed(
            db=db,
            record_id=record.id,
            actor_id=actor_id,
            decided_at=decided_at,
            error_detail=str(exc) or "Assistant action execution failed unexpectedly.",
        )

    record.status = "EXECUTED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    record.result = result
    record.error_detail = None
    db.commit()
    db.refresh(record)
    return record


def to_action_request_out(record: AssistantActionRequest) -> AssistantActionRequestOut:
    return AssistantActionRequestOut(
        action_request_id=record.id,
        run_id=record.run_id,
        user_id=record.user_id,
        status=record.status,
        workspace=record.workspace,
        agent_id=record.agent_id,
        agent_name=record.agent_name,
        action_type=record.action_type,
        summary=record.summary,
        description=record.description,
        payload=dict(record.payload or {}),
        result=dict(record.result) if isinstance(record.result, dict) else record.result,
        error_detail=record.error_detail,
        created_at=record.created_at,
        decided_at=record.decided_at,
        decided_by=record.decided_by,
    )


def to_action_request_out_list(records: Iterable[AssistantActionRequest]) -> list[AssistantActionRequestOut]:
    return [to_action_request_out(record) for record in records]


def _execute_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    if record.action_type == "cancel_trade":
        return _execute_cancel_trade_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    raise AssistantActionRequestError(f"Unsupported assistant action type '{record.action_type}'.")


def _execute_cancel_trade_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = str((record.payload or {}).get("trade_id") or "").strip().upper()
    if not trade_id:
        raise AssistantActionRequestError("The cancel-trade request is missing a trade_id.")

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise AssistantActionRequestError(f"Trade {trade_id} was not found.")
    if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
        raise AssistantActionRequestError(f"Trade {trade_id} is already closed as {trade.status}.")

    before = trade_snapshot(db, trade)
    event = Event(
        event_id=str(uuid.uuid4()),
        aggregate_type="trade",
        aggregate_id=trade_id,
        event_type="TradeCancelled",
        occurred_at=decided_at,
        recorded_at=decided_at,
        actor_id=actor_id,
        correlation_id=f"assistant-action-{record.id}",
        causation_id=f"assistant-action-request:{record.id}",
        schema_version=1,
        payload={
            "status": "CANCELLED",
            "assistant_action_request_id": record.id,
            "assistant_run_id": record.run_id,
        },
    )
    db.add(event)
    db.flush()

    trade.updated_at = decided_at
    trade.status = "CANCELLED"
    trade.last_event_id = event.event_id
    after = trade_snapshot(db, trade)
    sync_positions_for_trade_change(db, before, after, decided_at)
    sync_option_exposures_for_trade_change(db, before, after, decided_at)

    return {
        "event_id": event.event_id,
        "trade_id": trade_id,
        "trade_status": trade.status,
    }


def _mark_action_request_failed(
    *,
    db: Session,
    record_id: int,
    actor_id: str,
    decided_at: datetime,
    error_detail: str,
) -> AssistantActionRequest:
    db.rollback()
    record = db.get(AssistantActionRequest, record_id)
    if record is None:
        raise AssistantActionRequestError("Assistant action request not found after rollback.")

    record.status = "FAILED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    record.result = None
    record.error_detail = error_detail
    db.commit()
    db.refresh(record)
    return record
