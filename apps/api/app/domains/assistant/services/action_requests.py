from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Sequence

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_catalog import ASSISTANT_ACTION_CATALOG_BY_NAME
from apps.api.app.domains.assistant.services.action_runtime import AssistantActionProposal
from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionExecutionContext,
    AssistantActionHandler,
    AssistantActionSpec,
    build_assistant_action_spec_registry,
)
from apps.api.app.domains.assistant.services.policies import evaluate_action_policy
from apps.api.app.domains.assistant.services.registry import get_agent_record, to_managed_agent
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
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.assistant import AssistantActionRequestOut


class AssistantActionRequestError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


REVIEW_OUTCOME_APPROVED_AS_IS = "APPROVED_AS_IS"
REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS = "APPROVED_WITH_CORRECTIONS"
REVIEW_OUTCOME_REJECTED = "REJECTED"


@dataclass(frozen=True)
class AssistantActionDecision:
    review_outcome: str | None = None
    decision_note: str | None = None
    correction_summary: str | None = None
    correction_fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssistantActionRequestAdminSummary:
    total_count: int
    pending_count: int
    executed_count: int
    rejected_count: int
    failed_count: int
    correction_count: int
    avg_decision_seconds: float | None


@dataclass(frozen=True)
class AssistantActionRequestPage:
    records: list[AssistantActionRequest]
    total_count: int
    limit: int
    offset: int
    summary: AssistantActionRequestAdminSummary

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.records) < self.total_count


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
            if _canonical_stale_state_value(getattr(workflow_item, field)) != _canonical_stale_state_value(
                expected_value
            ):
                return False
        return True


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


def _action_spec(
    handler: AssistantActionHandler,
    *,
    requires_ready_preview: bool = False,
) -> AssistantActionSpec:
    return AssistantActionSpec(
        catalog_entry=ASSISTANT_ACTION_CATALOG_BY_NAME[handler.action_type],
        handler=handler,
        requires_ready_preview=requires_ready_preview,
    )


ACTION_SPECS: dict[str, AssistantActionSpec] = build_assistant_action_spec_registry(
    (
        _action_spec(CancelTradeActionHandler()),
        _action_spec(IssueTradeConfirmationActionHandler()),
        _action_spec(RecordTradeConfirmationResponseActionHandler()),
        _action_spec(UpdateTradeWorkflowItemActionHandler()),
        _action_spec(IssueTradeInvoiceActionHandler(), requires_ready_preview=True),
        _action_spec(CreateTradePaymentActionHandler()),
        _action_spec(ReprocessDocumentIngestionActionHandler()),
    )
)
ACTION_HANDLERS: dict[str, AssistantActionHandler] = {
    action_type: spec.handler for action_type, spec in ACTION_SPECS.items()
}


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
    return list_action_request_page(
        db,
        limit=limit,
        offset=offset,
        user_id=user_id,
        status=status,
    ).records


