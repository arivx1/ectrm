from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.eval_gates import build_agent_eval_gate
from apps.api.app.domains.assistant.services.policies import (
    AssistantAgentProfilePolicyError,
    validate_agent_profile_definition,
)
from apps.api.app.domains.assistant.services.registry import list_admin_agent_records
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_work_package import AssistantAgentWorkPackage
from apps.api.app.models.assistant_run import AssistantRun


TRUST_SIGNAL_MISSING_EVAL_COVERAGE = "MISSING_EVAL_COVERAGE"
TRUST_SIGNAL_POLICY_WARNING = "POLICY_WARNING"
TRUST_SIGNAL_RUN_WARNING = "RUN_WARNING"
TRUST_SIGNAL_ACTION_BACKLOG = "ACTION_BACKLOG"
TRUST_SIGNAL_FAILED_ACTIONS = "FAILED_ACTIONS"
TRUST_SIGNAL_STALE_WORK_PACKAGE = "STALE_WORK_PACKAGE"

STALE_WORK_PACKAGE_HOURS = 72.0


@dataclass(frozen=True)
class AssistantControlTowerAgentRosterSummary:
    total_count: int
    active_count: int
    draft_count: int
    paused_count: int
    retired_count: int
    action_capable_count: int
    missing_eval_coverage_count: int
    policy_warning_count: int


@dataclass(frozen=True)
class AssistantControlTowerRunSummary:
    total_count: int
    completed_count: int
    failed_count: int
    warning_count: int
    tool_call_count: int
    latest_run_at: datetime | None


@dataclass(frozen=True)
class AssistantControlTowerOldestPendingAction:
    action_request_id: int
    action_type: str
    summary: str
    agent_id: str | None
    agent_name: str | None
    user_id: str
    created_at: datetime
    age_seconds: float


@dataclass(frozen=True)
class AssistantControlTowerActionSummary:
    total_count: int
    pending_count: int
    failed_count: int
    rejected_count: int
    executed_count: int
    preview_blocked_count: int
    oldest_pending_action: AssistantControlTowerOldestPendingAction | None


@dataclass(frozen=True)
class AssistantControlTowerWorkPackageSummary:
    total_count: int
    accepted_count: int
    in_progress_count: int
    implemented_count: int
    dismissed_count: int
    stale_count: int
    stale_accepted_count: int
    stale_in_progress_count: int
    implemented_with_pr_count: int
    implemented_with_commit_count: int
    implemented_with_eval_count: int
    implemented_with_tests_count: int
    implemented_with_docs_count: int
    implemented_missing_evidence_count: int


@dataclass(frozen=True)
class AssistantControlTowerAgentTrustSignal:
    agent_id: str
    agent_name: str
    status: str
    role_key: str | None
    profile_kind: str | None
    signal_type: str
    severity: str
    summary: str
    details: tuple[str, ...]
    pending_action_count: int
    failed_action_count: int
    warning_run_count: int
    eval_status: str | None


@dataclass(frozen=True)
class AssistantControlTowerSummary:
    generated_at: datetime
    created_after: datetime | None
    created_before: datetime | None
    roster: AssistantControlTowerAgentRosterSummary
    runs: AssistantControlTowerRunSummary
    actions: AssistantControlTowerActionSummary
    work_packages: AssistantControlTowerWorkPackageSummary
    trust_signals: tuple[AssistantControlTowerAgentTrustSignal, ...]


@dataclass
class _AgentActivityCounters:
    pending_action_count: int = 0
    failed_action_count: int = 0
    warning_run_count: int = 0


@dataclass(frozen=True)
class _StaleWorkPackageReminder:
    work_package_id: str
    title: str
    status: str
    age_hours: float


