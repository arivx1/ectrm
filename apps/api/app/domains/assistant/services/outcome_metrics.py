from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.assistant_run_feedback import AssistantRunFeedback


PROMOTION_MIN_DECIDED_ACTIONS = 10
PROMOTION_MAX_REJECTION_RATE = 0.10
PROMOTION_MAX_FAILED_EXECUTION_RATE = 0.02
PROMOTION_MAX_STALE_ACTION_RATE = 0.05
PROMOTION_MAX_CORRECTION_RATE = 0.10
PROMOTION_MAX_PENDING_ACTIONS = 0

PAUSE_MIN_DECIDED_ACTIONS = 5
PAUSE_REJECTION_RATE = 0.40
PAUSE_FAILED_EXECUTION_RATE = 0.10
PAUSE_STALE_ACTION_RATE = 0.25
PAUSE_OLDEST_PENDING_HOURS = 72
PAUSE_REPEATED_FAILED_ACTIONS = 3
PAUSE_UNSUPPORTED_ATTEMPTS = 1
PAUSE_POLICY_DRIFT = 1

RECOMMENDATION_INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
RECOMMENDATION_KEEP_STAGED = "KEEP_STAGED"
RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW = "ELIGIBLE_FOR_BOUNDED_REVIEW"
RECOMMENDATION_RECOMMEND_PAUSE = "RECOMMEND_PAUSE"


@dataclass(frozen=True)
class AssistantOutcomeMetricThresholds:
    min_decided_actions_for_promotion: int = PROMOTION_MIN_DECIDED_ACTIONS
    max_rejection_rate_for_promotion: float = PROMOTION_MAX_REJECTION_RATE
    max_failed_execution_rate_for_promotion: float = PROMOTION_MAX_FAILED_EXECUTION_RATE
    max_stale_action_rate_for_promotion: float = PROMOTION_MAX_STALE_ACTION_RATE
    max_correction_rate_for_promotion: float = PROMOTION_MAX_CORRECTION_RATE
    max_pending_actions_for_promotion: int = PROMOTION_MAX_PENDING_ACTIONS
    min_decided_actions_for_pause_signal: int = PAUSE_MIN_DECIDED_ACTIONS
    rejection_rate_pause_threshold: float = PAUSE_REJECTION_RATE
    failed_execution_rate_pause_threshold: float = PAUSE_FAILED_EXECUTION_RATE
    stale_action_rate_pause_threshold: float = PAUSE_STALE_ACTION_RATE
    oldest_pending_hours_pause_threshold: int = PAUSE_OLDEST_PENDING_HOURS
    repeated_failed_actions_pause_threshold: int = PAUSE_REPEATED_FAILED_ACTIONS
    unsupported_attempt_pause_threshold: int = PAUSE_UNSUPPORTED_ATTEMPTS
    policy_drift_pause_threshold: int = PAUSE_POLICY_DRIFT


@dataclass(frozen=True)
class AssistantOutcomeMetricRecommendation:
    recommended_action: str
    promotion_candidate: bool
    pause_recommended: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class AssistantOutcomeMetricCounters:
    staged_action_count: int
    pending_action_count: int
    executed_action_count: int
    rejected_action_count: int
    failed_action_count: int
    correction_count: int
    decided_action_count: int
    stale_action_count: int
    unsupported_attempt_count: int
    policy_drift_count: int
    approval_rate: float | None
    rejection_rate: float | None
    failed_execution_rate: float | None
    correction_rate: float | None
    stale_action_rate: float | None
    avg_decision_seconds: float | None
    oldest_pending_age_seconds: float | None


@dataclass(frozen=True)
class AssistantAgentOutcomeMetricRow(AssistantOutcomeMetricCounters):
    agent_id: str | None
    agent_name: str | None
    agent_role_key: str | None
    agent_profile_kind: str | None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: float | None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: float | None
    helpful_feedback_count: int
    needs_work_feedback_count: int
    feedback_helpful_rate: float | None
    recommendation: AssistantOutcomeMetricRecommendation


@dataclass(frozen=True)
class AssistantRoleOutcomeMetricRow(AssistantOutcomeMetricCounters):
    agent_role_key: str | None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: float | None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: float | None
    recommendation: AssistantOutcomeMetricRecommendation


@dataclass(frozen=True)
class AssistantProfileOutcomeMetricRow(AssistantOutcomeMetricCounters):
    agent_profile_kind: str | None
    run_count: int
    completed_run_count: int
    failed_run_count: int
    warning_count: int
    warning_rate: float | None
    tool_call_count: int
    tool_error_count: int
    tool_error_rate: float | None
    recommendation: AssistantOutcomeMetricRecommendation


