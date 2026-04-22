from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.domains.assistant.services.outcome_metrics import (
    RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW,
    RECOMMENDATION_RECOMMEND_PAUSE,
    AssistantActionTypeOutcomeMetricRow,
    AssistantAgentOutcomeMetricRow,
    summarize_assistant_outcome_metrics,
)
from apps.api.app.domains.assistant.services.registry import get_agent_record
from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest


AUTONOMY_RECOMMENDATION_KEEP_STAGED = "KEEP_STAGED"
AUTONOMY_RECOMMENDATION_NARROW = "NARROW"
AUTONOMY_RECOMMENDATION_PAUSE = "PAUSE"
AUTONOMY_RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW = "ELIGIBLE_FOR_BOUNDED_REVIEW"

EVAL_STATUS_MISSING_PLAN = "MISSING_EVAL_PLAN"
EVAL_STATUS_DECLARED = "DECLARED"
EVAL_STATUS_ACTIONABLE = "ACTIONABLE"

KNOWLEDGE_BASE_PATH = (
    Path(__file__).resolve().parents[6] / "docs" / "engineering" / "agent-knowledge-base.md"
)


@dataclass(frozen=True)
class AssistantAutonomyKnowledgeEntry:
    title: str
    entry_type: str | None
    domain: str | None
    applies_to: str | None
    status: str | None
    lesson: str | None
    deterministic_opportunity: str | None
    agent_autonomy_impact: str | None


@dataclass(frozen=True)
class AssistantAutonomyEvalSignal:
    status: str
    required_cases: tuple[str, ...]
    proposed_cases: tuple[str, ...]
    notes: tuple[str, ...]


@dataclass(frozen=True)
class AssistantAutonomyReviewBrief:
    generated_at: datetime
    agent_id: str
    agent_name: str
    current_status: str
    current_authority: str | None
    recommended_next_authority: str
    recommendation_reasons: tuple[str, ...]
    human_owner_role: str | None
    allowed_action_types: tuple[str, ...]
    outcome_window_created_after: datetime | None
    outcome_window_created_before: datetime | None
    outcome_metrics: AssistantAgentOutcomeMetricRow | None
    action_type_metrics: tuple[AssistantActionTypeOutcomeMetricRow, ...]
    eval_signal: AssistantAutonomyEvalSignal
    stop_conditions: tuple[str, ...]
    knowledge_base_entries: tuple[AssistantAutonomyKnowledgeEntry, ...]
    deterministic_algorithm_candidates: tuple[str, ...]
    review_checklist: tuple[str, ...]


