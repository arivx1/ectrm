from __future__ import annotations

import json
import re
from datetime import datetime

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionPlanner,
    AssistantActionPlanningCandidate,
    AssistantActionPlanningContext,
    AssistantActionProposal,
    AssistantActionSpec,
)
from apps.api.app.domains.accruals.services.accruals import MANUAL_ENTRY_TYPES
from apps.api.app.domains.operations.services.actualizations import build_delivery_obligation_id
from apps.api.app.domains.operations.services.actualizations import preview_trade_actualization_void
from apps.api.app.domains.operations.services.settlement_invoices import preview_trade_invoice_issue
from apps.api.app.domains.operations.services.settlement_invoices import preview_trade_invoice_void
from apps.api.app.domains.operations.services.settlement_payments import preview_trade_payment_reversal
from apps.api.app.domains.operations.services.shipments import preview_delivery_event_reversal
from apps.api.app.domains.operations.services.workflow_items import evaluate_trade_workflow_item_update_policy
from apps.api.app.domains.operations.services.workflow_items import workflow_allowed_statuses
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.trade_accounting_entry import TradeAccountingEntry
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.shared.enums import DeliveryEventType

TRADE_ID_PATTERN = re.compile(r"\b([A-Za-z][A-Za-z0-9]{0,5}-\d{2,})\b")
INT_PATTERN_TEMPLATE = r"\b{label}(?:\s+(?:id|#))?[:\s#-]*(\d+)\b"
DOCUMENT_ID_PATTERN = re.compile(
    r"\bdocument(?:\s+id)?\s*(?:[:#]|number\s+)\s*([A-Za-z0-9][A-Za-z0-9-]{2,63})\b",
    re.IGNORECASE,
)
DELIVERY_ID_PATTERN = re.compile(
    r"\bdelivery(?:\s+id)?\s*(?:[:#]|number\s+)?\s*([A-Za-z0-9][A-Za-z0-9-]{2,95})\b",
    re.IGNORECASE,
)
ACCRUAL_LOT_ID_PATTERN = re.compile(
    r"\baccrual(?:\s+lot)?(?:\s+id)?\s*(?:[:#]|number\s+)?\s*([A-Za-z0-9][A-Za-z0-9-]{7,95})\b",
    re.IGNORECASE,
)
ACCRUAL_ENTRY_ID_PATTERN = re.compile(
    r"\baccrual(?:\s+entry)?(?:\s+id)?\s*(?:[:#]|number\s+)?\s*([A-Za-z0-9][A-Za-z0-9-]{7,95})\b",
    re.IGNORECASE,
)
ACCOUNTING_ENTRY_ID_PATTERN = re.compile(
    r"\baccounting(?:\s+entry)?(?:\s+id)?\s*(?:[:#]|number\s+)?\s*([A-Za-z0-9][A-Za-z0-9-]{7,95})\b",
    re.IGNORECASE,
)
DELIVERY_EVENT_TYPES = {event_type.value for event_type in DeliveryEventType}
TRADE_PAYLOAD_CONTEXT_KEYS: tuple[str, ...] = (
    "external_trade_id",
    "source_system",
    "execution_timestamp",
    "trade_date",
    "effective_start_date",
    "effective_end_date",
    "quality_spec",
    "unit_of_measure",
    "trade_currency_code",
    "location_code",
    "delivery_start",
    "delivery_end",
    "price_unit_code",
    "instrument_type",
    "option_type",
    "option_style",
    "option_expiration_date",
    "option_strike_price",
    "originating_option_trade_id",
    "trade_nature",
    "trade_structure",
    "trade_side",
    "book",
    "portfolio",
    "counterparty",
    "commodity_class",
    "commodity",
    "pricing_type",
    "pricing_status",
    "confirmation_status",
    "nomination_status",
    "allocation_status",
    "actualization_status",
    "price_index_code",
    "price",
    "volume",
    "invoice_status",
    "payment_status",
    "settlement_status",
    "trader_user",
    "status",
    "pretrade_review_id",
)
TRADE_NUMERIC_CONTEXT_KEYS = {"price", "volume", "option_strike_price"}
TRADE_INTEGER_CONTEXT_KEYS = {"pretrade_review_id"}


def _object_ref(record_type: str, record_id: object, label: str | None = None) -> dict[str, object]:
    normalized_id = str(record_id)
    return {
        "type": record_type,
        "id": normalized_id,
        "label": label or f"{record_type.replace('_', ' ').title()} {normalized_id}",
    }