def build_assistant_control_tower_summary(
    db: Session,
    *,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    now: datetime | None = None,
) -> AssistantControlTowerSummary:
    generated_at = _coerce_aware_datetime(now) or datetime.now(timezone.utc)
    agents = list_admin_agent_records(db)
    runs = _load_runs(db, created_after=created_after, created_before=created_before)
    actions = _load_action_requests(db, created_after=created_after, created_before=created_before)
    work_packages = _load_work_packages(db)
    activity_by_agent = _activity_by_agent(runs=runs, actions=actions)
    stale_work_packages_by_agent = _stale_work_packages_by_agent(work_packages, now=generated_at)

    missing_eval_agent_ids: set[str] = set()
    policy_warning_agent_ids: set[str] = set()
    trust_signals: list[AssistantControlTowerAgentTrustSignal] = []

    for agent in agents:
        eval_gate = build_agent_eval_gate(db, agent)
        counters = activity_by_agent.get(agent.agent_id, _AgentActivityCounters())
        if eval_gate.status == "BLOCKED":
            missing_eval_agent_ids.add(agent.agent_id)
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_MISSING_EVAL_COVERAGE,
                    severity="warning",
                    summary="Eval coverage is incomplete.",
                    details=tuple(eval_gate.missing_cases or eval_gate.notes),
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )

        policy_warning_details = _policy_warning_details(agent)
        if policy_warning_details:
            policy_warning_agent_ids.add(agent.agent_id)
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_POLICY_WARNING,
                    severity="danger",
                    summary="Policy definition needs review.",
                    details=policy_warning_details,
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )

        if counters.warning_run_count:
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_RUN_WARNING,
                    severity="warning",
                    summary=f"{counters.warning_run_count} run(s) emitted warnings.",
                    details=("Review warning details before increasing autonomy.",),
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )
        if counters.pending_action_count:
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_ACTION_BACKLOG,
                    severity="warning",
                    summary=f"{counters.pending_action_count} action request(s) are pending review.",
                    details=("Clear pending staged actions before considering broader authority.",),
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )
        if counters.failed_action_count:
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_FAILED_ACTIONS,
                    severity="danger",
                    summary=f"{counters.failed_action_count} action request(s) failed.",
                    details=("Failed action execution is a pause or narrowing signal until reviewed.",),
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )
        stale_work_packages = stale_work_packages_by_agent.get(agent.agent_id, ())
        if stale_work_packages:
            stale_in_progress_count = sum(
                1 for reminder in stale_work_packages if reminder.status == "IN_PROGRESS"
            )
            severity = "danger" if stale_in_progress_count else "warning"
            trust_signals.append(
                _agent_signal(
                    agent,
                    signal_type=TRUST_SIGNAL_STALE_WORK_PACKAGE,
                    severity=severity,
                    summary=(
                        f"{len(stale_work_packages)} work package(s) have gone stale without shipped evidence."
                    ),
                    details=_stale_work_package_details(stale_work_packages),
                    counters=counters,
                    eval_status=eval_gate.status,
                )
            )

    roster = _summarize_roster(
        agents,
        missing_eval_coverage_count=len(missing_eval_agent_ids),
        policy_warning_count=len(policy_warning_agent_ids),
    )
    return AssistantControlTowerSummary(
        generated_at=generated_at,
        created_after=created_after,
        created_before=created_before,
        roster=roster,
        runs=_summarize_runs(runs),
        actions=_summarize_actions(actions, now=generated_at),
        work_packages=_summarize_work_packages(work_packages, now=generated_at),
        trust_signals=tuple(sorted(trust_signals, key=_trust_signal_sort_key)),
    )


def _summarize_roster(
    agents: Iterable[AssistantAgent],
    *,
    missing_eval_coverage_count: int,
    policy_warning_count: int,
) -> AssistantControlTowerAgentRosterSummary:
    status_counts: dict[str, int] = {
        "ACTIVE": 0,
        "DRAFT": 0,
        "PAUSED": 0,
        "RETIRED": 0,
    }
    total_count = 0
    action_capable_count = 0
    for agent in agents:
        total_count += 1
        status = (agent.status or "").strip().upper()
        if status in status_counts:
            status_counts[status] += 1
        capabilities = {capability.strip().upper() for capability in agent.capabilities or []}
        if "ACTION" in capabilities or bool(agent.allowed_action_types):
            action_capable_count += 1

    return AssistantControlTowerAgentRosterSummary(
        total_count=total_count,
        active_count=status_counts["ACTIVE"],
        draft_count=status_counts["DRAFT"],
        paused_count=status_counts["PAUSED"],
        retired_count=status_counts["RETIRED"],
        action_capable_count=action_capable_count,
        missing_eval_coverage_count=missing_eval_coverage_count,
        policy_warning_count=policy_warning_count,
    )


