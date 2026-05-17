from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.domains.assistant.services.eval_gates import evaluate_agent_eval_gate
from apps.api.app.domains.assistant.services.agent_revisions import normalize_agent_revision_payload
from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.models.assistant_agent_revision import AssistantAgentRevision
from apps.api.app.schemas.assistant import (
    AssistantAgentProfileRequestActivation,
    AssistantAgentProfileRequestCreate,
    AssistantAgentProfileRequestDecision,
    AssistantAgentProfileRequestOut,
    AssistantAgentProfileRequestSubmit,
)


APPROVED_PROFILE_REQUEST_STATUSES = {"APPROVED", "ACTIVATED"}
_AUTHORITY_LEVEL_RANK = {
    "OBSERVE": 0,
    "EXPLAIN": 1,
    "DRAFT": 2,
    "STAGE": 3,
    "EXECUTE": 4,
    "EXTERNAL_COMMIT": 5,
}


def list_profile_requests(
    db: Session,
    *,
    status: str | None = None,
    requested_by: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AssistantAgentProfileRequest]:
    stmt = select(AssistantAgentProfileRequest).order_by(
        AssistantAgentProfileRequest.updated_at.desc(),
        AssistantAgentProfileRequest.request_id.desc(),
    )
    if status:
        stmt = stmt.where(AssistantAgentProfileRequest.status == status.strip().upper())
    if requested_by:
        stmt = stmt.where(AssistantAgentProfileRequest.requested_by == requested_by.strip())
    return list(db.scalars(stmt.offset(max(offset, 0)).limit(max(1, min(limit, 250)))).all())


def create_profile_request(
    db: Session,
    payload: AssistantAgentProfileRequestCreate,
) -> AssistantAgentProfileRequest:
    now = datetime.now(timezone.utc)
    record = AssistantAgentProfileRequest(
        status="REQUESTED",
        request_kind=payload.request_kind,
        target_agent_id=payload.target_agent_id,
        requested_agent_id=payload.requested_agent_id,
        change_summary=payload.change_summary,
        business_problem=payload.business_problem,
        proposed_mission=payload.proposed_mission,
        human_owner_role=payload.human_owner_role,
        requested_workspaces=list(payload.requested_workspaces),
        work_objects=list(payload.work_objects),
        requested_inputs_tools=list(payload.requested_inputs_tools),
        requested_action_types=list(payload.requested_action_types),
        requested_skills=list(payload.requested_skills),
        expected_outputs=list(payload.expected_outputs),
        requested_authority_ceiling=payload.requested_authority_ceiling,
        stop_conditions=list(payload.stop_conditions),
        success_metrics=list(payload.success_metrics),
        proposed_eval_cases=list(payload.proposed_eval_cases),
        requested_at=now,
        requested_by=payload.requested_by,
        updated_at=now,
    )
    db.add(record)
    db.flush()
    _record_profile_request_provenance(db, record=record, operation_key="assistant_agent_profile_request.requested")
    db.commit()
    db.refresh(record)
    return record


def submit_profile_request(
    db: Session,
    *,
    payload: AssistantAgentProfileRequestSubmit,
    requested_by: str,
) -> AssistantAgentProfileRequest:
    target_agent = (
        db.get(AssistantAgent, payload.target_agent_id)
        if payload.target_agent_id
        else None
    )

    normalized_payload = _normalize_submission_payload(
        payload,
        target_agent=target_agent,
        requested_by=requested_by,
    )
    return create_profile_request(db, normalized_payload)


def approve_profile_request(
    db: Session,
    *,
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
) -> AssistantAgentProfileRequest:
    record = _get_profile_request_or_error(db, request_id)
    if record.status not in {"REQUESTED", "APPROVED"}:
        raise AssistantServiceError(
            status_code=409,
            detail=f"Profile request {request_id} cannot be approved from {record.status}.",
        )
    approval_notes = payload.approval_notes
    if not approval_notes:
        raise AssistantServiceError(status_code=422, detail="approval_notes are required to approve a profile request.")
    now = datetime.now(timezone.utc)
    record.status = "APPROVED"
    record.approval_notes = approval_notes
    record.rejection_reason = None
    record.reviewed_by = payload.reviewed_by
    record.reviewed_at = now
    record.updated_at = now
    db.flush()
    _record_profile_request_provenance(db, record=record, operation_key="assistant_agent_profile_request.approved")
    db.commit()
    db.refresh(record)
    return record


