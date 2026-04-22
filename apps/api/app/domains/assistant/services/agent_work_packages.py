from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.autonomy_review import (
    AssistantAgentHealthWorkPackage,
    build_assistant_agent_health_review,
)
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.models.assistant_agent_work_package import AssistantAgentWorkPackage
from apps.api.app.schemas.assistant import AssistantAgentWorkPackageOut


WORK_PACKAGE_STATUS_CANDIDATE = "CANDIDATE"
WORK_PACKAGE_STATUS_ACCEPTED = "ACCEPTED"
WORK_PACKAGE_STATUS_IN_PROGRESS = "IN_PROGRESS"
WORK_PACKAGE_STATUS_IMPLEMENTED = "IMPLEMENTED"
WORK_PACKAGE_STATUS_DISMISSED = "DISMISSED"

WORK_PACKAGE_STATUSES = {
    WORK_PACKAGE_STATUS_CANDIDATE,
    WORK_PACKAGE_STATUS_ACCEPTED,
    WORK_PACKAGE_STATUS_IN_PROGRESS,
    WORK_PACKAGE_STATUS_IMPLEMENTED,
    WORK_PACKAGE_STATUS_DISMISSED,
}


def list_agent_work_packages(
    db: Session,
    *,
    status: str | None = None,
) -> list[AssistantAgentWorkPackage]:
    normalized_status = status.strip().upper() if status else None
    if normalized_status and normalized_status not in WORK_PACKAGE_STATUSES:
        raise AssistantServiceError(status_code=400, detail="Unsupported assistant agent work package status")

    stmt = select(AssistantAgentWorkPackage).order_by(
        AssistantAgentWorkPackage.updated_at.desc(),
        AssistantAgentWorkPackage.id.desc(),
    )
    if normalized_status:
        stmt = stmt.where(AssistantAgentWorkPackage.status == normalized_status)
    return list(db.scalars(stmt).all())


def accept_generated_agent_work_package(
    db: Session,
    *,
    work_package_id: str,
    accepted_by: str,
    notes: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    now: datetime | None = None,
) -> AssistantAgentWorkPackage:
    normalized_work_package_id = work_package_id.strip()
    if not normalized_work_package_id:
        raise AssistantServiceError(status_code=400, detail="Assistant agent work package id is required")

    generated_at = now or datetime.now(timezone.utc)
    snapshot = build_assistant_agent_health_review(
        db,
        created_after=created_after,
        created_before=created_before,
        now=generated_at,
    )
    candidate = next(
        (
            work_package
            for work_package in snapshot.work_packages
            if work_package.work_package_id == normalized_work_package_id
        ),
        None,
    )
    if candidate is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent work package candidate not found")

    record = db.scalar(
        select(AssistantAgentWorkPackage).where(
            AssistantAgentWorkPackage.work_package_id == normalized_work_package_id
        )
    )
    normalized_actor = accepted_by.strip() or "system"
    normalized_notes = notes.strip() if notes and notes.strip() else None
    created = record is None

    if record is None:
        record = AssistantAgentWorkPackage(
            work_package_id=candidate.work_package_id,
            title=candidate.title,
            package_type=candidate.package_type,
            priority=candidate.priority,
            status=WORK_PACKAGE_STATUS_ACCEPTED,
            source_agent_ids=list(candidate.source_agent_ids),
            source_agent_names=list(candidate.source_agent_names),
            source_recommendations=list(candidate.source_recommendations),
            source_candidates=list(candidate.source_candidates),
            recommended_owner_role=candidate.recommended_owner_role,
            rationale=candidate.rationale,
            acceptance_checks=list(candidate.acceptance_checks),
            knowledge_base_titles=list(candidate.knowledge_base_titles),
            accepted_at=generated_at,
            accepted_by=normalized_actor,
            notes=normalized_notes,
            created_at=generated_at,
            created_by=normalized_actor,
            updated_at=generated_at,
            updated_by=normalized_actor,
        )
        db.add(record)
    else:
        _refresh_generated_fields(record, candidate)
        if record.status in {WORK_PACKAGE_STATUS_CANDIDATE, WORK_PACKAGE_STATUS_DISMISSED}:
            record.status = WORK_PACKAGE_STATUS_ACCEPTED
        if record.accepted_at is None:
            record.accepted_at = generated_at
        record.accepted_by = normalized_actor
        if normalized_notes is not None:
            record.notes = normalized_notes
        record.updated_at = generated_at
        record.updated_by = normalized_actor

    db.flush()
    _record_agent_work_package_provenance(
        db,
        record=record,
        operation_key=(
            "assistant_agent_work_package.accepted"
            if created
            else "assistant_agent_work_package.accepted_candidate_refreshed"
        ),
        action="accepted" if created else "refreshed",
    )
    db.commit()
    db.refresh(record)
    return record


def to_agent_work_package_out(record: AssistantAgentWorkPackage) -> AssistantAgentWorkPackageOut:
    return AssistantAgentWorkPackageOut(
        id=record.id,
        work_package_id=record.work_package_id,
        title=record.title,
        package_type=record.package_type,
        priority=record.priority,
        status=record.status,
        source_agent_ids=list(record.source_agent_ids or []),
        source_agent_names=list(record.source_agent_names or []),
        source_recommendations=list(record.source_recommendations or []),
        source_candidates=list(record.source_candidates or []),
        recommended_owner_role=record.recommended_owner_role,
        rationale=record.rationale,
        acceptance_checks=list(record.acceptance_checks or []),
        knowledge_base_titles=list(record.knowledge_base_titles or []),
        accepted_at=record.accepted_at,
        accepted_by=record.accepted_by,
        notes=record.notes,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
    )


def _refresh_generated_fields(
    record: AssistantAgentWorkPackage,
    candidate: AssistantAgentHealthWorkPackage,
) -> None:
    record.title = candidate.title
    record.package_type = candidate.package_type
    record.priority = candidate.priority
    record.source_agent_ids = list(candidate.source_agent_ids)
    record.source_agent_names = list(candidate.source_agent_names)
    record.source_recommendations = list(candidate.source_recommendations)
    record.source_candidates = list(candidate.source_candidates)
    record.recommended_owner_role = candidate.recommended_owner_role
    record.rationale = candidate.rationale
    record.acceptance_checks = list(candidate.acceptance_checks)
    record.knowledge_base_titles = list(candidate.knowledge_base_titles)


def _record_agent_work_package_provenance(
    db: Session,
    *,
    record: AssistantAgentWorkPackage,
    operation_key: str,
    action: str,
) -> None:
    affected_records = [
        {
            "record_type": "assistant_agent_work_package",
            "record_id": record.work_package_id,
            "action": action,
            "label": record.title,
        }
    ]
    affected_records.extend(
        {
            "record_type": "assistant_agent",
            "record_id": agent_id,
            "action": "reviewed",
            "label": agent_id,
        }
        for agent_id in record.source_agent_ids or []
    )
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.agent_work_packages",
        affected_records=affected_records,
        details={
            "work_package_id": record.work_package_id,
            "package_type": record.package_type,
            "priority": record.priority,
            "status": record.status,
            "source_agent_count": len(record.source_agent_ids or []),
            "source_candidate_count": len(record.source_candidates or []),
        },
    )
