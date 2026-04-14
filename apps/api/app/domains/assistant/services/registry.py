from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.schemas.assistant import AssistantAgentAdminOut, AssistantAgentOut, AssistantWorkspace

ACTIVE_ASSISTANT_AGENT_STATUS = "ACTIVE"


@dataclass(frozen=True)
class ManagedAssistantAgent:
    agent_id: str
    name: str
    description: str
    status: str
    scope: str
    provider: str | None
    model: str | None
    allowed_workspaces: tuple[AssistantWorkspace, ...]
    capabilities: tuple[str, ...]
    allowed_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]
    system_prompt: str


def list_public_agent_records(db: Session) -> list[AssistantAgent]:
    stmt = (
        select(AssistantAgent)
        .where(AssistantAgent.status == ACTIVE_ASSISTANT_AGENT_STATUS)
        .order_by(AssistantAgent.name.asc())
    )
    return db.execute(stmt).scalars().all()


def list_admin_agent_records(db: Session) -> list[AssistantAgent]:
    stmt = select(AssistantAgent).order_by(AssistantAgent.name.asc())
    return db.execute(stmt).scalars().all()


def get_agent_record(db: Session, agent_id: str) -> AssistantAgent | None:
    return db.get(AssistantAgent, agent_id)


def to_public_agent_out(record: AssistantAgent) -> AssistantAgentOut:
    return AssistantAgentOut(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        allowed_workspaces=list(record.allowed_workspaces or []),
        capabilities=list(record.capabilities or []),
        allowed_tools=list(record.allowed_tools or []),
        allowed_action_types=list(record.allowed_action_types or []),
    )


def to_admin_agent_out(record: AssistantAgent) -> AssistantAgentAdminOut:
    return AssistantAgentAdminOut(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        allowed_workspaces=list(record.allowed_workspaces or []),
        capabilities=list(record.capabilities or []),
        allowed_tools=list(record.allowed_tools or []),
        allowed_action_types=list(record.allowed_action_types or []),
        system_prompt=record.system_prompt,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def to_managed_agent(record: AssistantAgent) -> ManagedAssistantAgent:
    return ManagedAssistantAgent(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        allowed_workspaces=tuple(record.allowed_workspaces or []),
        capabilities=tuple(record.capabilities or []),
        allowed_tools=tuple(record.allowed_tools or []),
        allowed_action_types=tuple(record.allowed_action_types or []),
        system_prompt=record.system_prompt,
    )