def reject_profile_request(
    db: Session,
    *,
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
) -> AssistantAgentProfileRequest:
    record = _get_profile_request_or_error(db, request_id)
    if record.status in {"ACTIVATED", "REJECTED"}:
        raise AssistantServiceError(
            status_code=409,
            detail=f"Profile request {request_id} cannot be rejected from {record.status}.",
        )
    rejection_reason = payload.rejection_reason
    if not rejection_reason:
        raise AssistantServiceError(status_code=422, detail="rejection_reason is required to reject a profile request.")
    now = datetime.now(timezone.utc)
    record.status = "REJECTED"
    record.rejection_reason = rejection_reason
    record.reviewed_by = payload.reviewed_by
    record.reviewed_at = now
    record.updated_at = now
    db.flush()
    _record_profile_request_provenance(db, record=record, operation_key="assistant_agent_profile_request.rejected")
    db.commit()
    db.refresh(record)
    return record


def mark_profile_request_activated(
    db: Session,
    *,
    request_id: int,
    payload: AssistantAgentProfileRequestActivation,
) -> AssistantAgentProfileRequest:
    record = _get_profile_request_or_error(db, request_id)
    if record.status not in APPROVED_PROFILE_REQUEST_STATUSES:
        raise AssistantServiceError(
            status_code=409,
            detail=f"Profile request {request_id} must be approved before activation.",
        )
    linked_agent = db.get(AssistantAgent, payload.linked_agent_id)
    if linked_agent is None:
        raise AssistantServiceError(status_code=404, detail="Linked assistant agent not found.")
    if record.target_agent_id and linked_agent.agent_id != record.target_agent_id:
        raise AssistantServiceError(
            status_code=422,
            detail="Existing-agent profile requests must be applied to their reviewed target agent.",
        )
    linked_revision = db.get(AssistantAgentRevision, payload.linked_revision_id)
    if linked_revision is None or linked_revision.agent_id != linked_agent.agent_id:
        raise AssistantServiceError(
            status_code=404,
            detail="Linked assistant agent revision not found for the selected agent.",
        )
    if (
        linked_revision.published_at is None
        or linked_agent.published_revision_id != linked_revision.revision_id
    ):
        raise AssistantServiceError(
            status_code=409,
            detail="Profile requests can only be marked applied after the linked agent revision is published.",
        )
    revision_payload = normalize_agent_revision_payload(linked_revision.payload)
    if revision_payload.get("profile_request_id") != record.request_id:
        raise AssistantServiceError(
            status_code=422,
            detail="Linked agent revision must carry the approved profile request ID before it can close the request.",
        )
    if linked_agent.profile_request_id != record.request_id:
        raise AssistantServiceError(
            status_code=422,
            detail="Linked agent must carry the approved profile request ID before it can close the request.",
        )
    now = datetime.now(timezone.utc)
    record.status = "ACTIVATED"
    record.linked_agent_id = payload.linked_agent_id
    record.linked_revision_id = payload.linked_revision_id
    record.activated_by = payload.activated_by
    record.activated_at = now
    record.updated_at = now
    db.flush()
    _record_profile_request_provenance(
        db,
        record=record,
        operation_key="assistant_agent_profile_request.activated",
        linked_agent_id=payload.linked_agent_id,
        linked_revision_id=payload.linked_revision_id,
    )
    return record