def _supporting_record(
    record_type: str,
    record_id: object,
    summary: str,
    label: str | None = None,
) -> dict[str, object]:
    return {
        **_object_ref(record_type, record_id, label),
        "summary": summary,
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


def _with_review_context(
    payload: dict[str, object],
    *,
    owning_work_object: dict[str, object],
    required_reviewer_role: str,
    business_rationale: str,
    proposed_mutation: dict[str, object],
    supporting_records: tuple[dict[str, object], ...],
    expected_downstream_effects: tuple[str, ...],
    assumptions: tuple[str, ...] = (),
    missing_evidence: tuple[str, ...] = (),
    stale_state_basis: dict[str, object] | None = None,
    idempotency_key: str | None = None,
    action_preview: dict[str, object] | None = None,
) -> dict[str, object]:
    review_context = {
        "owning_work_object": owning_work_object,
        "required_reviewer_role": required_reviewer_role,
        "business_rationale": business_rationale,
        "proposed_mutation": proposed_mutation,
        "supporting_records": list(supporting_records),
        "assumptions": list(assumptions),
        "missing_evidence": list(missing_evidence),
        "expected_downstream_effects": list(expected_downstream_effects),
        "stale_state_basis": dict(stale_state_basis or {}),
        "idempotency_key": idempotency_key,
    }
    if action_preview is not None:
        review_context["action_preview"] = action_preview
    return {
        **payload,
        "review_context": review_context,
    }


class CancelTradeActionPlanner:
    action_type = "cancel_trade"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_cancel_trade(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            db=context.db,
        )


class CreateTradeActionPlanner:
    action_type = "create_trade"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_create_trade(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class AmendTradeActionPlanner:
    action_type = "amend_trade"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_amend_trade(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class CreateManualAccrualEntryActionPlanner:
    action_type = "create_manual_accrual_entry"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_create_manual_accrual_entry(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReverseAccrualEntryActionPlanner:
    action_type = "reverse_accrual_entry"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_reverse_accrual_entry(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class IssueTradeConfirmationActionPlanner:
    action_type = "issue_trade_confirmation"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_issue_trade_confirmation(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class UpdateTradeWorkflowItemActionPlanner:
    action_type = "update_trade_workflow_item"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_update_trade_workflow_item(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class RecordTradeActualizationActionPlanner:
    action_type = "record_trade_actualization"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_record_trade_actualization(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class VoidTradeActualizationActionPlanner:
    action_type = "void_trade_actualization"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_void_trade_actualization(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class RecordDeliveryEventActionPlanner:
    action_type = "record_delivery_event"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_record_delivery_event(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReverseDeliveryEventActionPlanner:
    action_type = "reverse_delivery_event"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_reverse_delivery_event(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class RecordTradeConfirmationResponseActionPlanner:
    action_type = "record_trade_confirmation_response"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_record_trade_confirmation_response(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class IssueTradeInvoiceActionPlanner:
    action_type = "issue_trade_invoice"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_issue_trade_invoice(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class CreateTradePaymentActionPlanner:
    action_type = "create_trade_payment"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_create_trade_payment(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class VoidTradeInvoiceActionPlanner:
    action_type = "void_trade_invoice"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_void_trade_invoice(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReverseTradePaymentActionPlanner:
    action_type = "reverse_trade_payment"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_reverse_trade_payment(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class CreateAccountingEntryActionPlanner:
    action_type = "create_accounting_entry"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_create_accounting_entry(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReverseAccountingEntryActionPlanner:
    action_type = "reverse_accounting_entry"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_reverse_accounting_entry(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReprocessDocumentIngestionActionPlanner:
    action_type = "reprocess_document_ingestion"

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return _plan_reprocess_document_ingestion(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


ACTION_PLANNER_SEQUENCE: tuple[AssistantActionPlanner, ...] = (
    CancelTradeActionPlanner(),
    CreateTradeActionPlanner(),
    AmendTradeActionPlanner(),
    IssueTradeConfirmationActionPlanner(),
    UpdateTradeWorkflowItemActionPlanner(),
    RecordDeliveryEventActionPlanner(),
    ReverseDeliveryEventActionPlanner(),
    RecordTradeActualizationActionPlanner(),
    VoidTradeActualizationActionPlanner(),
    RecordTradeConfirmationResponseActionPlanner(),
    CreateManualAccrualEntryActionPlanner(),
    ReverseAccrualEntryActionPlanner(),
    IssueTradeInvoiceActionPlanner(),
    VoidTradeInvoiceActionPlanner(),
    CreateTradePaymentActionPlanner(),
    ReverseTradePaymentActionPlanner(),
    CreateAccountingEntryActionPlanner(),
    ReverseAccountingEntryActionPlanner(),
    ReprocessDocumentIngestionActionPlanner(),
)
ACTION_PLANNERS: dict[str, AssistantActionPlanner] = {
    planner.action_type: planner for planner in ACTION_PLANNER_SEQUENCE
}


def parse_action_context_fields(text: str | None) -> dict[str, str]:
    fields: dict[str, str] = {}
    if not text:
        return fields
    for raw_line in text.splitlines():
        match = re.match(r"^\s*(?:-\s*)?([a-zA-Z0-9_]+)\s*:\s*(.+?)\s*$", raw_line)
        if match is None:
            continue
        key = match.group(1).strip().lower()
        value = match.group(2).strip()
        if key and value:
            fields[key] = value
    return fields


def first_matching_action_plan(
    planning_context: AssistantActionPlanningContext,
    *,
    action_specs: dict[str, AssistantActionSpec],
) -> AssistantActionPlanningCandidate | None:
    for action_spec in _action_planning_sequence(action_specs):
        planning_candidate = action_spec.plan(planning_context)
        if planning_candidate is not None:
            return planning_candidate
    return None


def _action_planning_sequence(
    action_specs: dict[str, AssistantActionSpec],
) -> tuple[AssistantActionSpec, ...]:
    return tuple(sorted(action_specs.values(), key=lambda spec: spec.catalog_entry.planner_priority))


def _mentions_cancel_trade(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "cancel trade",
            "cancel this trade",
            "cancel the trade",
            "cancel selected trade",
            "cancel the selected trade",
            "cancel current trade",
            "cancel it",
        )
    )


def _resolve_trade_id(message: str, context: str | None) -> str | None:
    direct_match = TRADE_ID_PATTERN.search(message)
    if direct_match is not None:
        return direct_match.group(1).upper()

    context_fields = parse_action_context_fields(context)
    direct_context_value = _first_present_value(context_fields, "trade_id")
    if direct_context_value:
        return direct_context_value.strip().upper() or None

    if not context:
        return None

    selected_match = re.search(r"^- trade_id:\s*(.+)$", context, re.IGNORECASE | re.MULTILINE)
    if selected_match is None:
        return None
    return selected_match.group(1).strip().upper() or None


def _first_present_value(fields: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = fields.get(key.lower())
        if value:
            return value
    return None


def _resolve_int_id(
    message: str,
    *,
    label_patterns: tuple[str, ...],
    context_fields: dict[str, str],
    field_keys: tuple[str, ...],
) -> int | None:
    for field_key in field_keys:
        value = context_fields.get(field_key.lower())
        if value:
            try:
                return int(value)
            except ValueError:
                return None

    for label in label_patterns:
        pattern = re.compile(INT_PATTERN_TEMPLATE.format(label=label), re.IGNORECASE)
        match = pattern.search(message)
        if match is not None:
            return int(match.group(1))
    return None


def _resolve_confirmation_id(
    *,
    message: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> int | None:
    resolved_id = _resolve_int_id(
        message,
        label_patterns=("confirmation",),
        context_fields=context_fields,
        field_keys=("confirmation_id",),
    )
    if resolved_id is not None:
        return resolved_id

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return None
    return (
        db.execute(
            select(TradeConfirmation.id)
            .where(TradeConfirmation.trade_id == trade_id)
            .order_by(TradeConfirmation.id.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )


def _resolve_workflow_item_id(message: str, *, context_fields: dict[str, str]) -> int | None:
    return _resolve_int_id(
        message,
        label_patterns=("workflow item", "work item"),
        context_fields=context_fields,
        field_keys=("item_id", "workflow_item_id", "work_item_id"),
    )


def _resolve_invoice_id(message: str, *, context_fields: dict[str, str]) -> int | None:
    return _resolve_int_id(
        message,
        label_patterns=("invoice",),
        context_fields=context_fields,
        field_keys=("invoice_id",),
    )


def _resolve_payment_id(message: str, *, context_fields: dict[str, str]) -> int | None:
    return _resolve_int_id(
        message,
        label_patterns=("payment",),
        context_fields=context_fields,
        field_keys=("payment_id",),
    )


def _resolve_delivery_event_id(
    message: str,
    *,
    message_lower: str,
    delivery_id: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> int | None:
    resolved_id = _resolve_int_id(
        message,
        label_patterns=("delivery event", "event"),
        context_fields=context_fields,
        field_keys=("event_id", "delivery_event_id"),
    )
    if resolved_id is not None:
        return resolved_id
    if delivery_id is None:
        return None

    delivery_events = list(
        db.execute(
            select(DeliveryEvent)
            .where(DeliveryEvent.delivery_id == delivery_id)
            .order_by(DeliveryEvent.occurred_at.desc(), DeliveryEvent.id.desc())
        ).scalars().all()
    )
    reversed_event_ids = {
        int(event.reversal_of_event_id)
        for event in delivery_events
        if event.reversal_of_event_id is not None
    }
    active_events = [
        event
        for event in delivery_events
        if event.reversal_of_event_id is None
        and event.event_type != DeliveryEventType.EVENT_REVERSED.value
        and event.id not in reversed_event_ids
    ]
    if not active_events:
        return None

    event_type = _resolve_delivery_event_type(message_lower, context_fields)
    if event_type is not None:
        matched_event = next((event for event in active_events if event.event_type == event_type), None)
        return matched_event.id if matched_event is not None else None
    return active_events[0].id


def _resolve_accrual_lot_id(message: str, *, context_fields: dict[str, str]) -> str | None:
    value = _first_present_value(context_fields, "accrual_lot_id")
    if value:
        return value.strip() or None
    match = ACCRUAL_LOT_ID_PATTERN.search(message)
    if match is None:
        return None
    return match.group(1).strip() or None


def _resolve_accrual_entry_id(message: str, *, context_fields: dict[str, str]) -> str | None:
    value = _first_present_value(context_fields, "entry_id", "accrual_entry_id")
    if value:
        return value.strip() or None
    match = ACCRUAL_ENTRY_ID_PATTERN.search(message)
    if match is None:
        return None
    return match.group(1).strip() or None


def _resolve_accounting_entry_id(message: str, *, context_fields: dict[str, str]) -> str | None:
    value = _first_present_value(context_fields, "accounting_entry_id", "entry_id")
    if value:
        return value.strip() or None
    match = ACCOUNTING_ENTRY_ID_PATTERN.search(message)
    if match is None:
        return None
    return match.group(1).strip() or None


def _resolve_document_id(message: str, *, context: str | None, context_fields: dict[str, str]) -> str | None:
    value = _first_present_value(context_fields, "document_id", "source_document_id")
    if value:
        return value
    match = DOCUMENT_ID_PATTERN.search(message)
    if match is not None:
        return match.group(1)
    if not context:
        return None
    match = re.search(r"^- (?:document_id|source_document_id):\s*(.+)$", context, re.IGNORECASE | re.MULTILINE)
    if match is None:
        return None
    return match.group(1).strip() or None


def _parse_iso_datetime_value(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def _preview_datetime_value(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_optional_float_value(value: str | None) -> float | None:
    if not value:
        return None
    normalized = value.strip().replace(",", "")
    if normalized.startswith("$"):
        normalized = normalized[1:]
    try:
        return float(normalized)
    except ValueError:
        return None


def _parse_optional_int_value(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value.strip())
    except ValueError:
        return None


def _parse_optional_json_dict(value: str | None) -> dict[str, object] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return dict(parsed) if isinstance(parsed, dict) else None


def _parse_optional_json_list(value: str | None) -> list[dict[str, object]] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    normalized = [item for item in parsed if isinstance(item, dict)]
    return normalized or None


def _balanced_accounting_line_preview(
    lines: list[dict[str, object]],
) -> tuple[list[dict[str, object]], float, float] | None:
    normalized_lines: list[dict[str, object]] = []
    debit_total = 0.0
    credit_total = 0.0
    for raw_line in lines:
        side = str(raw_line.get("side") or "").strip().upper()
        account_code = str(raw_line.get("account_code") or "").strip()
        amount = raw_line.get("amount")
        if side not in {"DEBIT", "CREDIT"} or not account_code:
            return None
        try:
            normalized_amount = float(amount)
        except (TypeError, ValueError):
            return None
        if normalized_amount <= 0:
            return None
        normalized_line = {
            "side": side,
            "account_code": account_code,
            "amount": normalized_amount,
            **(
                {"currency_code": str(raw_line.get("currency_code")).strip().upper()}
                if raw_line.get("currency_code")
                else {}
            ),
            **({"reference_code": str(raw_line.get("reference_code")).strip()} if raw_line.get("reference_code") else {}),
            **({"notes": str(raw_line.get("notes")).strip()} if raw_line.get("notes") else {}),
        }
        normalized_lines.append(normalized_line)
        if side == "DEBIT":
            debit_total += normalized_amount
        else:
            credit_total += normalized_amount
    if len(normalized_lines) < 2 or round(debit_total, 6) != round(credit_total, 6):
        return None
    return normalized_lines, debit_total, credit_total


def _normalized_event_type(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().upper().replace("-", "_").replace(" ", "_")
    return normalized if normalized in DELIVERY_EVENT_TYPES else None


def _resolve_delivery_id(message: str, *, context: str | None, context_fields: dict[str, str]) -> str | None:
    explicit_value = _first_present_value(context_fields, "delivery_id")
    if explicit_value:
        return explicit_value.strip().upper() or None
    match = DELIVERY_ID_PATTERN.search(message)
    if match is not None:
        return match.group(1).strip().upper() or None
    if context:
        context_match = re.search(r"^- delivery_id:\s*(.+)$", context, re.IGNORECASE | re.MULTILINE)
        if context_match is not None:
            return context_match.group(1).strip().upper() or None
    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return None
    leg_no = _parse_optional_int_value(_first_present_value(context_fields, "leg_no"))
    return build_delivery_obligation_id(trade_id, leg_no)


def _resolve_delivery_event_type(message_lower: str, context_fields: dict[str, str]) -> str | None:
    explicit_value = _normalized_event_type(_first_present_value(context_fields, "event_type", "delivery_event_type"))
    if explicit_value is not None:
        return explicit_value

    phrase_map = {
        "delivery completed": "DELIVERY_COMPLETED",
        "completed delivery": "DELIVERY_COMPLETED",
        "delivery complete": "DELIVERY_COMPLETED",
        "execution started": "EXECUTION_STARTED",
        "started delivery": "EXECUTION_STARTED",
        "checkpoint recorded": "CHECKPOINT_RECORDED",
        "record checkpoint": "CHECKPOINT_RECORDED",
        "schedule committed": "SCHEDULE_COMMITTED",
        "committed schedule": "SCHEDULE_COMMITTED",
        "hold applied": "HOLD_APPLIED",
        "put on hold": "HOLD_APPLIED",
        "hold released": "HOLD_RELEASED",
        "released hold": "HOLD_RELEASED",
        "delivery cancelled": "CANCELLED",
        "cancelled delivery": "CANCELLED",
        "plan captured": "PLAN_CAPTURED",
    }
    for phrase, event_type in phrase_map.items():
        if phrase in message_lower:
            return event_type
    return None


def _merge_trade_payload_context(context_fields: dict[str, str]) -> dict[str, object]:
    payload = (
        _parse_optional_json_dict(_first_present_value(context_fields, "trade_payload_json", "payload_json", "payload"))
        or {}
    )
    for key in TRADE_PAYLOAD_CONTEXT_KEYS:
        raw_value = context_fields.get(key)
        if raw_value is None:
            continue
        if key in TRADE_NUMERIC_CONTEXT_KEYS:
            parsed_value = _parse_optional_float_value(raw_value)
            if parsed_value is None:
                continue
            payload[key] = parsed_value
            continue
        if key in TRADE_INTEGER_CONTEXT_KEYS:
            parsed_value = _parse_optional_int_value(raw_value)
            if parsed_value is None:
                continue
            payload[key] = parsed_value
            continue
        normalized = raw_value.strip()
        if normalized:
            payload[key] = normalized

    legs_payload = _parse_optional_json_list(_first_present_value(context_fields, "legs_json", "legs"))
    if legs_payload is not None:
        payload["legs"] = legs_payload
    return payload


def _extract_amount_from_message(message: str) -> float | None:
    match = re.search(r"\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)", message)
    if match is not None:
        return _parse_optional_float_value(match.group(1))

    match = re.search(r"\bamount(?:\s+of)?\s+([0-9][0-9,]*(?:\.[0-9]+)?)\b", message, re.IGNORECASE)
    if match is None:
        return None
    return _parse_optional_float_value(match.group(1))


def _extract_labeled_amount_from_message(message: str, *, labels: tuple[str, ...]) -> float | None:
    escaped_labels = "|".join(re.escape(label) for label in labels)
    patterns = (
        rf"\b(?:{escaped_labels})\b(?:\s+amount)?(?:\s+(?:of|for))?[:\s$-]*([0-9][0-9,]*(?:\.[0-9]+)?)\b",
        rf"\bamount(?:\s+for)?\s+(?:{escaped_labels})\b[:\s$-]*([0-9][0-9,]*(?:\.[0-9]+)?)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, message, re.IGNORECASE)
        if match is not None:
            return _parse_optional_float_value(match.group(1))
    return None


def _extract_labeled_iso_datetime_from_message(message: str, *, labels: tuple[str, ...]) -> str | None:
    escaped_labels = "|".join(re.escape(label) for label in labels)
    pattern = re.compile(
        rf"\b(?:{escaped_labels})\b(?:\s+(?:at|on|for|by|date))?[:\s-]*(20\d{{2}}-\d{{2}}-\d{{2}}(?:[T ][0-9:\-+.Z]+)?)\b",
        re.IGNORECASE,
    )
    match = pattern.search(message)
    if match is None:
        return None
    return _parse_iso_datetime_value(match.group(1).replace(" ", "T"))


def _extract_owner_from_message(message: str) -> str | None:
    patterns = (
        r"\bassign(?:\s+(?:it|this|item|workflow item|work item)(?:\s+\d+)?)?\s+to\s+([a-z0-9._-]+(?:\s+[a-z0-9._-]+){0,2}?)(?=\s+(?:due|status|note|notes)\b|[.,;]|$)",
        r"\bowner(?:\s+(?:is|to))?\s*[:=]?\s*([a-z0-9._-]+(?:\s+[a-z0-9._-]+){0,2}?)(?=\s+(?:due|status|note|notes)\b|[.,;]|$)",
        r"\bowned\s+by\s+([a-z0-9._-]+(?:\s+[a-z0-9._-]+){0,2}?)(?=\s+(?:due|status|note|notes)\b|[.,;]|$)",
    )
    for pattern in patterns:
        match = re.search(pattern, message, re.IGNORECASE)
        if match is not None:
            return match.group(1).strip().strip("'\"")
    return None


def _plan_create_trade(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_create_trade(message_lower):
        return None

    trade_id = _first_present_value(context_fields, "trade_id")
    if trade_id:
        trade_id = trade_id.strip().upper() or None
    if trade_id is None:
        trade_id = _resolve_trade_id(message, None)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade_id was provided for a governed trade-create request."
        )

    if db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first() is not None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} already exists, so no create-trade action was staged."
        )

    payload = _merge_trade_payload_context(context_fields)
    payload["status"] = str(payload.get("status") or "ACTIVE").strip().upper()

    pricing_type = str(payload.get("pricing_type") or "FIXED").strip().upper()
    trade_structure = str(payload.get("trade_structure") or "SINGLE").strip().upper()
    missing_fields = [
        label
        for label, present in (
            ("book", bool(payload.get("book"))),
            ("commodity_class", bool(payload.get("commodity_class"))),
            ("commodity", bool(payload.get("commodity"))),
            ("volume", trade_structure != "SINGLE" or payload.get("volume") is not None or bool(payload.get("legs"))),
            ("price", pricing_type not in {"FIXED", "HYBRID"} or payload.get("price") is not None),
            ("price_index_code", pricing_type not in {"INDEX", "HYBRID"} or bool(payload.get("price_index_code"))),
        )
        if not present
    ]
    if missing_fields:
        return AssistantActionPlanningCandidate(
            warning=(
                f"Trade {trade_id} needs structured fields before create_trade can run: "
                + ", ".join(missing_fields)
                + "."
            )
        )

    occurred_at = _parse_iso_datetime_value(_first_present_value(context_fields, "occurred_at", "event_occurred_at"))
    if occurred_at is None and payload.get("execution_timestamp"):
        occurred_at = _parse_iso_datetime_value(str(payload.get("execution_timestamp")))
    action_payload = {
        "trade_id": trade_id,
        **payload,
        **({"occurred_at": occurred_at} if occurred_at else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="create_trade",
            summary=f"Create trade {trade_id}",
            description=(
                f"Create trade {trade_id} through the canonical event-led trade service. "
                "If executed, the application will append a TradeCreated event and build the current trade projection."
            ),
            payload=_with_review_context(
                action_payload,
                owning_work_object=_object_ref("trade", trade_id),
                required_reviewer_role="TRADER_OR_DESK_LEAD",
                business_rationale=(
                    f"Trade {trade_id} was requested as a new platform booking and enough structured economics were supplied to create it through the governed trade event path."
                ),
                proposed_mutation={
                    "operation": "create_trade",
                    "trade_id": trade_id,
                    "fields": sorted(key for key in payload.keys()),
                },
                supporting_records=(
                    _supporting_record(
                        "trade",
                        trade_id,
                        "No existing trade with this identifier was present when the action was staged.",
                    ),
                ),
                expected_downstream_effects=(
                    "Create a TradeCreated event.",
                    "Build the active trade projection.",
                    "Refresh workflow, position, and accrual projections tied to the new trade.",
                ),
                stale_state_basis={"trade_exists": False},
                idempotency_key=f"assistant-action:create_trade:{trade_id}",
            ),
        )
    )


def _plan_amend_trade(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_amend_trade(message_lower):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade was identified for a governed trade-amend request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no amend-trade action was staged."
        )

    payload = _merge_trade_payload_context(context_fields)
    payload.pop("status", None) if str(payload.get("status") or "").strip() == "" else None
    changed_payload = {key: value for key, value in payload.items() if key in {*TRADE_PAYLOAD_CONTEXT_KEYS, "legs"}}
    if not changed_payload:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was identified, but no amendment fields were supplied."
        )

    occurred_at = _parse_iso_datetime_value(_first_present_value(context_fields, "occurred_at", "event_occurred_at"))
    action_payload = {
        "trade_id": trade_id,
        **changed_payload,
        **({"occurred_at": occurred_at} if occurred_at else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="amend_trade",
            summary=f"Amend trade {trade_id}",
            description=(
                f"Amend trade {trade_id} through the canonical event-led trade service. "
                "If executed, the application will append a TradeAmended event and refresh the trade projection."
            ),
            payload=_with_review_context(
                action_payload,
                owning_work_object=_object_ref("trade", trade_id),
                required_reviewer_role="TRADER_OR_DESK_LEAD",
                business_rationale=(
                    f"Trade {trade_id} was explicitly selected for amendment and structured field changes were provided."
                ),
                proposed_mutation={
                    "operation": "amend_trade",
                    "trade_id": trade_id,
                    "changed_fields": sorted(changed_payload.keys()),
                },
                supporting_records=(
                    _supporting_record(
                        "trade",
                        trade_id,
                        f"Trade status was {trade.status} with last_event_id {trade.last_event_id}.",
                    ),
                ),
                expected_downstream_effects=(
                    "Create a TradeAmended event.",
                    "Refresh the trade projection and dependent workflow state.",
                    "Recompute position, option exposure, and accrual projections affected by the amendment.",
                ),
                stale_state_basis={
                    "trade_exists": True,
                    "status": trade.status,
                    "last_event_id": trade.last_event_id,
                },
                idempotency_key=f"assistant-action:amend_trade:{trade_id}:{trade.last_event_id}",
            ),
        )
    )


def _plan_cancel_trade(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_cancel_trade(message_lower):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade was identified for an approval-gated cancellation request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no approval request was staged."
        )
    if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} is already closed as {trade.status}, so no approval request was staged."
        )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="cancel_trade",
            summary=f"Cancel trade {trade_id}",
            description=(
                f"Create a TradeCancelled event for {trade_id}. "
                "If approved, the application will mark the trade as cancelled and recalculate trade projections."
            ),
            payload=_with_review_context(
                {"trade_id": trade_id},
                owning_work_object=_object_ref("trade", trade_id),
                required_reviewer_role="TRADER_OR_DESK_LEAD",
                business_rationale=(
                    f"Trade {trade_id} was identified from the request context and was active when the action was staged."
                ),
                proposed_mutation={"operation": "cancel_trade", "trade_id": trade_id, "status": "CANCELLED"},
                supporting_records=(
                    _supporting_record(
                        "trade",
                        trade_id,
                        f"Current trade status was {trade.status or 'ACTIVE'} when staged.",
                    ),
                ),
                expected_downstream_effects=(
                    "Create a TradeCancelled event.",
                    "Mark the trade projection as CANCELLED.",
                    "Refresh position and option exposure projections.",
                ),
                stale_state_basis={
                    "status": trade.status,
                    "last_event_id": trade.last_event_id,
                },
                idempotency_key=f"assistant-action:cancel_trade:{trade_id}:{trade.last_event_id}",
            ),
        )
    )


def _plan_issue_trade_confirmation(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_issue_confirmation(message_lower):
        return None

    confirmation_id = _resolve_confirmation_id(message=message, context=context, context_fields=context_fields, db=db)
    if confirmation_id is None:
        return AssistantActionPlanningCandidate(
            warning="No confirmation was identified for an approval-gated confirmation issue request."
        )

    confirmation = db.get(TradeConfirmation, confirmation_id)
    if confirmation is None:
        return AssistantActionPlanningCandidate(
            warning=f"Confirmation {confirmation_id} was not found, so no approval request was staged."
        )

    issue_method = _resolve_issue_method(message_lower, context_fields)
    issue_recipient = _resolve_issue_recipient(message, context_fields)
    issue_note = _first_present_value(context_fields, "issue_note", "notes")
    issued_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "issued_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("issued", "issue"))
    )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="issue_trade_confirmation",
            summary=f"Issue confirmation {confirmation_id} for trade {confirmation.trade_id}",
            description=(
                f"Issue the current confirmation record {confirmation_id} for trade {confirmation.trade_id}. "
                "If approved, the application will update issue metadata and confirmation workflow state."
            ),
            payload=_with_review_context(
                {
                    "confirmation_id": confirmation_id,
                    **({"issue_method": issue_method} if issue_method else {}),
                    **({"issue_recipient": issue_recipient} if issue_recipient else {}),
                    **({"issue_note": issue_note} if issue_note else {}),
                    **({"issued_at": issued_at} if issued_at else {}),
                },
                owning_work_object=_object_ref("trade_confirmation", confirmation_id),
                required_reviewer_role="OPERATIONS_LEAD_OR_TRADER",
                business_rationale=(
                    f"Confirmation {confirmation_id} for trade {confirmation.trade_id} was selected for issuance."
                ),
                proposed_mutation={
                    "operation": "issue_trade_confirmation",
                    "confirmation_id": confirmation_id,
                    **({"issue_method": issue_method} if issue_method else {}),
                    **({"issue_recipient": issue_recipient} if issue_recipient else {}),
                },
                supporting_records=(
                    _supporting_record(
                        "trade_confirmation",
                        confirmation_id,
                        f"Confirmation is currently {confirmation.status}.",
                    ),
                    _supporting_record("trade", confirmation.trade_id, "Owning trade for the confirmation."),
                ),
                expected_downstream_effects=(
                    "Update confirmation issue metadata.",
                    "Move confirmation workflow state forward.",
                ),
                missing_evidence=(() if issue_recipient else ("No issue recipient was provided.",)),
                stale_state_basis={
                    "status": confirmation.status,
                    "issue_count": confirmation.issue_count,
                    "version": confirmation.version,
                },
                idempotency_key=(
                    f"assistant-action:issue_trade_confirmation:{confirmation_id}:{confirmation.version}:{confirmation.issue_count}"
                ),
            ),
        )
    )


def _plan_record_trade_confirmation_response(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    response_action = _resolve_confirmation_response_action(message_lower, context_fields)
    if response_action is None:
        return None
    if not _mentions_confirmation_response(message_lower, context_fields):
        return None

    confirmation_id = _resolve_confirmation_id(message=message, context=context, context_fields=context_fields, db=db)
    if confirmation_id is None:
        return AssistantActionPlanningCandidate(
            warning="No confirmation was identified for an approval-gated confirmation response request."
        )

    confirmation = db.get(TradeConfirmation, confirmation_id)
    if confirmation is None:
        return AssistantActionPlanningCandidate(
            warning=f"Confirmation {confirmation_id} was not found, so no approval request was staged."
        )

    received_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "received_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("received", "response", "confirmed", "disputed"))
    )
    response_method = _resolve_response_method(message_lower, context_fields)
    response_reference = _first_present_value(context_fields, "response_reference")
    response_note = _first_present_value(context_fields, "response_note", "notes")
    dispute_reason = _first_present_value(context_fields, "dispute_reason")

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="record_trade_confirmation_response",
            summary=f"Record {response_action.lower().replace('_', ' ')} for confirmation {confirmation_id}",
            description=(
                f"Record a counterparty response on confirmation {confirmation_id} for trade {confirmation.trade_id}. "
                "If approved, the application will update confirmation receipt status and downstream workflow state."
            ),
            payload=_with_review_context(
                {
                    "confirmation_id": confirmation_id,
                    "action": response_action,
                    **({"received_at": received_at} if received_at else {}),
                    **({"response_method": response_method} if response_method else {}),
                    **({"response_reference": response_reference} if response_reference else {}),
                    **({"response_note": response_note} if response_note else {}),
                    **({"dispute_reason": dispute_reason} if dispute_reason else {}),
                },
                owning_work_object=_object_ref("trade_confirmation", confirmation_id),
                required_reviewer_role="OPERATIONS_LEAD",
                business_rationale=(
                    f"A counterparty response was requested for confirmation {confirmation_id} on trade {confirmation.trade_id}."
                ),
                proposed_mutation={
                    "operation": "record_trade_confirmation_response",
                    "confirmation_id": confirmation_id,
                    "action": response_action,
                },
                supporting_records=(
                    _supporting_record(
                        "trade_confirmation",
                        confirmation_id,
                        f"Confirmation receipt status was {confirmation.receipt_status}.",
                    ),
                    _supporting_record("trade", confirmation.trade_id, "Owning trade for the confirmation."),
                ),
                expected_downstream_effects=(
                    "Update confirmation receipt status.",
                    "Refresh downstream confirmation workflow state.",
                ),
                missing_evidence=(
                    ()
                    if response_method or response_reference or response_note
                    else ("No response evidence was provided.",)
                ),
                stale_state_basis={
                    "status": confirmation.status,
                    "receipt_status": confirmation.receipt_status,
                    "version": confirmation.version,
                },
                idempotency_key=(
                    f"assistant-action:record_trade_confirmation_response:{confirmation_id}:{confirmation.version}:{response_action}"
                ),
            ),
        )
    )


def _plan_update_trade_workflow_item(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_workflow_update(message_lower):
        return None

    item_id = _resolve_workflow_item_id(message, context_fields=context_fields)
    if item_id is None:
        return AssistantActionPlanningCandidate(
            warning="No workflow item was identified for an approval-gated workflow update request."
        )

    workflow_item = db.get(TradeWorkflowItem, item_id)
    if workflow_item is None:
        return AssistantActionPlanningCandidate(
            warning=f"Workflow item {item_id} was not found, so no approval request was staged."
        )

    changes = _resolve_workflow_changes(
        workflow_item=workflow_item,
        message=message,
        message_lower=message_lower,
        context_fields=context_fields,
    )
    if not changes:
        return AssistantActionPlanningCandidate(
            warning=f"Workflow item {item_id} was identified, but no valid workflow changes were found to stage."
        )

    try:
        policy_decision = evaluate_trade_workflow_item_update_policy(
            db,
            item_id=item_id,
            changes=changes,
            validate_actor=False,
        )
    except (LookupError, PermissionError, ValueError) as exc:
        return AssistantActionPlanningCandidate(
            warning=f"Workflow item {item_id} update was not staged: {exc}"
        )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="update_trade_workflow_item",
            summary=f"Update workflow item {item_id} on trade {workflow_item.trade_id}",
            description=(
                f"Update workflow item {item_id} ({workflow_item.workflow_type}) for trade {workflow_item.trade_id}. "
                "If approved, the application will apply the requested workflow field changes with audit history."
            ),
            payload={
                "item_id": item_id,
                "changes": jsonable_encoder(policy_decision.normalized_changes),
                "review_context": policy_decision.to_review_context(),
            },
        )
    )


def _plan_record_trade_actualization(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_trade_actualization(message_lower, context_fields):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade was identified for a governed actualization request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no actualization request was staged."
        )

    leg_no = _parse_optional_int_value(_first_present_value(context_fields, "leg_no"))
    actual_quantity = (
        _parse_optional_float_value(_first_present_value(context_fields, "actual_quantity", "quantity"))
        or _extract_labeled_amount_from_message(
            message,
            labels=("actual quantity", "actualized quantity", "delivered quantity", "quantity"),
        )
    )
    if actual_quantity is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was identified, but no actualized quantity was provided to record."
        )

    actualized_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "actualized_at"))
        or _extract_labeled_iso_datetime_from_message(
            message,
            labels=("actualized", "actualized at", "delivered", "delivered at"),
        )
    )
    if actualized_at is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} actualization needs an actualized_at timestamp before it can run."
        )

    source = _first_present_value(context_fields, "source")
    notes = _first_present_value(context_fields, "notes")
    delivery_id = build_delivery_obligation_id(trade_id, leg_no)
    existing_actualization = db.execute(
        select(TradeActualization).where(TradeActualization.delivery_id == delivery_id)
    ).scalars().first()
    payload = {
        "trade_id": trade_id,
        **({"leg_no": leg_no} if leg_no is not None else {}),
        "actual_quantity": actual_quantity,
        "actualized_at": actualized_at,
        **({"source": source} if source else {}),
        **({"notes": notes} if notes else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="record_trade_actualization",
            summary=f"Record actualization for trade {trade_id}",
            description=(
                f"Upsert delivery actualization for trade {trade_id}. "
                "If executed, the application will refresh actualization workflow and synchronize derived accruals."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("trade", trade_id),
                required_reviewer_role="OPERATIONS_LEAD",
                business_rationale=(
                    f"Trade {trade_id} actualization is being updated to reflect executed physical movement already reported by the user."
                ),
                proposed_mutation={"operation": "record_trade_actualization", **payload},
                supporting_records=(
                    _supporting_record(
                        "trade",
                        trade_id,
                        f"Trade actualization status was {trade.actualization_status} and trade status was {trade.status}.",
                    ),
                ),
                expected_downstream_effects=(
                    "Upsert the trade actualization record.",
                    "Refresh actualization workflow state.",
                    "Synchronize derived accrual lots and workflow projections.",
                ),
                stale_state_basis={
                    "trade_status": trade.status,
                    "actualization_status": trade.actualization_status,
                    "last_event_id": trade.last_event_id,
                    "delivery_id": delivery_id,
                    "actualization_version": existing_actualization.version if existing_actualization is not None else None,
                    "actual_quantity": (
                        float(existing_actualization.actual_quantity)
                        if existing_actualization is not None
                        else None
                    ),
                    "actualized_at": (
                        existing_actualization.actualized_at.isoformat()
                        if existing_actualization is not None
                        else None
                    ),
                },
                idempotency_key=(
                    "assistant-action:record_trade_actualization:"
                    f"{delivery_id}:{existing_actualization.version if existing_actualization is not None else 'new'}:{actualized_at}"
                ),
            ),
        )
    )


def _plan_void_trade_actualization(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_trade_actualization_void(message_lower, context_fields):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade was identified for an actualization-void request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no actualization-void request was staged."
        )

    leg_no = _parse_optional_int_value(_first_present_value(context_fields, "leg_no"))
    delivery_id = build_delivery_obligation_id(trade_id, leg_no)
    existing_actualization = db.execute(
        select(TradeActualization).where(TradeActualization.delivery_id == delivery_id)
    ).scalars().first()
    if existing_actualization is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} does not have an actualization record to void."
        )

    void_reason = _first_present_value(context_fields, "void_reason", "reason", "notes")
    notes = _first_present_value(context_fields, "notes")
    action_preview = preview_trade_actualization_void(
        db,
        trade_id=trade_id,
        leg_no=leg_no,
        void_reason=void_reason,
    )
    payload = {
        "trade_id": trade_id,
        **({"leg_no": leg_no} if leg_no is not None else {}),
        **({"void_reason": void_reason} if void_reason else {}),
        **({"notes": notes} if notes else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="void_trade_actualization",
            summary=f"Void actualization for trade {trade_id}",
            description=(
                f"Void the recorded actualization for delivery {delivery_id}. "
                "If executed, the application will clear the mistaken movement actualization from live state and "
                "refresh downstream accrual and workflow projections."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref(
                    "trade_actualization",
                    existing_actualization.id,
                    f"Actualization {existing_actualization.id}",
                ),
                required_reviewer_role="OPERATIONS_LEAD",
                business_rationale=(
                    f"Trade {trade_id} actualization was selected for correction because the recorded executed quantity "
                    "no longer reflects the user's asserted movement reality."
                ),
                proposed_mutation={"operation": "void_trade_actualization", **payload},
                supporting_records=(
                    _supporting_record(
                        "trade_actualization",
                        existing_actualization.id,
                        (
                            f"Delivery {delivery_id} actualization status was {trade.actualization_status} with "
                            f"recorded quantity {float(existing_actualization.actual_quantity)}."
                        ),
                    ),
                    _supporting_record("trade", trade_id, f"Trade status was {trade.status}."),
                ),
                expected_downstream_effects=(
                    "Mark the actualization record voided with explicit correction metadata.",
                    "Refresh delivery and trade actualization status back to pending state.",
                    "Synchronize derived accrual lots and workflow projections.",
                ),
                missing_evidence=(() if void_reason else ("No void reason was provided.",)),
                stale_state_basis={
                    "trade_status": trade.status,
                    "actualization_status": trade.actualization_status,
                    "last_event_id": trade.last_event_id,
                    "delivery_id": delivery_id,
                    "actualization_version": existing_actualization.version,
                    "actual_quantity": float(existing_actualization.actual_quantity),
                    "actualized_at": existing_actualization.actualized_at.isoformat(),
                    "voided_at": existing_actualization.voided_at.isoformat()
                    if existing_actualization.voided_at is not None
                    else None,
                },
                idempotency_key=(
                    f"assistant-action:void_trade_actualization:{delivery_id}:{existing_actualization.version}"
                ),
                action_preview=action_preview,
            ),
        )
    )


def _plan_record_delivery_event(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_delivery_event(message_lower, context_fields):
        return None

    delivery_id = _resolve_delivery_id(message, context=context, context_fields=context_fields)
    if delivery_id is None:
        return AssistantActionPlanningCandidate(
            warning="No delivery was identified for a governed delivery-event request."
        )

    delivery = db.get(DeliveryObligation, delivery_id)
    if delivery is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} was not found, so no delivery-event action was staged."
        )

    event_type = _resolve_delivery_event_type(message_lower, context_fields)
    if event_type is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} was identified, but no valid delivery event type was provided."
        )

    occurred_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "occurred_at", "event_occurred_at"))
        or _extract_labeled_iso_datetime_from_message(
            message,
            labels=("occurred", "event", "delivery completed", "execution started", "checkpoint"),
        )
    )
    if occurred_at is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} needs an occurred_at timestamp before the delivery event can run."
        )

    delivery_events = list(
        db.execute(
            select(DeliveryEvent)
            .where(DeliveryEvent.delivery_id == delivery_id)
            .order_by(DeliveryEvent.occurred_at.desc(), DeliveryEvent.id.desc())
        ).scalars().all()
    )
    latest_event = delivery_events[0] if delivery_events else None
    payload = {
        "delivery_id": delivery_id,
        "event_type": event_type,
        "occurred_at": occurred_at,
        **(
            {"location_code": value}
            if (value := _first_present_value(context_fields, "location_code"))
            else {}
        ),
        **(
            {"reference_code": value}
            if (value := _first_present_value(context_fields, "reference_code"))
            else {}
        ),
        **({"source": value} if (value := _first_present_value(context_fields, "source")) else {}),
        **({"notes": value} if (value := _first_present_value(context_fields, "notes")) else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="record_delivery_event",
            summary=f"Record {event_type.lower().replace('_', ' ')} on delivery {delivery_id}",
            description=(
                f"Record delivery event {event_type} on {delivery_id}. "
                "If executed, the application will log the delivery event and refresh internal movement status."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("delivery_obligation", delivery_id, f"Delivery {delivery_id}"),
                required_reviewer_role="OPERATIONS_LEAD",
                business_rationale=(
                    f"Delivery {delivery_id} was selected for movement-state synchronization based on the user's reported logistics event."
                ),
                proposed_mutation={"operation": "record_delivery_event", **payload},
                supporting_records=(
                    _supporting_record(
                        "delivery_obligation",
                        delivery_id,
                        f"Delivery execution status was {delivery.execution_status} with {len(delivery_events)} recorded events.",
                        f"Delivery {delivery_id}",
                    ),
                ),
                expected_downstream_effects=(
                    "Append a delivery movement event.",
                    "Refresh the delivery execution status and latest-event projection.",
                    "Expose the updated movement state in operations and shipment views.",
                ),
                stale_state_basis={
                    "execution_status": delivery.execution_status,
                    "event_count": len(delivery_events),
                    "latest_event_type": latest_event.event_type if latest_event is not None else None,
                    "latest_event_at": latest_event.occurred_at.isoformat() if latest_event is not None else None,
                    "delivery_version": delivery.version,
                },
                idempotency_key=(
                    f"assistant-action:record_delivery_event:{delivery_id}:{len(delivery_events)}:{event_type}:{occurred_at}"
                ),
            ),
        )
    )


