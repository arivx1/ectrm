from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_runtime import AssistantActionProposal
from apps.api.app.domains.documents.services.ingestion import reprocess_document_ingestion
from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import create_trade_payment
from apps.api.app.domains.operations.services.trade_confirmations import issue_trade_confirmation
from apps.api.app.domains.operations.services.trade_confirmations import record_trade_confirmation_response
from apps.api.app.domains.operations.services.workflow_items import update_trade_workflow_item
from apps.api.app.domains.trading.services.trade_event_support import (
    sync_option_exposures_for_trade_change,
)
from apps.api.app.domains.trading.services.trade_event_support import (
    sync_positions_for_trade_change,
)
from apps.api.app.domains.trading.services.trade_event_support import trade_snapshot
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
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
    actor_role: str | None = None,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be approved.")

    decided_at = datetime.now(timezone.utc)

    try:
        result = _execute_action(
            db=db,
            record=record,
            actor_id=actor_id,
            actor_role=actor_role,
            decided_at=decided_at,
        )
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
    actor_role: str | None,
    decided_at: datetime,
) -> dict[str, object]:
    if record.action_type == "cancel_trade":
        return _execute_cancel_trade_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    if record.action_type == "issue_trade_confirmation":
        return _execute_issue_trade_confirmation_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    if record.action_type == "record_trade_confirmation_response":
        return _execute_record_trade_confirmation_response_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    if record.action_type == "update_trade_workflow_item":
        return _execute_update_trade_workflow_item_action(
            db=db,
            record=record,
            actor_id=actor_id,
            actor_role=actor_role,
            decided_at=decided_at,
        )
    if record.action_type == "issue_trade_invoice":
        return _execute_issue_trade_invoice_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    if record.action_type == "create_trade_payment":
        return _execute_create_trade_payment_action(
            db=db,
            record=record,
            actor_id=actor_id,
            decided_at=decided_at,
        )
    if record.action_type == "reprocess_document_ingestion":
        return _execute_reprocess_document_ingestion_action(
            db=db,
            record=record,
            actor_id=actor_id,
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


def _execute_issue_trade_confirmation_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    confirmation_id = _required_int_payload_value(record, "confirmation_id", "The confirmation issue request is missing a confirmation_id.")
    confirmation = issue_trade_confirmation(
        db,
        confirmation_id=confirmation_id,
        actor_id=actor_id,
        issue_method=_optional_str_payload_value(record, "issue_method"),
        issue_recipient=_optional_str_payload_value(record, "issue_recipient"),
        issue_note=_optional_str_payload_value(record, "issue_note"),
        issued_at=_optional_datetime_payload_value(record, "issued_at"),
        now=decided_at,
    )
    return {
        "confirmation_id": confirmation.confirmation_id,
        "trade_id": confirmation.trade_id,
        "status": confirmation.status,
        "issue_count": confirmation.issue_count,
        "receipt_status": confirmation.receipt_status,
    }


def _execute_record_trade_confirmation_response_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    confirmation_id = _required_int_payload_value(
        record,
        "confirmation_id",
        "The confirmation response request is missing a confirmation_id.",
    )
    action = _required_str_payload_value(
        record,
        "action",
        "The confirmation response request is missing an action.",
    )
    confirmation = record_trade_confirmation_response(
        db,
        confirmation_id=confirmation_id,
        actor_id=actor_id,
        action=action,
        received_at=_optional_datetime_payload_value(record, "received_at"),
        response_method=_optional_str_payload_value(record, "response_method"),
        response_reference=_optional_str_payload_value(record, "response_reference"),
        response_note=_optional_str_payload_value(record, "response_note"),
        dispute_reason=_optional_str_payload_value(record, "dispute_reason"),
        now=decided_at,
    )
    return {
        "confirmation_id": confirmation.confirmation_id,
        "trade_id": confirmation.trade_id,
        "status": confirmation.status,
        "receipt_status": confirmation.receipt_status,
    }


def _execute_update_trade_workflow_item_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    actor_role: str | None,
    decided_at: datetime,
) -> dict[str, object]:
    item_id = _required_int_payload_value(record, "item_id", "The workflow update request is missing an item_id.")
    payload_changes = (record.payload or {}).get("changes")
    if not isinstance(payload_changes, dict) or not payload_changes:
        raise AssistantActionRequestError("The workflow update request is missing changes.")

    changes = _json_payload_to_runtime_changes(payload_changes)
    workflow_item = update_trade_workflow_item(
        db,
        item_id=item_id,
        actor_id=actor_id,
        actor_role=actor_role,
        changes=changes,
        now=decided_at,
    )
    return {
        "item_id": workflow_item.item_id,
        "trade_id": workflow_item.trade_id,
        "workflow_type": workflow_item.workflow_type,
        "status": workflow_item.status,
        "owner": workflow_item.owner,
    }