def _summarize_runs(runs: Iterable[AssistantRun]) -> AssistantControlTowerRunSummary:
    total_count = 0
    completed_count = 0
    failed_count = 0
    warning_count = 0
    tool_call_count = 0
    latest_run_at: datetime | None = None
    for run in runs:
        total_count += 1
        if run.status == "COMPLETED":
            completed_count += 1
        elif run.status == "FAILED":
            failed_count += 1
        warning_count += len(run.warnings or [])
        tool_call_count += len(run.tool_calls or [])
        created_at = _coerce_aware_datetime(run.created_at)
        if created_at is not None and (latest_run_at is None or created_at > latest_run_at):
            latest_run_at = created_at

    return AssistantControlTowerRunSummary(
        total_count=total_count,
        completed_count=completed_count,
        failed_count=failed_count,
        warning_count=warning_count,
        tool_call_count=tool_call_count,
        latest_run_at=latest_run_at,
    )


def _summarize_actions(
    actions: Iterable[AssistantActionRequest],
    *,
    now: datetime,
) -> AssistantControlTowerActionSummary:
    total_count = 0
    pending_count = 0
    failed_count = 0
    rejected_count = 0
    executed_count = 0
    preview_blocked_count = 0
    oldest_pending: AssistantActionRequest | None = None

    for action in actions:
        total_count += 1
        if action.status == "PENDING":
            pending_count += 1
            if oldest_pending is None or action.created_at < oldest_pending.created_at:
                oldest_pending = action
        elif action.status == "FAILED":
            failed_count += 1
        elif action.status == "REJECTED":
            rejected_count += 1
        elif action.status == "EXECUTED":
            executed_count += 1
        if _action_preview_status(action) == "BLOCKED":
            preview_blocked_count += 1

    oldest_pending_action = None
    if oldest_pending is not None:
        created_at = _coerce_aware_datetime(oldest_pending.created_at) or oldest_pending.created_at
        oldest_pending_action = AssistantControlTowerOldestPendingAction(
            action_request_id=oldest_pending.id,
            action_type=oldest_pending.action_type,
            summary=oldest_pending.summary,
            agent_id=oldest_pending.agent_id,
            agent_name=oldest_pending.agent_name,
            user_id=oldest_pending.user_id,
            created_at=created_at,
            age_seconds=max((now - created_at).total_seconds(), 0),
        )

    return AssistantControlTowerActionSummary(
        total_count=total_count,
        pending_count=pending_count,
        failed_count=failed_count,
        rejected_count=rejected_count,
        executed_count=executed_count,
        preview_blocked_count=preview_blocked_count,
        oldest_pending_action=oldest_pending_action,
    )


def _load_work_packages(db: Session) -> list[AssistantAgentWorkPackage]:
    stmt = select(AssistantAgentWorkPackage).order_by(
        AssistantAgentWorkPackage.updated_at.desc(),
        AssistantAgentWorkPackage.id.desc(),
    )
    return list(db.scalars(stmt).all())