def _plan_reverse_delivery_event(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_delivery_event_reversal(message_lower, context_fields):
        return None

    delivery_id = _resolve_delivery_id(message, context=context, context_fields=context_fields)
    if delivery_id is None:
        return AssistantActionPlanningCandidate(
            warning="No delivery was identified for a delivery-event reversal request."
        )

    delivery = db.get(DeliveryObligation, delivery_id)
    if delivery is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} was not found, so no delivery-event reversal was staged."
        )

    event_id = _resolve_delivery_event_id(
        message,
        message_lower=message_lower,
        delivery_id=delivery_id,
        context_fields=context_fields,
        db=db,
    )
    if event_id is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery {delivery_id} was identified, but no reversible delivery event could be resolved."
        )

    delivery_events = list(
        db.execute(
            select(DeliveryEvent)
            .where(DeliveryEvent.delivery_id == delivery_id)
            .order_by(DeliveryEvent.occurred_at.desc(), DeliveryEvent.id.desc())
        ).scalars().all()
    )
    target_event = next((event for event in delivery_events if event.id == event_id), None)
    if target_event is None:
        return AssistantActionPlanningCandidate(
            warning=f"Delivery event {event_id} was not found on delivery {delivery_id}."
        )

    reversal_reason = _first_present_value(context_fields, "reversal_reason", "reason", "notes")
    notes = _first_present_value(context_fields, "notes")
    source = _first_present_value(context_fields, "source")
    reversed_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "reversed_at", "occurred_at"))
        or _extract_labeled_iso_datetime_from_message(
            message,
            labels=("reversed", "reversed at", "undo", "undo at"),
        )
    )
    action_preview = preview_delivery_event_reversal(
        db,
        delivery_id=delivery_id,
        event_id=event_id,
        reversal_reason=reversal_reason,
        reversed_at=_preview_datetime_value(reversed_at),
    )
    latest_event = delivery_events[0] if delivery_events else None
    payload = {
        "delivery_id": delivery_id,
        "event_id": event_id,
        **({"reversal_reason": reversal_reason} if reversal_reason else {}),
        **({"reversed_at": reversed_at} if reversed_at else {}),
        **({"source": source} if source else {}),
        **({"notes": notes} if notes else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="reverse_delivery_event",
            summary=f"Reverse delivery event {event_id} on {delivery_id}",
            description=(
                f"Reverse delivery event {event_id} on {delivery_id}. "
                "If executed, the application will append a correction record and recompute live movement status "
                "from the remaining event history."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("delivery_event", event_id, f"Delivery event {event_id}"),
                required_reviewer_role="OPERATIONS_LEAD",
                business_rationale=(
                    f"Delivery {delivery_id} event {event_id} was selected for correction because the logged movement "
                    "event no longer reflects the user's reported reality."
                ),
                proposed_mutation={"operation": "reverse_delivery_event", **payload},
                supporting_records=(
                    _supporting_record(
                        "delivery_obligation",
                        delivery_id,
                        f"Delivery execution status was {delivery.execution_status} with {len(delivery_events)} recorded events.",
                        f"Delivery {delivery_id}",
                    ),
                    _supporting_record(
                        "delivery_event",
                        event_id,
                        f"Target event type was {target_event.event_type} at {target_event.occurred_at.isoformat()}.",
                        f"Delivery event {event_id}",
                    ),
                ),
                expected_downstream_effects=(
                    "Append a delivery-event reversal record.",
                    "Recompute live delivery execution status from the remaining active event history.",
                    "Expose the corrected movement state in operations and shipment views.",
                ),
                missing_evidence=(() if reversal_reason else ("No reversal reason was provided.",)),
                stale_state_basis={
                    "execution_status": delivery.execution_status,
                    "event_count": len(delivery_events),
                    "latest_event_type": latest_event.event_type if latest_event is not None else None,
                    "latest_event_at": latest_event.occurred_at.isoformat() if latest_event is not None else None,
                    "delivery_version": delivery.version,
                    "target_event_id": target_event.id,
                    "target_event_type": target_event.event_type,
                    "target_event_occurred_at": target_event.occurred_at.isoformat(),
                    "target_event_version": target_event.version,
                    "target_event_reversal_of_event_id": target_event.reversal_of_event_id,
                },
                idempotency_key=f"assistant-action:reverse_delivery_event:{delivery_id}:{event_id}:{len(delivery_events)}",
                action_preview=action_preview,
            ),
        )
    )


