from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.policies import evaluate_action_policy
from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptSection
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.domains.operations.services.workflow_items import evaluate_trade_workflow_item_update_policy
from apps.api.app.domains.operations.services.workflow_items import workflow_allowed_statuses
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.assistant import AssistantPromptRequest

TRADE_ID_PATTERN = re.compile(r"\b([A-Za-z][A-Za-z0-9]{0,5}-\d{2,})\b")
INT_PATTERN_TEMPLATE = r"\b{label}(?:\s+(?:id|#))?[:\s#-]*(\d+)\b"
DOCUMENT_ID_PATTERN = re.compile(
    r"\bdocument(?:\s+id)?\s*(?:[:#]|number\s+)\s*([A-Za-z0-9][A-Za-z0-9-]{2,63})\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class _ActionPlanningCandidate:
    proposal: AssistantActionProposal | None = None
    warning: str | None = None


@dataclass(frozen=True)
class AssistantActionProposal:
    action_type: str
    summary: str
    description: str
    payload: dict[str, object]


@dataclass(frozen=True)
class AssistantActionRuntimeResult:
    sections: tuple[AssistantPromptSection, ...]
    proposals: tuple[AssistantActionProposal, ...]
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssistantActionPlanningContext:
    message: str
    message_lower: str
    context: str | None
    context_fields: dict[str, str]
    db: Session


class AssistantActionPlanner(Protocol):
    action_type: str

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        ...


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
) -> dict[str, object]:
    return {
        **payload,
        "review_context": {
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
        },
    }


class CancelTradeActionPlanner:
    action_type = "cancel_trade"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_cancel_trade(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            db=context.db,
        )