def _summarize_work_packages(
    work_packages: Iterable[AssistantAgentWorkPackage],
    *,
    now: datetime,
) -> AssistantControlTowerWorkPackageSummary:
    total_count = 0
    accepted_count = 0
    in_progress_count = 0
    implemented_count = 0
    dismissed_count = 0
    stale_count = 0
    stale_accepted_count = 0
    stale_in_progress_count = 0
    implemented_with_pr_count = 0
    implemented_with_commit_count = 0
    implemented_with_eval_count = 0
    implemented_with_tests_count = 0
    implemented_with_docs_count = 0
    implemented_missing_evidence_count = 0

    for record in work_packages:
        total_count += 1
        status = (record.status or "").strip().upper()
        if status == "ACCEPTED":
            accepted_count += 1
        elif status == "IN_PROGRESS":
            in_progress_count += 1
        elif status == "IMPLEMENTED":
            implemented_count += 1
        elif status == "DISMISSED":
            dismissed_count += 1

        if _is_stale_open_work_package(record, now=now):
            stale_count += 1
            if status == "ACCEPTED":
                stale_accepted_count += 1
            elif status == "IN_PROGRESS":
                stale_in_progress_count += 1

        if status != "IMPLEMENTED":
            continue

        has_pr, has_commit, has_eval, has_tests, has_docs = _work_package_evidence_flags(record)

        implemented_with_pr_count += int(has_pr)
        implemented_with_commit_count += int(has_commit)
        implemented_with_eval_count += int(has_eval)
        implemented_with_tests_count += int(has_tests)
        implemented_with_docs_count += int(has_docs)
        if not any((has_pr, has_commit, has_eval, has_tests, has_docs)):
            implemented_missing_evidence_count += 1

    return AssistantControlTowerWorkPackageSummary(
        total_count=total_count,
        accepted_count=accepted_count,
        in_progress_count=in_progress_count,
        implemented_count=implemented_count,
        dismissed_count=dismissed_count,
        stale_count=stale_count,
        stale_accepted_count=stale_accepted_count,
        stale_in_progress_count=stale_in_progress_count,
        implemented_with_pr_count=implemented_with_pr_count,
        implemented_with_commit_count=implemented_with_commit_count,
        implemented_with_eval_count=implemented_with_eval_count,
        implemented_with_tests_count=implemented_with_tests_count,
        implemented_with_docs_count=implemented_with_docs_count,
        implemented_missing_evidence_count=implemented_missing_evidence_count,
    )


def _activity_by_agent(
    *,
    runs: Iterable[AssistantRun],
    actions: Iterable[AssistantActionRequest],
) -> dict[str, _AgentActivityCounters]:
    activity: dict[str, _AgentActivityCounters] = {}
    for run in runs:
        if not run.agent_id:
            continue
        counters = activity.setdefault(run.agent_id, _AgentActivityCounters())
        if run.warnings:
            counters.warning_run_count += 1
    for action in actions:
        if not action.agent_id:
            continue
        counters = activity.setdefault(action.agent_id, _AgentActivityCounters())
        if action.status == "PENDING":
            counters.pending_action_count += 1
        elif action.status == "FAILED":
            counters.failed_action_count += 1
    return activity


def _stale_work_packages_by_agent(
    work_packages: Iterable[AssistantAgentWorkPackage],
    *,
    now: datetime,
) -> dict[str, tuple[_StaleWorkPackageReminder, ...]]:
    reminders: dict[str, list[_StaleWorkPackageReminder]] = {}
    for record in work_packages:
        if not _is_stale_open_work_package(record, now=now):
            continue
        age_hours = _work_package_age_hours(record, now=now)
        reminder = _StaleWorkPackageReminder(
            work_package_id=record.work_package_id,
            title=record.title,
            status=(record.status or "").strip().upper(),
            age_hours=age_hours,
        )
        for agent_id in _distinct(record.source_agent_ids or []):
            reminders.setdefault(agent_id, []).append(reminder)
    return {
        agent_id: tuple(
            sorted(rows, key=lambda reminder: (-reminder.age_hours, reminder.work_package_id))
        )
        for agent_id, rows in reminders.items()
    }


def _stale_work_package_details(
    reminders: Iterable[_StaleWorkPackageReminder],
) -> tuple[str, ...]:
    details = [
        f"{reminder.status.title().replace('_', ' ')} · {reminder.title} · {int(round(reminder.age_hours))}h since last update"
        for reminder in reminders
    ]
    return _distinct(details)


def _is_stale_open_work_package(
    record: AssistantAgentWorkPackage,
    *,
    now: datetime,
) -> bool:
    status = (record.status or "").strip().upper()
    if status not in {"ACCEPTED", "IN_PROGRESS"}:
        return False
    if _work_package_has_shipped_evidence(record):
        return False
    return _work_package_age_hours(record, now=now) >= STALE_WORK_PACKAGE_HOURS


def _work_package_age_hours(
    record: AssistantAgentWorkPackage,
    *,
    now: datetime,
) -> float:
    updated_at = _coerce_aware_datetime(record.updated_at)
    if updated_at is None:
        return 0.0
    return max((now - updated_at).total_seconds() / 3600, 0.0)


def _work_package_has_shipped_evidence(record: AssistantAgentWorkPackage) -> bool:
    return any(_work_package_evidence_flags(record))