@dataclass(frozen=True)
class AssistantWorkspaceFeedbackMetricRow:
    workspace: str | None
    run_count: int
    helpful_feedback_count: int
    needs_work_feedback_count: int
    feedback_count: int
    feedback_helpful_rate: float | None


@dataclass(frozen=True)
class AssistantRunFeedbackInsightRow:
    feedback_id: int
    run_id: int
    conversation_id: int | None
    agent_id: str | None
    agent_name: str | None
    workspace: str | None
    user_id: str
    user_role: str
    rating: str
    comment: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class AssistantActionTypeOutcomeMetricRow(AssistantOutcomeMetricCounters):
    action_type: str
    recommendation: AssistantOutcomeMetricRecommendation


@dataclass(frozen=True)
class AssistantOutcomeMetricsSnapshot:
    generated_at: datetime
    created_after: datetime | None
    created_before: datetime | None
    thresholds: AssistantOutcomeMetricThresholds
    total_feedback_count: int
    helpful_feedback_count: int
    needs_work_feedback_count: int
    feedback_helpful_rate: float | None
    by_agent: tuple[AssistantAgentOutcomeMetricRow, ...]
    by_role: tuple[AssistantRoleOutcomeMetricRow, ...]
    by_profile: tuple[AssistantProfileOutcomeMetricRow, ...]
    by_workspace: tuple[AssistantWorkspaceFeedbackMetricRow, ...]
    by_action_type: tuple[AssistantActionTypeOutcomeMetricRow, ...]
    recent_feedback: tuple[AssistantRunFeedbackInsightRow, ...]


@dataclass
class _ActionAccumulator:
    staged_action_count: int = 0
    pending_action_count: int = 0
    executed_action_count: int = 0
    rejected_action_count: int = 0
    failed_action_count: int = 0
    correction_count: int = 0
    stale_action_count: int = 0
    unsupported_attempt_count: int = 0
    policy_drift_count: int = 0
    decision_seconds: list[float] = field(default_factory=list)
    pending_ages_seconds: list[float] = field(default_factory=list)


@dataclass
class _AgentAccumulator(_ActionAccumulator):
    agent_id: str | None = None
    agent_name: str | None = None
    agent_role_key: str | None = None
    agent_profile_kind: str | None = None
    run_count: int = 0
    completed_run_count: int = 0
    failed_run_count: int = 0
    warning_count: int = 0
    tool_call_count: int = 0
    tool_error_count: int = 0
    helpful_feedback_count: int = 0
    needs_work_feedback_count: int = 0


@dataclass
class _GroupAccumulator(_ActionAccumulator):
    group_key: str | None = None
    run_count: int = 0
    completed_run_count: int = 0
    failed_run_count: int = 0
    warning_count: int = 0
    tool_call_count: int = 0
    tool_error_count: int = 0


@dataclass
class _WorkspaceFeedbackAccumulator:
    workspace: str | None = None
    run_count: int = 0
    helpful_feedback_count: int = 0
    needs_work_feedback_count: int = 0