class IssueTradeConfirmationActionPlanner:
    action_type = "issue_trade_confirmation"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_issue_trade_confirmation(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class UpdateTradeWorkflowItemActionPlanner:
    action_type = "update_trade_workflow_item"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_update_trade_workflow_item(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class RecordTradeConfirmationResponseActionPlanner:
    action_type = "record_trade_confirmation_response"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_record_trade_confirmation_response(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class IssueTradeInvoiceActionPlanner:
    action_type = "issue_trade_invoice"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_issue_trade_invoice(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


class CreateTradePaymentActionPlanner:
    action_type = "create_trade_payment"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_create_trade_payment(
            message=context.message,
            message_lower=context.message_lower,
            context_fields=context.context_fields,
            db=context.db,
        )


class ReprocessDocumentIngestionActionPlanner:
    action_type = "reprocess_document_ingestion"

    def plan(self, context: AssistantActionPlanningContext) -> _ActionPlanningCandidate | None:
        return _plan_reprocess_document_ingestion(
            message=context.message,
            message_lower=context.message_lower,
            context=context.context,
            context_fields=context.context_fields,
            db=context.db,
        )


ACTION_PLANNER_SEQUENCE: tuple[AssistantActionPlanner, ...] = (
    CancelTradeActionPlanner(),
    IssueTradeConfirmationActionPlanner(),
    UpdateTradeWorkflowItemActionPlanner(),
    RecordTradeConfirmationResponseActionPlanner(),
    IssueTradeInvoiceActionPlanner(),
    CreateTradePaymentActionPlanner(),
    ReprocessDocumentIngestionActionPlanner(),
)
ACTION_PLANNERS: dict[str, AssistantActionPlanner] = {
    planner.action_type: planner for planner in ACTION_PLANNER_SEQUENCE
}


def plan_action_requests(
    *,
    payload: AssistantPromptRequest,
    db: Session,
    agent_definition: ManagedAssistantAgent | None,
) -> AssistantActionRuntimeResult:
    if agent_definition is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())
    if "ACTION" not in {capability.upper() for capability in agent_definition.capabilities}:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    latest_message = _latest_user_message(payload)
    if latest_message is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    latest_message_lower = latest_message.lower()
    context_fields = _parse_key_value_fields(payload.context)
    planning_context = AssistantActionPlanningContext(
        message=latest_message,
        message_lower=latest_message_lower,
        context=payload.context,
        context_fields=context_fields,
        db=db,
    )
    planning_candidate = _first_matching_action_plan(planning_context)
    if planning_candidate is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())
    if planning_candidate.warning:
        return AssistantActionRuntimeResult(sections=(), proposals=(), warnings=(planning_candidate.warning,))

    proposal = planning_candidate.proposal
    assert proposal is not None
    policy_decision = evaluate_action_policy(
        agent=agent_definition,
        action_type=proposal.action_type,
        workspace=payload.workspace,
        phase="stage",
    )
    if not policy_decision.allowed:
        return AssistantActionRuntimeResult(
            sections=(),
            proposals=(),
            warnings=(policy_decision.reason,),
        )
    return AssistantActionRuntimeResult(
        sections=(_build_action_prompt_section(proposal),),
        proposals=(proposal,),
    )


def _first_matching_action_plan(
    planning_context: AssistantActionPlanningContext,
) -> _ActionPlanningCandidate | None:
    for planner in ACTION_PLANNER_SEQUENCE:
        planning_candidate = planner.plan(planning_context)
        if planning_candidate is not None:
            return planning_candidate
    return None


def _latest_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content.strip() or None
    return None


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

    context_fields = _parse_key_value_fields(context)
    direct_context_value = _first_present_value(context_fields, "trade_id")
    if direct_context_value:
        return direct_context_value.strip().upper() or None

    if not context:
        return None

    selected_match = re.search(r"^- trade_id:\s*(.+)$", context, re.IGNORECASE | re.MULTILINE)
    if selected_match is None:
        return None
    return selected_match.group(1).strip().upper() or None


def _parse_key_value_fields(text: str | None) -> dict[str, str]:
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


def _first_present_value(fields: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = fields.get(key.lower())
        if value:
            return value
    return None


def _resolve_int_id(message: str, *, label_patterns: tuple[str, ...], context_fields: dict[str, str], field_keys: tuple[str, ...]) -> int | None:
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


def _extract_iso_datetime_from_message(message: str) -> str | None:
    match = re.search(r"\b(20\d{2}-\d{2}-\d{2}(?:[T ][0-9:\-+.Z]+)?)\b", message)
    if match is None:
        return None
    return _parse_iso_datetime_value(match.group(1).replace(" ", "T"))


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


def _plan_cancel_trade(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    db: Session,
) -> _ActionPlanningCandidate | None:
    if not _mentions_cancel_trade(message_lower):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return _ActionPlanningCandidate(
            warning="No trade was identified for an approval-gated cancellation request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return _ActionPlanningCandidate(
            warning=f"Trade {trade_id} was not found, so no approval request was staged."
        )
    if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
        return _ActionPlanningCandidate(
            warning=f"Trade {trade_id} is already closed as {trade.status}, so no approval request was staged."
        )

    return _ActionPlanningCandidate(
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
) -> _ActionPlanningCandidate | None:
    if not _mentions_issue_confirmation(message_lower):
        return None

    confirmation_id = _resolve_confirmation_id(message=message, context=context, context_fields=context_fields, db=db)
    if confirmation_id is None:
        return _ActionPlanningCandidate(
            warning="No confirmation was identified for an approval-gated confirmation issue request."
        )

    confirmation = db.get(TradeConfirmation, confirmation_id)
    if confirmation is None:
        return _ActionPlanningCandidate(
            warning=f"Confirmation {confirmation_id} was not found, so no approval request was staged."
        )

    issue_method = _resolve_issue_method(message_lower, context_fields)
    issue_recipient = _resolve_issue_recipient(message, context_fields)
    issue_note = _first_present_value(context_fields, "issue_note", "notes")
    issued_at = (
        _parse_iso_datetime_value(_first_present_value(context_fields, "issued_at"))
        or _extract_labeled_iso_datetime_from_message(message, labels=("issued", "issue"))
    )

    return _ActionPlanningCandidate(
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
) -> _ActionPlanningCandidate | None:
    response_action = _resolve_confirmation_response_action(message_lower, context_fields)
    if response_action is None:
        return None
    if not _mentions_confirmation_response(message_lower, context_fields):
        return None

    confirmation_id = _resolve_confirmation_id(message=message, context=context, context_fields=context_fields, db=db)
    if confirmation_id is None:
        return _ActionPlanningCandidate(
            warning="No confirmation was identified for an approval-gated confirmation response request."
        )

    confirmation = db.get(TradeConfirmation, confirmation_id)
    if confirmation is None:
        return _ActionPlanningCandidate(
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

    return _ActionPlanningCandidate(
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
                missing_evidence=(() if response_method or response_reference or response_note else ("No response evidence was provided.",)),
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
) -> _ActionPlanningCandidate | None:
    if not _mentions_workflow_update(message_lower):
        return None

    item_id = _resolve_workflow_item_id(message, context_fields=context_fields)
    if item_id is None:
        return _ActionPlanningCandidate(
            warning="No workflow item was identified for an approval-gated workflow update request."
        )

    workflow_item = db.get(TradeWorkflowItem, item_id)
    if workflow_item is None:
        return _ActionPlanningCandidate(
            warning=f"Workflow item {item_id} was not found, so no approval request was staged."
        )

    changes = _resolve_workflow_changes(workflow_item=workflow_item, message=message, message_lower=message_lower, context_fields=context_fields)
    if not changes:
        return _ActionPlanningCandidate(
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
        return _ActionPlanningCandidate(
            warning=f"Workflow item {item_id} update was not staged: {exc}"
        )

    return _ActionPlanningCandidate(
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


def _plan_issue_trade_invoice(
    *,
    message: str,
    message_lower: str,
    context: str | None,
    context_fields: dict[str, str],
    db: Session,
) -> _ActionPlanningCandidate | None:
    if not _mentions_invoice_issue(message_lower):
        return None

    trade_id = _resolve_trade_id(message, context)
    if trade_id is None:
        return _ActionPlanningCandidate(
            warning="No trade was identified for an approval-gated invoice issue request."
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return _ActionPlanningCandidate(
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

    invoice_payload = {
        "trade_id": trade_id,
        **({"leg_no": leg_no} if (leg_no := _parse_optional_int_value(_first_present_value(context_fields, "leg_no"))) is not None else {}),
        **({"invoice_number": _first_present_value(context_fields, "invoice_number")} if _first_present_value(context_fields, "invoice_number") else {}),
        **({"invoice_currency_code": _first_present_value(context_fields, "invoice_currency_code", "currency_code")} if _first_present_value(context_fields, "invoice_currency_code", "currency_code") else {}),
        **({"billed_quantity": billed_quantity} if billed_quantity is not None else {}),
        **({"invoice_amount": invoice_amount} if invoice_amount is not None else {}),
        **({"issued_at": issued_at} if issued_at else {}),
        **({"due_at": due_at} if due_at else {}),
        **({"notes": _first_present_value(context_fields, "notes")} if _first_present_value(context_fields, "notes") else {}),
    }

    return _ActionPlanningCandidate(
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
            ),
        )
    )


def _plan_create_trade_payment(
    *,
    message: str,
    message_lower: str,
    context_fields: dict[str, str],
    db: Session,
) -> _ActionPlanningCandidate | None:
    if not _mentions_payment_creation(message_lower):
        return None

    invoice_id = _resolve_invoice_id(message, context_fields=context_fields)
    if invoice_id is None:
        return _ActionPlanningCandidate(
            warning="No invoice was identified for an approval-gated payment request."
        )

    invoice = db.get(TradeInvoice, invoice_id)
    if invoice is None:
        return _ActionPlanningCandidate(
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

    return _ActionPlanningCandidate(
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
                    **({"payment_reference": _first_present_value(context_fields, "payment_reference")} if _first_present_value(context_fields, "payment_reference") else {}),
                    **({"payment_currency_code": _first_present_value(context_fields, "payment_currency_code", "currency_code")} if _first_present_value(context_fields, "payment_currency_code", "currency_code") else {}),
                    **({"payment_amount": payment_amount} if payment_amount is not None else {}),
                    **({"status": payment_status} if payment_status else {}),
                    **({"due_at": due_at} if due_at else {}),
                    **({"received_at": received_at} if received_at else {}),
                    **({"notes": _first_present_value(context_fields, "notes")} if _first_present_value(context_fields, "notes") else {}),
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
                    f"assistant-action:create_trade_payment:{invoice_id}:{_first_present_value(context_fields, 'payment_reference') or invoice.version}"
                ),
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
) -> _ActionPlanningCandidate | None:
    if not _mentions_document_reprocess(message_lower):
        return None

    document_id = _resolve_document_id(message, context=context, context_fields=context_fields)
    if document_id is None:
        return _ActionPlanningCandidate(
            warning="No document was identified for an approval-gated reprocess request."
        )

    document = db.get(DocumentIngestion, document_id)
    if document is None:
        return _ActionPlanningCandidate(
            warning=f"Document {document_id} was not found, so no approval request was staged."
        )

    processor_provider = _resolve_processor_provider(message_lower, context_fields)
    return _ActionPlanningCandidate(
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
        _extract_labeled_iso_datetime_from_message(message, labels=("due", "due on", "due at")) if "due" in message_lower else None
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


def _build_action_prompt_section(proposal: AssistantActionProposal) -> AssistantPromptSection:
    prompt_payload = _action_payload_for_prompt(proposal.payload)
    return AssistantPromptSection(
        key="approval-gated-action",
        title="Approval-gated action candidate",
        source="agent",
        content=(
            "The application can stage an approval-gated action for explicit confirmation.\n"
            f"action_type: {proposal.action_type}\n"
            f"summary: {proposal.summary}\n"
            f"description: {proposal.description}\n"
            f"payload: {prompt_payload}\n"
            "Do not claim the action has been executed unless the approval workflow reports EXECUTED."
        ),
    )


def _action_payload_for_prompt(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if key != "review_context"}
