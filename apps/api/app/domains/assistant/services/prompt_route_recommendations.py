from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.outcome_metrics import (
    PROMPT_NAVIGATION_NARROW_MIN_DISMISSED,
    PROMPT_NAVIGATION_NARROW_MIN_DISMISS_RATE,
    PROMPT_NAVIGATION_RETIRE_MIN_FAILED,
    PROMPT_NAVIGATION_RETIRE_MIN_FAILURE_RATE,
    PROMPT_NAVIGATION_RULE_CANDIDATE_MIN_ACCEPTANCE_RATE,
    PROMPT_NAVIGATION_RULE_CANDIDATE_MIN_ACCEPTED,
    PROMPT_NAVIGATION_SIGNAL_CANDIDATE_FOR_RULE,
    PROMPT_NAVIGATION_SIGNAL_NARROW,
    PROMPT_NAVIGATION_SIGNAL_OBSERVE,
    PROMPT_NAVIGATION_SIGNAL_RETIRE,
)
from apps.api.app.models.assistant_prompt_navigation_outcome import AssistantPromptNavigationOutcome


PROMPT_ROUTE_RECOMMENDATION_LOOKBACK_DAYS = 30
PROMPT_ROUTE_RECOMMENDATION_LIMIT = 3


@dataclass(frozen=True)
class AssistantPromptRouteRecommendation:
    target_view: str
    target_label: str | None
    target_rationale: str | None
    focus_type: str | None
    accepted_count: int
    outcome_count: int
    acceptance_rate: float | None
    signal: str
    signal_reasons: tuple[str, ...]


@dataclass
class _PromptRouteAccumulator:
    target_view: str
    target_label: str | None = None
    target_rationale: str | None = None
    focus_type: str | None = None
    accepted_count: int = 0
    dismissed_count: int = 0
    failed_count: int = 0


def list_prompt_route_recommendations(
    db: Session,
    *,
    user_role: str,
    now: datetime | None = None,
    limit: int = PROMPT_ROUTE_RECOMMENDATION_LIMIT,
) -> tuple[AssistantPromptRouteRecommendation, ...]:
    generated_at = _coerce_aware_datetime(now) or datetime.now(timezone.utc)
    lookback_after = generated_at - timedelta(days=PROMPT_ROUTE_RECOMMENDATION_LOOKBACK_DAYS)
    normalized_user_role = _normalize_optional_text(user_role)
    if normalized_user_role is None:
        return ()

    records = _load_recent_prompt_navigation_outcomes(
        db,
        user_role=normalized_user_role,
        created_after=lookback_after,
    )

    accumulators: dict[str, _PromptRouteAccumulator] = {}
    for record in records:
        target_view = _normalize_optional_text(record.target_view)
        if target_view is None:
            continue
        target_label = _normalize_optional_text(record.target_label)
        focus_type = _normalize_optional_text(record.focus_type)

        accumulator = accumulators.setdefault(
            _prompt_route_key(
                target_view=target_view,
                target_label=target_label,
                focus_type=focus_type,
            ),
            _PromptRouteAccumulator(
                target_view=target_view,
                target_label=target_label,
                focus_type=focus_type,
            ),
        )
        if accumulator.target_label is None:
            accumulator.target_label = target_label
        if accumulator.target_rationale is None:
            accumulator.target_rationale = _normalize_optional_text(record.target_rationale)
        if accumulator.focus_type is None:
            accumulator.focus_type = focus_type

        outcome = _normalize_optional_text(record.outcome, uppercase=True)
        if outcome == "ACCEPTED":
            accumulator.accepted_count += 1
        elif outcome == "DISMISSED":
            accumulator.dismissed_count += 1
        elif outcome == "FAILED":
            accumulator.failed_count += 1

    recommendations: list[AssistantPromptRouteRecommendation] = []
    for accumulator in accumulators.values():
        outcome_count = accumulator.accepted_count + accumulator.dismissed_count + accumulator.failed_count
        signal, signal_reasons = _prompt_route_signal(accumulator, outcome_count=outcome_count)
        if signal != PROMPT_NAVIGATION_SIGNAL_CANDIDATE_FOR_RULE:
            continue

        recommendations.append(
            AssistantPromptRouteRecommendation(
                target_view=accumulator.target_view,
                target_label=accumulator.target_label,
                target_rationale=accumulator.target_rationale,
                focus_type=accumulator.focus_type,
                accepted_count=accumulator.accepted_count,
                outcome_count=outcome_count,
                acceptance_rate=_safe_ratio(accumulator.accepted_count, outcome_count),
                signal=signal,
                signal_reasons=tuple(signal_reasons),
            )
        )

    recommendations.sort(
        key=lambda recommendation: (
            recommendation.accepted_count,
            recommendation.acceptance_rate or 0.0,
            _prompt_route_specificity_score(recommendation),
            recommendation.target_label or recommendation.target_view,
        ),
        reverse=True,
    )
    normalized_limit = max(1, limit)
    return tuple(recommendations[:normalized_limit])