def summarize_assistant_outcome_metrics(
    db: Session,
    *,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    agent_id: str | None = None,
    action_type: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    now: datetime | None = None,
) -> AssistantOutcomeMetricsSnapshot:
    generated_at = _coerce_aware_datetime(now) or datetime.now(timezone.utc)
    normalized_agent_id = _normalize_optional_text(agent_id)
    normalized_action_type = _normalize_optional_text(action_type)
    normalized_role_key = _normalize_optional_text(role_key, lowercase=True)
    normalized_profile_kind = _normalize_optional_text(profile_kind, uppercase=True)
    thresholds = AssistantOutcomeMetricThresholds()

    runs = _load_runs(
        db,
        created_after=created_after,
        created_before=created_before,
        agent_id=normalized_agent_id,
        role_key=normalized_role_key,
        profile_kind=normalized_profile_kind,
    )
    run_by_id = {run.id: run for run in runs}
    feedback_records = _load_feedback_for_runs(db, run_ids=run_by_id.keys())
    feedback_by_run_id = _feedback_by_run_id(feedback_records)

    agent_accumulators: dict[str, _AgentAccumulator] = {}
    role_accumulators: dict[str, _GroupAccumulator] = {}
    profile_accumulators: dict[str, _GroupAccumulator] = {}
    workspace_accumulators: dict[str, _WorkspaceFeedbackAccumulator] = {}
    for run in runs:
        accumulator = _agent_accumulator_for_run(agent_accumulators, run)
        role_accumulator = _group_accumulator_for_key(role_accumulators, run.agent_role_key)
        profile_accumulator = _group_accumulator_for_key(profile_accumulators, run.agent_profile_kind)
        accumulator.run_count += 1
        role_accumulator.run_count += 1
        profile_accumulator.run_count += 1
        workspace_accumulator = _workspace_accumulator_for_run(workspace_accumulators, run)
        workspace_accumulator.run_count += 1
        if run.status == "COMPLETED":
            accumulator.completed_run_count += 1
            role_accumulator.completed_run_count += 1
            profile_accumulator.completed_run_count += 1
        elif run.status == "FAILED":
            accumulator.failed_run_count += 1
            role_accumulator.failed_run_count += 1
            profile_accumulator.failed_run_count += 1
        warning_count = len(run.warnings or [])
        tool_call_count = len(run.tool_calls or [])
        tool_error_count = _tool_error_count(run.tool_calls or [])
        accumulator.warning_count += warning_count
        accumulator.tool_call_count += tool_call_count
        accumulator.tool_error_count += tool_error_count
        role_accumulator.warning_count += warning_count
        role_accumulator.tool_call_count += tool_call_count
        role_accumulator.tool_error_count += tool_error_count
        profile_accumulator.warning_count += warning_count
        profile_accumulator.tool_call_count += tool_call_count
        profile_accumulator.tool_error_count += tool_error_count
        for feedback in feedback_by_run_id.get(run.id, []):
            if feedback.rating == "HELPFUL":
                accumulator.helpful_feedback_count += 1
                workspace_accumulator.helpful_feedback_count += 1
            elif feedback.rating == "NEEDS_WORK":
                accumulator.needs_work_feedback_count += 1
                workspace_accumulator.needs_work_feedback_count += 1

    action_accumulators: dict[str, _ActionAccumulator] = {}
    action_requests = _load_action_requests(
        db,
        created_after=created_after,
        created_before=created_before,
        agent_id=normalized_agent_id,
        action_type=normalized_action_type,
        role_key=normalized_role_key,
        profile_kind=normalized_profile_kind,
    )
    run_by_id.update(
        {
            run.id: run
            for run in _load_runs_by_ids(
                db,
                run_ids={record.run_id for record in action_requests if record.run_id not in run_by_id},
            )
        }
    )
    for record in action_requests:
        run = run_by_id.get(record.run_id)
        agent_accumulator = _agent_accumulator_for_action(agent_accumulators, record, run)
        role_accumulator = (
            _group_accumulator_for_key(role_accumulators, run.agent_role_key)
            if run is not None
            else None
        )
        profile_accumulator = (
            _group_accumulator_for_key(profile_accumulators, run.agent_profile_kind)
            if run is not None
            else None
        )
        action_accumulator = action_accumulators.setdefault(record.action_type, _ActionAccumulator())
        _accumulate_action_request(agent_accumulator, record=record, generated_at=generated_at)
        if role_accumulator is not None:
            _accumulate_action_request(role_accumulator, record=record, generated_at=generated_at)
        if profile_accumulator is not None:
            _accumulate_action_request(profile_accumulator, record=record, generated_at=generated_at)
        _accumulate_action_request(action_accumulator, record=record, generated_at=generated_at)

    by_agent = tuple(
        _build_agent_row(accumulator, thresholds=thresholds)
        for _, accumulator in sorted(agent_accumulators.items(), key=lambda item: item[0])
    )
    by_role = tuple(
        _build_role_row(accumulator, thresholds=thresholds)
        for _, accumulator in sorted(role_accumulators.items(), key=lambda item: item[0])
    )
    by_profile = tuple(
        _build_profile_row(accumulator, thresholds=thresholds)
        for _, accumulator in sorted(profile_accumulators.items(), key=lambda item: item[0])
    )
    by_action_type = tuple(
        _build_action_type_row(action_type_key, accumulator, thresholds=thresholds)
        for action_type_key, accumulator in sorted(action_accumulators.items(), key=lambda item: item[0])
    )
    by_workspace = tuple(
        _build_workspace_feedback_row(accumulator)
        for _, accumulator in sorted(workspace_accumulators.items(), key=lambda item: item[0])
        if accumulator.helpful_feedback_count + accumulator.needs_work_feedback_count > 0
    )
    helpful_feedback_count = sum(
        1 for feedback in feedback_records if feedback.rating == "HELPFUL"
    )
    needs_work_feedback_count = sum(
        1 for feedback in feedback_records if feedback.rating == "NEEDS_WORK"
    )
    total_feedback_count = helpful_feedback_count + needs_work_feedback_count
    recent_feedback = tuple(
        _build_feedback_insight_row(feedback, run_by_id[feedback.run_id])
        for feedback in sorted(
            feedback_records,
            key=lambda record: (_coerce_aware_datetime(record.updated_at) or datetime.min.replace(tzinfo=timezone.utc)),
            reverse=True,
        )[:10]
        if feedback.run_id in run_by_id
    )
    return AssistantOutcomeMetricsSnapshot(
        generated_at=generated_at,
        created_after=created_after,
        created_before=created_before,
        thresholds=thresholds,
        total_feedback_count=total_feedback_count,
        helpful_feedback_count=helpful_feedback_count,
        needs_work_feedback_count=needs_work_feedback_count,
        feedback_helpful_rate=_safe_ratio(helpful_feedback_count, total_feedback_count),
        by_agent=by_agent,
        by_role=by_role,
        by_profile=by_profile,
        by_workspace=by_workspace,
        by_action_type=by_action_type,
        recent_feedback=recent_feedback,
    )