def list_action_request_page(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
    status: str | None = None,
    action_type: str | None = None,
    agent_id: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    requester_user_id: str | None = None,
    decided_by: str | None = None,
    search: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    decided_after: datetime | None = None,
    decided_before: datetime | None = None,
) -> AssistantActionRequestPage:
    items_stmt = _apply_action_request_filters(
        select(AssistantActionRequest),
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    )
    records = db.execute(
        items_stmt.order_by(
            AssistantActionRequest.created_at.desc(),
            AssistantActionRequest.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    summary = _summarize_action_requests(
        db=db,
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    )
    return AssistantActionRequestPage(
        records=records,
        total_count=summary.total_count,
        limit=limit,
        offset=offset,
        summary=summary,
    )


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
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be rejected.")

    decision_metadata = _normalize_action_decision(
        decision,
        default_review_outcome=REVIEW_OUTCOME_REJECTED,
        allowed_review_outcomes=(REVIEW_OUTCOME_REJECTED,),
    )
    record.status = "REJECTED"
    record.decided_at = datetime.now(timezone.utc)
    record.decided_by = actor_id
    _apply_action_decision(record, decision_metadata)
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
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be approved.")

    decision_metadata = _normalize_action_decision(
        decision,
        default_review_outcome=REVIEW_OUTCOME_APPROVED_AS_IS,
        allowed_review_outcomes=(REVIEW_OUTCOME_APPROVED_AS_IS, REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS),
    )
    policy_decision = _evaluate_stored_action_policy(
        db=db,
        record=record,
        actor_role=actor_role,
    )
    if not policy_decision.allowed:
        raise AssistantActionRequestError(policy_decision.reason)

    decided_at = datetime.now(timezone.utc)

    try:
        approval_policy = _validate_approval_contract(db=db, record=record)
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
            decision=decision_metadata,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        return _mark_action_request_failed(
            db=db,
            record_id=record.id,
            actor_id=actor_id,
            decided_at=decided_at,
            error_detail=str(exc) or "Assistant action execution failed unexpectedly.",
            decision=decision_metadata,
        )

    result["approval_policy"] = approval_policy
    record.status = "EXECUTED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    _apply_action_decision(record, decision_metadata)
    record.result = result
    record.error_detail = None
    db.commit()
    db.refresh(record)
    return record


def _normalize_action_decision(
    decision: AssistantActionDecision | None,
    *,
    default_review_outcome: str,
    allowed_review_outcomes: tuple[str, ...],
) -> AssistantActionDecision:
    review_outcome = _normalize_optional_text(decision.review_outcome if decision is not None else None)
    normalized_outcome = (review_outcome or default_review_outcome).upper()
    if normalized_outcome not in allowed_review_outcomes:
        allowed = ", ".join(allowed_review_outcomes)
        raise AssistantActionRequestError(f"Review outcome must be one of: {allowed}.")

    decision_note = _normalize_optional_text(decision.decision_note if decision is not None else None)
    correction_summary = _normalize_optional_text(decision.correction_summary if decision is not None else None)
    correction_fields = _normalize_correction_fields(decision.correction_fields if decision is not None else ())

    if normalized_outcome == REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS:
        if correction_summary is None and not correction_fields:
            raise AssistantActionRequestError(
                "Approvals with corrections require a correction summary or at least one corrected field."
            )
    else:
        correction_summary = None
        correction_fields = ()

    return AssistantActionDecision(
        review_outcome=normalized_outcome,
        decision_note=decision_note,
        correction_summary=correction_summary,
        correction_fields=correction_fields,
    )


def _normalize_correction_fields(values: Sequence[str]) -> tuple[str, ...]:
    fields: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_optional_text(value)
        if normalized is None or normalized in seen:
            continue
        fields.append(normalized)
        seen.add(normalized)
    return tuple(fields)


def _apply_action_decision(
    record: AssistantActionRequest,
    decision: AssistantActionDecision,
) -> None:
    record.review_outcome = decision.review_outcome
    record.decision_note = decision.decision_note
    record.correction_summary = decision.correction_summary
    record.correction_fields = list(decision.correction_fields) if decision.correction_fields else None


def _evaluate_stored_action_policy(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_role: str | None,
):
    agent_definition = None
    if record.agent_id:
        agent_record = get_agent_record(db, record.agent_id)
        if agent_record is not None:
            agent_definition = to_managed_agent(agent_record)
    return evaluate_action_policy(
        agent=agent_definition,
        action_type=record.action_type,
        workspace=record.workspace,
        actor_role=actor_role,
        phase="execute",
    )


def to_action_request_out(record: AssistantActionRequest) -> AssistantActionRequestOut:
    payload = dict(record.payload or {})
    review_context = _extract_action_review_context(payload)
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
        payload=_strip_action_review_context(payload),
        review_context=review_context,
        lifecycle=_build_action_request_lifecycle(record, review_context),
        result=dict(record.result) if isinstance(record.result, dict) else record.result,
        error_detail=record.error_detail,
        review_outcome=record.review_outcome,
        decision_note=record.decision_note,
        correction_summary=record.correction_summary,
        correction_fields=list(record.correction_fields or []),
        created_at=record.created_at,
        decided_at=record.decided_at,
        decided_by=record.decided_by,
    )


def to_action_request_out_list(records: Iterable[AssistantActionRequest]) -> list[AssistantActionRequestOut]:
    return [to_action_request_out(record) for record in records]


def _extract_action_review_context(payload: dict[str, object]) -> dict[str, object] | None:
    review_context = payload.get("review_context")
    if isinstance(review_context, dict):
        return review_context
    return None


def _strip_action_review_context(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if key != "review_context"}


def _build_action_request_lifecycle(
    record: AssistantActionRequest,
    review_context: dict[str, object] | None,
) -> dict[str, object]:
    status = str(record.status or "").strip().upper()
    review_risk_flags = _derive_review_risk_flags(review_context)
    preview_status = _action_preview_status(review_context)
    preview_blocked = preview_status == "BLOCKED"

    if status == "PENDING":
        return {
            "stage": "AWAITING_REVIEW",
            "label": "Preview blocked" if preview_blocked else "Awaiting review",
            "tone": "danger" if preview_blocked else "attention",
            "is_terminal": False,
            "can_approve": not preview_blocked,
            "can_reject": True,
            "reviewer_action_label": (
                "Reject or restage with corrected input"
                if preview_blocked
                else "Review evidence, then approve or reject"
                if review_risk_flags
                else "Approve or reject"
            ),
            "decided_label": None,
            "review_risk_flags": review_risk_flags,
        }

    if status == "EXECUTED":
        return {
            "stage": "EXECUTED",
            "label": "Executed",
            "tone": "success",
            "is_terminal": True,
            "can_approve": False,
            "can_reject": False,
            "reviewer_action_label": None,
            "decided_label": _decision_label("Executed", record.decided_by),
            "review_risk_flags": review_risk_flags,
        }

    if status == "REJECTED":
        return {
            "stage": "REJECTED",
            "label": "Rejected",
            "tone": "neutral",
            "is_terminal": True,
            "can_approve": False,
            "can_reject": False,
            "reviewer_action_label": None,
            "decided_label": _decision_label("Rejected", record.decided_by),
            "review_risk_flags": review_risk_flags,
        }

    return {
        "stage": "FAILED",
        "label": "Failed",
        "tone": "danger",
        "is_terminal": True,
        "can_approve": False,
        "can_reject": False,
        "reviewer_action_label": None,
        "decided_label": _decision_label("Failed during execution", record.decided_by),
        "review_risk_flags": review_risk_flags,
    }


def _derive_review_risk_flags(review_context: dict[str, object] | None) -> list[str]:
    if not review_context:
        return []

    flags: list[str] = []
    missing_evidence = review_context.get("missing_evidence")
    if isinstance(missing_evidence, list) and len(missing_evidence) > 0:
        flags.append("MISSING_EVIDENCE")

    stale_state_basis = review_context.get("stale_state_basis")
    if isinstance(stale_state_basis, dict) and stale_state_basis:
        flags.append("STALE_STATE_RECHECK_REQUIRED")

    preview_status = _action_preview_status(review_context)
    if preview_status == "READY":
        flags.append("DRY_RUN_PREVIEW_READY")
    elif preview_status == "BLOCKED":
        flags.append("DRY_RUN_PREVIEW_BLOCKED")

    return flags


def _action_preview_status(review_context: dict[str, object] | None) -> str | None:
    if not review_context:
        return None
    action_preview = review_context.get("action_preview")
    if not isinstance(action_preview, dict):
        return None
    status = action_preview.get("status")
    if status is None:
        return None
    return str(status).strip().upper() or None


def _decision_label(action: str, decided_by: str | None) -> str:
    if decided_by:
        return f"{action} by {decided_by}"
    return action


def _apply_action_request_filters(
    stmt,
    *,
    user_id: str | None = None,
    status: str | None = None,
    action_type: str | None = None,
    agent_id: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    requester_user_id: str | None = None,
    decided_by: str | None = None,
    search: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    decided_after: datetime | None = None,
    decided_before: datetime | None = None,
):
    normalized_status = _normalize_optional_text(status, uppercase=True)
    normalized_action_type = _normalize_optional_text(action_type)
    normalized_agent_id = _normalize_optional_text(agent_id, lowercase=True)
    normalized_role_key = _normalize_optional_text(role_key, lowercase=True)
    normalized_profile_kind = _normalize_optional_text(profile_kind, uppercase=True)
    normalized_requester_user_id = _normalize_optional_text(requester_user_id)
    normalized_decided_by = _normalize_optional_text(decided_by)
    normalized_search = _normalize_optional_text(search, lowercase=True)

    if normalized_role_key is not None or normalized_profile_kind is not None:
        stmt = stmt.join(AssistantRun, AssistantRun.id == AssistantActionRequest.run_id)
    if user_id is not None:
        stmt = stmt.where(AssistantActionRequest.user_id == user_id)
    if normalized_status is not None:
        stmt = stmt.where(AssistantActionRequest.status == normalized_status)
    if normalized_action_type is not None:
        stmt = stmt.where(AssistantActionRequest.action_type == normalized_action_type)
    if normalized_agent_id is not None:
        stmt = stmt.where(AssistantActionRequest.agent_id == normalized_agent_id)
    if normalized_role_key is not None:
        stmt = stmt.where(AssistantRun.agent_role_key == normalized_role_key)
    if normalized_profile_kind is not None:
        stmt = stmt.where(AssistantRun.agent_profile_kind == normalized_profile_kind)
    if normalized_requester_user_id is not None:
        stmt = stmt.where(AssistantActionRequest.user_id == normalized_requester_user_id)
    if normalized_decided_by is not None:
        stmt = stmt.where(AssistantActionRequest.decided_by == normalized_decided_by)
    if created_after is not None:
        stmt = stmt.where(AssistantActionRequest.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantActionRequest.created_at <= created_before)
    if decided_after is not None:
        stmt = stmt.where(AssistantActionRequest.decided_at.is_not(None))
        stmt = stmt.where(AssistantActionRequest.decided_at >= decided_after)
    if decided_before is not None:
        stmt = stmt.where(AssistantActionRequest.decided_at.is_not(None))
        stmt = stmt.where(AssistantActionRequest.decided_at <= decided_before)
    if normalized_search is not None:
        search_pattern = f"%{normalized_search}%"
        stmt = stmt.where(
            or_(
                func.lower(AssistantActionRequest.summary).like(search_pattern),
                func.lower(AssistantActionRequest.description).like(search_pattern),
                func.lower(AssistantActionRequest.user_id).like(search_pattern),
                func.lower(func.coalesce(AssistantActionRequest.agent_name, "")).like(search_pattern),
                func.lower(func.coalesce(AssistantActionRequest.decided_by, "")).like(search_pattern),
                func.lower(AssistantActionRequest.action_type).like(search_pattern),
            )
        )
    return stmt


def _summarize_action_requests(
    *,
    db: Session,
    user_id: str | None,
    status: str | None,
    action_type: str | None,
    agent_id: str | None,
    role_key: str | None,
    profile_kind: str | None,
    requester_user_id: str | None,
    decided_by: str | None,
    search: str | None,
    created_after: datetime | None,
    created_before: datetime | None,
    decided_after: datetime | None,
    decided_before: datetime | None,
) -> AssistantActionRequestAdminSummary:
    summary_subquery = _apply_action_request_filters(
        select(
            AssistantActionRequest.status.label("status"),
            AssistantActionRequest.review_outcome.label("review_outcome"),
            AssistantActionRequest.created_at.label("created_at"),
            AssistantActionRequest.decided_at.label("decided_at"),
        ),
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    ).subquery()

    total_count = int(db.execute(select(func.count()).select_from(summary_subquery)).scalar_one())
    status_counts = {
        "PENDING": 0,
        "EXECUTED": 0,
        "REJECTED": 0,
        "FAILED": 0,
    }
    for row_status, row_count in db.execute(
        select(summary_subquery.c.status, func.count()).group_by(summary_subquery.c.status)
    ).all():
        if row_status in status_counts:
            status_counts[str(row_status)] = int(row_count)

    correction_count = int(
        db.execute(
            select(func.count())
            .select_from(summary_subquery)
            .where(summary_subquery.c.review_outcome == REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS)
        ).scalar_one()
    )

    latency_rows = db.execute(
        select(summary_subquery.c.created_at, summary_subquery.c.decided_at).where(
            summary_subquery.c.decided_at.is_not(None)
        )
    ).all()
    avg_decision_seconds: float | None = None
    if latency_rows:
        total_decision_seconds = sum(
            max((decided_at - created_at).total_seconds(), 0.0)
            for created_at, decided_at in latency_rows
            if created_at is not None and decided_at is not None
        )
        avg_decision_seconds = total_decision_seconds / len(latency_rows)

    return AssistantActionRequestAdminSummary(
        total_count=total_count,
        pending_count=status_counts["PENDING"],
        executed_count=status_counts["EXECUTED"],
        rejected_count=status_counts["REJECTED"],
        failed_count=status_counts["FAILED"],
        correction_count=correction_count,
        avg_decision_seconds=avg_decision_seconds,
    )


def _normalize_optional_text(
    value: str | None,
    *,
    lowercase: bool = False,
    uppercase: bool = False,
) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None
    if lowercase:
        return normalized.lower()
    if uppercase:
        return normalized.upper()
    return normalized


def _execute_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    actor_role: str | None,
    decided_at: datetime,
) -> dict[str, object]:
    return _action_spec_for(record).execute(
        AssistantActionExecutionContext(
            db=db,
            record=record,
            actor_id=actor_id,
            actor_role=actor_role,
            decided_at=decided_at,
        )
    )


