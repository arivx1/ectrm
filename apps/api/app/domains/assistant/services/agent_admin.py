from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.agent_evals import seed_agent_evals_from_profile_request
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.domains.assistant.services.policies import (
    AssistantAgentProfilePolicyError,
    resolve_agent_profile_policy_defaults,
    validate_agent_profile_definition,
)
from apps.api.app.domains.assistant.services.profile_requests import validate_agent_activation_requirements
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.schemas.assistant import (
    AssistantAgentCreate,
    AssistantAgentUpdate,
)


@dataclass(frozen=True)
class AssistantAgentMutationInput:
    agent_id: str
    name: str
    description: str
    status: str
    scope: str
    provider: str | None
    model: str | None
    allowed_workspaces: tuple[str, ...]
    capabilities: tuple[str, ...]
    allowed_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]
    system_prompt: str
    role_key: str | None = None
    profile_kind: str = "CUSTOM"
    specialization_summary: str | None = None
    human_owner_role: str | None = None
    authority_ceiling: str | None = None
    activation_notes: str | None = None
    profile_request_id: int | None = None
    daily_token_allocation: int | None = None


@dataclass(frozen=True)
class AssistantAgentMutationResult:
    record: AssistantAgent
    created: bool
    updated: bool


def create_admin_assistant_agent(
    db: Session,
    payload: AssistantAgentCreate,
) -> AssistantAgent:
    result = upsert_admin_assistant_agent(
        db,
        definition=_definition_from_create(payload),
        actor_id=payload.created_by,
        on_missing="create",
        on_existing="error",
        touch_existing=False,
        commit=True,
        record_provenance=True,
    )
    return result.record


def update_admin_assistant_agent(
    db: Session,
    *,
    agent_id: str,
    payload: AssistantAgentUpdate,
) -> AssistantAgent:
    result = upsert_admin_assistant_agent(
        db,
        definition=_definition_from_update(agent_id=agent_id, payload=payload),
        actor_id=payload.updated_by,
        on_missing="error",
        on_existing="update",
        touch_existing=True,
        commit=True,
        record_provenance=True,
    )
    return result.record


def upsert_admin_assistant_agent(
    db: Session,
    *,
    definition: AssistantAgentMutationInput,
    actor_id: str,
    on_missing: Literal["create", "error"],
    on_existing: Literal["update", "error"],
    touch_existing: bool,
    commit: bool,
    record_provenance: bool = False,
) -> AssistantAgentMutationResult:
    _validate_agent_policy_definition(definition)
    _validate_agent_daily_token_allocation(definition)
    now = datetime.now(timezone.utc)
    record = db.get(AssistantAgent, definition.agent_id)
    if record is None:
        if on_missing == "error":
            raise AssistantServiceError(status_code=404, detail=f"Assistant agent '{definition.agent_id}' was not found.")
        record = AssistantAgent(
            agent_id=definition.agent_id,
            name=definition.name,
            description=definition.description,
            status=definition.status,
            scope=definition.scope,
            provider=definition.provider,
            model=definition.model,
            role_key=definition.role_key,
            profile_kind=definition.profile_kind,
            specialization_summary=definition.specialization_summary,
            human_owner_role=definition.human_owner_role,
            authority_ceiling=definition.authority_ceiling,
            activation_notes=definition.activation_notes,
            profile_request_id=definition.profile_request_id,
            allowed_workspaces=list(definition.allowed_workspaces),
            capabilities=list(definition.capabilities),
            allowed_tools=list(definition.allowed_tools),
            allowed_action_types=list(definition.allowed_action_types),
            daily_token_allocation=definition.daily_token_allocation,
            system_prompt=definition.system_prompt,
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
        )
        db.add(record)
        db.flush()
        _seed_profile_request_evals_for_agent(db, record=record, actor_id=actor_id)
        _validate_agent_activation_definition(db, definition)
        if record_provenance:
            _record_agent_provenance(db, record=record, operation_key="assistant_agent.created", action="created")
        if commit:
            db.commit()
            db.refresh(record)
        return AssistantAgentMutationResult(record=record, created=True, updated=False)

    if on_existing == "error":
        raise AssistantServiceError(
            status_code=409,
            detail=f"Assistant agent '{definition.agent_id}' already exists.",
        )

    old_status = record.status
    changed = _apply_agent_definition(record, definition=definition)
    if changed or touch_existing:
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1
        db.flush()
        _seed_profile_request_evals_for_agent(db, record=record, actor_id=actor_id)
        _validate_agent_activation_definition(db, definition)
        if record_provenance:
            _record_agent_provenance(
                db,
                record=record,
                operation_key=_agent_status_operation_key(old_status=old_status, new_status=record.status),
                action=record.status.lower() if old_status != record.status else "updated",
            )
        if commit:
            db.commit()
            db.refresh(record)
        return AssistantAgentMutationResult(record=record, created=False, updated=True)

    db.flush()
    _seed_profile_request_evals_for_agent(db, record=record, actor_id=actor_id)
    _validate_agent_activation_definition(db, definition)
    if commit:
        db.commit()
        db.refresh(record)
    return AssistantAgentMutationResult(record=record, created=False, updated=False)


def _definition_from_create(payload: AssistantAgentCreate) -> AssistantAgentMutationInput:
    capabilities = tuple(payload.capabilities)
    defaults = resolve_agent_profile_policy_defaults(
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        capabilities=capabilities,
        allowed_tools=tuple(payload.allowed_tools),
        allowed_action_types=tuple(payload.allowed_action_types),
    )
    return AssistantAgentMutationInput(
        agent_id=payload.agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        specialization_summary=payload.specialization_summary,
        human_owner_role=payload.human_owner_role,
        authority_ceiling=payload.authority_ceiling,
        activation_notes=payload.activation_notes,
        profile_request_id=payload.profile_request_id,
        allowed_workspaces=tuple(payload.allowed_workspaces),
        capabilities=capabilities,
        allowed_tools=defaults.allowed_tools,
        allowed_action_types=defaults.allowed_action_types,
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
    )