def _plan_create_manual_accrual_entry(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_create_manual_accrual_entry(message_lower, context_fields):
        return None

    accrual_lot_id = _resolve_accrual_lot_id(message, context_fields=context_fields)
    if accrual_lot_id is None:
        return AssistantActionPlanningCandidate(
            warning="No accrual lot was identified for a governed manual accrual entry request."
        )

    lot = db.get(TradeAccrualLot, accrual_lot_id)
    if lot is None:
        return AssistantActionPlanningCandidate(
            warning=f"Accrual lot {accrual_lot_id} was not found, so no manual accrual action was staged."
        )

    quantity_delta = _parse_optional_float_value(_first_present_value(context_fields, "quantity_delta"))
    amount_delta = _parse_optional_float_value(_first_present_value(context_fields, "amount_delta"))
    if (quantity_delta is None or quantity_delta == 0) and (amount_delta is None or amount_delta == 0):
        return AssistantActionPlanningCandidate(
            warning=f"Accrual lot {accrual_lot_id} was identified, but no non-zero quantity_delta or amount_delta was supplied."
        )

    effective_at = _parse_iso_datetime_value(_first_present_value(context_fields, "effective_at", "effective_date"))
    if effective_at is None:
        return AssistantActionPlanningCandidate(
            warning=f"Manual accrual entry for lot {accrual_lot_id} needs an effective_at timestamp before it can run."
        )

    entry_count = db.execute(
        select(TradeAccrualEntry.entry_id).where(TradeAccrualEntry.accrual_lot_id == accrual_lot_id)
    ).scalars().all()
    payload = {
        "accrual_lot_id": accrual_lot_id,
        "effective_at": effective_at,
        **({"quantity_delta": quantity_delta} if quantity_delta not in {None, 0} else {}),
        **({"amount_delta": amount_delta} if amount_delta not in {None, 0} else {}),
        **({"notes": value} if (value := _first_present_value(context_fields, "notes", "reason")) else {}),
        **(
            {"reference_price": value}
            if (value := _parse_optional_float_value(_first_present_value(context_fields, "reference_price"))) is not None
            else {}
        ),
        **(
            {"price_index_code": value}
            if (value := _first_present_value(context_fields, "price_index_code"))
            else {}
        ),
        **(
            {"fx_rate": value}
            if (value := _parse_optional_float_value(_first_present_value(context_fields, "fx_rate"))) is not None
            else {}
        ),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="create_manual_accrual_entry",
            summary=f"Create manual accrual entry on lot {accrual_lot_id}",
            description=(
                f"Append an immutable manual accrual adjustment entry on lot {accrual_lot_id}. "
                "If executed, the application will recalculate accrual lot balances and reconciliation state."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("trade_accrual_lot", accrual_lot_id, f"Accrual lot {accrual_lot_id}"),
                required_reviewer_role="SETTLEMENT_LEAD_OR_CONTROLLER",
                business_rationale=(
                    f"Accrual lot {accrual_lot_id} needs a controller-directed manual adjustment so the platform ledger reflects the asserted operational reality."
                ),
                proposed_mutation={"operation": "create_manual_accrual_entry", **payload},
                supporting_records=(
                    _supporting_record(
                        "trade_accrual_lot",
                        accrual_lot_id,
                        f"Lot status was {lot.status} with version {lot.version} when the manual adjustment was staged.",
                        f"Accrual lot {accrual_lot_id}",
                    ),
                ),
                expected_downstream_effects=(
                    "Append a manual accrual ledger entry.",
                    "Recompute accrual lot balances and status.",
                    "Expose the revised balances in accrual reconciliation reads.",
                ),
                stale_state_basis={
                    "trade_id": lot.trade_id,
                    "lot_status": lot.status,
                    "lot_version": lot.version,
                    "entry_count": len(entry_count),
                    "closed_at": lot.closed_at.isoformat() if lot.closed_at is not None else None,
                },
                idempotency_key=(
                    f"assistant-action:create_manual_accrual_entry:{accrual_lot_id}:{lot.version}:{effective_at}:{quantity_delta}:{amount_delta}"
                ),
            ),
        )
    )