def validate_agent_activation_requirements(
    db: Session,
    *,
    agent_id: str,
    agent_name: str,
    status: str,
    profile_kind: str,
    role_key: str | None,
    profile_request_id: int | None,
    human_owner_role: str | None,
    authority_ceiling: str | None,
    activation_notes: str | None,
    capabilities: tuple[str, ...],
    allowed_action_types: tuple[str, ...],
) -> None:
    if status != "ACTIVE":
        return

    errors: list[str] = []
    normalized_capabilities = {capability.upper() for capability in capabilities}
    normalized_profile_kind = profile_kind.strip().upper()

    if not human_owner_role:
        errors.append(f"{agent_name} must name a human owner role before activation.")
    if not authority_ceiling:
        errors.append(f"{agent_name} must declare an authority ceiling before activation.")
    if not activation_notes:
        errors.append(f"{agent_name} must include activation notes before activation.")

    profile_request: AssistantAgentProfileRequest | None = None
    if profile_request_id is not None:
        profile_request = db.get(AssistantAgentProfileRequest, profile_request_id)
        if profile_request is None:
            errors.append(f"{agent_name} references unknown profile request {profile_request_id}.")
        elif profile_request.status not in APPROVED_PROFILE_REQUEST_STATUSES:
            errors.append(f"{agent_name} profile request {profile_request_id} must be approved before activation.")
        elif profile_request.linked_agent_id and profile_request.linked_agent_id != agent_id:
            errors.append(
                f"{agent_name} profile request {profile_request_id} is already linked to {profile_request.linked_agent_id}."
            )

    if normalized_profile_kind == "CUSTOM":
        if role_key:
            if get_role_archetype(role_key) is None:
                errors.append(f"{agent_name} maps to unknown role archetype '{role_key}'.")
        elif profile_request_id is None:
            errors.append(f"{agent_name} custom profiles need an approved profile request before activation.")

        if "ACTION" in normalized_capabilities:
            if not allowed_action_types:
                errors.append(f"{agent_name} action-capable custom profiles need explicit allowed action types.")
            if profile_request is None:
                errors.append(f"{agent_name} action-capable custom profiles need an approved profile request.")
            else:
                persisted_eval_count = db.query(AssistantAgentEval).filter(
                    AssistantAgentEval.agent_id == agent_id
                ).count()
                if persisted_eval_count <= 0:
                    errors.append(f"{agent_name} action-capable custom profiles need at least one persisted eval case.")
                if not profile_request.approval_notes:
                    errors.append(f"{agent_name} action-capable custom profiles need approval notes.")

    eval_gate = evaluate_agent_eval_gate(
        db,
        agent_id=agent_id,
        profile_kind=profile_kind,
        role_key=role_key,
        profile_request_id=profile_request_id,
        authority_ceiling=authority_ceiling,
        capabilities=capabilities,
        allowed_action_types=allowed_action_types,
    )
    if eval_gate.status == "BLOCKED":
        errors.extend(eval_gate.missing_cases)

    if errors:
        raise AssistantServiceError(status_code=422, detail="; ".join(errors))


def to_profile_request_out(record: AssistantAgentProfileRequest) -> AssistantAgentProfileRequestOut:
    return AssistantAgentProfileRequestOut(
        request_id=record.request_id,
        status=record.status,
        request_kind=record.request_kind,
        target_agent_id=record.target_agent_id,
        requested_agent_id=record.requested_agent_id,
        change_summary=record.change_summary,
        business_problem=record.business_problem,
        proposed_mission=record.proposed_mission,
        human_owner_role=record.human_owner_role,
        requested_workspaces=list(record.requested_workspaces or []),
        work_objects=list(record.work_objects or []),
        requested_inputs_tools=list(record.requested_inputs_tools or []),
        requested_action_types=list(record.requested_action_types or []),
        requested_skills=list(record.requested_skills or []),
        expected_outputs=list(record.expected_outputs or []),
        requested_authority_ceiling=record.requested_authority_ceiling,
        stop_conditions=list(record.stop_conditions or []),
        success_metrics=list(record.success_metrics or []),
        proposed_eval_cases=list(record.proposed_eval_cases or []),
        approval_notes=record.approval_notes,
        rejection_reason=record.rejection_reason,
        linked_agent_id=record.linked_agent_id,
        linked_revision_id=record.linked_revision_id,
        requested_at=record.requested_at,
        requested_by=record.requested_by,
        reviewed_at=record.reviewed_at,
        reviewed_by=record.reviewed_by,
        activated_at=record.activated_at,
        activated_by=record.activated_by,
        updated_at=record.updated_at,
    )