def _validate_approval_contract(
    *,
    db: Session,
    record: AssistantActionRequest,
) -> dict[str, object]:
    payload = dict(record.payload or {})
    review_context = _extract_action_review_context(payload)
    if review_context is None:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context with reviewer, stale-state, and idempotency evidence."
        )

    stale_state_basis = review_context.get("stale_state_basis")
    if not isinstance(stale_state_basis, dict) or not stale_state_basis:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context.stale_state_basis before execution."
        )

    idempotency_key = _review_context_text_value(review_context, "idempotency_key")
    if idempotency_key is None:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context.idempotency_key before execution."
        )

    preview_check = _validate_action_preview_contract(record=record, review_context=review_context)
    preview_approval_checks = preview_check.pop("approval_checks", [])

    duplicate_record = _find_executed_action_request_by_idempotency_key(
        db=db,
        idempotency_key=idempotency_key,
        exclude_record_id=record.id,
    )
    if duplicate_record is not None:
        raise AssistantActionRequestError(
            "Assistant action approval blocked because idempotency key "
            f"'{idempotency_key}' already executed on action request {duplicate_record.id}."
        )

    stale_state_recheck = _recheck_stale_state(db=db, record=record, review_context=review_context)

    return {
        "status": "PASSED",
        "idempotency_key": idempotency_key,
        "checks": [
            "review_context_present",
            "idempotency_key_unique",
            *preview_approval_checks,
            "stale_state_rechecked",
        ],
        **preview_check,
        **stale_state_recheck,
    }


