from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.domains.assistant.services.eval_gates import evaluate_agent_eval_gate
from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.schemas.assistant import (
    AssistantAgentProfileRequestActivation,
    AssistantAgentProfileRequestCreate,
    AssistantAgentProfileRequestDecision,
    AssistantAgentProfileRequestOut,
)


APPROVED_PROFILE_REQUEST_STATUSES = {"APPROVED", "ACTIVATED"}


def list_profile_requests(
    db: Session,
    *,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AssistantAgentProfileRequest]:
    stmt = select(AssistantAgentProfileRequest).order_by(
        AssistantAgentProfileRequest.updated_at.desc(),
        AssistantAgentProfileRequest.request_id.desc(),
    )
    if status:
        stmt = stmt.where(AssistantAgentProfileRequest.status == status.strip().upper())
    return list(db.scalars(stmt.offset(max(offset, 0)).limit(max(1, min(limit, 250)))).all())


def create_profile_request(
    db: Session,
    payload: AssistantAgentProfileRequestCreate,
) -> AssistantAgentProfileRequest:
    now = datetime.now(timezone.utc)
    record = AssistantAgentProfileRequest(
        status="REQUESTED",
        requested_agent_id=payload.requested_agent_id,
        business_problem=payload.business_problem,
        proposed_mission=payload.proposed_mission,
        human_owner_role=payload.human_owner_role,
        requested_workspaces=list(payload.requested_workspaces),
        work_objects=list(payload.work_objects),
        requested_inputs_tools=list(payload.requested_inputs_tools),
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
    now = datetime.now(timezone.utc)
    record.status = "ACTIVATED"
    record.linked_agent_id = payload.linked_agent_id
    record.activated_by = payload.activated_by
    record.activated_at = now
    record.updated_at = now
    db.flush()
    _record_profile_request_provenance(
        db,
        record=record,
        operation_key="assistant_agent_profile_request.activated",
        linked_agent_id=payload.linked_agent_id,
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
        requested_agent_id=record.requested_agent_id,
        business_problem=record.business_problem,
        proposed_mission=record.proposed_mission,
        human_owner_role=record.human_owner_role,
        requested_workspaces=list(record.requested_workspaces or []),
        work_objects=list(record.work_objects or []),
        requested_inputs_tools=list(record.requested_inputs_tools or []),
        expected_outputs=list(record.expected_outputs or []),
        requested_authority_ceiling=record.requested_authority_ceiling,
        stop_conditions=list(record.stop_conditions or []),
        success_metrics=list(record.success_metrics or []),
        proposed_eval_cases=list(record.proposed_eval_cases or []),
        approval_notes=record.approval_notes,
        rejection_reason=record.rejection_reason,
        linked_agent_id=record.linked_agent_id,
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
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.profile_requests",
        affected_records=affected_records,
        details={
            "request_id": record.request_id,
            "status": record.status,
            "requested_agent_id": record.requested_agent_id,
            "requested_authority_ceiling": record.requested_authority_ceiling,
            "workspace_count": len(record.requested_workspaces or []),
            "tool_count": len(record.requested_inputs_tools or []),
            "eval_case_count": len(record.proposed_eval_cases or []),
        },
    )