def _load_recent_prompt_navigation_outcomes(
    db: Session,
    *,
    user_role: str,
    created_after: datetime,
) -> list[AssistantPromptNavigationOutcome]:
    stmt = (
        select(AssistantPromptNavigationOutcome)
        .where(AssistantPromptNavigationOutcome.user_role == user_role)
        .where(AssistantPromptNavigationOutcome.surface == "PROMPT_HOME")
        .where(AssistantPromptNavigationOutcome.created_at >= created_after)
        .where(AssistantPromptNavigationOutcome.target_view.is_not(None))
        .order_by(
            AssistantPromptNavigationOutcome.updated_at.desc(),
            AssistantPromptNavigationOutcome.id.desc(),
        )
    )
    return list(db.execute(stmt).scalars().all())


def _prompt_route_signal(
    accumulator: _PromptRouteAccumulator,
    *,
    outcome_count: int,
) -> tuple[str, list[str]]:
    acceptance_rate = _safe_ratio(accumulator.accepted_count, outcome_count) or 0.0
    dismiss_rate = _safe_ratio(accumulator.dismissed_count, outcome_count) or 0.0
    failure_rate = _safe_ratio(accumulator.failed_count, outcome_count) or 0.0

    if (
        accumulator.failed_count >= PROMPT_NAVIGATION_RETIRE_MIN_FAILED
        and failure_rate >= PROMPT_NAVIGATION_RETIRE_MIN_FAILURE_RATE
    ):
        return (
            PROMPT_NAVIGATION_SIGNAL_RETIRE,
            [
                "Repeated failed handoff payloads suggest this route should be paused or rebuilt.",
            ],
        )

    if (
        accumulator.dismissed_count >= PROMPT_NAVIGATION_NARROW_MIN_DISMISSED
        and dismiss_rate >= PROMPT_NAVIGATION_NARROW_MIN_DISMISS_RATE
    ):
        return (
            PROMPT_NAVIGATION_SIGNAL_NARROW,
            [
                "Users dismiss this destination often enough that the routing rule should narrow or ask for confirmation.",
            ],
        )

    if (
        accumulator.accepted_count >= PROMPT_NAVIGATION_RULE_CANDIDATE_MIN_ACCEPTED
        and acceptance_rate >= PROMPT_NAVIGATION_RULE_CANDIDATE_MIN_ACCEPTANCE_RATE
        and accumulator.failed_count == 0
    ):
        return (
            PROMPT_NAVIGATION_SIGNAL_CANDIDATE_FOR_RULE,
            [
                "Repeated accepted handoffs make this destination a strong deterministic rule candidate.",
            ],
        )

    if outcome_count == 0:
        return (
            PROMPT_NAVIGATION_SIGNAL_OBSERVE,
            ["No prompt-first handoff outcomes were recorded for this destination."],
        )
    if accumulator.failed_count > 0:
        return (
            PROMPT_NAVIGATION_SIGNAL_OBSERVE,
            ["Keep observing until failed handoffs stop appearing for this destination."],
        )
    if accumulator.dismissed_count > 0:
        return (
            PROMPT_NAVIGATION_SIGNAL_OBSERVE,
            ["Keep observing whether users accept or dismiss this route more consistently."],
        )
    return (
        PROMPT_NAVIGATION_SIGNAL_OBSERVE,
        ["Keep observing until the route has enough repeated outcomes to justify product logic."],
    )


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _normalize_optional_text(
    value: object,
    *,
    uppercase: bool = False,
) -> str | None:
    if not isinstance(value, str):
        return None
    normalized_value = value.strip()
    if not normalized_value:
        return None
    if uppercase:
        return normalized_value.upper()
    return normalized_value


def _prompt_route_key(
    *,
    target_view: str,
    target_label: str | None,
    focus_type: str | None,
) -> str:
    return "::".join(
        [
            target_view,
            target_label or "__unlabeled__",
            focus_type or "__workspace__",
        ]
    )


def _prompt_route_specificity_score(
    recommendation: AssistantPromptRouteRecommendation,
) -> int:
    score = 0
    if recommendation.focus_type is not None:
        score += 1
    if recommendation.target_label is not None:
        score += 1
    return score


def _coerce_aware_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
