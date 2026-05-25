from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import (
    create_manual_accrual_entry,
    reverse_manual_accrual_entry,
)
from apps.api.app.domains.accounting.services import (
    create_trade_accounting_entry,
    reverse_trade_accounting_entry,
)
from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionExecutionContext,
    AssistantActionHandler,
)
from apps.api.app.domains.documents.services.ingestion import reprocess_document_ingestion
from apps.api.app.domains.home_views.services.definitions import (
    HomeViewDefinitionConflictError,
    HomeViewDefinitionValidationError,
    create_home_view_definition,
    find_home_view_definition_by_scope_name,
    home_view_name_key,
    to_home_view_definition_out,
)
from apps.api.app.domains.operations.services.actualizations import (
    build_delivery_obligation_id,
    upsert_trade_actualization,
    void_trade_actualization,
)
from apps.api.app.domains.operations.services.audit_events import TradeAuditMutationContext
from apps.api.app.domains.operations.services.shipments import append_delivery_event, reverse_delivery_event
from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice, void_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import (
    create_trade_payment,
    reverse_trade_payment,
)
from apps.api.app.domains.reports.services.settlement_presets import (
    SettlementReportPresetConflictError,
    create_settlement_report_preset,
    find_settlement_preset_by_scope_name,
    settlement_preset_name_key,
    to_settlement_preset_out,
)
from apps.api.app.domains.operations.services.trade_confirmations import issue_trade_confirmation
from apps.api.app.domains.operations.services.trade_confirmations import record_trade_confirmation_response
from apps.api.app.domains.operations.services.workflow_items import update_trade_workflow_item
from apps.api.app.domains.trading.services.trade_commands import (
    TradeWriteCommand,
    append_trade_write_command,
)
from apps.api.app.domains.trading.services.event_writes import AppendDomainEventCommand, append_domain_event
from apps.api.app.domains.trading.services.trade_event_support import (
    sync_option_exposures_for_trade_change,
)
from apps.api.app.domains.trading.services.trade_event_support import (
    sync_positions_for_trade_change,
)
from apps.api.app.domains.trading.services.trade_event_support import trade_snapshot
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accounting_entry import TradeAccountingEntry
from apps.api.app.models.trade_accounting_entry_line import TradeAccountingEntryLine
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.home_view import HomeViewDefinitionCreate
from apps.api.app.schemas.report import SettlementReportPresetCreate

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