def _get_profile_request_or_error(db: Session, request_id: int) -> AssistantAgentProfileRequest:
    record = db.get(AssistantAgentProfileRequest, request_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent profile request not found")
    return record


def _record_profile_request_provenance(
    db: Session,
    *,
    record: AssistantAgentProfileRequest,
    operation_key: str,
    linked_agent_id: str | None = None,
    linked_revision_id: int | None = None,
) -> None:
    affected_records: list[dict[str, object]] = [
        {
            "record_type": "assistant_agent_profile_request",
            "record_id": record.request_id,
            "action": operation_key.rsplit(".", 1)[-1],
            "label": record.requested_agent_id or f"profile-request-{record.request_id}",
        }
    ]
    if linked_agent_id:
        affected_records.append(
            {
                "record_type": "assistant_agent",
                "record_id": linked_agent_id,
                "action": "linked",
                "label": linked_agent_id,
            }
        )
    if linked_revision_id is not None:
        affected_records.append(
            {
                "record_type": "assistant_agent_revision",
                "record_id": linked_revision_id,
                "action": "linked",
                "label": f"revision-{linked_revision_id}",
            }
        )
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.profile_requests",
        affected_records=affected_records,
        details={
            "request_id": record.request_id,
            "status": record.status,
            "request_kind": record.request_kind,
            "target_agent_id": record.target_agent_id,
            "requested_agent_id": record.requested_agent_id,
            "requested_authority_ceiling": record.requested_authority_ceiling,
            "workspace_count": len(record.requested_workspaces or []),
            "tool_count": len(record.requested_inputs_tools or []),
            "action_count": len(record.requested_action_types or []),
            "skill_count": len(record.requested_skills or []),
            "eval_case_count": len(record.proposed_eval_cases or []),
            "linked_revision_id": linked_revision_id,
        },
    )


def _normalize_submission_payload(
    payload: AssistantAgentProfileRequestSubmit,
    *,
    target_agent: AssistantAgent | None,
    requested_by: str,
) -> AssistantAgentProfileRequestCreate:
    request_kind = payload.request_kind
    errors: list[str] = []

    if request_kind == "NEW_SPECIALIZATION":
        if payload.target_agent_id:
            errors.append("New specialization requests should not target an existing managed agent.")
        if not payload.human_owner_role:
            errors.append("Human owner role is required for a new specialization request.")
        if not payload.requested_workspaces:
            errors.append("Select at least one workspace for a new specialization request.")
        if not payload.work_objects:
            errors.append("List at least one work object for a new specialization request.")
        if not payload.expected_outputs:
            errors.append("List at least one expected output for a new specialization request.")
        if not payload.stop_conditions:
            errors.append("List at least one stop condition for a new specialization request.")
        if not payload.success_metrics:
            errors.append("List at least one success metric for a new specialization request.")
        if not payload.proposed_eval_cases:
            errors.append("List at least one proposed eval case for a new specialization request.")
        if payload.requested_authority_ceiling is None:
            errors.append("Requested authority ceiling is required for a new specialization request.")
    else:
        if target_agent is None:
            errors.append("Select an existing managed agent before submitting this request.")
        if payload.requested_agent_id:
            errors.append("Existing-agent change requests cannot assign a new requested_agent_id.")

    if errors:
        raise AssistantServiceError(status_code=422, detail="; ".join(errors))

    if request_kind == "NEW_SPECIALIZATION":
        return AssistantAgentProfileRequestCreate(
            request_kind=request_kind,
            target_agent_id=None,
            requested_agent_id=payload.requested_agent_id,
            change_summary=payload.change_summary,
            business_problem=payload.business_problem,
            proposed_mission=payload.proposed_mission,
            human_owner_role=payload.human_owner_role or "",
            requested_workspaces=list(payload.requested_workspaces),
            work_objects=list(payload.work_objects),
            requested_inputs_tools=list(payload.requested_inputs_tools),
            requested_action_types=list(payload.requested_action_types),
            requested_skills=list(payload.requested_skills),
            expected_outputs=list(payload.expected_outputs),
            requested_authority_ceiling=payload.requested_authority_ceiling or "DRAFT",
            stop_conditions=list(payload.stop_conditions),
            success_metrics=list(payload.success_metrics),
            proposed_eval_cases=list(payload.proposed_eval_cases),
            requested_by=requested_by,
        )

    assert target_agent is not None

    if request_kind == "NARROW_ACCESS":
        requested_workspaces = list(payload.requested_workspaces or target_agent.allowed_workspaces or [])
        requested_inputs_tools = list(payload.requested_inputs_tools)
        requested_action_types = list(payload.requested_action_types)
        requested_skills = list(payload.requested_skills)
    else:
        requested_workspaces = list(payload.requested_workspaces or target_agent.allowed_workspaces or [])
        requested_inputs_tools = list(payload.requested_inputs_tools or target_agent.allowed_tools or [])
        requested_action_types = list(payload.requested_action_types or target_agent.allowed_action_types or [])
        requested_skills = list(payload.requested_skills or target_agent.skills or [])
    current_authority = target_agent.authority_ceiling or "DRAFT"
    requested_authority = payload.requested_authority_ceiling or current_authority
    human_owner_role = payload.human_owner_role or target_agent.human_owner_role or ""
    work_objects = list(payload.work_objects or ["assistant agent profile"])
    expected_outputs = list(
        payload.expected_outputs
        or [f"Reviewed update plan for {target_agent.name}.", "Explicit approved profile diffs for admin review."]
    )
    stop_conditions = list(
        payload.stop_conditions
        or [
            "Stop if the requested change would exceed the current authority boundary without explicit admin review.",
            "Stop if the target agent mission or ownership is unclear.",
        ]
    )
    success_metrics = list(
        payload.success_metrics
        or [
            f"Clarify why {target_agent.name} should change before any prompt or policy mutation.",
            "Keep requested changes reviewable through the existing managed-agent revision flow.",
        ]
    )
    proposed_eval_cases = list(
        payload.proposed_eval_cases
        or ["Confirms the requested profile change still respects reviewed authority and stop conditions."]
    )

    if request_kind == "NARROW_ACCESS":
        errors = _validate_narrow_access_request(
            target_agent=target_agent,
            requested_workspaces=requested_workspaces,
            requested_inputs_tools=requested_inputs_tools,
            requested_action_types=requested_action_types,
            requested_skills=requested_skills,
            requested_authority=requested_authority,
        )
        if errors:
            raise AssistantServiceError(status_code=422, detail="; ".join(errors))

    return AssistantAgentProfileRequestCreate(
        request_kind=request_kind,
        target_agent_id=target_agent.agent_id,
        requested_agent_id=None,
        change_summary=payload.change_summary,
        business_problem=payload.business_problem,
        proposed_mission=payload.proposed_mission,
        human_owner_role=human_owner_role,
        requested_workspaces=requested_workspaces,
        work_objects=work_objects,
        requested_inputs_tools=requested_inputs_tools,
        requested_action_types=requested_action_types,
        requested_skills=requested_skills,
        expected_outputs=expected_outputs,
        requested_authority_ceiling=requested_authority,
        stop_conditions=stop_conditions,
        success_metrics=success_metrics,
        proposed_eval_cases=proposed_eval_cases,
        requested_by=requested_by,
    )