def _work_package_evidence_flags(
    record: AssistantAgentWorkPackage,
) -> tuple[bool, bool, bool, bool, bool]:
    evidence = record.implementation_evidence if isinstance(record.implementation_evidence, dict) else {}
    has_pr = bool(str(evidence.get("pr_url")).strip()) if evidence.get("pr_url") else False
    has_commit = bool(str(evidence.get("commit_sha")).strip()) if evidence.get("commit_sha") else False
    has_eval = bool(evidence.get("eval_ids")) if isinstance(evidence.get("eval_ids"), list) else False
    has_tests = bool(evidence.get("test_names")) if isinstance(evidence.get("test_names"), list) else False
    has_docs = bool(evidence.get("doc_paths")) if isinstance(evidence.get("doc_paths"), list) else False
    return has_pr, has_commit, has_eval, has_tests, has_docs


def _agent_signal(
    agent: AssistantAgent,
    *,
    signal_type: str,
    severity: str,
    summary: str,
    details: tuple[str, ...],
    counters: _AgentActivityCounters,
    eval_status: str | None,
) -> AssistantControlTowerAgentTrustSignal:
    return AssistantControlTowerAgentTrustSignal(
        agent_id=agent.agent_id,
        agent_name=agent.name,
        status=agent.status,
        role_key=agent.role_key,
        profile_kind=agent.profile_kind,
        signal_type=signal_type,
        severity=severity,
        summary=summary,
        details=_distinct(details),
        pending_action_count=counters.pending_action_count,
        failed_action_count=counters.failed_action_count,
        warning_run_count=counters.warning_run_count,
        eval_status=eval_status,
    )


def _policy_warning_details(agent: AssistantAgent) -> tuple[str, ...]:
    try:
        validate_agent_profile_definition(
            agent_name=agent.name,
            agent_id=agent.agent_id,
            role_key=agent.role_key,
            profile_kind=agent.profile_kind,
            scope=agent.scope,
            allowed_workspaces=tuple(agent.allowed_workspaces or []),
            capabilities=tuple(agent.capabilities or []),
            skills=tuple(agent.skills or []),
            allowed_tools=tuple(agent.allowed_tools or []),
            allowed_action_types=tuple(agent.allowed_action_types or []),
            authority_ceiling=agent.authority_ceiling,
            orchestration_pattern=agent.orchestration_pattern or "SINGLE",
            parent_agent_id=agent.parent_agent_id,
            managed_agent_ids=tuple(agent.managed_agent_ids or []),
        )
    except AssistantAgentProfilePolicyError as exc:
        return _distinct(str(exc).split("; "))
    return ()


def _action_preview_status(record: AssistantActionRequest) -> str | None:
    payload = record.payload if isinstance(record.payload, dict) else {}
    review_context = payload.get("review_context")
    if not isinstance(review_context, dict):
        return None
    preview = review_context.get("action_preview")
    if not isinstance(preview, dict):
        return None
    status = preview.get("status")
    if not isinstance(status, str):
        return None
    return status.strip().upper() or None


def _load_runs(
    db: Session,
    *,
    created_after: datetime | None,
    created_before: datetime | None,
) -> list[AssistantRun]:
    stmt = select(AssistantRun)
    if created_after is not None:
        stmt = stmt.where(AssistantRun.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantRun.created_at <= created_before)
    stmt = stmt.order_by(AssistantRun.created_at.desc(), AssistantRun.id.desc())
    return list(db.execute(stmt).scalars().all())


def _load_action_requests(
    db: Session,
    *,
    created_after: datetime | None,
    created_before: datetime | None,
) -> list[AssistantActionRequest]:
    stmt = select(AssistantActionRequest)
    if created_after is not None:
        stmt = stmt.where(AssistantActionRequest.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantActionRequest.created_at <= created_before)
    stmt = stmt.order_by(AssistantActionRequest.created_at.desc(), AssistantActionRequest.id.desc())
    return list(db.execute(stmt).scalars().all())


def _coerce_aware_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _distinct(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return tuple(result)


def _trust_signal_sort_key(signal: AssistantControlTowerAgentTrustSignal) -> tuple[int, str, str]:
    severity_rank = {
        "danger": 0,
        "warning": 1,
        "info": 2,
    }
    return (severity_rank.get(signal.severity, 99), signal.agent_id, signal.signal_type)