def _plan_reverse_accrual_entry(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_reverse_accrual_entry(message_lower, context_fields):
        return None

    entry_id = _resolve_accrual_entry_id(message, context_fields=context_fields)
    if entry_id is None:
        return AssistantActionPlanningCandidate(
            warning="No accrual entry was identified for a governed accrual reversal request."
        )

    entry = db.get(TradeAccrualEntry, entry_id)
    if entry is None:
        return AssistantActionPlanningCandidate(
            warning=f"Accrual entry {entry_id} was not found, so no reversal action was staged."
        )
    if entry.entry_type not in MANUAL_ENTRY_TYPES:
        return AssistantActionPlanningCandidate(
            warning=f"Accrual entry {entry_id} is not a manual entry and cannot be reversed through the governed reversal path."
        )

    lot = db.get(TradeAccrualLot, entry.accrual_lot_id)
    reversal_entry_id = db.execute(
        select(TradeAccrualEntry.entry_id).where(TradeAccrualEntry.reversal_of_entry_id == entry_id).limit(1)
    ).scalars().first()
    if reversal_entry_id is not None:
        return AssistantActionPlanningCandidate(
            warning=f"Accrual entry {entry_id} has already been reversed by {reversal_entry_id}."
        )

    payload = {
        "entry_id": entry_id,
        **(
            {"effective_at": value}
            if (value := _parse_iso_datetime_value(_first_present_value(context_fields, "effective_at", "effective_date")))
            else {}
        ),
        **({"reversal_reason": value} if (value := _first_present_value(context_fields, "reversal_reason", "reason", "notes")) else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="reverse_accrual_entry",
            summary=f"Reverse accrual entry {entry_id}",
            description=(
                f"Reverse manual accrual entry {entry_id} with an immutable offsetting ledger row. "
                "If executed, the application will recompute the owning accrual lot balances and status."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("trade_accrual_entry", entry_id, f"Accrual entry {entry_id}"),
                required_reviewer_role="SETTLEMENT_LEAD_OR_CONTROLLER",
                business_rationale=(
                    f"Manual accrual entry {entry_id} no longer reflects the intended controller view and should be reversed through the accrual ledger."
                ),
                proposed_mutation={"operation": "reverse_accrual_entry", **payload},
                supporting_records=(
                    _supporting_record(
                        "trade_accrual_entry",
                        entry_id,
                        f"Entry type was {entry.entry_type} on accrual lot {entry.accrual_lot_id}.",
                        f"Accrual entry {entry_id}",
                    ),
                ),
                expected_downstream_effects=(
                    "Append an immutable manual reversal entry.",
                    "Recompute the owning accrual lot balances and status.",
                    "Preserve a traceable reversal chain for the manual accrual history.",
                ),
                stale_state_basis={
                    "accrual_lot_id": entry.accrual_lot_id,
                    "trade_id": entry.trade_id,
                    "entry_type": entry.entry_type,
                    "lot_status": lot.status if lot is not None else None,
                    "lot_version": lot.version if lot is not None else None,
                    "closed_at": lot.closed_at.isoformat() if lot is not None and lot.closed_at is not None else None,
                    "existing_reversal_entry_id": None,
                },
                idempotency_key=f"assistant-action:reverse_accrual_entry:{entry_id}",
            ),
        )
    )


def _plan_create_accounting_entry(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_create_accounting_entry(message_lower, context_fields):
        return None

    trade_id = _resolve_trade_id(message, context)
    accrual_lot_id = _resolve_accrual_lot_id(message, context_fields=context_fields)
    accrual_entry_id = _resolve_accrual_entry_id(message, context_fields=context_fields)
    invoice_id = _resolve_invoice_id(message, context_fields=context_fields)
    payment_id = _resolve_payment_id(message, context_fields=context_fields)

    lot = db.get(TradeAccrualLot, accrual_lot_id) if accrual_lot_id is not None else None
    accrual_entry = db.get(TradeAccrualEntry, accrual_entry_id) if accrual_entry_id is not None else None
    invoice = db.get(TradeInvoice, invoice_id) if invoice_id is not None else None
    payment = db.get(TradePayment, payment_id) if payment_id is not None else None
    if trade_id is None:
        trade_id = (
            lot.trade_id if lot is not None else None
        ) or (
            accrual_entry.trade_id if accrual_entry is not None else None
        ) or (
            invoice.trade_id if invoice is not None else None
        ) or (
            payment.trade_id if payment is not None else None
        )
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade or linked accrual, invoice, or payment record was identified for the accounting entry request."
        )

    trade = db.get(Trade, trade_id)
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no accounting entry action was staged."
        )

    raw_lines = (
        _parse_optional_json_list(_first_present_value(context_fields, "accounting_lines_json", "journal_lines_json", "lines_json", "lines"))
        or []
    )
    preview = _balanced_accounting_line_preview(raw_lines)
    if preview is None:
        return AssistantActionPlanningCandidate(
            warning="Accounting entry requests need a balanced lines_json payload with at least one debit and one credit line."
        )
    normalized_lines, debit_total, credit_total = preview

    description = _first_present_value(context_fields, "description", "entry_description", "journal_description")
    if description is None:
        return AssistantActionPlanningCandidate(
            warning=f"Accounting entry for trade {trade.trade_id} needs a description before it can run."
        )

    effective_at = _parse_iso_datetime_value(_first_present_value(context_fields, "effective_at", "effective_date"))
    if effective_at is None:
        return AssistantActionPlanningCandidate(
            warning=f"Accounting entry for trade {trade.trade_id} needs an effective_at timestamp before it can run."
        )

    payload = {
        "trade_id": trade.trade_id,
        "description": description,
        "effective_at": effective_at,
        "lines": normalized_lines,
        **({"accrual_lot_id": accrual_lot_id} if accrual_lot_id is not None else {}),
        **({"accrual_entry_id": accrual_entry_id} if accrual_entry_id is not None else {}),
        **({"invoice_id": invoice_id} if invoice_id is not None else {}),
        **({"payment_id": payment_id} if payment_id is not None else {}),
        **({"journal_code": value} if (value := _first_present_value(context_fields, "journal_code")) else {}),
        **({"entry_type": value} if (value := _first_present_value(context_fields, "entry_type")) else {}),
        **({"currency_code": value} if (value := _first_present_value(context_fields, "currency_code")) else {}),
        **({"notes": value} if (value := _first_present_value(context_fields, "notes", "reason")) else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="create_accounting_entry",
            summary=f"Create accounting entry for trade {trade.trade_id}",
            description=(
                f"Create a balanced internal accounting entry for trade {trade.trade_id}. "
                "If executed, the application will persist the posting header and its debit or credit lines."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref("trade", trade.trade_id),
                required_reviewer_role="CONTROLLER_OR_FINANCE_LEAD",
                business_rationale=(
                    f"Trade {trade.trade_id} needs an internal accounting posting so the platform ledger reflects the asserted finance reality."
                ),
                proposed_mutation={
                    "operation": "create_accounting_entry",
                    "trade_id": trade.trade_id,
                    "line_count": len(normalized_lines),
                    "debit_total": debit_total,
                    "credit_total": credit_total,
                    "links": {
                        key: value
                        for key, value in {
                            "accrual_lot_id": accrual_lot_id,
                            "accrual_entry_id": accrual_entry_id,
                            "invoice_id": invoice_id,
                            "payment_id": payment_id,
                        }.items()
                        if value is not None
                    },
                },
                supporting_records=tuple(
                    record
                    for record in (
                        _supporting_record("trade", trade.trade_id, f"Trade status was {trade.status}."),
                        _supporting_record("trade_accrual_lot", accrual_lot_id, f"Lot version was {lot.version}.")
                        if lot is not None
                        else None,
                        _supporting_record("trade_invoice", invoice_id, f"Invoice status was {invoice.status}.")
                        if invoice is not None
                        else None,
                        _supporting_record("trade_payment", payment_id, f"Payment status was {payment.status}.")
                        if payment is not None
                        else None,
                    )
                    if record is not None
                ),
                expected_downstream_effects=(
                    "Create a posted internal accounting entry.",
                    "Persist balanced debit and credit posting lines.",
                    "Expose the posting history for future accounting review and reversal.",
                ),
                stale_state_basis={
                    "trade_status": trade.status,
                    "trade_last_event_id": trade.last_event_id,
                    "accrual_lot_version": lot.version if lot is not None else None,
                    "invoice_version": invoice.version if invoice is not None else None,
                    "payment_version": payment.version if payment is not None else None,
                },
                idempotency_key=(
                    "assistant-action:create_accounting_entry:"
                    f"{trade.trade_id}:{effective_at}:{json.dumps(normalized_lines, sort_keys=True)}"
                ),
                action_preview={
                    "preview_type": "create_accounting_entry",
                    "status": "READY",
                    "summary": (
                        f"Balanced {len(normalized_lines)}-line accounting entry for trade {trade.trade_id} "
                        f"with debits and credits totaling {debit_total:.2f}."
                    ),
                    "affected_records": [
                        _supporting_record("trade", trade.trade_id, f"Trade status was {trade.status}."),
                    ],
                    "expected_side_effects": [
                        "Create a posted internal accounting entry.",
                        "Persist balanced debit and credit posting lines.",
                    ],
                    "assumptions": [
                        "Finance has already validated the described posting treatment against the loaded evidence.",
                    ],
                },
            ),
        )
    )