def _validate_action_preview_contract(
    *,
    record: AssistantActionRequest,
    review_context: dict[str, object],
) -> dict[str, object]:
    action_spec = _action_spec_for(record)
    if not action_spec.requires_ready_preview:
        return {"approval_checks": []}

    action_preview = review_context.get("action_preview")
    if not isinstance(action_preview, dict):
        raise AssistantActionRequestError(
            f"Assistant action approval requires a ready {record.action_type} preview before execution."
        )

    preview_status = _action_preview_status(review_context)
    if preview_status != "READY":
        blocking_reasons = action_preview.get("blocking_reasons")
        reason_text = ""
        if isinstance(blocking_reasons, list) and blocking_reasons:
            reason_text = " " + "; ".join(str(reason) for reason in blocking_reasons)
        raise AssistantActionRequestError(
            f"Assistant action approval blocked because the {record.action_type} preview is not ready."
            + reason_text
        )

    return {
        "approval_checks": ["action_preview_ready"],
        "action_preview_status": preview_status,
    }


def _review_context_text_value(review_context: dict[str, object], key: str) -> str | None:
    value = review_context.get(key)
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _find_executed_action_request_by_idempotency_key(
    *,
    db: Session,
    idempotency_key: str,
    exclude_record_id: int,
) -> AssistantActionRequest | None:
    records = db.execute(
        select(AssistantActionRequest)
        .where(AssistantActionRequest.status == "EXECUTED")
        .where(AssistantActionRequest.id != exclude_record_id)
    ).scalars().all()
    for candidate in records:
        candidate_context = _extract_action_review_context(dict(candidate.payload or {}))
        if candidate_context is None:
            continue
        if _review_context_text_value(candidate_context, "idempotency_key") == idempotency_key:
            return candidate
    return None