def _definition_from_update(
    *,
    agent_id: str,
    payload: AssistantAgentUpdate,
) -> AssistantAgentMutationInput:
    capabilities = tuple(payload.capabilities)
    defaults = resolve_agent_profile_policy_defaults(
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        capabilities=capabilities,
        allowed_tools=tuple(payload.allowed_tools),
        allowed_action_types=tuple(payload.allowed_action_types),
    )
    return AssistantAgentMutationInput(
        agent_id=agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        specialization_summary=payload.specialization_summary,
        human_owner_role=payload.human_owner_role,
        authority_ceiling=payload.authority_ceiling,
        activation_notes=payload.activation_notes,
        profile_request_id=payload.profile_request_id,
        allowed_workspaces=tuple(payload.allowed_workspaces),
        capabilities=capabilities,
        allowed_tools=defaults.allowed_tools,
        allowed_action_types=defaults.allowed_action_types,
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
    )


def _validate_agent_policy_definition(definition: AssistantAgentMutationInput) -> None:
    try:
        validate_agent_profile_definition(
            agent_name=definition.name,
            role_key=definition.role_key,
            profile_kind=definition.profile_kind,
            scope=definition.scope,
            allowed_workspaces=definition.allowed_workspaces,
            capabilities=definition.capabilities,
            allowed_tools=definition.allowed_tools,
            allowed_action_types=definition.allowed_action_types,
            authority_ceiling=definition.authority_ceiling,
        )
    except AssistantAgentProfilePolicyError as exc:
        raise AssistantServiceError(
            status_code=422,
            detail=str(exc),
        ) from exc


def _validate_agent_activation_definition(db: Session, definition: AssistantAgentMutationInput) -> None:
    validate_agent_activation_requirements(
        db,
        agent_id=definition.agent_id,
        agent_name=definition.name,
        status=definition.status,
        profile_kind=definition.profile_kind,
        role_key=definition.role_key,
        profile_request_id=definition.profile_request_id,
        human_owner_role=definition.human_owner_role,
        authority_ceiling=definition.authority_ceiling,
        activation_notes=definition.activation_notes,
        capabilities=definition.capabilities,
        allowed_action_types=definition.allowed_action_types,
    )


def _validate_agent_daily_token_allocation(definition: AssistantAgentMutationInput) -> None:
    if definition.daily_token_allocation is not None and definition.daily_token_allocation < 0:
        raise AssistantServiceError(
            status_code=422,
            detail="daily_token_allocation must be greater than or equal to 0",
        )


def _seed_profile_request_evals_for_agent(
    db: Session,
    *,
    record: AssistantAgent,
    actor_id: str,
) -> None:
    if record.profile_request_id is None:
        return
    profile_request = db.get(AssistantAgentProfileRequest, record.profile_request_id)
    if profile_request is None or profile_request.status not in {"APPROVED", "ACTIVATED"}:
        return
    seed_agent_evals_from_profile_request(
        db,
        agent=record,
        profile_request=profile_request,
        actor_id=actor_id,
    )


def _apply_agent_definition(
    record: AssistantAgent,
    *,
    definition: AssistantAgentMutationInput,
) -> bool:
    next_values = {
        "name": definition.name,
        "description": definition.description,
        "status": definition.status,
        "scope": definition.scope,
        "provider": definition.provider,
        "model": definition.model,
        "role_key": definition.role_key,
        "profile_kind": definition.profile_kind,
        "specialization_summary": definition.specialization_summary,
        "human_owner_role": definition.human_owner_role,
        "authority_ceiling": definition.authority_ceiling,
        "activation_notes": definition.activation_notes,
        "profile_request_id": definition.profile_request_id,
        "allowed_workspaces": list(definition.allowed_workspaces),
        "capabilities": list(definition.capabilities),
        "allowed_tools": list(definition.allowed_tools),
        "allowed_action_types": list(definition.allowed_action_types),
        "daily_token_allocation": definition.daily_token_allocation,
        "system_prompt": definition.system_prompt,
    }
    changed = False
    for field_name, next_value in next_values.items():
        if getattr(record, field_name) != next_value:
            setattr(record, field_name, next_value)
            changed = True
    return changed


def _record_agent_provenance(
    db: Session,
    *,
    record: AssistantAgent,
    operation_key: str,
    action: str,
) -> None:
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.agents",
        affected_records=[
            {
                "record_type": "assistant_agent",
                "record_id": record.agent_id,
                "action": action,
                "label": record.name,
            }
        ],
        details={
            "agent_id": record.agent_id,
            "role_key": record.role_key,
            "profile_kind": record.profile_kind,
            "profile_request_id": record.profile_request_id,
            "workspace_count": len(record.allowed_workspaces or []),
            "capability_count": len(record.capabilities or []),
            "tool_count": len(record.allowed_tools or []),
            "action_type_count": len(record.allowed_action_types or []),
        },
    )


def _agent_status_operation_key(*, old_status: str, new_status: str) -> str:
    if old_status != new_status:
        if new_status == "ACTIVE":
            return "assistant_agent.activated"
        if new_status == "PAUSED":
            return "assistant_agent.paused"
        if new_status == "RETIRED":
            return "assistant_agent.retired"
    return "assistant_agent.updated"
