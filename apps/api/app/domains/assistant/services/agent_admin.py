from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.domains.assistant.services.tools import list_tool_names
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
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
    _validate_agent_definition(definition)
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

    changed = _apply_agent_definition(record, definition=definition)
    if changed or touch_existing:
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1
        db.flush()
        if record_provenance:
            _record_agent_provenance(db, record=record, operation_key="assistant_agent.updated", action="updated")
        if commit:
            db.commit()
            db.refresh(record)
        return AssistantAgentMutationResult(record=record, created=False, updated=True)

    db.flush()
    if commit:
        db.commit()
        db.refresh(record)
    return AssistantAgentMutationResult(record=record, created=False, updated=False)


def _definition_from_create(payload: AssistantAgentCreate) -> AssistantAgentMutationInput:
    capabilities = tuple(payload.capabilities)
    return AssistantAgentMutationInput(
        agent_id=payload.agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        allowed_workspaces=tuple(payload.allowed_workspaces),
        capabilities=capabilities,
        allowed_tools=_default_tools(tuple(payload.allowed_tools)),
        allowed_action_types=_default_actions(tuple(payload.allowed_action_types), capabilities=capabilities),
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
    )


def _definition_from_update(
    *,
    agent_id: str,
    payload: AssistantAgentUpdate,
) -> AssistantAgentMutationInput:
    capabilities = tuple(payload.capabilities)
    return AssistantAgentMutationInput(
        agent_id=agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        allowed_workspaces=tuple(payload.allowed_workspaces),
        capabilities=capabilities,
        allowed_tools=_default_tools(tuple(payload.allowed_tools)),
        allowed_action_types=_default_actions(tuple(payload.allowed_action_types), capabilities=capabilities),
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
    )


def _default_tools(allowed_tools: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(allowed_tools) if allowed_tools else tuple(list_tool_names())


def _default_actions(
    allowed_action_types: tuple[str, ...],
    *,
    capabilities: tuple[str, ...],
) -> tuple[str, ...]:
    if allowed_action_types:
        return tuple(allowed_action_types)
    if "ACTION" in {capability.upper() for capability in capabilities}:
        return tuple(ALL_ASSISTANT_ACTION_TYPES)
    return ()


def _validate_agent_definition(definition: AssistantAgentMutationInput) -> None:
    capabilities = {capability.upper() for capability in definition.capabilities}
    if definition.allowed_action_types and "ACTION" not in capabilities:
        raise AssistantServiceError(
            status_code=422,
            detail="allowed_action_types can only be set for agents with the ACTION capability",
        )
    if definition.daily_token_allocation is not None and definition.daily_token_allocation < 0:
        raise AssistantServiceError(
            status_code=422,
            detail="daily_token_allocation must be greater than or equal to 0",
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
            "workspace_count": len(record.allowed_workspaces or []),
            "capability_count": len(record.capabilities or []),
            "tool_count": len(record.allowed_tools or []),
            "action_type_count": len(record.allowed_action_types or []),
        },
    )
