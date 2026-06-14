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

WORK_PACKAGE_STATUS_TRANSITIONS = {
    WORK_PACKAGE_STATUS_ACCEPTED: {WORK_PACKAGE_STATUS_IN_PROGRESS, WORK_PACKAGE_STATUS_DISMISSED},
    WORK_PACKAGE_STATUS_IN_PROGRESS: {WORK_PACKAGE_STATUS_IMPLEMENTED, WORK_PACKAGE_STATUS_DISMISSED},
    WORK_PACKAGE_STATUS_IMPLEMENTED: set(),
    WORK_PACKAGE_STATUS_DISMISSED: set(),
}


def list_agent_work_packages(
    db: Session,
    *,
    status: str | None = None,
    has_pr: bool | None = None,
    has_commit: bool | None = None,
    has_eval: bool | None = None,
    has_tests: bool | None = None,
    has_docs: bool | None = None,
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
    records = list(db.scalars(stmt).all())
    if not any(
        flag is not None for flag in (has_pr, has_commit, has_eval, has_tests, has_docs)
    ):
        return records
    return [
        record
        for record in records
        if _matches_implementation_evidence_filters(
            record,
            has_pr=has_pr,
            has_commit=has_commit,
            has_eval=has_eval,
            has_tests=has_tests,
            has_docs=has_docs,
        )
    ]


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
            implementation_evidence={},
            accepted_at=generated_at,
            accepted_by=normalized_actor,
            implemented_at=None,
            implemented_by=None,
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


def update_agent_work_package(
    db: Session,
    *,
    work_package_id: str,
    status: str,
    updated_by: str,
    notes: str | None = None,
    implementation_evidence: dict[str, object] | None = None,
    now: datetime | None = None,
) -> AssistantAgentWorkPackage:
    normalized_work_package_id = work_package_id.strip()
    if not normalized_work_package_id:
        raise AssistantServiceError(status_code=400, detail="Assistant agent work package id is required")

    normalized_status = status.strip().upper()
    if normalized_status not in WORK_PACKAGE_STATUSES or normalized_status == WORK_PACKAGE_STATUS_CANDIDATE:
        raise AssistantServiceError(status_code=400, detail="Unsupported assistant agent work package status")

    record = db.scalar(
        select(AssistantAgentWorkPackage).where(
            AssistantAgentWorkPackage.work_package_id == normalized_work_package_id
        )
    )
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent work package not found")

    normalized_actor = updated_by.strip() or "system"
    normalized_notes = notes.strip() if notes and notes.strip() else None
    merged_implementation_evidence = _merge_implementation_evidence(
        record.implementation_evidence if isinstance(record.implementation_evidence, dict) else {},
        implementation_evidence,
    )

    if normalized_status != record.status:
        allowed_targets = WORK_PACKAGE_STATUS_TRANSITIONS.get(record.status, set())
        if normalized_status not in allowed_targets:
            raise AssistantServiceError(
                status_code=409,
                detail=f"Cannot move assistant agent work package from {record.status} to {normalized_status}",
            )
        if normalized_status == WORK_PACKAGE_STATUS_IMPLEMENTED and not _has_implementation_evidence(
            merged_implementation_evidence
        ):
            raise AssistantServiceError(
                status_code=400,
                detail="Implementation evidence is required before marking a work package implemented",
            )
        record.status = normalized_status
        if normalized_status == WORK_PACKAGE_STATUS_IMPLEMENTED and record.implemented_at is None:
            record.implemented_at = now or datetime.now(timezone.utc)
            record.implemented_by = normalized_actor

    record.implementation_evidence = merged_implementation_evidence
    if normalized_notes is not None:
        record.notes = normalized_notes
    record.updated_at = now or datetime.now(timezone.utc)
    record.updated_by = normalized_actor
    db.flush()
    _record_agent_work_package_provenance(
        db,
        record=record,
        operation_key="assistant_agent_work_package.status_updated",
        action=record.status.lower(),
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
        implementation_evidence=_implementation_evidence_out(record.implementation_evidence),
        accepted_at=record.accepted_at,
        accepted_by=record.accepted_by,
        implemented_at=record.implemented_at,
        implemented_by=record.implemented_by,
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
            "has_implementation_evidence": _has_implementation_evidence(record.implementation_evidence),
            "implemented_at": record.implemented_at.isoformat() if record.implemented_at else None,
            "implemented_by": record.implemented_by,
        },
    )