def _load_runs(
    db: Session,
    *,
    created_after: datetime | None,
    created_before: datetime | None,
    agent_id: str | None,
    role_key: str | None,
    profile_kind: str | None,
) -> list[AssistantRun]:
    stmt = select(AssistantRun)
    if created_after is not None:
        stmt = stmt.where(AssistantRun.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantRun.created_at <= created_before)
    if agent_id is not None:
        stmt = stmt.where(AssistantRun.agent_id == agent_id)
    if role_key is not None:
        stmt = stmt.where(AssistantRun.agent_role_key == role_key)
    if profile_kind is not None:
        stmt = stmt.where(AssistantRun.agent_profile_kind == profile_kind)
    return list(db.execute(stmt).scalars().all())


def _load_feedback_for_runs(
    db: Session,
    *,
    run_ids: Iterable[int],
) -> list[AssistantRunFeedback]:
    normalized_run_ids = tuple({run_id for run_id in run_ids if run_id is not None})
    if not normalized_run_ids:
        return []

    stmt = (
        select(AssistantRunFeedback)
        .where(AssistantRunFeedback.run_id.in_(normalized_run_ids))
        .order_by(AssistantRunFeedback.updated_at.desc(), AssistantRunFeedback.id.desc())
    )
    return list(db.execute(stmt).scalars().all())


def _load_runs_by_ids(
    db: Session,
    *,
    run_ids: Iterable[int],
) -> list[AssistantRun]:
    normalized_run_ids = tuple({run_id for run_id in run_ids if run_id is not None})
    if not normalized_run_ids:
        return []

    stmt = select(AssistantRun).where(AssistantRun.id.in_(normalized_run_ids))
    return list(db.execute(stmt).scalars().all())


def _feedback_by_run_id(feedback_records: Iterable[AssistantRunFeedback]) -> dict[int, list[AssistantRunFeedback]]:
    by_run_id: dict[int, list[AssistantRunFeedback]] = {}
    for feedback in feedback_records:
        by_run_id.setdefault(feedback.run_id, []).append(feedback)
    return by_run_id


def _load_action_requests(
    db: Session,
    *,
    created_after: datetime | None,
    created_before: datetime | None,
    agent_id: str | None,
    action_type: str | None,
    role_key: str | None,
    profile_kind: str | None,
) -> list[AssistantActionRequest]:
    stmt = select(AssistantActionRequest)
    if role_key is not None or profile_kind is not None:
        stmt = stmt.join(AssistantRun, AssistantRun.id == AssistantActionRequest.run_id)
    if created_after is not None:
        stmt = stmt.where(AssistantActionRequest.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantActionRequest.created_at <= created_before)
    if agent_id is not None:
        stmt = stmt.where(AssistantActionRequest.agent_id == agent_id)
    if action_type is not None:
        stmt = stmt.where(AssistantActionRequest.action_type == action_type)
    if role_key is not None:
        stmt = stmt.where(AssistantRun.agent_role_key == role_key)
    if profile_kind is not None:
        stmt = stmt.where(AssistantRun.agent_profile_kind == profile_kind)
    return list(db.execute(stmt).scalars().all())


