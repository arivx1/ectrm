from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.models.document_action_approval_request import DocumentActionApprovalRequest
from apps.api.app.schemas.document import DocumentActionPlanOut
from apps.api.app.schemas.document import DocumentActionRecordRefOut
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentLinkageCandidateOut

from .document_action_approval_requests import stage_document_action_approval_request_for_plan
from .document_action_execution import execute_document_action_plan
from .document_action_governance import build_document_action_governance
from .document_ingestion_serialization import load_document_and_pages
from .document_linkage import build_document_linkage_assessment
from .document_record_links import list_document_record_links
from .document_record_links import to_document_record_link_out

SAFE_SELECTED_ATTACH_SCORE = 0.9


def execute_selected_document_record_candidate_attach(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    record_type: str,
    record_id: str,
) -> DocumentIngestionOut:
    candidate = _load_selected_existing_candidate(
        db,
        document_id=document_id,
        record_type=record_type,
        record_id=record_id,
    )
    if candidate.candidate_state != "ATTACH_READY" or candidate.score < SAFE_SELECTED_ATTACH_SCORE:
        raise ValueError(
            "The selected record candidate requires approval before attachment."
        )

    return execute_document_action_plan(
        db,
        document_id=document_id,
        actor_id=actor_id,
        require_safe_direct_execution=False,
        action_plan_override=_build_selected_attach_plan(document_id=document_id, candidate=candidate),
    )


def stage_selected_document_record_candidate_approval_request(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    record_type: str,
    record_id: str,
    request_comment: str | None = None,
) -> DocumentActionApprovalRequest:
    candidate = _load_selected_existing_candidate(
        db,
        document_id=document_id,
        record_type=record_type,
        record_id=record_id,
    )
    action_plan = _build_selected_attach_plan(document_id=document_id, candidate=candidate)
    document, pages = load_document_and_pages(db, document_id=document_id)
    linkage = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=document.review_status,
        document_id=document.document_id,
    )
    selected_linkage = linkage.model_copy(update={"confidence": candidate.score})
    governance = build_document_action_governance(
        action_plan=action_plan,
        linkage_assessment=selected_linkage,
        record_links=[
            to_document_record_link_out(link)
            for link in list_document_record_links(db, document_id=document_id)
        ],
    )
    if not governance.manual_execution_allowed:
        raise ValueError("The selected record candidate is not eligible for approval.")

    return stage_document_action_approval_request_for_plan(
        db,
        document_id=document_id,
        actor_id=actor_id,
        action_plan=action_plan,
        governance=governance,
        request_comment=request_comment,
    )


def _load_selected_existing_candidate(
    db: Session,
    *,
    document_id: str,
    record_type: str,
    record_id: str,
) -> DocumentLinkageCandidateOut:
    document, pages = load_document_and_pages(db, document_id=document_id)
    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can attach selected record candidates.")

    normalized_record_type = str(record_type or "").strip().upper()
    normalized_record_id = str(record_id or "").strip()
    if not normalized_record_type or not normalized_record_id:
        raise ValueError("Selected record candidates require both record_type and record_id.")

    linkage = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=document.review_status,
        document_id=document.document_id,
    )
    for candidate in linkage.candidates:
        if (
            candidate.existing_record
            and candidate.record_type == normalized_record_type
            and candidate.record_id == normalized_record_id
        ):
            if candidate.candidate_state == "ALREADY_LINKED":
                raise ValueError("The selected record candidate is already linked to this document.")
            return candidate

    raise LookupError(
        f"Record candidate '{normalized_record_type} {normalized_record_id}' was not found for this document."
    )


def _build_selected_attach_plan(
    *,
    document_id: str,
    candidate: DocumentLinkageCandidateOut,
) -> DocumentActionPlanOut:
    return DocumentActionPlanOut(
        status="READY",
        action_type="ATTACH_EXISTING_RECORD",
        operation_type="link_document_to_record",
        candidate_state=candidate.candidate_state,
        title=f"Attach To {candidate.record_label}",
        description=(
            f"Attach this document as supporting evidence for the selected record {candidate.record_label}."
        ),
        confidence=round(candidate.score, 3),
        target=DocumentActionRecordRefOut(
            record_type=candidate.record_type,
            record_id=candidate.record_id,
            record_label=candidate.record_label,
            existing_record=True,
        ),
        owner=None,
        missing_evidence=list(candidate.missing_keys),
        reasons=[
            f"A reviewer selected {candidate.record_label} from the current candidate list.",
            candidate.reason,
        ],
        payload={
            "document_id": document_id,
            "target_record_type": candidate.record_type,
            "target_record_id": candidate.record_id,
            "selected_candidate": {
                "record_type": candidate.record_type,
                "record_id": candidate.record_id,
                "score": candidate.score,
                "candidate_state": candidate.candidate_state,
            },
        },
    )
