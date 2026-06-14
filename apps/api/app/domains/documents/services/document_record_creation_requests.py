from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.documents.services.document_action_planning import build_document_action_plan
from apps.api.app.domains.documents.services.document_activity import append_document_activity_event
from apps.api.app.domains.documents.services.document_ingestion_common import clean_optional_text
from apps.api.app.domains.documents.services.document_ingestion_serialization import load_document_and_pages
from apps.api.app.domains.documents.services.document_linkage import build_document_linkage_assessment
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_creation_request import DocumentRecordCreationRequest
from apps.api.app.schemas.document import DocumentActionPlanOut
from apps.api.app.schemas.document import DocumentActionRecordRefOut
from apps.api.app.schemas.document import DocumentLinkageAssessmentOut
from apps.api.app.schemas.document import DocumentLinkageCandidateOut
from apps.api.app.schemas.document import DocumentRecordCreationRequestOut

from .document_record_links import create_document_record_link


@dataclass(frozen=True)
class _RecordCreationIntakeTarget:
    target: DocumentActionRecordRefOut
    candidate: DocumentLinkageCandidateOut | None


class DocumentRecordCreationRequestPersistenceUnavailable(RuntimeError):
    pass


def document_record_creation_requests_table_available(db: Session) -> bool:
    inspector = inspect(db.connection())
    return inspector.has_table(DocumentRecordCreationRequest.__tablename__)