def build_assistant_autonomy_review_brief(
    db: Session,
    *,
    agent_id: str,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    now: datetime | None = None,
) -> AssistantAutonomyReviewBrief:
    normalized_agent_id = agent_id.strip().lower()
    record = get_agent_record(db, normalized_agent_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")

    generated_at = now or datetime.now(timezone.utc)
    snapshot = summarize_assistant_outcome_metrics(
        db,
        agent_id=record.agent_id,
        created_after=created_after,
        created_before=created_before,
        now=generated_at,
    )
    outcome_metrics = _agent_outcome_row(snapshot.by_agent, record.agent_id)
    action_type_metrics = tuple(snapshot.by_action_type)
    role = get_role_archetype(record.role_key or "") if record.role_key else None
    eval_signal = _build_eval_signal(db, record=record, role_required_cases=role.required_eval_coverage if role else ())
    knowledge_entries = _relevant_knowledge_entries(record, role_stop_conditions=role.stop_conditions if role else ())

    recommendation, reasons = _recommend_next_authority(
        record=record,
        outcome_metrics=outcome_metrics,
        action_type_metrics=action_type_metrics,
        eval_signal=eval_signal,
    )
    stop_conditions = _stop_conditions(record, role_stop_conditions=role.stop_conditions if role else ())
    candidates = _deterministic_candidates(
        knowledge_entries=knowledge_entries,
        action_type_metrics=action_type_metrics,
    )

    return AssistantAutonomyReviewBrief(
        generated_at=generated_at,
        agent_id=record.agent_id,
        agent_name=record.name,
        current_status=record.status,
        current_authority=record.authority_ceiling,
        recommended_next_authority=recommendation,
        recommendation_reasons=tuple(reasons),
        human_owner_role=record.human_owner_role or (role.human_owner_role if role else None),
        allowed_action_types=tuple(record.allowed_action_types or ()),
        outcome_window_created_after=created_after,
        outcome_window_created_before=created_before,
        outcome_metrics=outcome_metrics,
        action_type_metrics=action_type_metrics,
        eval_signal=eval_signal,
        stop_conditions=stop_conditions,
        knowledge_base_entries=knowledge_entries,
        deterministic_algorithm_candidates=candidates,
        review_checklist=_review_checklist(record),
    )


def _agent_outcome_row(
    rows: Iterable[AssistantAgentOutcomeMetricRow],
    agent_id: str,
) -> AssistantAgentOutcomeMetricRow | None:
    for row in rows:
        if row.agent_id == agent_id:
            return row
    return None


def _build_eval_signal(
    db: Session,
    *,
    record: AssistantAgent,
    role_required_cases: tuple[str, ...],
) -> AssistantAutonomyEvalSignal:
    proposed_cases: tuple[str, ...] = ()
    notes: list[str] = []
    if record.profile_request_id is not None:
        profile_request = db.get(AssistantAgentProfileRequest, record.profile_request_id)
        if profile_request is not None:
            proposed_cases = tuple(profile_request.proposed_eval_cases or ())
            notes.append(f"Profile request #{profile_request.id} proposed {len(proposed_cases)} eval case(s).")
        else:
            notes.append(f"Linked profile request #{record.profile_request_id} was not found.")

    if role_required_cases:
        notes.append("Role archetype declares required eval coverage.")
    if proposed_cases:
        status = EVAL_STATUS_ACTIONABLE
    elif role_required_cases:
        status = EVAL_STATUS_DECLARED
    else:
        status = EVAL_STATUS_MISSING_PLAN
        notes.append("No role or profile request eval plan is attached to this agent.")

    return AssistantAutonomyEvalSignal(
        status=status,
        required_cases=tuple(role_required_cases),
        proposed_cases=proposed_cases,
        notes=tuple(notes),
    )


def _recommend_next_authority(
    *,
    record: AssistantAgent,
    outcome_metrics: AssistantAgentOutcomeMetricRow | None,
    action_type_metrics: tuple[AssistantActionTypeOutcomeMetricRow, ...],
    eval_signal: AssistantAutonomyEvalSignal,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    capabilities = set(record.capabilities or [])
    allowed_action_types = tuple(record.allowed_action_types or ())
    authority = str(record.authority_ceiling or "").upper()

    if record.status in {"PAUSED", "RETIRED"}:
        return AUTONOMY_RECOMMENDATION_PAUSE, [f"Agent status is {record.status}."]
    if authority == "EXTERNAL_COMMIT":
        return AUTONOMY_RECOMMENDATION_NARROW, [
            "External-commit authority is outside the Phase 1 autonomy boundary.",
        ]
    if authority == "EXECUTE":
        reasons.append("Execute authority requires explicit bounded-execution review before activation.")
    if "ACTION" in capabilities and not allowed_action_types:
        return AUTONOMY_RECOMMENDATION_NARROW, [
            "ACTION-capable agents must declare explicit governed action types.",
        ]
    if not record.human_owner_role:
        reasons.append("Human owner role is missing from the agent profile.")
    if eval_signal.status == EVAL_STATUS_MISSING_PLAN:
        reasons.append("Eval coverage is not declared for this agent.")

    metric_rows = [row for row in [outcome_metrics, *action_type_metrics] if row is not None]
    if any(row.recommendation.pause_recommended for row in metric_rows):
        reasons.extend(_recommendation_reasons(metric_rows, pause_only=True))
        return AUTONOMY_RECOMMENDATION_PAUSE, _dedupe(reasons)

    if outcome_metrics is None:
        reasons.append("No observed action outcomes exist for this agent in the selected window.")
        return AUTONOMY_RECOMMENDATION_KEEP_STAGED, _dedupe(reasons)

    promotion_rows = [outcome_metrics, *action_type_metrics]
    if (
        outcome_metrics.recommendation.recommended_action == RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW
        and all(
            row.recommendation.recommended_action == RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW
            for row in promotion_rows
        )
        and eval_signal.status != EVAL_STATUS_MISSING_PLAN
        and record.human_owner_role
        and authority not in {"EXECUTE", "EXTERNAL_COMMIT"}
    ):
        return AUTONOMY_RECOMMENDATION_ELIGIBLE_FOR_BOUNDED_REVIEW, _dedupe(
            [
                "Observed action outcomes pass conservative promotion thresholds.",
                "Eval expectations are declared; a human owner must still approve any authority change.",
            ]
        )

    reasons.extend(_recommendation_reasons(promotion_rows, pause_only=False))
    if not reasons:
        reasons.append("Keep the agent staged until outcome metrics, eval coverage, and owner review all line up.")
    return AUTONOMY_RECOMMENDATION_KEEP_STAGED, _dedupe(reasons)


def _recommendation_reasons(
    rows: Iterable[AssistantAgentOutcomeMetricRow | AssistantActionTypeOutcomeMetricRow],
    *,
    pause_only: bool,
) -> list[str]:
    reasons: list[str] = []
    for row in rows:
        recommendation = row.recommendation
        if pause_only and not recommendation.pause_recommended:
            continue
        if not pause_only and recommendation.recommended_action == RECOMMENDATION_RECOMMEND_PAUSE:
            continue
        reasons.extend(recommendation.reasons)
    return reasons


def _stop_conditions(
    record: AssistantAgent,
    *,
    role_stop_conditions: tuple[str, ...],
) -> tuple[str, ...]:
    conditions = list(role_stop_conditions)
    if "ACTION" in set(record.capabilities or ()):
        conditions.append("Do not execute business mutations directly from freeform output.")
    if str(record.authority_ceiling or "").upper() in {"EXECUTE", "EXTERNAL_COMMIT"}:
        conditions.append("Require separate owner approval before increasing execution authority.")
    conditions.append("Pause or narrow if rejection, failed-action, stale-action, or review burden rises.")
    return tuple(_dedupe(conditions))


def _review_checklist(record: AssistantAgent) -> tuple[str, ...]:
    checklist = [
        "Confirm the human owner and approval owner are named.",
        "Review outcome metrics for approvals, rejections, failed execution, stale actions, and pending backlog.",
        "Confirm eval coverage before changing status, tools, actions, or authority.",
        "Check knowledge-base lessons for stop conditions and deterministic algorithm candidates.",
    ]
    if "ACTION" in set(record.capabilities or ()):
        checklist.append("Run policy simulation for each allowed action type before increasing autonomy.")
    checklist.append("Record any new recurring judgment as an algorithm-candidate knowledge-base entry.")
    return tuple(checklist)


def _deterministic_candidates(
    *,
    knowledge_entries: tuple[AssistantAutonomyKnowledgeEntry, ...],
    action_type_metrics: tuple[AssistantActionTypeOutcomeMetricRow, ...],
) -> tuple[str, ...]:
    candidates = [
        entry.deterministic_opportunity
        for entry in knowledge_entries
        if entry.entry_type == "algorithm-candidate" and entry.deterministic_opportunity
    ]
    for row in action_type_metrics:
        if not row.recommendation.promotion_candidate:
            candidates.append(
                f"Review {row.action_type} blockers and promote recurring reviewer decisions into typed policy or service logic."
            )
    return tuple(_dedupe(candidates))


def _relevant_knowledge_entries(
    record: AssistantAgent,
    *,
    role_stop_conditions: tuple[str, ...],
) -> tuple[AssistantAutonomyKnowledgeEntry, ...]:
    entries = _parse_knowledge_base(KNOWLEDGE_BASE_PATH)
    keywords = _knowledge_keywords(record, role_stop_conditions=role_stop_conditions)
    scored: list[tuple[int, AssistantAutonomyKnowledgeEntry]] = []
    for entry in entries:
        haystack = " ".join(
            value
            for value in (
                entry.title,
                entry.entry_type,
                entry.domain,
                entry.applies_to,
                entry.lesson,
                entry.deterministic_opportunity,
                entry.agent_autonomy_impact,
            )
            if value
        ).lower()
        score = sum(1 for keyword in keywords if keyword in haystack)
        if entry.entry_type in {"stop-condition", "algorithm-candidate", "promotion-signal"}:
            score += 1
        if score > 0:
            scored.append((score, entry))

    scored.sort(key=lambda item: (-item[0], item[1].title))
    if scored:
        return tuple(entry for _, entry in scored[:6])
    return tuple(entries[:4])


def _knowledge_keywords(
    record: AssistantAgent,
    *,
    role_stop_conditions: tuple[str, ...],
) -> set[str]:
    values = [
        record.agent_id,
        record.name,
        record.role_key or "",
        record.profile_kind or "",
        record.human_owner_role or "",
        *(record.allowed_workspaces or []),
        *(record.capabilities or []),
        *(record.allowed_action_types or []),
        *role_stop_conditions,
    ]
    keywords: set[str] = {"agent", "autonomy", "action", "deterministic"}
    for value in values:
        for token in str(value).replace("_", " ").replace("-", " ").lower().split():
            if len(token) >= 4:
                keywords.add(token)
    return keywords


def _parse_knowledge_base(path: Path) -> tuple[AssistantAutonomyKnowledgeEntry, ...]:
    if not path.exists():
        return ()

    entries: list[AssistantAutonomyKnowledgeEntry] = []
    current_title: str | None = None
    current_fields: dict[str, str] = {}
    active_field: str | None = None

    def flush_entry() -> None:
        if current_title is None:
            return
        entries.append(
            AssistantAutonomyKnowledgeEntry(
                title=current_title,
                entry_type=current_fields.get("type"),
                domain=current_fields.get("domain"),
                applies_to=current_fields.get("applies to"),
                status=current_fields.get("status"),
                lesson=current_fields.get("lesson"),
                deterministic_opportunity=current_fields.get("deterministic opportunity"),
                agent_autonomy_impact=current_fields.get("agent autonomy impact"),
            )
        )

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("### "):
            flush_entry()
            current_title = line.removeprefix("### ").strip()
            current_fields = {}
            active_field = None
            continue
        if current_title is None:
            continue
        if line.startswith("- ") and ":" in line:
            key, value = line[2:].split(":", 1)
            active_field = key.strip().lower()
            current_fields[active_field] = value.strip()
            continue
        if active_field and line.startswith("  "):
            current_fields[active_field] = f"{current_fields[active_field]} {line.strip()}".strip()
    flush_entry()
    return tuple(entries)


def _dedupe(values: Iterable[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        deduped.append(normalized)
        seen.add(normalized)
    return deduped
