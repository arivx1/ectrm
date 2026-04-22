from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.documents.services.document_action_execution import execute_document_action_plan
from apps.api.app.domains.documents.services.document_action_governance import (
    DocumentActionGovernance,
    build_document_action_governance,
)
from apps.api.app.domains.documents.services.document_action_planning import build_document_action_plan
from apps.api.app.domains.documents.services.document_ingestion_serialization import load_document_and_pages
from apps.api.app.domains.documents.services.document_linkage import build_document_linkage_assessment
from apps.api.app.models.document_action_approval_request import DocumentActionApprovalRequest
from apps.api.app.models.document_action_decision import DocumentActionDecision
from apps.api.app.models.event import Event
from apps.api.app.schemas.document import DocumentActionPlanOut


def stage_document_action_approval_request(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    request_comment: str | None = None,
) -> DocumentActionApprovalRequest:
    now = datetime.now(timezone.utc)
    document, pages = load_document_and_pages(db, document_id=document_id)
    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can be staged for action approval.")

    action_plan, governance = _build_current_action_context(
        db,
        document_id=document.document_id,
        review_status=document.review_status,
        pages=pages,
    )
    if not governance.manual_execution_allowed:
        raise ValueError("The current document action plan is not eligible for manual approval.")

    request = DocumentActionApprovalRequest(
        document_id=document.document_id,
        status="PENDING",
        title=action_plan.title,
        description=action_plan.description,
        action_type=action_plan.action_type,
        operation_type=action_plan.operation_type,
        governance_status=governance.status,
        target_record_type=action_plan.target.record_type if action_plan.target is not None else None,
        target_record_id=action_plan.target.record_id if action_plan.target is not None else None,
        owner_record_type=action_plan.owner.record_type if action_plan.owner is not None else None,
        owner_record_id=action_plan.owner.record_id if action_plan.owner is not None else None,
        request_comment=_clean_optional_text(request_comment),
        decision_comment=None,
        action_plan_snapshot=action_plan.model_dump(mode="json"),
        governance_snapshot=jsonable_encoder(governance.to_snapshot()),
        result_snapshot={},
        error_detail=None,
        execution_decision_id=None,
        requested_at=now,
        requested_by=actor_id,
        decided_at=None,
        decided_by=None,
    )
    db.add(request)
    db.flush()
    _append_document_action_event(
        db,
        event_type="DocumentActionApprovalRequested",
        document_id=document.document_id,
        actor_id=actor_id,
        request=request,
        now=now,
    )
    return request


def approve_document_action_approval_request(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    decision_comment: str,
) -> DocumentActionApprovalRequest:
    now = datetime.now(timezone.utc)
    request = _load_pending_request(db, document_id=document_id)
    result = execute_document_action_plan(db, document_id=document_id, actor_id=actor_id)
    decision = DocumentActionDecision(
        document_id=document_id,
        decision="APPROVED",
        execution_mode="MANUAL",
        execution_status="EXECUTED",
        decision_comment=_required_text(decision_comment, field_name="decision_comment"),
        action_type=request.action_type,
        operation_type=request.operation_type,
        governance_status=request.governance_status,
        target_record_type=request.target_record_type,
        target_record_id=request.target_record_id,
        owner_record_type=request.owner_record_type,
        owner_record_id=request.owner_record_id,
        action_plan_snapshot=dict(request.action_plan_snapshot or {}),
        governance_snapshot=dict(request.governance_snapshot or {}),
        result_snapshot=result.model_dump(mode="json"),
        document_event_id=None,
        trade_event_id=None,
        decided_at=now,
        decided_by=actor_id,
    )
    db.add(decision)
    db.flush()

    request.status = "EXECUTED"
    request.decision_comment = decision.decision_comment
    request.result_snapshot = decision.result_snapshot
    request.error_detail = None
    request.execution_decision_id = decision.decision_id
    request.decided_at = now
    request.decided_by = actor_id
    db.flush()
    _append_document_action_event(
        db,
        event_type="DocumentActionApprovalExecuted",
        document_id=document_id,
        actor_id=actor_id,
        request=request,
        now=now,
    )
    return request


def reject_document_action_approval_request(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    decision_comment: str,
) -> DocumentActionApprovalRequest:
    now = datetime.now(timezone.utc)
    request = _load_pending_request(db, document_id=document_id)
    request.status = "REJECTED"
    request.decision_comment = _required_text(decision_comment, field_name="decision_comment")
    request.decided_at = now
    request.decided_by = actor_id
    request.error_detail = None
    db.flush()
    _append_document_action_event(
        db,
        event_type="DocumentActionApprovalRejected",
        document_id=document_id,
        actor_id=actor_id,
        request=request,
        now=now,
    )
    return request


def _build_current_action_context(
    db: Session,
    *,
    document_id: str,
    review_status: str,
    pages,
) -> tuple[DocumentActionPlanOut, DocumentActionGovernance]:
    linkage = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=review_status,
        document_id=document_id,
    )
    action_plan = build_document_action_plan(
        document_id=document_id,
        pages=pages,
        review_status=review_status,
        linkage_assessment=linkage,
    )
    governance = build_document_action_governance(
        action_plan=action_plan,
        linkage_assessment=linkage,
    )
    return action_plan, governance


def _load_pending_request(
    db: Session,
    *,
    document_id: str,
) -> DocumentActionApprovalRequest:
    request = db.execute(
        select(DocumentActionApprovalRequest)
        .where(
            DocumentActionApprovalRequest.document_id == document_id,
            DocumentActionApprovalRequest.status == "PENDING",
        )
        .order_by(DocumentActionApprovalRequest.requested_at.desc(), DocumentActionApprovalRequest.request_id.desc())
    ).scalars().first()
    if request is None:
        raise LookupError(f"No pending document action approval request exists for document '{document_id}'.")
    return request


def _append_document_action_event(
    db: Session,
    *,
    event_type: str,
    document_id: str,
    actor_id: str,
    request: DocumentActionApprovalRequest,
    now: datetime,
) -> None:
    db.add(
        Event(
            event_id=str(uuid.uuid4()),
            aggregate_type="document",
            aggregate_id=document_id,
            event_type=event_type,
            occurred_at=now,
            recorded_at=now,
            actor_id=actor_id,
            correlation_id=None,
            causation_id=None,
            schema_version=1,
            payload={"request": _request_snapshot(request)},
        )
    )
    db.flush()


def _request_snapshot(request: DocumentActionApprovalRequest) -> dict[str, object]:
    return jsonable_encoder(
        {
            "request_id": request.request_id,
            "document_id": request.document_id,
            "status": request.status,
            "title": request.title,
            "action_type": request.action_type,
            "operation_type": request.operation_type,
            "governance_status": request.governance_status,
            "target_record_type": request.target_record_type,
            "target_record_id": request.target_record_id,
            "owner_record_type": request.owner_record_type,
            "owner_record_id": request.owner_record_id,
            "requested_at": request.requested_at,
            "requested_by": request.requested_by,
            "decided_at": request.decided_at,
            "decided_by": request.decided_by,
            "decision_comment": request.decision_comment,
            "execution_decision_id": request.execution_decision_id,
        }
    )


def _clean_optional_text(value: object | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _required_text(value: object | None, *, field_name: str) -> str:
    text = _clean_optional_text(value)
    if text is None:
        raise ValueError(f"{field_name} is required.")
    return text