def stage_document_record_creation_request(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    request_comment: str | None = None,
) -> DocumentRecordCreationRequest:
    if not document_record_creation_requests_table_available(db):
        raise DocumentRecordCreationRequestPersistenceUnavailable(
            "Document record creation request persistence is unavailable because the database schema is behind "
            "the current code. Run the latest migrations and retry."
        )

    document, pages = load_document_and_pages(db, document_id=document_id)
    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can request missing record creation.")

    linkage_assessment = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=document.review_status,
        document_id=document.document_id,
    )
    action_plan = build_document_action_plan(
        document_id=document.document_id,
        pages=pages,
        review_status=document.review_status,
        linkage_assessment=linkage_assessment,
    )
    intake_target = _resolve_record_creation_intake_target(
        action_plan=action_plan,
        linkage_assessment=linkage_assessment,
    )
    if intake_target is None:
        raise ValueError(
            "The current document action plan does not identify a missing record that needs creation intake."
        )

    existing_request = find_open_document_record_creation_request(
        db,
        document_id=document.document_id,
        target_record_type=intake_target.target.record_type,
    )
    if existing_request is not None:
        return existing_request

    now = datetime.now(timezone.utc)
    target_label = _target_record_label(intake_target.target)
    request = DocumentRecordCreationRequest(
        document_id=document.document_id,
        status="OPEN",
        document_kind=_dominant_document_kind(pages),
        target_record_type=intake_target.target.record_type,
        target_record_label=target_label,
        owner_record_type=action_plan.owner.record_type if action_plan.owner is not None else None,
        owner_record_id=action_plan.owner.record_id if action_plan.owner is not None else None,
        required_owner_record_types=list(action_plan.required_owner_record_types),
        matched_keys=list(intake_target.candidate.matched_keys) if intake_target.candidate is not None else [],
        missing_evidence=_missing_evidence(action_plan=action_plan, candidate=intake_target.candidate),
        captured_fields=_captured_fields(pages),
        title=f"Record Needed: {target_label}",
        description=_request_description(action_plan=action_plan),
        request_comment=clean_optional_text(request_comment),
        resolution_comment=None,
        linkage_snapshot=linkage_assessment.model_dump(mode="json"),
        action_plan_snapshot=action_plan.model_dump(mode="json"),
        resolved_record_type=None,
        resolved_record_id=None,
        requested_at=now,
        requested_by=actor_id,
        resolved_at=None,
        resolved_by=None,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(request)
    db.flush()
    append_document_activity_event(
        db,
        document_id=document.document_id,
        actor_id=actor_id,
        event_type="DocumentRecordCreationRequested",
        occurred_at=now,
        payload={
            "request": _request_snapshot(request),
            "target_record_type": request.target_record_type,
            "target_record_label": request.target_record_label,
        },
    )
    return request


def list_document_record_creation_requests(
    db: Session,
    *,
    status_filter: str | None = "OPEN",
    limit: int = 50,
) -> list[DocumentRecordCreationRequestOut]:
    if not document_record_creation_requests_table_available(db):
        return []

    statement = select(DocumentRecordCreationRequest)
    if status_filter:
        statement = statement.where(DocumentRecordCreationRequest.status == status_filter)
    statement = statement.order_by(
        DocumentRecordCreationRequest.requested_at.desc(),
        DocumentRecordCreationRequest.request_id.desc(),
    ).limit(limit)
    requests = db.execute(statement).scalars().all()
    return [to_document_record_creation_request_out(request) for request in requests]


def list_document_record_creation_requests_for_document(
    db: Session,
    *,
    document_id: str,
    status_filter: str | None = "OPEN",
) -> list[DocumentRecordCreationRequestOut]:
    if not document_record_creation_requests_table_available(db):
        return []

    statement = select(DocumentRecordCreationRequest).where(
        DocumentRecordCreationRequest.document_id == document_id,
    )
    if status_filter:
        statement = statement.where(DocumentRecordCreationRequest.status == status_filter)
    statement = statement.order_by(
        DocumentRecordCreationRequest.requested_at.desc(),
        DocumentRecordCreationRequest.request_id.desc(),
    )
    requests = db.execute(statement).scalars().all()
    return [to_document_record_creation_request_out(request) for request in requests]


def resolve_document_record_creation_request(
    db: Session,
    *,
    document_id: str,
    request_id: int,
    actor_id: str,
    record_type: str,
    record_id: str,
    resolution_comment: str | None = None,
) -> DocumentRecordCreationRequest:
    if not document_record_creation_requests_table_available(db):
        raise DocumentRecordCreationRequestPersistenceUnavailable(
            "Document record creation request persistence is unavailable because the database schema is behind "
            "the current code. Run the latest migrations and retry."
        )

    request = _load_open_document_record_creation_request(
        db,
        document_id=document_id,
        request_id=request_id,
    )
    normalized_record_type = str(record_type or "").strip().upper()
    normalized_record_id = str(record_id or "").strip()
    if not normalized_record_type or not normalized_record_id:
        raise ValueError("Resolving a document record creation request requires record_type and record_id.")
    if normalized_record_type != request.target_record_type:
        raise ValueError(
            "Document record creation requests must be resolved with the same target record type "
            f"({request.target_record_type})."
        )

    now = datetime.now(timezone.utc)
    link = create_document_record_link(
        db,
        document_id=request.document_id,
        record_type=normalized_record_type,
        record_id=normalized_record_id,
        actor_id=actor_id,
        source="RECORD_CREATION_REQUEST",
    )
    request.status = "RESOLVED"
    request.resolved_record_type = link.record_type
    request.resolved_record_id = link.record_id
    request.resolution_comment = clean_optional_text(resolution_comment)
    request.resolved_at = now
    request.resolved_by = actor_id
    request.updated_at = now
    request.updated_by = actor_id
    request.version += 1
    db.flush()
    append_document_activity_event(
        db,
        document_id=request.document_id,
        actor_id=actor_id,
        event_type="DocumentRecordCreationResolved",
        occurred_at=now,
        payload={
            "request": _request_snapshot(request),
            "record_link": {
                "record_type": link.record_type,
                "record_id": link.record_id,
                "record_label": link.record_label,
                "summary": link.summary,
            },
        },
    )
    return request


def cancel_document_record_creation_request(
    db: Session,
    *,
    document_id: str,
    request_id: int,
    actor_id: str,
    resolution_comment: str,
) -> DocumentRecordCreationRequest:
    if not document_record_creation_requests_table_available(db):
        raise DocumentRecordCreationRequestPersistenceUnavailable(
            "Document record creation request persistence is unavailable because the database schema is behind "
            "the current code. Run the latest migrations and retry."
        )

    request = _load_open_document_record_creation_request(
        db,
        document_id=document_id,
        request_id=request_id,
    )
    comment = clean_optional_text(resolution_comment)
    if comment is None:
        raise ValueError("Cancelling a document record creation request requires a resolution comment.")

    now = datetime.now(timezone.utc)
    request.status = "CANCELLED"
    request.resolution_comment = comment
    request.resolved_at = now
    request.resolved_by = actor_id
    request.updated_at = now
    request.updated_by = actor_id
    request.version += 1
    db.flush()
    append_document_activity_event(
        db,
        document_id=request.document_id,
        actor_id=actor_id,
        event_type="DocumentRecordCreationCancelled",
        occurred_at=now,
        payload={"request": _request_snapshot(request)},
    )
    return request


def find_open_document_record_creation_request(
    db: Session,
    *,
    document_id: str,
    target_record_type: str,
) -> DocumentRecordCreationRequest | None:
    normalized_target = str(target_record_type or "").strip().upper()
    return db.execute(
        select(DocumentRecordCreationRequest)
        .where(
            DocumentRecordCreationRequest.document_id == document_id,
            DocumentRecordCreationRequest.target_record_type == normalized_target,
            DocumentRecordCreationRequest.status == "OPEN",
        )
        .order_by(
            DocumentRecordCreationRequest.requested_at.desc(),
            DocumentRecordCreationRequest.request_id.desc(),
        )
    ).scalars().first()


def _load_open_document_record_creation_request(
    db: Session,
    *,
    document_id: str,
    request_id: int,
) -> DocumentRecordCreationRequest:
    request = db.execute(
        select(DocumentRecordCreationRequest).where(
            DocumentRecordCreationRequest.document_id == document_id,
            DocumentRecordCreationRequest.request_id == request_id,
        )
    ).scalars().first()
    if request is None:
        raise LookupError(f"Document record creation request '{request_id}' was not found.")
    if request.status != "OPEN":
        raise ValueError(
            f"Document record creation request '{request_id}' is already {request.status.lower()}."
        )
    return request


def to_document_record_creation_request_out(
    request: DocumentRecordCreationRequest,
) -> DocumentRecordCreationRequestOut:
    return DocumentRecordCreationRequestOut(
        request_id=request.request_id,
        document_id=request.document_id,
        status=request.status,
        document_kind=request.document_kind,
        target_record_type=request.target_record_type,
        target_record_label=request.target_record_label,
        owner_record_type=request.owner_record_type,
        owner_record_id=request.owner_record_id,
        required_owner_record_types=list(request.required_owner_record_types or []),
        matched_keys=list(request.matched_keys or []),
        missing_evidence=list(request.missing_evidence or []),
        captured_fields=dict(request.captured_fields or {}),
        title=request.title,
        description=request.description,
        request_comment=request.request_comment,
        resolution_comment=request.resolution_comment,
        linkage_snapshot=dict(request.linkage_snapshot or {}),
        action_plan_snapshot=dict(request.action_plan_snapshot or {}),
        resolved_record_type=request.resolved_record_type,
        resolved_record_id=request.resolved_record_id,
        requested_at=request.requested_at,
        requested_by=request.requested_by,
        resolved_at=request.resolved_at,
        resolved_by=request.resolved_by,
        updated_at=request.updated_at,
        updated_by=request.updated_by,
        version=request.version,
    )


def _resolve_record_creation_intake_target(
    *,
    action_plan: DocumentActionPlanOut,
    linkage_assessment: DocumentLinkageAssessmentOut,
) -> _RecordCreationIntakeTarget | None:
    target = action_plan.target
    if target is None or target.existing_record:
        return None
    if action_plan.action_type == "CREATE_RECORD_FROM_DOCUMENT" and action_plan.status == "READY":
        return None
    if action_plan.status != "BLOCKED":
        return None
    if action_plan.action_type != "MANUAL_REVIEW":
        return None

    candidate = _find_create_candidate(linkage_assessment=linkage_assessment, target=target)
    if action_plan.candidate_state == "OWNER_REQUIRED":
        return _RecordCreationIntakeTarget(target=target, candidate=candidate)
    if action_plan.candidate_state == "MANUAL_REVIEW" and "typed_creation_service" in action_plan.missing_evidence:
        return _RecordCreationIntakeTarget(target=target, candidate=candidate)
    return None


def _find_create_candidate(
    *,
    linkage_assessment: DocumentLinkageAssessmentOut,
    target: DocumentActionRecordRefOut,
) -> DocumentLinkageCandidateOut | None:
    for candidate in linkage_assessment.candidates:
        if (
            candidate.record_type == target.record_type
            and not candidate.existing_record
            and candidate.create_if_missing
        ):
            return candidate
    return None


def _dominant_document_kind(pages: list[DocumentIngestionPage]) -> str | None:
    counts: dict[str, int] = {}
    for page in pages:
        if page.document_kind in {"UNKNOWN", "OTHER"}:
            continue
        counts[page.document_kind] = counts.get(page.document_kind, 0) + 1
    if not counts:
        return None
    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


def _captured_fields(pages: list[DocumentIngestionPage]) -> dict[str, object]:
    captured: dict[str, object] = {}
    ordered_pages = sorted(
        pages,
        key=lambda page: (page.review_status != "REVIEWED", page.page_number),
    )
    for page in ordered_pages:
        for field in page.header_fields or []:
            key = clean_optional_text(field.get("field_key"), lowercase=True)
            value = clean_optional_text(field.get("value"))
            if key and value and key not in captured:
                captured[key] = value
    return captured


def _target_record_label(target: DocumentActionRecordRefOut) -> str:
    label = clean_optional_text(target.record_label) or target.record_type.replace("_", " ").title()
    if label.startswith("Create "):
        label = label[len("Create ") :]
    return label


def _missing_evidence(
    *,
    action_plan: DocumentActionPlanOut,
    candidate: DocumentLinkageCandidateOut | None,
) -> list[str]:
    missing: list[str] = []
    for item in [
        *action_plan.required_owner_record_types,
        *action_plan.missing_evidence,
        *(candidate.missing_keys if candidate is not None else []),
    ]:
        normalized = clean_optional_text(item)
        if normalized is not None and normalized not in missing:
            missing.append(normalized)
    return missing


def _request_description(action_plan: DocumentActionPlanOut) -> str:
    description = clean_optional_text(action_plan.description) or (
        "The document implies a record that does not safely exist in the system yet."
    )
    return (
        f"{description} This request is intake for a human-owned creation path; "
        "it does not create or mutate the business record."
    )


def _request_snapshot(request: DocumentRecordCreationRequest) -> dict[str, object]:
    return jsonable_encoder(
        {
            "request_id": request.request_id,
            "document_id": request.document_id,
            "status": request.status,
            "target_record_type": request.target_record_type,
            "target_record_label": request.target_record_label,
            "owner_record_type": request.owner_record_type,
            "owner_record_id": request.owner_record_id,
            "required_owner_record_types": list(request.required_owner_record_types or []),
            "missing_evidence": list(request.missing_evidence or []),
            "resolved_record_type": request.resolved_record_type,
            "resolved_record_id": request.resolved_record_id,
            "resolution_comment": request.resolution_comment,
            "requested_at": request.requested_at,
            "requested_by": request.requested_by,
            "resolved_at": request.resolved_at,
            "resolved_by": request.resolved_by,
        }
    )