def _plan_reverse_accounting_entry(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_reverse_accounting_entry(message_lower, context_fields):
        return None

    accounting_entry_id = _resolve_accounting_entry_id(message, context_fields=context_fields)
    if accounting_entry_id is None:
        return AssistantActionPlanningCandidate(
            warning="No accounting entry was identified for a governed accounting reversal request."
        )

    entry = db.get(TradeAccountingEntry, accounting_entry_id)
    if entry is None:
        return AssistantActionPlanningCandidate(
            warning=f"Accounting entry {accounting_entry_id} was not found, so no accounting reversal was staged."
        )

    reversal_entry_id = db.execute(
        select(TradeAccountingEntry.accounting_entry_id)
        .where(TradeAccountingEntry.reversal_of_entry_id == accounting_entry_id)
        .limit(1)
    ).scalars().first()
    if reversal_entry_id is not None:
        return AssistantActionPlanningCandidate(
            warning=f"Accounting entry {accounting_entry_id} has already been reversed by {reversal_entry_id}."
        )

    payload = {
        "accounting_entry_id": accounting_entry_id,
        **(
            {"effective_at": value}
            if (value := _parse_iso_datetime_value(_first_present_value(context_fields, "effective_at", "effective_date")))
            else {}
        ),
        **({"reversal_reason": value} if (value := _first_present_value(context_fields, "reversal_reason", "reason", "notes")) else {}),
    }
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="reverse_accounting_entry",
            summary=f"Reverse accounting entry {accounting_entry_id}",
            description=(
                f"Reverse accounting entry {accounting_entry_id} with a balanced offsetting posting. "
                "If executed, the application will mark the original as reversed and persist the reversal entry."
            ),
            payload=_with_review_context(
                payload,
                owning_work_object=_object_ref(
                    "trade_accounting_entry",
                    accounting_entry_id,
                    f"Accounting entry {accounting_entry_id}",
                ),
                required_reviewer_role="CONTROLLER_OR_FINANCE_LEAD",
                business_rationale=(
                    f"Accounting entry {accounting_entry_id} no longer reflects the intended posting outcome and should be reversed through the internal ledger."
                ),
                proposed_mutation={"operation": "reverse_accounting_entry", **payload},
                supporting_records=(
                    _supporting_record(
                        "trade_accounting_entry",
                        accounting_entry_id,
                        f"Entry status was {entry.status} with version {entry.version}.",
                        f"Accounting entry {accounting_entry_id}",
                    ),
                ),
                expected_downstream_effects=(
                    "Create a balanced reversal posting entry.",
                    "Mark the original accounting entry as reversed.",
                    "Preserve a traceable posting reversal chain.",
                ),
                stale_state_basis={
                    "trade_id": entry.trade_id,
                    "status": entry.status,
                    "version": entry.version,
                    "existing_reversal_entry_id": None,
                },
                idempotency_key=f"assistant-action:reverse_accounting_entry:{accounting_entry_id}",
            ),
        )
    )


