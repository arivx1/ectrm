from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import (
    AssistantAgentAdminOut,
    AssistantAgentOut,
    AssistantAgentTokenBudgetOut,
    AssistantWorkspace,
)

ACTIVE_ASSISTANT_AGENT_STATUS = "ACTIVE"
TOKEN_BUDGET_WARNING_THRESHOLD_PERCENT = 80.0


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


def summarize_agent_token_budgets(
    db: Session,
    records: list[AssistantAgent],
) -> dict[str, AssistantAgentTokenBudgetOut]:
    if not records:
        return {}

    window_start, reset_at = _current_budget_window()
    agent_ids = [record.agent_id for record in records]
    usage_by_agent_id = _load_agent_token_usage(db, agent_ids=agent_ids, window_start=window_start)
    return {
        record.agent_id: _build_token_budget(
            usage_by_agent_id.get(record.agent_id, 0),
            allocation=record.daily_token_allocation,
            window_started_at=window_start,
            reset_at=reset_at,
        )
        for record in records
    }


def summarize_agent_token_budget(db: Session, record: AssistantAgent) -> AssistantAgentTokenBudgetOut:
    window_start, reset_at = _current_budget_window()
    return summarize_agent_token_budgets(db, [record]).get(record.agent_id) or _build_token_budget(
        0,
        allocation=record.daily_token_allocation,
        window_started_at=window_start,
        reset_at=reset_at,
    )


def to_public_agent_out(
    record: AssistantAgent,
    *,
    token_budget: AssistantAgentTokenBudgetOut | None = None,
) -> AssistantAgentOut:
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
        daily_token_allocation=record.daily_token_allocation,
        token_budget=token_budget or _build_empty_token_budget(record),
    )


def to_admin_agent_out(
    record: AssistantAgent,
    *,
    token_budget: AssistantAgentTokenBudgetOut | None = None,
) -> AssistantAgentAdminOut:
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
        daily_token_allocation=record.daily_token_allocation,
        token_budget=token_budget or _build_empty_token_budget(record),
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


def _current_budget_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(timezone.utc)
    window_start = current.astimezone(timezone.utc).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    return window_start, window_start + timedelta(days=1)


def _load_agent_token_usage(
    db: Session,
    *,
    agent_ids: list[str],
    window_start: datetime,
) -> dict[str, int]:
    token_total = func.coalesce(AssistantRun.input_tokens, 0) + func.coalesce(AssistantRun.output_tokens, 0)
    rows = db.execute(
        select(AssistantRun.agent_id, func.coalesce(func.sum(token_total), 0))
        .where(
            AssistantRun.agent_id.in_(agent_ids),
            AssistantRun.created_at >= window_start,
            AssistantRun.status == "COMPLETED",
        )
        .group_by(AssistantRun.agent_id)
    ).all()
    return {
        str(agent_id): int(used_tokens or 0)
        for agent_id, used_tokens in rows
        if agent_id is not None
    }


def _build_empty_token_budget(record: AssistantAgent) -> AssistantAgentTokenBudgetOut:
    window_start, reset_at = _current_budget_window()
    return _build_token_budget(
        0,
        allocation=record.daily_token_allocation,
        window_started_at=window_start,
        reset_at=reset_at,
    )


def _build_token_budget(
    used_tokens: int,
    *,
    allocation: int | None,
    window_started_at: datetime,
    reset_at: datetime,
) -> AssistantAgentTokenBudgetOut:
    allocation_source = "AGENT" if allocation is not None else "DEFAULT"
    allocated_tokens = allocation if allocation is not None else settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION
    remaining_tokens = max(allocated_tokens - used_tokens, 0)
    percent_used = (
        100.0
        if allocated_tokens == 0
        else min(round((used_tokens / allocated_tokens) * 100, 1), 100.0)
    )
    if remaining_tokens == 0:
        status = "RED"
    elif percent_used >= TOKEN_BUDGET_WARNING_THRESHOLD_PERCENT:
        status = "AMBER"
    else:
        status = "GREEN"
    return AssistantAgentTokenBudgetOut(
        status=status,
        allocated_tokens=allocated_tokens,
        used_tokens=used_tokens,
        remaining_tokens=remaining_tokens,
        percent_used=percent_used,
        warning_threshold_percent=TOKEN_BUDGET_WARNING_THRESHOLD_PERCENT,
        allocation_source=allocation_source,
        window_started_at=window_started_at,
        reset_at=reset_at,
    )
