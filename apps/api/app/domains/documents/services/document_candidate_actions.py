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
from .document_action_planning import build_document_action_plan_for_candidate
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
    record_id: str | None,
) -> DocumentIngestionOut:
    _document, _pages, _linkage, candidate = _load_selected_record_candidate(
        db,
        document_id=document_id,
        record_type=record_type,
        record_id=record_id,
        allow_create_candidate=False,
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
    record_id: str | None,
    request_comment: str | None = None,
) -> DocumentActionApprovalRequest:
    document, pages, linkage, candidate = _load_selected_record_candidate(
        db,
        document_id=document_id,
        record_type=record_type,
        record_id=record_id,
        allow_create_candidate=True,
    )
    if candidate.existing_record:
        action_plan = _build_selected_attach_plan(document_id=document_id, candidate=candidate)
    else:
        action_plan = _build_selected_create_plan(
            document_id=document_id,
            pages=pages,
            review_status=document.review_status,
            linkage_assessment=linkage,
            candidate=candidate,
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


def _load_selected_record_candidate(
    db: Session,
    *,
    document_id: str,
    record_type: str,
    record_id: str | None,
    allow_create_candidate: bool,
):
    document, pages = load_document_and_pages(db, document_id=document_id)
    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can attach selected record candidates.")

    normalized_record_type = str(record_type or "").strip().upper()
    normalized_record_id = str(record_id or "").strip() or None
    if not normalized_record_type:
        raise ValueError("Selected record candidates require record_type.")
    if not allow_create_candidate and normalized_record_id is None:
        raise ValueError("Selected existing record candidates require record_id.")

    linkage = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=document.review_status,
        document_id=document.document_id,
    )
    for candidate in linkage.candidates:
        if candidate.record_type != normalized_record_type:
            continue

        if candidate.existing_record and candidate.record_id == normalized_record_id:
            if candidate.candidate_state == "ALREADY_LINKED":
                raise ValueError("The selected record candidate is already linked to this document.")
            return document, pages, linkage, candidate

        if (
            allow_create_candidate
            and normalized_record_id is None
            and not candidate.existing_record
            and candidate.create_if_missing
            and candidate.candidate_state == "CREATE_CANDIDATE"
        ):
            return document, pages, linkage, candidate

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
            "selected_candidate": _selected_candidate_payload(candidate),
        },
    )


def _build_selected_create_plan(
    *,
    document_id: str,
    pages,
    review_status: str,
    linkage_assessment,
    candidate: DocumentLinkageCandidateOut,
) -> DocumentActionPlanOut:
    action_plan = build_document_action_plan_for_candidate(
        document_id=document_id,
        pages=pages,
        review_status=review_status,
        linkage_assessment=linkage_assessment,
        selected_candidate=candidate,
    )
    if action_plan.action_type != "CREATE_RECORD_FROM_DOCUMENT":
        raise ValueError("The selected record candidate is not eligible for record creation.")
    return _with_selected_candidate_payload(action_plan, candidate)


def _with_selected_candidate_payload(
    action_plan: DocumentActionPlanOut,
    candidate: DocumentLinkageCandidateOut,
) -> DocumentActionPlanOut:
    return action_plan.model_copy(
        update={
            "payload": {
                **action_plan.payload,
                "selected_candidate": _selected_candidate_payload(candidate),
            },
        }
    )


def _selected_candidate_payload(candidate: DocumentLinkageCandidateOut) -> dict[str, object]:
    return {
        "record_type": candidate.record_type,
        "record_id": candidate.record_id,
        "score": candidate.score,
        "candidate_state": candidate.candidate_state,
        "existing_record": candidate.existing_record,
        "create_if_missing": candidate.create_if_missing,
    }