def _plan_issue_trade_invoice(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_invoice_issue(message_lower):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return AssistantActionPlanningCandidate(
            warning="No trade was identified for an approval-gated invoice issue request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no approval request was staged."
        )
    existing_invoices = list(
        db.execute(
            select(TradeInvoice)
            .where(TradeInvoice.trade_id == trade_id)
            .order_by(TradeInvoice.created_at.asc(), TradeInvoice.id.asc())
        ).scalars().all()
    )

    invoice_amount = (
        _parse_optional_float_value(_first_present_value(context_fields, "invoice_amount"))
        or _extract_labeled_amount_from_message(message, labels=("invoice", "invoice amount"))
        or _extract_amount_from_message(message)
    )
    billed_quantity = _parse_optional_float_value(_first_present_value(context_fields, "billed_quantity"))
    issued_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "issued_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("issued", "issue"))
    )
    due_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "due_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("due", "due on", "due at"))
    )

    invoice_number = _first_present_value(context_fields, "invoice_number")
    invoice_currency_code = _first_present_value(context_fields, "invoice_currency_code", "currency_code")
    notes = _first_present_value(context_fields, "notes")
    leg_no = _parse_optional_int_value(_first_present_value(context_fields, "leg_no"))
    invoice_payload = {
        "trade_id": trade_id,
        **({"leg_no": leg_no} if leg_no is not None else {}),
        **({"invoice_number": invoice_number} if invoice_number else {}),
        **({"invoice_currency_code": invoice_currency_code} if invoice_currency_code else {}),
        **({"billed_quantity": billed_quantity} if billed_quantity is not None else {}),
        **({"invoice_amount": invoice_amount} if invoice_amount is not None else {}),
        **({"issued_at": issued_at} if issued_at else {}),
        **({"due_at": due_at} if due_at else {}),
        **({"notes": notes} if notes else {}),
    }
    action_preview = preview_trade_invoice_issue(
        db,
        trade_id=trade_id,
        leg_no=invoice_payload.get("leg_no") if isinstance(invoice_payload.get("leg_no"), int) else None,
        invoice_number=invoice_payload.get("invoice_number"),
        invoice_currency_code=invoice_payload.get("invoice_currency_code"),
        billed_quantity=invoice_payload.get("billed_quantity"),
        invoice_amount=invoice_payload.get("invoice_amount"),
        issued_at=_preview_datetime_value(issued_at),
        due_at=_preview_datetime_value(due_at),
    )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="issue_trade_invoice",
            summary=f"Issue an invoice for trade {trade_id}",
            description=(
                f"Issue a settlement invoice for trade {trade_id}. "
                "If approved, the application will create the invoice and refresh settlement workflow projections."
            ),
            payload=_with_review_context(
                invoice_payload,
                owning_work_object=_object_ref("trade", trade_id),
                required_reviewer_role="SETTLEMENT_LEAD",
                business_rationale=f"Trade {trade_id} was selected for invoice issuance.",
                proposed_mutation={"operation": "issue_trade_invoice", **invoice_payload},
                supporting_records=(
                    _supporting_record(
                        "trade",
                        trade_id,
                        f"Trade settlement status was {trade.settlement_status}.",
                    ),
                ),
                expected_downstream_effects=(
                    "Create a trade invoice.",
                    "Refresh settlement workflow projections.",
                    "Expose the invoice in settlement and reporting views.",
                ),
                missing_evidence=tuple(
                    label
                    for label, present in (
                        ("No invoice amount was provided.", invoice_amount is not None),
                        ("No invoice due date was provided.", bool(due_at)),
                    )
                    if not present
                ),
                stale_state_basis={
                    "trade_status": trade.status,
                    "settlement_status": trade.settlement_status,
                    "last_event_id": trade.last_event_id,
                    "existing_invoice_count": len(existing_invoices),
                    "invoice_state_token": _invoice_state_token(existing_invoices),
                },
                idempotency_key=(
                    f"assistant-action:issue_trade_invoice:{trade_id}:{invoice_payload.get('invoice_number') or trade.last_event_id}"
                ),
                action_preview=action_preview,
            ),
        )
    )


def _plan_create_trade_payment(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_payment_creation(message_lower):
        return None

    invoice_id = _resolve_invoice_id(message, context_fields=context_fields)
    if invoice_id is None:
        return AssistantActionPlanningCandidate(
            warning="No invoice was identified for an approval-gated payment request."
        )

    invoice = db.get(TradeInvoice, invoice_id)
    if invoice is None:
        return AssistantActionPlanningCandidate(
            warning=f"Invoice {invoice_id} was not found, so no approval request was staged."
        )
    existing_payments = list(
        db.execute(
            select(TradePayment)
            .where(TradePayment.invoice_id == invoice_id)
            .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
        ).scalars().all()
    )

    payment_amount = (
        _parse_optional_float_value(_first_present_value(context_fields, "payment_amount"))
        or _extract_labeled_amount_from_message(message, labels=("payment", "payment amount"))
        or _extract_amount_from_message(message)
    )
    due_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "due_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("due", "due on", "due at"))
    )
    received_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "received_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("received", "paid"))
    )
    payment_status = _resolve_payment_status(message_lower, context_fields)
    payment_reference = _first_present_value(context_fields, "payment_reference")
    payment_currency_code = _first_present_value(context_fields, "payment_currency_code", "currency_code")
    notes = _first_present_value(context_fields, "notes")

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="create_trade_payment",
            summary=f"Create a payment for invoice {invoice_id}",
            description=(
                f"Create a settlement payment against invoice {invoice_id} for trade {invoice.trade_id}. "
                "If approved, the application will create the payment and refresh payment workflow projections."
            ),
            payload=_with_review_context(
                {
                    "invoice_id": invoice_id,
                    **({"payment_reference": payment_reference} if payment_reference else {}),
                    **({"payment_currency_code": payment_currency_code} if payment_currency_code else {}),
                    **({"payment_amount": payment_amount} if payment_amount is not None else {}),
                    **({"status": payment_status} if payment_status else {}),
                    **({"due_at": due_at} if due_at else {}),
                    **({"received_at": received_at} if received_at else {}),
                    **({"notes": notes} if notes else {}),
                },
                owning_work_object=_object_ref("trade_invoice", invoice_id),
                required_reviewer_role="SETTLEMENT_LEAD",
                business_rationale=f"Invoice {invoice_id} was selected for payment recording.",
                proposed_mutation={
                    "operation": "create_trade_payment",
                    "invoice_id": invoice_id,
                    **({"payment_amount": payment_amount} if payment_amount is not None else {}),
                    **({"status": payment_status} if payment_status else {}),
                },
                supporting_records=(
                    _supporting_record(
                        "trade_invoice",
                        invoice_id,
                        f"Invoice status was {invoice.status} with invoice amount {invoice.invoice_amount}.",
                    ),
                    _supporting_record("trade", invoice.trade_id, "Owning trade for the invoice."),
                ),
                expected_downstream_effects=(
                    "Create a trade payment record.",
                    "Refresh payment workflow projections.",
                    "Update settlement and cash follow-through views.",
                ),
                missing_evidence=(() if payment_amount is not None else ("No payment amount was provided.",)),
                stale_state_basis={
                    "invoice_status": invoice.status,
                    "invoice_amount": float(invoice.invoice_amount),
                    "version": invoice.version,
                    "existing_payment_count": len(existing_payments),
                    "payment_state_token": _payment_state_token(existing_payments),
                },
                idempotency_key=(
                    f"assistant-action:create_trade_payment:{invoice_id}:{payment_reference or invoice.version}"
                ),
            ),
        )
    )


def _plan_void_trade_invoice(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_invoice_void(message_lower):
        return None

    invoice_id = _resolve_invoice_id(message, context_fields=context_fields)
    if invoice_id is None:
        return AssistantActionPlanningCandidate(
            warning="No invoice was identified for an invoice-void request."
        )

    invoice = db.get(TradeInvoice, invoice_id)
    if invoice is None:
        return AssistantActionPlanningCandidate(
            warning=f"Invoice {invoice_id} was not found, so no void request was staged."
        )

    payments = list(
        db.execute(
            select(TradePayment)
            .where(TradePayment.invoice_id == invoice_id)
            .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
        ).scalars().all()
    )
    void_reason = _first_present_value(context_fields, "void_reason", "reason", "notes")
    notes = _first_present_value(context_fields, "notes")
    action_preview = preview_trade_invoice_void(
        db,
        invoice_id=invoice_id,
        void_reason=void_reason,
    )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="void_trade_invoice",
            summary=f"Void invoice {invoice.invoice_number}",
            description=(
                f"Void invoice {invoice.invoice_number} for trade {invoice.trade_id}. "
                "If executed, the application will mark the invoice as not required, clear eligible unpaid payment rows, "
                "and refresh settlement projections."
            ),
            payload=_with_review_context(
                {
                    "invoice_id": invoice_id,
                    **({"void_reason": void_reason} if void_reason else {}),
                    **({"notes": notes} if notes else {}),
                },
                owning_work_object=_object_ref("trade_invoice", invoice_id),
                required_reviewer_role="SETTLEMENT_LEAD",
                business_rationale=f"Invoice {invoice.invoice_number} was selected for settlement correction.",
                proposed_mutation={
                    "operation": "void_trade_invoice",
                    "invoice_id": invoice_id,
                    **({"void_reason": void_reason} if void_reason else {}),
                },
                supporting_records=(
                    _supporting_record(
                        "trade_invoice",
                        invoice_id,
                        f"Invoice status was {invoice.status} with invoice amount {invoice.invoice_amount}.",
                    ),
                    _supporting_record("trade", invoice.trade_id, "Owning trade for the invoice."),
                ),
                expected_downstream_effects=(
                    "Mark the invoice NOT_REQUIRED with explicit void metadata.",
                    "Refresh settlement workflow projections.",
                    "Auto-clear unpaid payment records tied to the invoice when eligible.",
                ),
                missing_evidence=(() if void_reason else ("No void reason was provided.",)),
                stale_state_basis={
                    "invoice_status": invoice.status,
                    "invoice_amount": float(invoice.invoice_amount),
                    "version": invoice.version,
                    "voided_at": invoice.voided_at,
                    "existing_payment_count": len(payments),
                    "payment_state_token": _payment_state_token(payments),
                },
                idempotency_key=f"assistant-action:void_trade_invoice:{invoice_id}",
                action_preview=action_preview,
            ),
        )
    )


def _plan_reverse_trade_payment(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_payment_reversal(message_lower, context_fields):
        return None

    payment_id = _resolve_payment_id(message, context_fields=context_fields)
    if payment_id is None:
        return AssistantActionPlanningCandidate(
            warning="No payment was identified for a payment-reversal request."
        )

    payment = db.get(TradePayment, payment_id)
    if payment is None:
        return AssistantActionPlanningCandidate(
            warning=f"Payment {payment_id} was not found, so no reversal request was staged."
        )

    reversal_reason = _first_present_value(context_fields, "reversal_reason", "reason", "notes")
    notes = _first_present_value(context_fields, "notes")
    payment_reference = _first_present_value(context_fields, "payment_reference")
    reversed_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "reversed_at", "effective_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("reversed", "reverse", "effective"))
    )
    action_preview = preview_trade_payment_reversal(
        db,
        payment_id=payment_id,
        reversal_reason=reversal_reason,
        reversed_at=_preview_datetime_value(reversed_at),
        payment_reference=payment_reference,
    )

    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="reverse_trade_payment",
            summary=f"Reverse payment {payment.payment_reference}",
            description=(
                f"Reverse payment {payment.payment_reference} on invoice {payment.invoice_id}. "
                "If executed, the application will append an offsetting payment entry and refresh settlement projections."
            ),
            payload=_with_review_context(
                {
                    "payment_id": payment_id,
                    **({"reversal_reason": reversal_reason} if reversal_reason else {}),
                    **({"payment_reference": payment_reference} if payment_reference else {}),
                    **({"reversed_at": reversed_at} if reversed_at else {}),
                    **({"notes": notes} if notes else {}),
                },
                owning_work_object=_object_ref("trade_payment", payment_id),
                required_reviewer_role="SETTLEMENT_LEAD",
                business_rationale=f"Payment {payment.payment_reference} was selected for settlement correction.",
                proposed_mutation={
                    "operation": "reverse_trade_payment",
                    "payment_id": payment_id,
                    **({"reversal_reason": reversal_reason} if reversal_reason else {}),
                },
                supporting_records=(
                    _supporting_record(
                        "trade_payment",
                        payment_id,
                        f"Payment status was {payment.status} with amount {payment.payment_amount}.",
                    ),
                    _supporting_record("trade_invoice", payment.invoice_id, "Owning invoice for the payment."),
                ),
                expected_downstream_effects=(
                    "Create an offsetting payment ledger record.",
                    "Refresh payment workflow projections.",
                    "Re-open invoice balance if the original payment no longer reflects reality.",
                ),
                missing_evidence=(() if reversal_reason else ("No reversal reason was provided.",)),
                stale_state_basis={
                    "payment_status": payment.status,
                    "payment_amount": float(payment.payment_amount),
                    "version": payment.version,
                    "reversal_of_payment_id": payment.reversal_of_payment_id,
                    "invoice_id": payment.invoice_id,
                },
                idempotency_key=f"assistant-action:reverse_trade_payment:{payment_id}",
                action_preview=action_preview,
            ),
        )
    )