def _recheck_stale_state(
    *,
    db: Session,
    record: AssistantActionRequest,
    review_context: dict[str, object],
) -> dict[str, object]:
    raw_basis = review_context.get("stale_state_basis")
    stale_state_basis = raw_basis if isinstance(raw_basis, dict) else {}
    current_state = _current_stale_state_for_action(db=db, record=record)
    mismatches = [
        _format_stale_state_mismatch(key, expected_value, current_state)
        for key, expected_value in stale_state_basis.items()
        if _canonical_stale_state_value(expected_value)
        != _canonical_stale_state_value(current_state.get(key, _MISSING_STALE_STATE_VALUE))
    ]
    if mismatches:
        if _action_payload_is_idempotent_retry(db=db, record=record):
            return {
                "stale_state_basis": jsonable_encoder(stale_state_basis),
                "stale_state_current": jsonable_encoder(current_state),
                "stale_state_mismatches": mismatches,
                "idempotent_retry_rechecked": True,
            }
        raise AssistantActionRequestError(
            "Assistant action approval blocked because the staged review context is stale; "
            "the object changed since this action was staged: "
            + "; ".join(mismatches)
        )

    return {
        "stale_state_basis": jsonable_encoder(stale_state_basis),
        "stale_state_current": jsonable_encoder(current_state),
        "stale_state_mismatches": [],
    }