def _agent_accumulator_for_run(
    accumulators: dict[str, _AgentAccumulator],
    run: AssistantRun,
) -> _AgentAccumulator:
    key = _agent_group_key(run.agent_id)
    accumulator = accumulators.setdefault(
        key,
        _AgentAccumulator(
            agent_id=run.agent_id,
            agent_name=run.agent_name,
            agent_role_key=run.agent_role_key,
            agent_profile_kind=run.agent_profile_kind,
        ),
    )
    _merge_agent_identity(
        accumulator,
        agent_id=run.agent_id,
        agent_name=run.agent_name,
        agent_role_key=run.agent_role_key,
        agent_profile_kind=run.agent_profile_kind,
    )
    return accumulator


def _workspace_accumulator_for_run(
    accumulators: dict[str, _WorkspaceFeedbackAccumulator],
    run: AssistantRun,
) -> _WorkspaceFeedbackAccumulator:
    key = run.workspace or "__unknown__"
    accumulator = accumulators.setdefault(
        key,
        _WorkspaceFeedbackAccumulator(workspace=run.workspace),
    )
    accumulator.workspace = accumulator.workspace or run.workspace
    return accumulator


def _group_accumulator_for_key(
    accumulators: dict[str, _GroupAccumulator],
    group_key: str | None,
) -> _GroupAccumulator:
    key = group_key or "__unknown__"
    return accumulators.setdefault(key, _GroupAccumulator(group_key=group_key))


def _agent_accumulator_for_action(
    accumulators: dict[str, _AgentAccumulator],
    record: AssistantActionRequest,
    run: AssistantRun | None,
) -> _AgentAccumulator:
    agent_id = record.agent_id or (run.agent_id if run is not None else None)
    key = _agent_group_key(agent_id)
    accumulator = accumulators.setdefault(
        key,
        _AgentAccumulator(
            agent_id=agent_id,
            agent_name=record.agent_name or (run.agent_name if run is not None else None),
            agent_role_key=run.agent_role_key if run is not None else None,
            agent_profile_kind=run.agent_profile_kind if run is not None else None,
        ),
    )
    _merge_agent_identity(
        accumulator,
        agent_id=agent_id,
        agent_name=record.agent_name or (run.agent_name if run is not None else None),
        agent_role_key=run.agent_role_key if run is not None else None,
        agent_profile_kind=run.agent_profile_kind if run is not None else None,
    )
    return accumulator


def _merge_agent_identity(
    accumulator: _AgentAccumulator,
    *,
    agent_id: str | None,
    agent_name: str | None,
    agent_role_key: str | None,
    agent_profile_kind: str | None,
) -> None:
    accumulator.agent_id = accumulator.agent_id or agent_id
    accumulator.agent_name = accumulator.agent_name or agent_name
    accumulator.agent_role_key = accumulator.agent_role_key or agent_role_key
    accumulator.agent_profile_kind = accumulator.agent_profile_kind or agent_profile_kind


def _accumulate_action_request(
    accumulator: _ActionAccumulator,
    *,
    record: AssistantActionRequest,
    generated_at: datetime,
) -> None:
    accumulator.staged_action_count += 1
    status = str(record.status or "").upper()
    if status == "PENDING":
        accumulator.pending_action_count += 1
        created_at = _coerce_aware_datetime(record.created_at)
        if created_at is not None:
            accumulator.pending_ages_seconds.append(max((generated_at - created_at).total_seconds(), 0.0))
    elif status == "EXECUTED":
        accumulator.executed_action_count += 1
    elif status == "REJECTED":
        accumulator.rejected_action_count += 1
    elif status == "FAILED":
        accumulator.failed_action_count += 1

    if str(record.review_outcome or "").upper() == "APPROVED_WITH_CORRECTIONS":
        accumulator.correction_count += 1

    if record.decided_at is not None:
        decided_at = _coerce_aware_datetime(record.decided_at)
        created_at = _coerce_aware_datetime(record.created_at)
        if decided_at is not None and created_at is not None:
            accumulator.decision_seconds.append(max((decided_at - created_at).total_seconds(), 0.0))

    if _action_request_has_stale_outcome(record):
        accumulator.stale_action_count += 1
    if _action_request_has_unsupported_attempt(record):
        accumulator.unsupported_attempt_count += 1
    if _action_request_has_policy_drift(record):
        accumulator.policy_drift_count += 1


