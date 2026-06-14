from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.assistant.services.agent_revisions import has_unpublished_agent_revision
from apps.api.app.domains.assistant.services.policies import build_effective_policy_for_agent
from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype, resolved_role_default_tools
from apps.api.app.domains.assistant.services.skills import INTER_AGENT_CONSULTATION_SKILL
from apps.api.app.domains.assistant.services.tools import augment_managed_agent_introspection_tools
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import (
    AssistantAgentAdminOut,
    AssistantAgentEvalGateOut,
    AssistantAgentOut,
    AssistantAgentTokenBudgetOut,
    AssistantTokenUsageBucketOut,
    AssistantTokenUsageSummaryOut,
    AssistantTokenUsageTrackerOut,
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
    role_key: str | None
    profile_kind: str
    specialization_summary: str | None
    human_owner_role: str | None
    authority_ceiling: str | None
    activation_notes: str | None
    orchestration_pattern: str
    parent_agent_id: str | None
    managed_agent_ids: tuple[str, ...]
    delegation_guidance: str | None
    allowed_workspaces: tuple[AssistantWorkspace, ...]
    capabilities: tuple[str, ...]
    skills: tuple[str, ...]
    allowed_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]
    system_prompt: str


@dataclass
class _TokenUsageTotals:
    input_tokens: int = 0
    output_tokens: int = 0
    recorded_run_count: int = 0
    managed_agent_tokens: int = 0
    unassigned_tokens: int = 0

    @property
    def used_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


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


def summarize_assistant_token_usage(db: Session) -> AssistantTokenUsageSummaryOut:
    window_start, reset_at = _current_budget_window()
    token_total = func.coalesce(AssistantRun.input_tokens, 0) + func.coalesce(AssistantRun.output_tokens, 0)
    input_total = func.coalesce(func.sum(func.coalesce(AssistantRun.input_tokens, 0)), 0)
    output_total = func.coalesce(func.sum(func.coalesce(AssistantRun.output_tokens, 0)), 0)
    managed_total = func.coalesce(
        func.sum(
            case(
                (AssistantRun.agent_id.is_not(None), token_total),
                else_=0,
            )
        ),
        0,
    )
    unassigned_total = func.coalesce(
        func.sum(
            case(
                (AssistantRun.agent_id.is_(None), token_total),
                else_=0,
            )
        ),
        0,
    )

    row = db.execute(
        select(
            input_total,
            output_total,
            func.count(AssistantRun.id),
            managed_total,
            unassigned_total,
        ).where(
            AssistantRun.created_at >= window_start,
            AssistantRun.status == "COMPLETED",
        )
    ).one()
    input_tokens = int(row[0] or 0)
    output_tokens = int(row[1] or 0)
    managed_agent_tokens = int(row[3] or 0)
    unassigned_tokens = int(row[4] or 0)
    return AssistantTokenUsageSummaryOut(
        used_tokens=input_tokens + output_tokens,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        recorded_run_count=int(row[2] or 0),
        managed_agent_tokens=managed_agent_tokens,
        unassigned_tokens=unassigned_tokens,
        window_started_at=window_start,
        reset_at=reset_at,
    )


def summarize_assistant_token_usage_tracker(
    db: Session,
    *,
    now: datetime | None = None,
) -> AssistantTokenUsageTrackerOut:
    generated_at = _as_utc_datetime(now or datetime.now(timezone.utc))
    today_start = _start_of_day(generated_at)
    current_week_start = _start_of_week(generated_at)
    current_month_start = _start_of_month(generated_at)

    daily_starts = [today_start - timedelta(days=offset) for offset in range(13, -1, -1)]
    weekly_starts = [current_week_start - timedelta(weeks=offset) for offset in range(7, -1, -1)]
    monthly_starts = [_add_months(current_month_start, -offset) for offset in range(11, -1, -1)]
    earliest_start = min(daily_starts[0], weekly_starts[0], monthly_starts[0])

    rows = db.execute(
        select(
            AssistantRun.created_at,
            AssistantRun.input_tokens,
            AssistantRun.output_tokens,
            AssistantRun.agent_id,
        ).where(
            AssistantRun.created_at >= earliest_start,
            AssistantRun.created_at <= generated_at,
            AssistantRun.status == "COMPLETED",
        )
    ).all()

    return AssistantTokenUsageTrackerOut(
        generated_at=generated_at,
        timezone="UTC",
        daily=_build_usage_buckets(
            period="day",
            starts=daily_starts,
            next_start=lambda value: value + timedelta(days=1),
            rows=rows,
        ),
        weekly=_build_usage_buckets(
            period="week",
            starts=weekly_starts,
            next_start=lambda value: value + timedelta(weeks=1),
            rows=rows,
        ),
        monthly=_build_usage_buckets(
            period="month",
            starts=monthly_starts,
            next_start=lambda value: _add_months(value, 1),
            rows=rows,
        ),
    )