class CreateTradeActionHandler(NonIdempotentActionHandler):
    action_type = "create_trade"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_trade_action(
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
        trade_id = _required_str_payload_value(record, "trade_id", "The create-trade request is missing a trade_id.")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        return {
            "trade_exists": trade is not None,
        }


class AmendTradeActionHandler(NonIdempotentActionHandler):
    action_type = "amend_trade"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_amend_trade_action(
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
        trade_id = _required_str_payload_value(record, "trade_id", "The amend-trade request is missing a trade_id.")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(f"Trade {trade_id} was not found during approval stale-state recheck.")
        return {
            "trade_exists": True,
            "status": trade.status,
            "last_event_id": trade.last_event_id,
        }


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


class CreateSettlementReportPresetActionHandler(NonIdempotentActionHandler):
    action_type = "create_settlement_report_preset"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_settlement_report_preset_action(
            db=context.db,
            record=context.record,
            actor_role=context.actor_role,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        name = _required_str_payload_value(
            record,
            "name",
            "The settlement preset request is missing a name.",
        )
        scope = _required_str_payload_value(
            record,
            "scope",
            "The settlement preset request is missing a scope.",
        )
        existing = find_settlement_preset_by_scope_name(
            db,
            owner_user_id=record.user_id,
            scope=scope,
            name=name,
        )
        return {
            "scope": scope,
            "name_key": settlement_preset_name_key(name),
            "existing_preset_id": existing.id if existing is not None else None,
        }


class CreateHomeViewInstanceActionHandler(NonIdempotentActionHandler):
    action_type = "create_home_view_instance"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_home_view_instance_action(
            db=context.db,
            record=context.record,
            actor_role=context.actor_role,
        )

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        name = _required_str_payload_value(
            record,
            "name",
            "The Home view request is missing a name.",
        )
        scope = _required_str_payload_value(
            record,
            "scope",
            "The Home view request is missing a scope.",
        )
        existing = find_home_view_definition_by_scope_name(
            db,
            owner_user_id=record.user_id,
            scope=scope,
            name=name,
        )
        return {
            "scope": scope,
            "name_key": home_view_name_key(name),
            "existing_definition_id": existing.id if existing is not None else None,
            "base_template_key": _optional_str_payload_value(record, "base_template_key"),
            "base_template_version": _optional_int_payload_value(record, "base_template_version"),
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
            "voided_at": actualization.voided_at if actualization is not None else None,
        }


class VoidTradeActualizationActionHandler(NonIdempotentActionHandler):
    action_type = "void_trade_actualization"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_void_trade_actualization_action(
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
            "The trade actualization void request is missing a trade_id.",
        )
        leg_no = _optional_int_payload_value(record, "leg_no")
        trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
        if trade is None:
            raise AssistantActionRequestError(
                f"Trade {trade_id} was not found during actualization-void stale-state recheck."
            )
        delivery_id = build_delivery_obligation_id(trade_id, leg_no)
        actualization = db.execute(
            select(TradeActualization).where(TradeActualization.delivery_id == delivery_id)
        ).scalars().first()
        if actualization is None:
            raise AssistantActionRequestError(
                f"Delivery {delivery_id} does not have an actualization record during stale-state recheck."
            )
        return {
            "trade_status": trade.status,
            "actualization_status": trade.actualization_status,
            "last_event_id": trade.last_event_id,
            "delivery_id": delivery_id,
            "actualization_version": actualization.version,
            "actual_quantity": float(actualization.actual_quantity),
            "actualized_at": actualization.actualized_at,
            "voided_at": actualization.voided_at,
        }


class RecordDeliveryEventActionHandler(NonIdempotentActionHandler):
    action_type = "record_delivery_event"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_record_delivery_event_action(
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
        delivery_id = _required_str_payload_value(
            record,
            "delivery_id",
            "The delivery-event request is missing a delivery_id.",
        )
        delivery = db.get(DeliveryObligation, delivery_id)
        if delivery is None:
            raise AssistantActionRequestError(
                f"Delivery {delivery_id} was not found during approval stale-state recheck."
            )
        delivery_events = list(
            db.execute(
                select(DeliveryEvent)
                .where(DeliveryEvent.delivery_id == delivery_id)
                .order_by(DeliveryEvent.occurred_at.desc(), DeliveryEvent.id.desc())
            ).scalars().all()
        )
        latest_event = delivery_events[0] if delivery_events else None
        return {
            "execution_status": delivery.execution_status,
            "event_count": len(delivery_events),
            "latest_event_type": latest_event.event_type if latest_event is not None else None,
            "latest_event_at": latest_event.occurred_at if latest_event is not None else None,
            "delivery_version": delivery.version,
        }


class ReverseDeliveryEventActionHandler(NonIdempotentActionHandler):
    action_type = "reverse_delivery_event"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_reverse_delivery_event_action(
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
        delivery_id = _required_str_payload_value(
            record,
            "delivery_id",
            "The delivery-event reversal request is missing a delivery_id.",
        )
        event_id = _required_int_payload_value(
            record,
            "event_id",
            "The delivery-event reversal request is missing an event_id.",
        )
        delivery = db.get(DeliveryObligation, delivery_id)
        if delivery is None:
            raise AssistantActionRequestError(
                f"Delivery {delivery_id} was not found during approval stale-state recheck."
            )
        delivery_events = list(
            db.execute(
                select(DeliveryEvent)
                .where(DeliveryEvent.delivery_id == delivery_id)
                .order_by(DeliveryEvent.occurred_at.desc(), DeliveryEvent.id.desc())
            ).scalars().all()
        )
        latest_event = delivery_events[0] if delivery_events else None
        target_event = next((event for event in delivery_events if event.id == event_id), None)
        if target_event is None:
            raise AssistantActionRequestError(
                f"Delivery event {event_id} was not found on delivery {delivery_id} during stale-state recheck."
            )
        return {
            "execution_status": delivery.execution_status,
            "event_count": len(delivery_events),
            "latest_event_type": latest_event.event_type if latest_event is not None else None,
            "latest_event_at": latest_event.occurred_at if latest_event is not None else None,
            "delivery_version": delivery.version,
            "target_event_id": target_event.id,
            "target_event_type": target_event.event_type,
            "target_event_occurred_at": target_event.occurred_at,
            "target_event_version": target_event.version,
            "target_event_reversal_of_event_id": target_event.reversal_of_event_id,
        }


class CreateManualAccrualEntryActionHandler(NonIdempotentActionHandler):
    action_type = "create_manual_accrual_entry"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_manual_accrual_entry_action(
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
        accrual_lot_id = _required_str_payload_value(
            record,
            "accrual_lot_id",
            "The manual-accrual request is missing an accrual_lot_id.",
        )
        lot = db.get(TradeAccrualLot, accrual_lot_id)
        if lot is None:
            raise AssistantActionRequestError(
                f"Accrual lot {accrual_lot_id} was not found during approval stale-state recheck."
            )
        entry_count = db.execute(
            select(TradeAccrualEntry.entry_id).where(TradeAccrualEntry.accrual_lot_id == accrual_lot_id)
        ).scalars().all()
        return {
            "trade_id": lot.trade_id,
            "lot_status": lot.status,
            "lot_version": lot.version,
            "entry_count": len(entry_count),
            "closed_at": lot.closed_at,
        }


class ReverseAccrualEntryActionHandler(NonIdempotentActionHandler):
    action_type = "reverse_accrual_entry"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_reverse_accrual_entry_action(
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
        entry_id = _required_str_payload_value(
            record,
            "entry_id",
            "The accrual-reversal request is missing an entry_id.",
        )
        entry = db.get(TradeAccrualEntry, entry_id)
        if entry is None:
            raise AssistantActionRequestError(
                f"Accrual entry {entry_id} was not found during approval stale-state recheck."
            )
        lot = db.get(TradeAccrualLot, entry.accrual_lot_id)
        reversal_id = db.execute(
            select(TradeAccrualEntry.entry_id).where(TradeAccrualEntry.reversal_of_entry_id == entry_id).limit(1)
        ).scalars().first()
        return {
            "accrual_lot_id": entry.accrual_lot_id,
            "trade_id": entry.trade_id,
            "entry_type": entry.entry_type,
            "lot_status": lot.status if lot is not None else None,
            "lot_version": lot.version if lot is not None else None,
            "closed_at": lot.closed_at if lot is not None else None,
            "existing_reversal_entry_id": reversal_id,
        }


class CreateAccountingEntryActionHandler(NonIdempotentActionHandler):
    action_type = "create_accounting_entry"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_create_accounting_entry_action(
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
        trade_id = _optional_str_payload_value(record, "trade_id")
        accrual_lot_id = _optional_str_payload_value(record, "accrual_lot_id")
        invoice_id = _optional_int_payload_value(record, "invoice_id")
        payment_id = _optional_int_payload_value(record, "payment_id")
        trade = db.get(Trade, trade_id) if trade_id is not None else None
        lot = db.get(TradeAccrualLot, accrual_lot_id) if accrual_lot_id is not None else None
        invoice = db.get(TradeInvoice, invoice_id) if invoice_id is not None else None
        payment = db.get(TradePayment, payment_id) if payment_id is not None else None
        return {
            "trade_exists": trade is not None,
            "trade_status": trade.status if trade is not None else None,
            "trade_last_event_id": trade.last_event_id if trade is not None else None,
            "accrual_lot_status": lot.status if lot is not None else None,
            "accrual_lot_version": lot.version if lot is not None else None,
            "invoice_status": invoice.status if invoice is not None else None,
            "invoice_version": invoice.version if invoice is not None else None,
            "payment_status": payment.status if payment is not None else None,
            "payment_version": payment.version if payment is not None else None,
        }


class ReverseAccountingEntryActionHandler(NonIdempotentActionHandler):
    action_type = "reverse_accounting_entry"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_reverse_accounting_entry_action(
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
        accounting_entry_id = _required_str_payload_value(
            record,
            "accounting_entry_id",
            "The accounting reversal request is missing an accounting_entry_id.",
        )
        entry = db.get(TradeAccountingEntry, accounting_entry_id)
        if entry is None:
            raise AssistantActionRequestError(
                f"Accounting entry {accounting_entry_id} was not found during approval stale-state recheck."
            )
        reversal_id = db.execute(
            select(TradeAccountingEntry.accounting_entry_id)
            .where(TradeAccountingEntry.reversal_of_entry_id == accounting_entry_id)
            .limit(1)
        ).scalars().first()
        return {
            "trade_id": entry.trade_id,
            "status": entry.status,
            "version": entry.version,
            "existing_reversal_entry_id": reversal_id,
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


class VoidTradeInvoiceActionHandler(NonIdempotentActionHandler):
    action_type = "void_trade_invoice"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_void_trade_invoice_action(
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
        invoice_id = _required_int_payload_value(
            record,
            "invoice_id",
            "The invoice-void request is missing an invoice_id.",
        )
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
            "voided_at": invoice.voided_at,
            "existing_payment_count": len(existing_payments),
            "payment_state_token": _payment_state_token(existing_payments),
        }


class ReverseTradePaymentActionHandler(NonIdempotentActionHandler):
    action_type = "reverse_trade_payment"

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return _execute_reverse_trade_payment_action(
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
        payment_id = _required_int_payload_value(
            record,
            "payment_id",
            "The payment-reversal request is missing a payment_id.",
        )
        payment = db.get(TradePayment, payment_id)
        if payment is None:
            raise AssistantActionRequestError(
                f"Payment {payment_id} was not found during approval stale-state recheck."
            )
        reversal_id = db.execute(
            select(TradePayment.id)
            .where(TradePayment.reversal_of_payment_id == payment_id)
            .limit(1)
        ).scalars().first()
        return {
            "payment_status": payment.status,
            "payment_amount": float(payment.payment_amount),
            "version": payment.version,
            "reversal_of_payment_id": payment.reversal_of_payment_id,
            "invoice_id": payment.invoice_id,
            "existing_reversal_payment_id": reversal_id,
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
    CreateTradeActionHandler(),
    AmendTradeActionHandler(),
    CancelTradeActionHandler(),
    CreateSettlementReportPresetActionHandler(),
    CreateHomeViewInstanceActionHandler(),
    RecordDeliveryEventActionHandler(),
    ReverseDeliveryEventActionHandler(),
    CreateManualAccrualEntryActionHandler(),
    ReverseAccrualEntryActionHandler(),
    IssueTradeConfirmationActionHandler(),
    RecordTradeConfirmationResponseActionHandler(),
    UpdateTradeWorkflowItemActionHandler(),
    RecordTradeActualizationActionHandler(),
    VoidTradeActualizationActionHandler(),
    IssueTradeInvoiceActionHandler(),
    VoidTradeInvoiceActionHandler(),
    CreateTradePaymentActionHandler(),
    ReverseTradePaymentActionHandler(),
    CreateAccountingEntryActionHandler(),
    ReverseAccountingEntryActionHandler(),
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
            "voided_at": invoice.voided_at,
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
            "reversal_of_payment_id": payment.reversal_of_payment_id,
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

    command_id = _assistant_trade_command_id(record, command_type="CancelTrade")
    event = _append_assistant_trade_write_command(
        db=db,
        record=record,
        actor_id=actor_id,
        decided_at=decided_at,
        command_type="CancelTrade",
        trade_id=trade_id,
        command_id=command_id,
        payload={
            **_domain_payload(record, exclude_keys={"trade_id", "occurred_at"}),
            "status": "CANCELLED",
            "assistant_action_request_id": record.id,
            "assistant_run_id": record.run_id,
        },
    )
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise AssistantActionRequestError(f"Trade {trade_id} was not found after cancellation.")

    return {
        "event_id": event.event_id,
        "command_id": command_id,
        "command_type": "CancelTrade",
        "trade_id": trade_id,
        "trade_status": trade.status,
        "last_event_id": trade.last_event_id,
    }


def _execute_create_settlement_report_preset_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_role: str | None,
) -> dict[str, object]:
    try:
        payload = SettlementReportPresetCreate.model_validate(
            {
                "name": _required_str_payload_value(
                    record,
                    "name",
                    "The settlement preset request is missing a name.",
                ),
                "scope": _required_str_payload_value(
                    record,
                    "scope",
                    "The settlement preset request is missing a scope.",
                ),
                "filters": dict((record.payload or {}).get("filters") or {}),
            }
        )
    except Exception as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    try:
        preset = create_settlement_report_preset(
            db,
            owner_user_id=record.user_id,
            payload=payload,
        )
    except SettlementReportPresetConflictError as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    return {
        "preset": to_settlement_preset_out(
            preset,
            actor_id=record.user_id,
            actor_role=actor_role,
        ).model_dump(mode="json"),
    }


def _execute_create_home_view_instance_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_role: str | None,
) -> dict[str, object]:
    raw_cards = (record.payload or {}).get("cards")
    if not isinstance(raw_cards, list):
        raise AssistantActionRequestError("The Home view request is missing card definitions.")
    raw_global_filters = (record.payload or {}).get("global_filters")
    if raw_global_filters is not None and not isinstance(raw_global_filters, dict):
        raise AssistantActionRequestError("The Home view request global_filters must be an object.")
    try:
        payload = HomeViewDefinitionCreate.model_validate(
            {
                "name": _required_str_payload_value(
                    record,
                    "name",
                    "The Home view request is missing a name.",
                ),
                "scope": _required_str_payload_value(
                    record,
                    "scope",
                    "The Home view request is missing a scope.",
                ),
                "base_template_key": _required_str_payload_value(
                    record,
                    "base_template_key",
                    "The Home view request is missing a base_template_key.",
                ),
                "base_template_version": _required_int_payload_value(
                    record,
                    "base_template_version",
                    "The Home view request is missing a base_template_version.",
                ),
                "persona_hint": (record.payload or {}).get("persona_hint"),
                "cards": raw_cards,
                "global_filters": dict(raw_global_filters or {}),
            }
        )
    except Exception as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    try:
        home_view = create_home_view_definition(
            db,
            owner_user_id=record.user_id,
            payload=payload,
        )
    except (HomeViewDefinitionConflictError, HomeViewDefinitionValidationError) as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    return {
        "home_view_definition": to_home_view_definition_out(
            home_view,
            db=db,
            actor_id=record.user_id,
            actor_role=actor_role,
        ).model_dump(mode="json"),
    }


def _execute_create_trade_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = _required_str_payload_value(record, "trade_id", "The create-trade request is missing a trade_id.")
    command_id = _assistant_trade_command_id(record, command_type="BookTrade")
    event = _append_assistant_trade_write_command(
        db=db,
        record=record,
        actor_id=actor_id,
        decided_at=decided_at,
        command_type="BookTrade",
        trade_id=trade_id,
        command_id=command_id,
        payload={
            **_domain_payload(record, exclude_keys={"trade_id", "occurred_at"}),
            "assistant_action_request_id": record.id,
            "assistant_run_id": record.run_id,
        },
    )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise AssistantActionRequestError(f"Trade {trade_id} was not created.")
    return {
        "event_id": event.event_id,
        "command_id": command_id,
        "command_type": "BookTrade",
        "trade_id": trade.trade_id,
        "trade_status": trade.status,
        "last_event_id": trade.last_event_id,
    }


def _execute_amend_trade_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = _required_str_payload_value(record, "trade_id", "The amend-trade request is missing a trade_id.")
    payload = _domain_payload(record, exclude_keys={"trade_id", "occurred_at"})
    if not payload:
        raise AssistantActionRequestError("The amend-trade request is missing changed fields.")
    command_id = _assistant_trade_command_id(record, command_type="AmendTradeTerms")
    event = _append_assistant_trade_write_command(
        db=db,
        record=record,
        actor_id=actor_id,
        decided_at=decided_at,
        command_type="AmendTradeTerms",
        trade_id=trade_id,
        command_id=command_id,
        payload={
            **payload,
            "assistant_action_request_id": record.id,
            "assistant_run_id": record.run_id,
        },
    )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise AssistantActionRequestError(f"Trade {trade_id} was not found after amendment.")
    return {
        "event_id": event.event_id,
        "command_id": command_id,
        "command_type": "AmendTradeTerms",
        "trade_id": trade.trade_id,
        "trade_status": trade.status,
        "last_event_id": trade.last_event_id,
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
        mutation_context=_assistant_trade_audit_mutation_context(record),
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


def _execute_void_trade_actualization_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    trade_id = _required_str_payload_value(
        record,
        "trade_id",
        "The trade actualization void request is missing a trade_id.",
    )
    try:
        actualization = void_trade_actualization(
            db,
            trade_id=trade_id,
            leg_no=_optional_int_payload_value(record, "leg_no"),
            actor_id=actor_id,
            void_reason=_required_str_payload_value(
                record,
                "void_reason",
                "The trade actualization void request is missing a void_reason.",
            ),
            notes=_optional_str_payload_value(record, "notes"),
            now=decided_at,
            mutation_context=_assistant_trade_audit_mutation_context(record),
        )
    except (HTTPException, LookupError, ValueError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        raise AssistantActionRequestError(detail or "Trade actualization void execution failed.") from exc

    return jsonable_encoder(
        {
            "actualization_id": actualization.actualization_id,
            "delivery_id": actualization.delivery_id,
            "trade_id": actualization.trade_id,
            "leg_no": actualization.leg_no,
            "actualization_status": actualization.actualization_status,
            "actual_quantity": actualization.actual_quantity,
            "actualized_at": actualization.actualized_at,
            "voided_at": actualization.voided_at,
            "void_reason": actualization.void_reason,
        }
    )


def _execute_record_delivery_event_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    delivery_id = _required_str_payload_value(
        record,
        "delivery_id",
        "The delivery-event request is missing a delivery_id.",
    )
    try:
        delivery = append_delivery_event(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            event_type=_required_str_payload_value(
                record,
                "event_type",
                "The delivery-event request is missing an event_type.",
            ),
            occurred_at=_required_datetime_payload_value(
                record,
                "occurred_at",
                "The delivery-event request is missing an occurred_at timestamp.",
            ),
            location_code=_optional_str_payload_value(record, "location_code"),
            reference_code=_optional_str_payload_value(record, "reference_code"),
            source=_optional_str_payload_value(record, "source"),
            notes=_optional_str_payload_value(record, "notes"),
            now=decided_at,
        )
    except (HTTPException, LookupError, ValueError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        raise AssistantActionRequestError(detail or "Delivery event execution failed.") from exc

    latest_event = delivery.delivery_events[0] if delivery.delivery_events else None
    return {
        "delivery_id": delivery.delivery_id,
        "trade_id": delivery.trade_id,
        "execution_status": delivery.execution_status,
        "event_count": delivery.event_count,
        "latest_event_type": latest_event.event_type if latest_event is not None else None,
    }


def _execute_reverse_delivery_event_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    delivery_id = _required_str_payload_value(
        record,
        "delivery_id",
        "The delivery-event reversal request is missing a delivery_id.",
    )
    try:
        delivery = reverse_delivery_event(
            db,
            delivery_id=delivery_id,
            event_id=_required_int_payload_value(
                record,
                "event_id",
                "The delivery-event reversal request is missing an event_id.",
            ),
            actor_id=actor_id,
            reversal_reason=_required_str_payload_value(
                record,
                "reversal_reason",
                "The delivery-event reversal request is missing a reversal_reason.",
            ),
            reversed_at=_optional_datetime_payload_value(record, "reversed_at"),
            source=_optional_str_payload_value(record, "source"),
            notes=_optional_str_payload_value(record, "notes"),
            now=decided_at,
        )
    except (HTTPException, LookupError, ValueError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        raise AssistantActionRequestError(detail or "Delivery event reversal execution failed.") from exc

    latest_event = delivery.delivery_events[0] if delivery.delivery_events else None
    return {
        "delivery_id": delivery.delivery_id,
        "trade_id": delivery.trade_id,
        "execution_status": delivery.execution_status,
        "event_count": delivery.event_count,
        "latest_event_type": latest_event.event_type if latest_event is not None else None,
        "latest_event_id": latest_event.event_id if latest_event is not None else None,
        "latest_event_reversal_of_event_id": (
            latest_event.reversal_of_event_id if latest_event is not None else None
        ),
    }


def _execute_create_manual_accrual_entry_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    accrual_lot_id = _required_str_payload_value(
        record,
        "accrual_lot_id",
        "The manual-accrual request is missing an accrual_lot_id.",
    )
    try:
        entry = create_manual_accrual_entry(
            db,
            accrual_lot_id=accrual_lot_id,
            actor_id=actor_id,
            quantity_delta=_optional_numeric_payload_value(record, "quantity_delta"),
            amount_delta=_optional_numeric_payload_value(record, "amount_delta"),
            effective_at=_optional_datetime_payload_value(record, "effective_at"),
            notes=_optional_str_payload_value(record, "notes"),
            reference_price=_optional_numeric_payload_value(record, "reference_price"),
            price_index_code=_optional_str_payload_value(record, "price_index_code"),
            fx_rate=_optional_numeric_payload_value(record, "fx_rate"),
            now=decided_at,
        )
    except (LookupError, ValueError) as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    lot = db.get(TradeAccrualLot, entry.accrual_lot_id)
    if lot is None:
        raise AssistantActionRequestError(f"Accrual lot {entry.accrual_lot_id} was not found after entry creation.")
    return {
        "entry_id": entry.entry_id,
        "accrual_lot_id": entry.accrual_lot_id,
        "trade_id": entry.trade_id,
        "entry_type": entry.entry_type,
        "lot_status": lot.status,
        "lot_version": lot.version,
    }


def _execute_reverse_accrual_entry_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    entry_id = _required_str_payload_value(
        record,
        "entry_id",
        "The accrual-reversal request is missing an entry_id.",
    )
    try:
        reversal_entry = reverse_manual_accrual_entry(
            db,
            entry_id=entry_id,
            actor_id=actor_id,
            reversal_reason=_optional_str_payload_value(record, "reversal_reason"),
            effective_at=_optional_datetime_payload_value(record, "effective_at"),
            now=decided_at,
        )
    except (LookupError, ValueError) as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    lot = db.get(TradeAccrualLot, reversal_entry.accrual_lot_id)
    if lot is None:
        raise AssistantActionRequestError(
            f"Accrual lot {reversal_entry.accrual_lot_id} was not found after entry reversal."
        )
    return {
        "entry_id": reversal_entry.entry_id,
        "reversal_of_entry_id": reversal_entry.reversal_of_entry_id,
        "accrual_lot_id": reversal_entry.accrual_lot_id,
        "trade_id": reversal_entry.trade_id,
        "lot_status": lot.status,
        "lot_version": lot.version,
    }


def _execute_create_accounting_entry_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    try:
        entry = create_trade_accounting_entry(
            db,
            actor_id=actor_id,
            lines=_required_dict_list_payload_value(
                record,
                "lines",
                "The accounting-entry request is missing balanced posting lines.",
            ),
            description=_required_str_payload_value(
                record,
                "description",
                "The accounting-entry request is missing a description.",
            ),
            trade_id=_optional_str_payload_value(record, "trade_id"),
            accrual_lot_id=_optional_str_payload_value(record, "accrual_lot_id"),
            accrual_entry_id=_optional_str_payload_value(record, "accrual_entry_id"),
            invoice_id=_optional_int_payload_value(record, "invoice_id"),
            payment_id=_optional_int_payload_value(record, "payment_id"),
            journal_code=_optional_str_payload_value(record, "journal_code"),
            entry_type=_optional_str_payload_value(record, "entry_type"),
            currency_code=_optional_str_payload_value(record, "currency_code"),
            effective_at=_optional_datetime_payload_value(record, "effective_at"),
            notes=_optional_str_payload_value(record, "notes"),
            now=decided_at,
        )
    except (LookupError, ValueError) as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    line_count = db.execute(
        select(TradeAccountingEntryLine.id).where(
            TradeAccountingEntryLine.accounting_entry_id == entry.accounting_entry_id
        )
    ).scalars().all()
    return {
        "accounting_entry_id": entry.accounting_entry_id,
        "trade_id": entry.trade_id,
        "entry_type": entry.entry_type,
        "status": entry.status,
        "currency_code": entry.currency_code,
        "line_count": len(line_count),
    }


def _execute_reverse_accounting_entry_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    accounting_entry_id = _required_str_payload_value(
        record,
        "accounting_entry_id",
        "The accounting reversal request is missing an accounting_entry_id.",
    )
    try:
        reversal_entry = reverse_trade_accounting_entry(
            db,
            accounting_entry_id=accounting_entry_id,
            actor_id=actor_id,
            reversal_reason=_optional_str_payload_value(record, "reversal_reason"),
            effective_at=_optional_datetime_payload_value(record, "effective_at"),
            now=decided_at,
        )
    except (LookupError, ValueError) as exc:
        raise AssistantActionRequestError(str(exc)) from exc

    line_count = db.execute(
        select(TradeAccountingEntryLine.id).where(
            TradeAccountingEntryLine.accounting_entry_id == reversal_entry.accounting_entry_id
        )
    ).scalars().all()
    return {
        "accounting_entry_id": reversal_entry.accounting_entry_id,
        "reversal_of_entry_id": reversal_entry.reversal_of_entry_id,
        "trade_id": reversal_entry.trade_id,
        "status": reversal_entry.status,
        "line_count": len(line_count),
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
        due_calendar_code=_optional_str_payload_value(record, "due_calendar_code"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
        mutation_context=_assistant_trade_audit_mutation_context(record),
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
        due_calendar_code=_optional_str_payload_value(record, "due_calendar_code"),
        received_at=_optional_datetime_payload_value(record, "received_at"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
        mutation_context=_assistant_trade_audit_mutation_context(record),
    )
    return {
        "payment_id": payment.payment_id,
        "invoice_id": payment.invoice_id,
        "trade_id": payment.trade_id,
        "payment_reference": payment.payment_reference,
        "status": payment.status,
    }


def _execute_void_trade_invoice_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    invoice_id = _required_int_payload_value(
        record,
        "invoice_id",
        "The invoice-void request is missing an invoice_id.",
    )
    invoice = void_trade_invoice(
        db,
        invoice_id=invoice_id,
        actor_id=actor_id,
        void_reason=_optional_str_payload_value(record, "void_reason"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
        mutation_context=_assistant_trade_audit_mutation_context(record),
    )
    return {
        "invoice_id": invoice.invoice_id,
        "trade_id": invoice.trade_id,
        "invoice_number": invoice.invoice_number,
        "status": invoice.status,
        "void_reason": invoice.void_reason,
    }


def _execute_reverse_trade_payment_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
) -> dict[str, object]:
    payment_id = _required_int_payload_value(
        record,
        "payment_id",
        "The payment-reversal request is missing a payment_id.",
    )
    payment = reverse_trade_payment(
        db,
        payment_id=payment_id,
        actor_id=actor_id,
        reversal_reason=_optional_str_payload_value(record, "reversal_reason"),
        payment_reference=_optional_str_payload_value(record, "payment_reference"),
        reversed_at=_optional_datetime_payload_value(record, "reversed_at"),
        notes=_optional_str_payload_value(record, "notes"),
        now=decided_at,
        mutation_context=_assistant_trade_audit_mutation_context(record),
    )
    return {
        "payment_id": payment.payment_id,
        "invoice_id": payment.invoice_id,
        "trade_id": payment.trade_id,
        "payment_reference": payment.payment_reference,
        "status": payment.status,
        "reversal_of_payment_id": payment.reversal_of_payment_id,
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


def _required_dict_list_payload_value(
    record: AssistantActionRequest,
    key: str,
    error_detail: str,
) -> list[dict[str, object]]:
    raw_value = (record.payload or {}).get(key)
    if not isinstance(raw_value, list) or not raw_value:
        raise AssistantActionRequestError(error_detail)
    normalized: list[dict[str, object]] = []
    for item in raw_value:
        if not isinstance(item, dict):
            raise AssistantActionRequestError(f"Assistant action payload field '{key}' must be a list of objects.")
        normalized.append(dict(item))
    return normalized


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


def _domain_payload(
    record: AssistantActionRequest,
    *,
    exclude_keys: set[str] | None = None,
) -> dict[str, object]:
    payload = dict(record.payload or {})
    for key in {"review_context", *(exclude_keys or set())}:
        payload.pop(key, None)
    return payload


def _assistant_trade_command_id(record: AssistantActionRequest, *, command_type: str) -> str:
    return f"assistant-action-request:{record.id}:{command_type}"


def _assistant_action_execution_mode(record: AssistantActionRequest) -> str:
    payload = dict(record.payload or {})
    review_context = payload.get("review_context")
    if not isinstance(review_context, dict):
        return ""

    return str(review_context.get("execution_mode") or "").strip().upper()


def _assistant_trade_source_surface(record: AssistantActionRequest) -> str:
    execution_mode = _assistant_action_execution_mode(record)
    if execution_mode == "AUTONOMOUS":
        return "assistant.action_requests.autonomous"
    if execution_mode == "REVIEW_REQUIRED":
        return "assistant.action_requests.approve"
    return "assistant.action_requests.execute"


def _assistant_trade_expected_last_event_id(record: AssistantActionRequest) -> str | None:
    payload = dict(record.payload or {})
    review_context = payload.get("review_context")
    if not isinstance(review_context, dict):
        return None

    stale_state_basis = review_context.get("stale_state_basis")
    if not isinstance(stale_state_basis, dict):
        return None

    last_event_id = stale_state_basis.get("last_event_id")
    if last_event_id is None:
        return None
    normalized = str(last_event_id).strip()
    return normalized or None


def _assistant_trade_audit_mutation_context(record: AssistantActionRequest) -> TradeAuditMutationContext:
    provenance_details = {
        "action_request_id": record.id,
        "assistant_run_id": record.run_id,
        "assistant_action_type": record.action_type,
    }
    if record.agent_id:
        provenance_details["assistant_agent_id"] = record.agent_id
    execution_mode = _assistant_action_execution_mode(record)
    if execution_mode:
        provenance_details["execution_mode"] = execution_mode
    return TradeAuditMutationContext(
        source_surface=_assistant_trade_source_surface(record),
        correlation_id=f"assistant-action-{record.id}",
        provenance_details=provenance_details,
    )


def _append_assistant_trade_write_command(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decided_at: datetime,
    command_type: str,
    trade_id: str,
    command_id: str,
    payload: dict[str, object],
) -> Event:
    try:
        return append_trade_write_command(
            db,
            TradeWriteCommand(
                command_id=command_id,
                command_type=command_type,
                trade_id=trade_id,
                payload=payload,
                occurred_at=_optional_datetime_payload_value(record, "occurred_at") or decided_at,
                recorded_at=decided_at,
                actor_id=actor_id,
                correlation_id=f"assistant-action-{record.id}",
                causation_id=f"assistant-action-request:{record.id}",
                source_surface=_assistant_trade_source_surface(record),
                expected_last_event_id=_assistant_trade_expected_last_event_id(record),
            ),
            refresh=True,
        )
    except HTTPException as exc:
        raise AssistantActionRequestError(str(exc.detail or exc)) from exc