def _build_agent_row(
    accumulator: _AgentAccumulator,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> AssistantAgentOutcomeMetricRow:
    counters = _build_action_counters(accumulator)
    feedback_count = accumulator.helpful_feedback_count + accumulator.needs_work_feedback_count
    return AssistantAgentOutcomeMetricRow(
        agent_id=accumulator.agent_id,
        agent_name=accumulator.agent_name,
        agent_role_key=accumulator.agent_role_key,
        agent_profile_kind=accumulator.agent_profile_kind,
        run_count=accumulator.run_count,
        completed_run_count=accumulator.completed_run_count,
        failed_run_count=accumulator.failed_run_count,
        warning_count=accumulator.warning_count,
        warning_rate=_safe_ratio(accumulator.warning_count, accumulator.run_count),
        tool_call_count=accumulator.tool_call_count,
        tool_error_count=accumulator.tool_error_count,
        tool_error_rate=_safe_ratio(accumulator.tool_error_count, accumulator.tool_call_count),
        helpful_feedback_count=accumulator.helpful_feedback_count,
        needs_work_feedback_count=accumulator.needs_work_feedback_count,
        feedback_helpful_rate=_safe_ratio(accumulator.helpful_feedback_count, feedback_count),
        recommendation=_recommend_action(accumulator, thresholds=thresholds),
        **counters.__dict__,
    )


def _build_action_type_row(
    action_type: str,
    accumulator: _ActionAccumulator,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> AssistantActionTypeOutcomeMetricRow:
    counters = _build_action_counters(accumulator)
    return AssistantActionTypeOutcomeMetricRow(
        action_type=action_type,
        recommendation=_recommend_action(accumulator, thresholds=thresholds),
        **counters.__dict__,
    )


def _build_role_row(
    accumulator: _GroupAccumulator,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> AssistantRoleOutcomeMetricRow:
    counters = _build_action_counters(accumulator)
    return AssistantRoleOutcomeMetricRow(
        agent_role_key=accumulator.group_key,
        run_count=accumulator.run_count,
        completed_run_count=accumulator.completed_run_count,
        failed_run_count=accumulator.failed_run_count,
        warning_count=accumulator.warning_count,
        warning_rate=_safe_ratio(accumulator.warning_count, accumulator.run_count),
        tool_call_count=accumulator.tool_call_count,
        tool_error_count=accumulator.tool_error_count,
        tool_error_rate=_safe_ratio(accumulator.tool_error_count, accumulator.tool_call_count),
        recommendation=_recommend_action(accumulator, thresholds=thresholds),
        **counters.__dict__,
    )


def _build_profile_row(
    accumulator: _GroupAccumulator,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> AssistantProfileOutcomeMetricRow:
    counters = _build_action_counters(accumulator)
    return AssistantProfileOutcomeMetricRow(
        agent_profile_kind=accumulator.group_key,
        run_count=accumulator.run_count,
        completed_run_count=accumulator.completed_run_count,
        failed_run_count=accumulator.failed_run_count,
        warning_count=accumulator.warning_count,
        warning_rate=_safe_ratio(accumulator.warning_count, accumulator.run_count),
        tool_call_count=accumulator.tool_call_count,
        tool_error_count=accumulator.tool_error_count,
        tool_error_rate=_safe_ratio(accumulator.tool_error_count, accumulator.tool_call_count),
        recommendation=_recommend_action(accumulator, thresholds=thresholds),
        **counters.__dict__,
    )


def _build_workspace_feedback_row(
    accumulator: _WorkspaceFeedbackAccumulator,
) -> AssistantWorkspaceFeedbackMetricRow:
    feedback_count = accumulator.helpful_feedback_count + accumulator.needs_work_feedback_count
    return AssistantWorkspaceFeedbackMetricRow(
        workspace=accumulator.workspace,
        run_count=accumulator.run_count,
        helpful_feedback_count=accumulator.helpful_feedback_count,
        needs_work_feedback_count=accumulator.needs_work_feedback_count,
        feedback_count=feedback_count,
        feedback_helpful_rate=_safe_ratio(accumulator.helpful_feedback_count, feedback_count),
    )


def _build_feedback_insight_row(
    feedback: AssistantRunFeedback,
    run: AssistantRun,
) -> AssistantRunFeedbackInsightRow:
    return AssistantRunFeedbackInsightRow(
        feedback_id=feedback.id,
        run_id=feedback.run_id,
        conversation_id=feedback.conversation_id,
        agent_id=run.agent_id,
        agent_name=run.agent_name,
        workspace=run.workspace,
        user_id=feedback.user_id,
        user_role=feedback.user_role,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
    )


def _build_action_counters(accumulator: _ActionAccumulator) -> AssistantOutcomeMetricCounters:
    decided_action_count = (
        accumulator.executed_action_count
        + accumulator.rejected_action_count
        + accumulator.failed_action_count
    )
    return AssistantOutcomeMetricCounters(
        staged_action_count=accumulator.staged_action_count,
        pending_action_count=accumulator.pending_action_count,
        executed_action_count=accumulator.executed_action_count,
        rejected_action_count=accumulator.rejected_action_count,
        failed_action_count=accumulator.failed_action_count,
        correction_count=accumulator.correction_count,
        decided_action_count=decided_action_count,
        stale_action_count=accumulator.stale_action_count,
        unsupported_attempt_count=accumulator.unsupported_attempt_count,
        policy_drift_count=accumulator.policy_drift_count,
        approval_rate=_safe_ratio(accumulator.executed_action_count, decided_action_count),
        rejection_rate=_safe_ratio(accumulator.rejected_action_count, decided_action_count),
        failed_execution_rate=_safe_ratio(accumulator.failed_action_count, decided_action_count),
        correction_rate=_safe_ratio(accumulator.correction_count, decided_action_count),
        stale_action_rate=_safe_ratio(accumulator.stale_action_count, decided_action_count),
        avg_decision_seconds=_average(accumulator.decision_seconds),
        oldest_pending_age_seconds=max(accumulator.pending_ages_seconds) if accumulator.pending_ages_seconds else None,
    )


def _recommend_action(
    accumulator: _ActionAccumulator,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> AssistantOutcomeMetricRecommendation:
    counters = _build_action_counters(accumulator)
    pause_reasons = _pause_reasons(counters, thresholds=thresholds)
    if pause_reasons:
        return AssistantOutcomeMetricRecommendation(
            recommended_action=RECOMMENDATION_RECOMMEND_PAUSE,
            promotion_candidate=False,
            pause_recommended=True,
            reasons=tuple(pause_reasons),
        )

    if counters.decided_action_count < thresholds.min_decided_actions_for_promotion:
        return AssistantOutcomeMetricRecommendation(
            recommended_action=RECOMMENDATION_INSUFFICIENT_DATA,
            promotion_candidate=False,
            pause_recommended=False,
            reasons=(
                "Collect more decided action outcomes before considering bounded execution.",
            ),
        )

    blockers = _promotion_blockers(counters, thresholds=thresholds)
    if blockers:
        return AssistantOutcomeMetricRecommendation(
            recommended_action=RECOMMENDATION_KEEP_STAGED,
            promotion_candidate=False,
            pause_recommended=False,
            reasons=tuple(blockers),
        )

    return AssistantOutcomeMetricRecommendation(
        recommended_action=RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW,
        promotion_candidate=True,
        pause_recommended=False,
        reasons=(
            "Observed action outcomes are within conservative promotion thresholds.",
            "A human owner must still approve any bounded execution policy change.",
        ),
    )


def _pause_reasons(
    counters: AssistantOutcomeMetricCounters,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> list[str]:
    reasons: list[str] = []
    if counters.oldest_pending_age_seconds is not None:
        oldest_pending_hours = counters.oldest_pending_age_seconds / 3600
        if oldest_pending_hours >= thresholds.oldest_pending_hours_pause_threshold:
            reasons.append("Pending action backlog is older than the pause threshold.")
    if counters.failed_action_count >= thresholds.repeated_failed_actions_pause_threshold:
        reasons.append("Repeated failed actions exceed the pause threshold.")
    if counters.unsupported_attempt_count >= thresholds.unsupported_attempt_pause_threshold:
        reasons.append("Unsupported tool or action attempts were observed.")
    if counters.policy_drift_count >= thresholds.policy_drift_pause_threshold:
        reasons.append("Policy validation drift was observed after role or permission changes.")

    if counters.decided_action_count < thresholds.min_decided_actions_for_pause_signal:
        return reasons

    if _rate_exceeds(counters.rejection_rate, thresholds.rejection_rate_pause_threshold):
        reasons.append("Rejected action rate exceeds the pause threshold.")
    if _rate_exceeds(counters.failed_execution_rate, thresholds.failed_execution_rate_pause_threshold):
        reasons.append("Failed execution rate exceeds the pause threshold.")
    if _rate_exceeds(counters.stale_action_rate, thresholds.stale_action_rate_pause_threshold):
        reasons.append("Stale-action rate exceeds the pause threshold.")
    return reasons


def _promotion_blockers(
    counters: AssistantOutcomeMetricCounters,
    *,
    thresholds: AssistantOutcomeMetricThresholds,
) -> list[str]:
    blockers: list[str] = []
    if counters.pending_action_count > thresholds.max_pending_actions_for_promotion:
        blockers.append("Pending actions must clear before bounded execution review.")
    if _rate_exceeds(counters.rejection_rate, thresholds.max_rejection_rate_for_promotion):
        blockers.append("Rejected action rate is above the promotion threshold.")
    if _rate_exceeds(counters.failed_execution_rate, thresholds.max_failed_execution_rate_for_promotion):
        blockers.append("Failed execution rate is above the promotion threshold.")
    if _rate_exceeds(counters.stale_action_rate, thresholds.max_stale_action_rate_for_promotion):
        blockers.append("Stale-action rate is above the promotion threshold.")
    if counters.unsupported_attempt_count > 0:
        blockers.append("Unsupported tool or action attempts must be investigated before promotion.")
    if counters.policy_drift_count > 0:
        blockers.append("Policy validation drift must be investigated before promotion.")
    if _rate_exceeds(counters.correction_rate, thresholds.max_correction_rate_for_promotion):
        blockers.append("Reviewer correction rate is above the promotion threshold.")
    return blockers


def _action_request_has_stale_outcome(record: AssistantActionRequest) -> bool:
    error_detail = str(record.error_detail or "").lower()
    if "stale" in error_detail or "changed since this action was staged" in error_detail:
        return True

    result = record.result if isinstance(record.result, dict) else {}
    approval_policy = result.get("approval_policy")
    if isinstance(approval_policy, dict) and approval_policy.get("idempotent_retry_rechecked") is True:
        return True

    workflow_item = result.get("workflow_item")
    if isinstance(workflow_item, dict) and workflow_item.get("idempotent_retry") is True:
        return True

    return False


def _action_request_has_unsupported_attempt(record: AssistantActionRequest) -> bool:
    text = _action_failure_text(record)
    return any(
        phrase in text
        for phrase in (
            "unsupported",
            "not supported",
            "unknown action",
            "unknown tool",
            "unregistered action",
        )
    )


def _action_request_has_policy_drift(record: AssistantActionRequest) -> bool:
    text = _action_failure_text(record)
    if not text or _action_request_has_stale_outcome(record):
        return False
    return any(
        phrase in text
        for phrase in (
            "policy drift",
            "policy validation",
            "no longer allowed",
            "not allowed",
            "allowed action",
            "allowed_action",
            "requires approval",
            "requires reviewer",
        )
    )


def _action_failure_text(record: AssistantActionRequest) -> str:
    chunks: list[str] = []
    if record.error_detail:
        chunks.append(str(record.error_detail))
    if isinstance(record.result, dict):
        for key in ("error", "error_detail", "reason", "policy_reason"):
            value = record.result.get(key)
            if value:
                chunks.append(str(value))
    return " ".join(chunks).lower()


def _agent_group_key(agent_id: str | None) -> str:
    return agent_id or "__unassigned__"


def _tool_error_count(tool_calls: Iterable[object]) -> int:
    count = 0
    for tool_call in tool_calls:
        if _tool_call_is_error(tool_call):
            count += 1
    return count


def _tool_call_is_error(tool_call: object) -> bool:
    if isinstance(tool_call, dict):
        if tool_call.get("is_error") is True:
            return True
        if tool_call.get("error") or tool_call.get("error_detail"):
            return True
        status = str(tool_call.get("status") or "").upper()
        if status in {"ERROR", "FAILED"}:
            return True
        summary = str(tool_call.get("summary") or "").lower()
        return " failed:" in summary or summary.startswith("failed:")

    if getattr(tool_call, "is_error", False) is True:
        return True
    if getattr(tool_call, "error", None) or getattr(tool_call, "error_detail", None):
        return True
    status = str(getattr(tool_call, "status", "") or "").upper()
    if status in {"ERROR", "FAILED"}:
        return True
    summary = str(getattr(tool_call, "summary", "") or "").lower()
    return " failed:" in summary or summary.startswith("failed:")


def _normalize_optional_text(
    value: str | None,
    *,
    lowercase: bool = False,
    uppercase: bool = False,
) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if lowercase:
        normalized = normalized.lower()
    if uppercase:
        normalized = normalized.upper()
    return normalized or None


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _rate_exceeds(value: float | None, threshold: float) -> bool:
    return value is not None and value > threshold


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _coerce_aware_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