_MISSING_STALE_STATE_VALUE = object()


def _format_stale_state_mismatch(
    key: str,
    expected_value: object,
    current_state: dict[str, object | None],
) -> str:
    current_value = current_state.get(key, _MISSING_STALE_STATE_VALUE)
    if current_value is _MISSING_STALE_STATE_VALUE:
        return f"{key} expected {_format_stale_state_value(expected_value)} but is no longer available"
    return (
        f"{key} expected {_format_stale_state_value(expected_value)} "
        f"but found {_format_stale_state_value(current_value)}"
    )


def _format_stale_state_value(value: object) -> str:
    if value is None:
        return "null"
    return repr(_canonical_stale_state_value(value))


def _canonical_stale_state_value(value: object) -> object:
    if value is _MISSING_STALE_STATE_VALUE:
        return value
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


def _current_stale_state_for_action(
    *,
    db: Session,
    record: AssistantActionRequest,
) -> dict[str, object | None]:
    return _action_spec_for(record).current_stale_state(db=db, record=record)


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


def _action_payload_is_idempotent_retry(*, db: Session, record: AssistantActionRequest) -> bool:
    return _action_spec_for(record).is_idempotent_retry(db=db, record=record)


def _action_spec_for(record: AssistantActionRequest) -> AssistantActionSpec:
    action_spec = ACTION_SPECS.get(record.action_type)
    if action_spec is None:
        raise AssistantActionRequestError(f"Unsupported assistant action type '{record.action_type}'.")
    return action_spec


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
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    db.rollback()
    record = db.get(AssistantActionRequest, record_id)
    if record is None:
        raise AssistantActionRequestError("Assistant action request not found after rollback.")

    record.status = "FAILED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    if decision is not None:
        _apply_action_decision(record, decision)
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
        expected_version=_workflow_update_expected_version(record),
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
