from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionExecutionContext,
    AssistantActionHandler,
)
from apps.api.app.domains.documents.services.ingestion import reprocess_document_ingestion
from apps.api.app.domains.operations.services.actualizations import (
    build_delivery_obligation_id,
    upsert_trade_actualization,
)
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
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem

__all__ = [
    "ACTION_HANDLERS",
    "ACTION_HANDLER_SEQUENCE",
    "AssistantActionRequestError",
    "canonical_action_stale_state_value",
]


class AssistantActionRequestError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def canonical_action_stale_state_value(value: object) -> object:
    if isinstance(value, datetime):
        normalized = value
        if normalized.tzinfo is not None:
            normalized = normalized.astimezone(timezone.utc).replace(tzinfo=None)
        return normalized.isoformat(timespec="microseconds")
    if isinstance(value, str):
        normalized_text = value.strip()
        try:
            parsed = datetime.fromisoformat(normalized_text.replace("Z", "+00:00"))
        except ValueError:
            return normalized_text
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.isoformat(timespec="microseconds")
    return jsonable_encoder(value)


class NonIdempotentActionHandler:
    def is_idempotent_retry(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> bool:
        return False


class CancelTradeActionHandler(NonIdempotentActionHandler):
    action_type = "cancel_trade"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_cancel_trade_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        trade_id = _required_str_payload_value(record, "trade_id", "The cancel-trade request is missing a trade_id.")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(f"Trade {trade_id} was not found during approval stale-state recheck.")
        return {
            "status": trade.status,
            "last_event_id": trade.last_event_id,
        }


class IssueTradeConfirmationActionHandler(NonIdempotentActionHandler):
    action_type = "issue_trade_confirmation"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_issue_trade_confirmation_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        confirmation_id = _required_int_payload_value(
            record,
            "confirmation_id",
            "The confirmation issue request is missing a confirmation_id.",
        )
        confirmation = db.get(TradeConfirmation, confirmation_id)
        if confirmation is None:
            raise AssistantActionRequestError(
                f"Confirmation {confirmation_id} was not found during approval stale-state recheck."
            )
        return {
            "status": confirmation.status,
            "issue_count": confirmation.issue_count,
            "version": confirmation.version,
        }


class RecordTradeConfirmationResponseActionHandler(NonIdempotentActionHandler):
    action_type = "record_trade_confirmation_response"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_record_trade_confirmation_response_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        confirmation_id = _required_int_payload_value(
            record,
            "confirmation_id",
            "The confirmation response request is missing a confirmation_id.",
        )
        confirmation = db.get(TradeConfirmation, confirmation_id)
        if confirmation is None:
            raise AssistantActionRequestError(
                f"Confirmation {confirmation_id} was not found during approval stale-state recheck."
            )
        return {
            "status": confirmation.status,
            "receipt_status": confirmation.receipt_status,
            "version": confirmation.version,
        }


class UpdateTradeWorkflowItemActionHandler:
    action_type = "update_trade_workflow_item"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_update_trade_workflow_item_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            actor_role=context.actor_role,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        item_id = _required_int_payload_value(record, "item_id", "The workflow update request is missing an item_id.")
        workflow_item = db.get(TradeWorkflowItem, item_id)
        if workflow_item is None:
            raise AssistantActionRequestError(
                f"Workflow item {item_id} was not found during approval stale-state recheck."
            )
        trade = db.execute(select(Trade).where(Trade.trade_id == workflow_item.trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(
                f"Trade {workflow_item.trade_id} was not found during approval stale-state recheck."
            )
        return {
            "workflow_item_status": workflow_item.status,
            "workflow_item_owner": workflow_item.owner,
            "workflow_item_due_at": workflow_item.due_at,
            "workflow_item_updated_at": workflow_item.updated_at,
            "workflow_item_version": workflow_item.version,
            "trade_status": trade.status,
            "trade_updated_at": trade.updated_at,
            "trade_last_event_id": trade.last_event_id,
        }

    def is_idempotent_retry(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> bool:
        item_id = _required_int_payload_value(record, "item_id", "The workflow update request is missing an item_id.")
        workflow_item = db.get(TradeWorkflowItem, item_id)
        if workflow_item is None:
            return False

        payload_changes = (record.payload or {}).get("changes")
        if not isinstance(payload_changes, dict) or not payload_changes:
            return False

        for field, expected_value in payload_changes.items():
            if field not in {"status", "owner", "due_at", "notes"}:
                return False
            if canonical_action_stale_state_value(getattr(workflow_item, field)) != canonical_action_stale_state_value(
                expected_value
            ):
                return False
        return True


class RecordTradeActualizationActionHandler(NonIdempotentActionHandler):
    action_type = "record_trade_actualization"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_record_trade_actualization_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        trade_id = _required_str_payload_value(
            record,
            "trade_id",
            "The trade actualization request is missing a trade_id.",
        )
        leg_no = _optional_int_payload_value(record, "leg_no")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(
                f"Trade {trade_id} was not found during actualization stale-state recheck."
            )
        delivery_id = build_delivery_obligation_id(trade_id, leg_no)
        actualization = db.execute(
            select(TradeActualization).where(TradeActualization.delivery_id == delivery_id)
        ).scalars().first()
        return {
            "trade_status": trade.status,
            "actualization_status": trade.actualization_status,
            "last_event_id": trade.last_event_id,
            "delivery_id": delivery_id,
            "actualization_version": actualization.version if actualization is not None else None,
            "actual_quantity": float(actualization.actual_quantity) if actualization is not None else None,
            "actualized_at": actualization.actualized_at if actualization is not None else None,
        }


class IssueTradeInvoiceActionHandler(NonIdempotentActionHandler):
    action_type = "issue_trade_invoice"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_issue_trade_invoice_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        trade_id = _required_str_payload_value(record, "trade_id", "The invoice request is missing a trade_id.")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(f"Trade {trade_id} was not found during approval stale-state recheck.")
        existing_invoices = list(
            db.execute(
                select(TradeInvoice)
                .where(TradeInvoice.trade_id == trade_id)
                .order_by(TradeInvoice.created_at.asc(), TradeInvoice.id.asc())
            ).scalars().all()
        )
        return {
            "trade_status": trade.status,
            "settlement_status": trade.settlement_status,
            "last_event_id": trade.last_event_id,
            "existing_invoice_count": len(existing_invoices),
            "invoice_state_token": _invoice_state_token(existing_invoices),
        }


class CreateTradePaymentActionHandler(NonIdempotentActionHandler):
    action_type = "create_trade_payment"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_trade_payment_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
            decided_at=context.decided_at,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        invoice_id = _required_int_payload_value(record, "invoice_id", "The payment request is missing an invoice_id.")
        invoice = db.get(TradeInvoice, invoice_id)
        if invoice is None:
            raise AssistantActionRequestError(
                f"Invoice {invoice_id} was not found during approval stale-state recheck."
            )
        existing_payments = list(
            db.execute(
                select(TradePayment)
                .where(TradePayment.invoice_id == invoice_id)
                .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
            ).scalars().all()
        )
        return {
            "invoice_status": invoice.status,
            "invoice_amount": float(invoice.invoice_amount),
            "version": invoice.version,
            "existing_payment_count": len(existing_payments),
            "payment_state_token": _payment_state_token(existing_payments),
        }


class ReprocessDocumentIngestionActionHandler(NonIdempotentActionHandler):
    action_type = "reprocess_document_ingestion"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_reprocess_document_ingestion_action(
            db=context.db,
            record=context.record,
            actor_id=context.actor_id,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        document_id = _required_str_payload_value(
            record,
            "document_id",
            "The document reprocess request is missing a document_id.",
        )
        document = db.get(DocumentIngestion, document_id)
        if document is None:
            raise AssistantActionRequestError(
                f"Document {document_id} was not found during approval stale-state recheck."
            )
        return {
            "status": document.status,
            "review_status": document.review_status,
            "version": document.version,
        }


ACTION_HANDLER_SEQUENCE: tuple[AssistantActionHandler, ...] = (
    CancelTradeActionHandler(),
    IssueTradeConfirmationActionHandler(),
    RecordTradeConfirmationResponseActionHandler(),
    UpdateTradeWorkflowItemActionHandler(),
    RecordTradeActualizationActionHandler(),
    IssueTradeInvoiceActionHandler(),
    CreateTradePaymentActionHandler(),
    ReprocessDocumentIngestionActionHandler(),
)
ACTION_HANDLERS: dict[str, AssistantActionHandler] = {
    handler.action_type: handler for handler in ACTION_HANDLER_SEQUENCE
}


def _invoice_state_token(invoices: list[TradeInvoice]) -> list[dict[str, object | None]]:
    return [
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": invoice.status,
            "invoice_amount": float(invoice.invoice_amount),
            "billed_quantity": float(invoice.billed_quantity) if invoice.billed_quantity is not None else None,
            "version": invoice.version,
        }
        for invoice in invoices
    ]


def _payment_state_token(payments: list[TradePayment]) -> list[dict[str, object | None]]:
    return [
        {
            "payment_id": payment.id,
            "payment_reference": payment.payment_reference,
            "status": payment.status,
            "payment_amount": float(payment.payment_amount),
            "payment_currency_code": payment.payment_currency_code,
            "version": payment.version,
        }
        for payment in payments
    ]


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


def _execute_issue_trade_confirmation_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    confirmation_id = _required_int_payload_value(
        record,
        "confirmation_id",
        "The confirmation issue request is missing a confirmation_id.",
    )
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
        expected_version=_workflow_update_expected_version(record),
    )
    return {
        "item_id": workflow_item.item_id,
        "trade_id": workflow_item.trade_id,
        "workflow_type": workflow_item.workflow_type,
        "status": workflow_item.status,
        "owner": workflow_item.owner,
    }


def _execute_record_trade_actualization_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = _required_str_payload_value(
        record,
        "trade_id",
        "The trade actualization request is missing a trade_id.",
    )
    actualization = upsert_trade_actualization(
        db,
        trade_id=trade_id,
        leg_no=_optional_int_payload_value(record, "leg_no"),
        actual_quantity=_required_numeric_payload_value(
            record,
            "actual_quantity",
            "The trade actualization request is missing an actual_quantity.",
        ),
        actualized_at=_required_datetime_payload_value(
            record,
            "actualized_at",
            "The trade actualization request is missing an actualized_at timestamp.",
        ),
        source=_optional_str_payload_value(record, "source"),
        notes=_optional_str_payload_value(record, "notes"),
        actor_id=actor_id,
        now=decided_at,
    )
    return jsonable_encoder(
        {
            "actualization_id": actualization.actualization_id,
            "delivery_id": actualization.delivery_id,
            "trade_id": actualization.trade_id,
            "leg_no": actualization.leg_no,
            "actualization_status": actualization.actualization_status,
            "actual_quantity": actualization.actual_quantity,
            "actualized_at": actualization.actualized_at,
            "source": actualization.source,
        }
    )


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


def _required_numeric_payload_value(
    record: AssistantActionRequest,
    key: str,
    error_detail: str,
) -> float:
    value = _optional_numeric_payload_value(record, key)
    if value is None:
        raise AssistantActionRequestError(error_detail)
    return value


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


def _required_datetime_payload_value(
    record: AssistantActionRequest,
    key: str,
    error_detail: str,
) -> datetime:
    value = _optional_datetime_payload_value(record, key)
    if value is None:
        raise AssistantActionRequestError(error_detail)
    return value


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


def _workflow_update_expected_version(record: AssistantActionRequest) -> object | None:
    payload = record.payload or {}
    if "expected_version" in payload:
        return payload.get("expected_version")

    review_context = payload.get("review_context")
    if not isinstance(review_context, dict):
        return None

    stale_state_basis = review_context.get("stale_state_basis")
    if not isinstance(stale_state_basis, dict):
        return None
    return stale_state_basis.get("workflow_item_version")