def _implementation_evidence_out(
    value: dict[str, object] | None,
) -> dict[str, object]:
    evidence = value if isinstance(value, dict) else {}
    return {
        "pr_url": str(evidence.get("pr_url")).strip() if evidence.get("pr_url") else None,
        "commit_sha": str(evidence.get("commit_sha")).strip().lower() if evidence.get("commit_sha") else None,
        "eval_ids": _normalize_int_list(evidence.get("eval_ids")),
        "test_names": _normalize_text_list(evidence.get("test_names")),
        "doc_paths": _normalize_text_list(evidence.get("doc_paths")),
        "owner": str(evidence.get("owner")).strip() if evidence.get("owner") else None,
    }


def _merge_implementation_evidence(
    current: dict[str, object],
    incoming: dict[str, object] | None,
) -> dict[str, object]:
    evidence = _implementation_evidence_out(current)
    if not incoming:
        return _compact_implementation_evidence(evidence)
    if incoming.get("pr_url") is not None:
        evidence["pr_url"] = str(incoming["pr_url"]).strip() or None
    if incoming.get("commit_sha") is not None:
        evidence["commit_sha"] = str(incoming["commit_sha"]).strip().lower() or None
    if incoming.get("eval_ids") is not None:
        evidence["eval_ids"] = _normalize_int_list(incoming.get("eval_ids"))
    if incoming.get("test_names") is not None:
        evidence["test_names"] = _normalize_text_list(incoming.get("test_names"))
    if incoming.get("doc_paths") is not None:
        evidence["doc_paths"] = _normalize_text_list(incoming.get("doc_paths"))
    if incoming.get("owner") is not None:
        evidence["owner"] = str(incoming["owner"]).strip() or None
    return _compact_implementation_evidence(evidence)


def _compact_implementation_evidence(
    value: dict[str, object],
) -> dict[str, object]:
    compact: dict[str, object] = {}
    for field_name in ("pr_url", "commit_sha", "owner"):
        field_value = value.get(field_name)
        if isinstance(field_value, str) and field_value.strip():
            compact[field_name] = field_value.strip()
    for field_name in ("eval_ids", "test_names", "doc_paths"):
        field_value = value.get(field_name)
        if isinstance(field_value, list) and field_value:
            compact[field_name] = field_value
    return compact


def _has_implementation_evidence(value: dict[str, object] | None) -> bool:
    evidence = _implementation_evidence_out(value)
    return bool(
        evidence["pr_url"]
        or evidence["commit_sha"]
        or evidence["eval_ids"]
        or evidence["test_names"]
        or evidence["doc_paths"]
    )


def _matches_implementation_evidence_filters(
    record: AssistantAgentWorkPackage,
    *,
    has_pr: bool | None,
    has_commit: bool | None,
    has_eval: bool | None,
    has_tests: bool | None,
    has_docs: bool | None,
) -> bool:
    evidence = _implementation_evidence_out(record.implementation_evidence)
    checks = {
        "has_pr": bool(evidence["pr_url"]),
        "has_commit": bool(evidence["commit_sha"]),
        "has_eval": bool(evidence["eval_ids"]),
        "has_tests": bool(evidence["test_names"]),
        "has_docs": bool(evidence["doc_paths"]),
    }
    expected = {
        "has_pr": has_pr,
        "has_commit": has_commit,
        "has_eval": has_eval,
        "has_tests": has_tests,
        "has_docs": has_docs,
    }
    return all(value is None or checks[key] is value for key, value in expected.items())


def _normalize_int_list(value: object) -> list[int]:
    if not isinstance(value, list):
        return []
    normalized: list[int] = []
    seen: set[int] = set()
    for item in value:
        try:
            resolved = int(item)
        except (TypeError, ValueError):
            continue
        if resolved <= 0 or resolved in seen:
            continue
        normalized.append(resolved)
        seen.add(resolved)
    return normalized


def _normalize_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        resolved = item.strip()
        if not resolved or resolved in seen:
            continue
        normalized.append(resolved)
        seen.add(resolved)
    return normalized