def to_public_agent_out(
    record: AssistantAgent,
    *,
    token_budget: AssistantAgentTokenBudgetOut | None = None,
    eval_gate: AssistantAgentEvalGateOut | None = None,
) -> AssistantAgentOut:
    effective_skills, effective_allowed_tools = _resolve_effective_agent_profile(record)
    return AssistantAgentOut(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        role_key=record.role_key,
        profile_kind=record.profile_kind or "CUSTOM",
        specialization_summary=record.specialization_summary,
        human_owner_role=record.human_owner_role,
        authority_ceiling=record.authority_ceiling,
        activation_notes=record.activation_notes,
        orchestration_pattern=record.orchestration_pattern or "SINGLE",
        parent_agent_id=record.parent_agent_id,
        managed_agent_ids=list(record.managed_agent_ids or []),
        delegation_guidance=record.delegation_guidance,
        profile_request_id=record.profile_request_id,
        allowed_workspaces=list(record.allowed_workspaces or []),
        capabilities=list(record.capabilities or []),
        skills=list(effective_skills),
        allowed_tools=list(effective_allowed_tools),
        allowed_action_types=list(record.allowed_action_types or []),
        daily_token_allocation=record.daily_token_allocation,
        token_budget=token_budget or _build_empty_token_budget(record),
        effective_policy=build_effective_policy_for_agent(to_managed_agent(record)),
        eval_gate=eval_gate,
    )


def to_admin_agent_out(
    record: AssistantAgent,
    *,
    token_budget: AssistantAgentTokenBudgetOut | None = None,
    eval_gate: AssistantAgentEvalGateOut | None = None,
) -> AssistantAgentAdminOut:
    effective_skills, effective_allowed_tools = _resolve_effective_agent_profile(record)
    return AssistantAgentAdminOut(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        role_key=record.role_key,
        profile_kind=record.profile_kind or "CUSTOM",
        specialization_summary=record.specialization_summary,
        human_owner_role=record.human_owner_role,
        authority_ceiling=record.authority_ceiling,
        activation_notes=record.activation_notes,
        orchestration_pattern=record.orchestration_pattern or "SINGLE",
        parent_agent_id=record.parent_agent_id,
        managed_agent_ids=list(record.managed_agent_ids or []),
        delegation_guidance=record.delegation_guidance,
        profile_request_id=record.profile_request_id,
        allowed_workspaces=list(record.allowed_workspaces or []),
        capabilities=list(record.capabilities or []),
        skills=list(effective_skills),
        allowed_tools=list(effective_allowed_tools),
        allowed_action_types=list(record.allowed_action_types or []),
        daily_token_allocation=record.daily_token_allocation,
        token_budget=token_budget or _build_empty_token_budget(record),
        effective_policy=build_effective_policy_for_agent(to_managed_agent(record)),
        eval_gate=eval_gate,
        system_prompt=record.system_prompt,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        latest_revision_id=record.latest_revision_id,
        published_revision_id=record.published_revision_id,
        published_at=record.published_at,
        published_by=record.published_by,
        has_unpublished_revision=has_unpublished_agent_revision(record),
    )