def _execute_issue_trade_invoice_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = _required_str_payload_value(record, "trade_id", "The invoice request is missing a trade_id.")
    invoice = issue_trade_invoice(
        db,
        trade_id=trade_id,
        actor_id=actor_id,
        leg_no=_optional_int_payload_value(record, "leg_no"),
        invoice_number=_optional_str_payload_value(record, "invoice_number"),
        invoice_currency_code=_optional_str_payload_value(record, "invoice_currency_code"),
        billed_quantity=_optional_numeric_payload_value(record, "billed_quantity"),
        invoice_amount=_optional_numeric_payload_value(record, "invoice_amount"),
        issued_at=_optional_datetime_payload_value(record, "issued_at"),
        due_at=_optional_datetime_payload_value(record, "due_at"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
    )
    return {
        "invoice_id": invoice.invoice_id,
        "trade_id": invoice.trade_id,
        "invoice_number": invoice.invoice_number,
        "status": invoice.status,
        "outstanding_amount": invoice.outstanding_amount,
    }


def _execute_create_trade_payment_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    invoice_id = _required_int_payload_value(record, "invoice_id", "The payment request is missing an invoice_id.")
    payment = create_trade_payment(
        db,
        invoice_id=invoice_id,
        actor_id=actor_id,
        payment_reference=_optional_str_payload_value(record, "payment_reference"),
        payment_currency_code=_optional_str_payload_value(record, "payment_currency_code"),
        payment_amount=_optional_numeric_payload_value(record, "payment_amount"),
        status=_optional_str_payload_value(record, "status"),
        due_at=_optional_datetime_payload_value(record, "due_at"),
        received_at=_optional_datetime_payload_value(record, "received_at"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
    )
    return {
        "payment_id": payment.payment_id,
        "invoice_id": payment.invoice_id,
        "trade_id": payment.trade_id,
        "payment_reference": payment.payment_reference,
        "status": payment.status,
    }


def _execute_reprocess_document_ingestion_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
) -> dict[str, object]:
    document_id = _required_str_payload_value(
        record,
        "document_id",
        "The document reprocess request is missing a document_id.",
    )
    processor_provider = _optional_str_payload_value(record, "processor_provider")
    document = reprocess_document_ingestion(
        db,
        document_id=document_id,
        actor_id=actor_id,
        processor_provider=processor_provider,
        processor_provider_specified=processor_provider is not None,
    )
    return {
        "document_id": document.document_id,
        "status": document.status,
        "review_status": document.review_status,
        "processor_provider": document.processor_provider,
    }


def _required_int_payload_value(
    record: AssistantActionRequest,
    key: str,
    error_detail: str,
) -> int:
    value = _optional_int_payload_value(record, key)
    if value is None:
        raise AssistantActionRequestError(error_detail)
    return value


def _optional_int_payload_value(record: AssistantActionRequest, key: str) -> int | None:
    raw_value = (record.payload or {}).get(key)
    if raw_value is None or raw_value == "":
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError) as exc:
        raise AssistantActionRequestError(f"Assistant action payload field '{key}' must be an integer.") from exc


def _required_str_payload_value(
    record: AssistantActionRequest,
    key: str,
    error_detail: str,
) -> str:
    value = _optional_str_payload_value(record, key)
    if not value:
        raise AssistantActionRequestError(error_detail)
    return value


def _optional_str_payload_value(record: AssistantActionRequest, key: str) -> str | None:
    raw_value = (record.payload or {}).get(key)
    if raw_value is None:
        return None
    value = str(raw_value).strip()
    return value or None


def _optional_numeric_payload_value(record: AssistantActionRequest, key: str) -> float | None:
    raw_value = (record.payload or {}).get(key)
    if raw_value is None or raw_value == "":
        return None
    try:
        return float(raw_value)
    except (TypeError, ValueError) as exc:
        raise AssistantActionRequestError(f"Assistant action payload field '{key}' must be numeric.") from exc


def _optional_datetime_payload_value(record: AssistantActionRequest, key: str) -> datetime | None:
    raw_value = (record.payload or {}).get(key)
    if raw_value is None or raw_value == "":
        return None
    if not isinstance(raw_value, str):
        raise AssistantActionRequestError(f"Assistant action payload field '{key}' must be an ISO timestamp string.")

    normalized = raw_value.strip()
    if not normalized:
        return None

    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AssistantActionRequestError(
            f"Assistant action payload field '{key}' must be a valid ISO timestamp."
        ) from exc


def _json_payload_to_runtime_changes(changes: dict[str, object]) -> dict[str, object | None]:
    normalized_changes: dict[str, object | None] = {}
    for key, value in changes.items():
        if key in {"due_at"} and isinstance(value, str):
            try:
                normalized_changes[key] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise AssistantActionRequestError(
                    f"Assistant action payload field '{key}' must be a valid ISO timestamp."
                ) from exc
        else:
            normalized_changes[key] = value
    return normalized_changes