def _plan_reprocess_document_ingestion(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> AssistantActionPlanningCandidate | None:
    if not _mentions_document_reprocess(message_lower):
        return None

    document_id = _resolve_document_id(message, context=context, context_fields=context_fields)
    if document_id is None:
        return AssistantActionPlanningCandidate(
            warning="No document was identified for an approval-gated reprocess request."
        )

    document = db.get(DocumentIngestion, document_id)
    if document is None:
        return AssistantActionPlanningCandidate(
            warning=f"Document {document_id} was not found, so no approval request was staged."
        )

    processor_provider = _resolve_processor_provider(message_lower, context_fields)
    return AssistantActionPlanningCandidate(
        proposal=AssistantActionProposal(
            action_type="reprocess_document_ingestion",
            summary=f"Reprocess document {document_id}",
            description=(
                f"Reset and reprocess document ingestion {document_id}. "
                "If approved, the application will reset analysis state and rerun document processing."
            ),
            payload=_with_review_context(
                {
                    "document_id": document_id,
                    **({"processor_provider": processor_provider} if processor_provider else {}),
                },
                owning_work_object=_object_ref("document_ingestion", document_id),
                required_reviewer_role="OPERATIONS_LEAD_OR_ADMIN",
                business_rationale=f"Document {document_id} was selected for ingestion reprocessing.",
                proposed_mutation={
                    "operation": "reprocess_document_ingestion",
                    "document_id": document_id,
                    **({"processor_provider": processor_provider} if processor_provider else {}),
                },
                supporting_records=(
                    _supporting_record(
                        "document_ingestion",
                        document_id,
                        f"Document status was {document.status} and review status was {document.review_status}.",
                    ),
                ),
                expected_downstream_effects=(
                    "Reset document analysis state.",
                    "Rerun document processing.",
                    "Refresh document review and linkage signals.",
                ),
                stale_state_basis={
                    "status": document.status,
                    "review_status": document.review_status,
                    "version": document.version,
                },
                idempotency_key=f"assistant-action:reprocess_document_ingestion:{document_id}:{document.version}",
            ),
        )
    )


def _mentions_issue_confirmation(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "issue confirmation",
            "send confirmation",
            "reissue confirmation",
            "issue this confirmation",
            "send this confirmation",
            "issue the confirmation",
        )
    )


def _mentions_create_trade(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "create trade",
            "book trade",
            "capture trade",
            "create a trade",
            "book a trade",
        )
    )


def _mentions_amend_trade(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "amend trade",
            "amend the trade",
            "update the trade",
            "change the trade",
            "modify the trade",
        )
    )


def _mentions_create_manual_accrual_entry(message_lower: str, context_fields: dict[str, str]) -> bool:
    if "reverse" in message_lower or "reversal" in message_lower:
        return False
    if any(key in context_fields for key in ("accrual_lot_id", "quantity_delta", "amount_delta")):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "create accrual entry",
            "record accrual entry",
            "manual accrual entry",
            "manual accrual adjustment",
            "adjust accrual lot",
            "post accrual adjustment",
        )
    )


def _mentions_reverse_accrual_entry(message_lower: str, context_fields: dict[str, str]) -> bool:
    if any(key in context_fields for key in ("entry_id", "accrual_entry_id")) and (
        "reverse" in message_lower or "reversal" in message_lower
    ):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "reverse accrual entry",
            "reverse the accrual entry",
            "undo accrual entry",
            "undo accrual adjustment",
        )
    )


def _mentions_workflow_update(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "workflow item",
            "work item",
            "workflow status",
            "assign this",
            "assign it",
            "update workflow",
            "mark workflow",
        )
    )


def _mentions_delivery_event_reversal(message_lower: str, context_fields: dict[str, str]) -> bool:
    if any(key in context_fields for key in ("event_id", "delivery_event_id")) and (
        "reverse" in message_lower or "reversal" in message_lower or "undo" in message_lower
    ):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "reverse delivery event",
            "reverse this delivery event",
            "reverse movement event",
            "undo delivery event",
            "undo movement event",
            "remove delivery event",
            "delete delivery event",
        )
    )


def _mentions_delivery_event(message_lower: str, context_fields: dict[str, str]) -> bool:
    if _mentions_delivery_event_reversal(message_lower, context_fields):
        return False
    if any(key in context_fields for key in ("delivery_id", "delivery_event_type", "event_type")):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "delivery event",
            "movement event",
            "delivery completed",
            "execution started",
            "checkpoint recorded",
            "hold applied",
            "hold released",
        )
    )


def _mentions_trade_actualization_void(message_lower: str, context_fields: dict[str, str]) -> bool:
    if any(key in context_fields for key in ("void_reason", "reason")) and (
        "void" in message_lower or "clear" in message_lower or "undo" in message_lower
    ):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "void actualization",
            "void this actualization",
            "clear actualization",
            "clear this actualization",
            "undo actualization",
            "remove actualization",
            "delete actualization",
        )
    )


def _mentions_trade_actualization(message_lower: str, context_fields: dict[str, str]) -> bool:
    if _mentions_trade_actualization_void(message_lower, context_fields):
        return False
    return any(
        phrase in message_lower
        for phrase in (
            "record actualization",
            "update actualization",
            "actualize trade",
            "actualized",
            "delivery actualization",
            "movement actualization",
        )
    )


def _mentions_confirmation_response(message_lower: str, context_fields: dict[str, str]) -> bool:
    if any(key in context_fields for key in ("confirmation_id", "action", "response_action", "receipt_status")):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "confirmation response",
            "counterparty confirmed",
            "counterparty disputed",
            "mark confirmation",
            "record confirmation",
            "confirmation was",
        )
    )


def _mentions_invoice_issue(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "issue invoice",
            "create invoice",
            "send invoice",
            "invoice this trade",
            "invoice the trade",
        )
    )


def _mentions_invoice_void(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "void invoice",
            "void this invoice",
            "cancel invoice",
            "delete invoice",
            "remove invoice",
        )
    )


def _mentions_payment_creation(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "create payment",
            "record payment",
            "mark paid",
            "mark this invoice paid",
            "record cash receipt",
            "settle invoice",
        )
    )


def _mentions_payment_reversal(message_lower: str, context_fields: dict[str, str]) -> bool:
    if "payment_id" in context_fields and ("reverse" in message_lower or "reversal" in message_lower):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "reverse payment",
            "reverse this payment",
            "undo payment",
            "delete payment",
            "remove payment",
        )
    )


def _mentions_create_accounting_entry(message_lower: str, context_fields: dict[str, str]) -> bool:
    if any(key in context_fields for key in ("accounting_lines_json", "journal_lines_json", "lines_json")):
        if "reverse" not in message_lower and "reversal" not in message_lower:
            return True
    return any(
        phrase in message_lower
        for phrase in (
            "create accounting entry",
            "create journal entry",
            "post journal entry",
            "book accounting entry",
            "create posting",
        )
    )


def _mentions_reverse_accounting_entry(message_lower: str, context_fields: dict[str, str]) -> bool:
    if "accounting_entry_id" in context_fields and ("reverse" in message_lower or "reversal" in message_lower):
        return True
    return any(
        phrase in message_lower
        for phrase in (
            "reverse accounting entry",
            "reverse journal entry",
            "reverse posting",
            "void accounting entry",
        )
    )


def _mentions_document_reprocess(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "reprocess document",
            "reprocess this document",
            "re-run document",
            "rerun document",
            "process this document again",
        )
    )


def _resolve_issue_method(message_lower: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "issue_method")
    if field_value:
        return field_value.strip().upper()
    for candidate in ("EMAIL", "EDI", "PORTAL", "MANUAL", "OTHER"):
        if candidate.lower() in message_lower:
            return candidate
    return None


def _resolve_response_method(message_lower: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "response_method")
    if field_value:
        return field_value.strip().upper()
    for candidate in ("EMAIL", "EDI", "PORTAL", "PHONE", "MANUAL", "OTHER"):
        if candidate.lower() in message_lower:
            return candidate
    return None


def _resolve_issue_recipient(message: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "issue_recipient")
    if field_value:
        return field_value
    match = re.search(r"\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b", message, re.IGNORECASE)
    if match is None:
        return None
    return match.group(1)


def _resolve_confirmation_response_action(message_lower: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "action", "response_action", "receipt_status")
    if field_value:
        normalized = field_value.strip().upper()
        if normalized in {"RECEIVED", "COUNTERPARTY_CONFIRMED", "COUNTERPARTY_DISPUTED"}:
            return normalized
    if "disput" in message_lower:
        return "COUNTERPARTY_DISPUTED"
    if "confirmed" in message_lower or "confirm it" in message_lower or "mark confirmed" in message_lower:
        return "COUNTERPARTY_CONFIRMED"
    if "received" in message_lower:
        return "RECEIVED"
    return None


def _resolve_workflow_changes(
    *,
    workflow_item: TradeWorkflowItem,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
) -> dict[str, object]:
    changes: dict[str, object] = {}
    requested_status = _first_present_value(context_fields, "status")
    if requested_status:
        changes["status"] = requested_status.strip().upper()
    else:
        allowed_statuses = workflow_allowed_statuses(workflow_item.workflow_type)
        for status in allowed_statuses:
            if status.lower() in message_lower:
                changes["status"] = status
                break

    owner = _first_present_value(context_fields, "owner")
    if owner:
        changes["owner"] = owner
    else:
        owner_from_message = _extract_owner_from_message(message)
        if owner_from_message is not None:
            changes["owner"] = owner_from_message

    due_at = _parse_iso_datetime_value(_first_present_value(context_fields, "due_at")) or (
        _extract_labeled_iso_datetime_from_message(message, labels=("due", "due on", "due at"))
        if "due" in message_lower
        else None
    )
    if due_at:
        changes["due_at"] = due_at

    notes = _first_present_value(context_fields, "notes")
    if notes:
        changes["notes"] = notes

    return changes


def _resolve_payment_status(message_lower: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "status")
    if field_value:
        return field_value.strip().upper()
    if "not required" in message_lower:
        return "NOT_REQUIRED"
    if "overdue" in message_lower:
        return "OVERDUE"
    if "mark paid" in message_lower or " paid" in message_lower:
        return "PAID"
    if " due" in message_lower:
        return "DUE"
    if "pending" in message_lower:
        return "PENDING"
    return None


def _resolve_processor_provider(message_lower: str, context_fields: dict[str, str]) -> str | None:
    field_value = _first_present_value(context_fields, "processor_provider")
    if field_value:
        return field_value.strip().lower()
    for provider in ("openai", "anthropic", "google"):
        if provider in message_lower:
            return provider
    return None