def to_managed_agent(record: AssistantAgent) -> ManagedAssistantAgent:
    effective_skills, effective_allowed_tools = _resolve_effective_agent_profile(record)
    return ManagedAssistantAgent(
        agent_id=record.agent_id,
        name=record.name,
        description=record.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        role_key=record.role_key,
        profile_kind=record.profile_kind or "CUSTOM",
        specialization_summary=record.specialization_summary,
        human_owner_role=record.human_owner_role,
        authority_ceiling=record.authority_ceiling,
        activation_notes=record.activation_notes,
        orchestration_pattern=record.orchestration_pattern or "SINGLE",
        parent_agent_id=record.parent_agent_id,
        managed_agent_ids=tuple(record.managed_agent_ids or []),
        delegation_guidance=record.delegation_guidance,
        allowed_workspaces=tuple(record.allowed_workspaces or []),
        capabilities=tuple(record.capabilities or []),
        skills=effective_skills,
        allowed_tools=effective_allowed_tools,
        allowed_action_types=tuple(record.allowed_action_types or []),
        system_prompt=record.system_prompt,
    )


def _resolve_effective_agent_profile(record: AssistantAgent) -> tuple[tuple[str, ...], tuple[str, ...]]:
    role = get_role_archetype(record.role_key) if record.role_key else None
    effective_skills = tuple(record.skills or [])
    if not effective_skills and role is not None:
        effective_skills = tuple(role.skills)

    effective_allowed_tools = tuple(record.allowed_tools or [])
    normalized_capabilities = {str(capability).upper() for capability in record.capabilities or []}
    if role is not None and (record.profile_kind or "CUSTOM").upper() == "ROLE_DERIVED":
        if not effective_allowed_tools and "READ" in normalized_capabilities:
            effective_allowed_tools = tuple(resolved_role_default_tools(role))
        elif INTER_AGENT_CONSULTATION_SKILL in set(effective_skills):
            next_allowed_tools = list(effective_allowed_tools)
            for tool_name in ("consult_managed_agent", "enlist_managed_agent"):
                if tool_name not in set(next_allowed_tools):
                    next_allowed_tools.append(tool_name)
            effective_allowed_tools = tuple(next_allowed_tools)

    effective_allowed_tools = augment_managed_agent_introspection_tools(
        effective_allowed_tools,
        capabilities=tuple(record.capabilities or ()),
    )

    return effective_skills, effective_allowed_tools


def _build_usage_buckets(
    *,
    period: str,
    starts: list[datetime],
    next_start,
    rows,
) -> list[AssistantTokenUsageBucketOut]:
    totals_by_start = {start: _TokenUsageTotals() for start in starts}
    ranges = [(start, next_start(start)) for start in starts]

    for created_at, input_tokens, output_tokens, agent_id in rows:
        created_at_utc = _as_utc_datetime(created_at)
        for bucket_start, bucket_end in ranges:
            if bucket_start <= created_at_utc < bucket_end:
                _add_run_to_usage_totals(
                    totals_by_start[bucket_start],
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    agent_id=agent_id,
                )
                break

    return [
        AssistantTokenUsageBucketOut(
            period=period,
            bucket_started_at=start,
            bucket_ended_at=end,
            used_tokens=totals_by_start[start].used_tokens,
            input_tokens=totals_by_start[start].input_tokens,
            output_tokens=totals_by_start[start].output_tokens,
            recorded_run_count=totals_by_start[start].recorded_run_count,
            managed_agent_tokens=totals_by_start[start].managed_agent_tokens,
            unassigned_tokens=totals_by_start[start].unassigned_tokens,
        )
        for start, end in ranges
    ]


def _add_run_to_usage_totals(
    totals: _TokenUsageTotals,
    *,
    input_tokens: int | None,
    output_tokens: int | None,
    agent_id: str | None,
) -> None:
    input_total = int(input_tokens or 0)
    output_total = int(output_tokens or 0)
    used_total = input_total + output_total
    totals.input_tokens += input_total
    totals.output_tokens += output_total
    totals.recorded_run_count += 1
    if agent_id is None:
        totals.unassigned_tokens += used_total
    else:
        totals.managed_agent_tokens += used_total


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _start_of_day(value: datetime) -> datetime:
    return _as_utc_datetime(value).replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_week(value: datetime) -> datetime:
    day_start = _start_of_day(value)
    return day_start - timedelta(days=day_start.weekday())


def _start_of_month(value: datetime) -> datetime:
    return _start_of_day(value).replace(day=1)


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    return value.replace(year=value.year + month_index // 12, month=month_index % 12 + 1, day=1)


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