def _validate_narrow_access_request(
    *,
    target_agent: AssistantAgent,
    requested_workspaces: list[str],
    requested_inputs_tools: list[str],
    requested_action_types: list[str],
    requested_skills: list[str],
    requested_authority: str,
) -> list[str]:
    errors: list[str] = []

    current_workspaces = set(target_agent.allowed_workspaces or [])
    current_tools = set(target_agent.allowed_tools or [])
    current_actions = set(target_agent.allowed_action_types or [])
    current_skills = set(target_agent.skills or [])

    if not set(requested_workspaces).issubset(current_workspaces):
        errors.append("Narrow access requests can only keep or remove currently allowed workspaces.")
    if not requested_workspaces:
        errors.append("Narrow access requests must keep at least one workspace.")
    if not set(requested_inputs_tools).issubset(current_tools):
        errors.append("Narrow access requests can only keep or remove currently allowed live tools.")
    if not set(requested_action_types).issubset(current_actions):
        errors.append("Narrow access requests can only keep or remove currently allowed governed actions.")
    if not set(requested_skills).issubset(current_skills):
        errors.append("Narrow access requests can only keep or remove currently pinned skills.")

    current_authority = target_agent.authority_ceiling or "DRAFT"
    if _authority_rank(requested_authority) > _authority_rank(current_authority):
        errors.append("Narrow access requests cannot raise the current authority ceiling.")
    if _authority_rank(requested_authority) < _authority_rank("STAGE") and requested_action_types:
        errors.append("Narrow access requests below STAGE authority cannot keep governed action types.")

    narrowed = (
        len(requested_workspaces) < len(target_agent.allowed_workspaces or [])
        or len(requested_inputs_tools) < len(target_agent.allowed_tools or [])
        or len(requested_action_types) < len(target_agent.allowed_action_types or [])
        or len(requested_skills) < len(target_agent.skills or [])
        or _authority_rank(requested_authority) < _authority_rank(current_authority)
    )
    if not narrowed:
        errors.append(
            "Narrow access requests must reduce at least one workspace, tool, action, skill, or authority boundary."
        )

    return errors


def _authority_rank(value: str) -> int:
    return _AUTHORITY_LEVEL_RANK.get(value.strip().upper(), _AUTHORITY_LEVEL_RANK["DRAFT"])
