from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from pydantic import ValidationError
from sqlalchemy import or_, select

from apps.api.app.domains.reports.services.pretrade_reviews import PRETRADE_SHARED_OWNER_KEY
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationCheckOut,
    PreTradeRecommendationResultOut,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceAdapterOut,
    PreTradeRecommendationSourceProvenance,
    PreTradeRecommendationSourceQuality,
    PreTradeRecommendationSourceSnapshot,
    PreTradeRecommendationStance,
    PreTradeRecommendationSourceType,
    PreTradeReviewRecommendationSummary,
    PreTradeScenarioDraft,
)

PRETRADE_RECOMMENDATION_RUN_PRESET_KEY = "pretrade_recommendation_run"

STANCE_ORDER: tuple[PreTradeRecommendationStance, ...] = (
    "PROCEED",
    "PROCEED_WITH_CARE",
    "ESCALATE",
    "WAIT_FOR_DATA",
)

QUALITY_SCORE_BY_STATUS: dict[PreTradeRecommendationSourceQuality, int] = {
    "OK": 100,
    "STALE": 65,
    "DEGRADED": 45,
    "MISSING": 0,
}


@dataclass(frozen=True)
class SourceAdapterDefinition:
    adapter_key: str
    label: str
    source_type: PreTradeRecommendationSourceType
    description: str
    freshness_sla_hours: int | None
    required_for_recommendation: bool
    payload_keys: tuple[str, ...]
    missing_if_false_keys: tuple[str, ...] = ()
    provenance_dataset: str = ""


SOURCE_ADAPTERS: tuple[SourceAdapterDefinition, ...] = (
    SourceAdapterDefinition(
        adapter_key="desk-context",
        label="Desk exposure context",
        source_type="INTERNAL",
        description="Internal active trades and net position used to assess concentration.",
        freshness_sla_hours=24,
        required_for_recommendation=True,
        payload_keys=("related_active_trade_count", "current_net_position", "current_counterparty_exposure"),
        provenance_dataset="active-trades-and-positions",
    ),
    SourceAdapterDefinition(
        adapter_key="counterparty-credit",
        label="Counterparty credit profile",
        source_type="INTERNAL",
        description="Internal credit coverage, limits, breach action, and external rating context.",
        freshness_sla_hours=168,
        required_for_recommendation=True,
        payload_keys=("has_credit_profile", "credit_limit_amount", "breach_action", "credit_rating"),
        missing_if_false_keys=("has_credit_profile",),
        provenance_dataset="counterparty-credit-profiles",
    ),
    SourceAdapterDefinition(
        adapter_key="latest-mark",
        label="Latest price-index mark",
        source_type="EXTERNAL",
        description="External mark used to compare target economics against market context.",
        freshness_sla_hours=48,
        required_for_recommendation=True,
        payload_keys=("latest_mark", "price_index_code", "observation_date"),
        provenance_dataset="price-index-observations",
    ),
    SourceAdapterDefinition(
        adapter_key="market-context",
        label="Market context",
        source_type="EXTERNAL",
        description="External market drivers and macro/fundamental freshness context.",
        freshness_sla_hours=24,
        required_for_recommendation=False,
        payload_keys=("market_freshness_issue_count", "fundamental_count", "macro_count"),
        provenance_dataset="market-context",
    ),
    SourceAdapterDefinition(
        adapter_key="weather-intelligence",
        label="Weather intelligence",
        source_type="EXTERNAL",
        description="External weather signal summary used to flag regional demand, supply, or storm risk.",
        freshness_sla_hours=24,
        required_for_recommendation=False,
        payload_keys=("weather_high_risk_count", "live_weather_location_count"),
        provenance_dataset="weather-intelligence",
    ),
)

SOURCE_ADAPTER_BY_KEY = {adapter.adapter_key: adapter for adapter in SOURCE_ADAPTERS}


def list_pretrade_source_adapters() -> list[PreTradeRecommendationSourceAdapterOut]:
    return [
        PreTradeRecommendationSourceAdapterOut(
            adapter_key=adapter.adapter_key,
            label=adapter.label,
            source_type=adapter.source_type,
            description=adapter.description,
            freshness_sla_hours=adapter.freshness_sla_hours,
            required_for_recommendation=adapter.required_for_recommendation,
            payload_keys=list(adapter.payload_keys),
            provenance_dataset=adapter.provenance_dataset,
        )
        for adapter in SOURCE_ADAPTERS
    ]


def pretrade_recommendation_run_records_stmt(actor_id: str):
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
        or_(
            ReportPreset.scope_owner_key == actor_id,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        ),
    )


def pretrade_recommendation_run_record_stmt(run_id: int):
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
        ReportPreset.id == run_id,
    )


def recommendation_run_payload(record: ReportPreset) -> dict[str, object]:
    payload = record.filters_json or {}
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _is_blank(value: str | None) -> bool:
    return (value or "").strip() == ""


def _safe_divide(numerator: float, denominator: float) -> float | None:
    if not denominator:
        return None
    return (numerator / denominator) * 100


def _source_age_hours(snapshot: PreTradeRecommendationSourceSnapshot, as_of: datetime) -> float | None:
    observed_at = snapshot.provenance.observed_at or snapshot.captured_at or snapshot.provenance.ingested_at
    if observed_at is None:
        return None
    if observed_at.tzinfo is None and as_of.tzinfo is not None:
        observed_at = observed_at.replace(tzinfo=as_of.tzinfo)
    if observed_at.tzinfo is not None and as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=observed_at.tzinfo)
    return max(0.0, (as_of - observed_at).total_seconds() / 3600)


def _payload_has_value(payload: dict[str, object], keys: Iterable[str]) -> bool:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return True
    return False


def _source_quality_status(
    *,
    adapter: SourceAdapterDefinition,
    snapshot: PreTradeRecommendationSourceSnapshot,
    as_of: datetime,
) -> PreTradeRecommendationSourceQuality:
    if not snapshot.source_available:
        return "MISSING"
    if any(snapshot.payload.get(key) is False for key in adapter.missing_if_false_keys):
        return "MISSING"
    if adapter.payload_keys and not _payload_has_value(snapshot.payload, adapter.payload_keys):
        return "MISSING"
    if snapshot.freshness == "DEGRADED":
        return "DEGRADED"
    if snapshot.freshness == "STALE":
        return "STALE"

    source_age_hours = _source_age_hours(snapshot, as_of)
    if adapter.freshness_sla_hours is not None and source_age_hours is not None and source_age_hours > adapter.freshness_sla_hours:
        return "STALE"
    return "OK"


def _provenance_from_snapshot(
    *,
    adapter: SourceAdapterDefinition,
    snapshot: PreTradeRecommendationSourceSnapshot,
    actor_id: str | None,
) -> PreTradeRecommendationSourceProvenance:
    payload = snapshot.payload
    provider = snapshot.provenance.provider
    if provider is None:
        raw_provider = payload.get("source_provider") or payload.get("provider")
        provider = raw_provider if isinstance(raw_provider, str) and raw_provider.strip() else adapter.label

    record_id = snapshot.provenance.record_id
    if record_id is None:
        for key in ("record_id", "source_series_id", "price_index_code", "counterparty_code", "observation_date"):
            raw_value = payload.get(key)
            if isinstance(raw_value, str) and raw_value.strip():
                record_id = raw_value.strip()
                break

    return PreTradeRecommendationSourceProvenance(
        provider=provider,
        dataset=snapshot.provenance.dataset or adapter.provenance_dataset,
        record_id=record_id,
        observed_at=snapshot.provenance.observed_at or snapshot.captured_at,
        ingested_at=snapshot.provenance.ingested_at or snapshot.captured_at,
        captured_by=snapshot.provenance.captured_by or actor_id,
    )


def _missing_source_snapshot(adapter: SourceAdapterDefinition, *, actor_id: str | None) -> PreTradeRecommendationSourceSnapshot:
    return PreTradeRecommendationSourceSnapshot(
        source_key=adapter.adapter_key,
        adapter_key=adapter.adapter_key,
        adapter_label=adapter.label,
        source_type=adapter.source_type,
        source_available=False,
        freshness="UNKNOWN",
        quality_status="MISSING",
        quality_score=QUALITY_SCORE_BY_STATUS["MISSING"],
        summary=f"No {adapter.label.lower()} snapshot was captured.",
        provenance=PreTradeRecommendationSourceProvenance(
            provider=adapter.label,
            dataset=adapter.provenance_dataset,
            captured_by=actor_id,
        ),
        payload={},
    )


def normalize_recommendation_input_snapshots(
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    *,
    as_of: datetime,
    actor_id: str | None = None,
) -> list[PreTradeRecommendationSourceSnapshot]:
    snapshots_by_key = {
        (snapshot.adapter_key or snapshot.source_key): snapshot
        for snapshot in input_snapshots
        if (snapshot.adapter_key or snapshot.source_key)
    }
    normalized: list[PreTradeRecommendationSourceSnapshot] = []

    for adapter in SOURCE_ADAPTERS:
        snapshot = snapshots_by_key.get(adapter.adapter_key)
        if snapshot is None:
            normalized.append(_missing_source_snapshot(adapter, actor_id=actor_id))
            continue

        quality_status = _source_quality_status(adapter=adapter, snapshot=snapshot, as_of=as_of)
        normalized.append(
            snapshot.model_copy(
                update={
                    "adapter_key": adapter.adapter_key,
                    "adapter_label": adapter.label,
                    "source_type": adapter.source_type,
                    "quality_status": quality_status,
                    "quality_score": QUALITY_SCORE_BY_STATUS[quality_status],
                    "provenance": _provenance_from_snapshot(
                        adapter=adapter,
                        snapshot=snapshot,
                        actor_id=actor_id,
                    ),
                }
            )
        )

    known_adapter_keys = {adapter.adapter_key for adapter in SOURCE_ADAPTERS}
    for snapshot in input_snapshots:
        adapter_key = snapshot.adapter_key or snapshot.source_key
        if adapter_key in known_adapter_keys:
            continue
        quality_status: PreTradeRecommendationSourceQuality = (
            "MISSING" if not snapshot.source_available else "DEGRADED" if snapshot.freshness == "DEGRADED" else "STALE" if snapshot.freshness == "STALE" else "OK"
        )
        normalized.append(
            snapshot.model_copy(
                update={
                    "adapter_key": adapter_key,
                    "adapter_label": snapshot.adapter_label or snapshot.source_key,
                    "quality_status": quality_status,
                    "quality_score": QUALITY_SCORE_BY_STATUS[quality_status],
                }
            )
        )

    return normalized


def _max_stance(
    current: PreTradeRecommendationStance,
    candidate: PreTradeRecommendationStance,
) -> PreTradeRecommendationStance:
    return candidate if STANCE_ORDER.index(candidate) > STANCE_ORDER.index(current) else current


def _payload_number(
    snapshots: Iterable[PreTradeRecommendationSourceSnapshot],
    keys: Iterable[str],
) -> float | None:
    for snapshot in snapshots:
        for key in keys:
            value = snapshot.payload.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int | float):
                return float(value)
    return None


def _payload_text(
    snapshots: Iterable[PreTradeRecommendationSourceSnapshot],
    keys: Iterable[str],
) -> str | None:
    for snapshot in snapshots:
        for key in keys:
            value = snapshot.payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _payload_bool(
    snapshots: Iterable[PreTradeRecommendationSourceSnapshot],
    keys: Iterable[str],
) -> bool | None:
    for snapshot in snapshots:
        for key in keys:
            value = snapshot.payload.get(key)
            if isinstance(value, bool):
                return value
    return None


def _format_percent(value: float | None) -> str:
    return "n/a" if value is None else f"{round(value)}%"


def _build_check(
    *,
    key: str,
    label: str,
    status: str,
    detail: str,
) -> PreTradeRecommendationCheckOut:
    impact_by_status = {
        "good": 0,
        "watch": -12,
        "block": -30,
    }
    return PreTradeRecommendationCheckOut(
        key=key,
        label=label,
        status=status,  # type: ignore[arg-type]
        detail=detail,
        score_impact=impact_by_status[status],
    )


def _snapshot_has_degraded_external_context(snapshots: list[PreTradeRecommendationSourceSnapshot]) -> bool:
    if any(snapshot.source_type == "EXTERNAL" and snapshot.freshness in {"STALE", "DEGRADED"} for snapshot in snapshots):
        return True
    stale_source_count = _payload_number(snapshots, ("stale_source_count", "market_freshness_issue_count"))
    return stale_source_count is not None and stale_source_count > 0


def build_pretrade_recommendation_result(
    *,
    draft: PreTradeScenarioDraft,
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    as_of: datetime | None = None,
) -> PreTradeRecommendationResultOut:
    input_snapshots = normalize_recommendation_input_snapshots(
        input_snapshots,
        as_of=as_of or datetime.now(timezone.utc),
    )
    checks: list[PreTradeRecommendationCheckOut] = []
    stance: PreTradeRecommendationStance = "PROCEED"
    required_adapter_keys = {
        adapter.adapter_key
        for adapter in SOURCE_ADAPTERS
        if adapter.required_for_recommendation and (adapter.adapter_key != "latest-mark" or draft.pricing_type.upper() != "FIXED")
    }
    missing_required_sources = [
        snapshot.adapter_label or snapshot.source_key
        for snapshot in input_snapshots
        if (snapshot.adapter_key or snapshot.source_key) in required_adapter_keys
        and snapshot.quality_status == "MISSING"
        and not snapshot.source_available
    ]
    impaired_sources = [
        snapshot.adapter_label or snapshot.source_key
        for snapshot in input_snapshots
        if snapshot.quality_status in {"STALE", "DEGRADED", "MISSING"}
        and snapshot.source_available
    ]

    if missing_required_sources:
        stance = _max_stance(stance, "WAIT_FOR_DATA")
        checks.append(
            _build_check(
                key="source-quality",
                label="Source adapter quality",
                status="block",
                detail=f"Required source adapters did not capture evidence: {', '.join(missing_required_sources[:3])}.",
            )
        )
    elif impaired_sources:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="source-quality",
                label="Source adapter quality",
                status="watch",
                detail=f"Some source evidence is stale, degraded, or incomplete: {', '.join(impaired_sources[:3])}.",
            )
        )
    else:
        checks.append(
            _build_check(
                key="source-quality",
                label="Source adapter quality",
                status="good",
                detail="Required source adapters captured clean evidence within their freshness windows.",
            )
        )

    estimated_notional = (
        abs(draft.target_price * draft.target_volume)
        if draft.target_price is not None and draft.target_volume is not None
        else None
    )
    current_counterparty_exposure = _payload_number(
        input_snapshots,
        ("current_counterparty_exposure", "counterparty_exposure"),
    )
    credit_limit_amount = _payload_number(input_snapshots, ("credit_limit_amount", "limit_amount"))
    projected_credit_utilization_pct = _payload_number(
        input_snapshots,
        ("projected_credit_utilization_pct",),
    )
    if projected_credit_utilization_pct is None and estimated_notional is not None and credit_limit_amount:
        projected_credit_utilization_pct = _safe_divide(
            (current_counterparty_exposure or 0) + estimated_notional,
            credit_limit_amount,
        )

    current_net_position = _payload_number(input_snapshots, ("current_net_position", "net_position"))
    related_active_trade_count = int(_payload_number(input_snapshots, ("related_active_trade_count",)) or 0)
    latest_mark = _payload_number(input_snapshots, ("latest_mark", "latest_mark_value", "mark_value", "value"))
    mark_gap_pct = (
        _safe_divide(abs(draft.target_price - latest_mark), abs(latest_mark))
        if latest_mark is not None and draft.target_price is not None and latest_mark != 0
        else None
    )
    has_credit_profile = _payload_bool(input_snapshots, ("has_credit_profile",))
    breach_action = _payload_text(input_snapshots, ("breach_action", "credit_breach_action"))
    if has_credit_profile is None:
        has_credit_profile = credit_limit_amount is not None or breach_action is not None

    if _is_blank(draft.book) or _is_blank(draft.commodity_class) or _is_blank(draft.commodity) or draft.target_volume is None:
        stance = _max_stance(stance, "WAIT_FOR_DATA")
        checks.append(
            _build_check(
                key="required-fields",
                label="Required trade context",
                status="block",
                detail="Book, commodity, and target volume are required before the desk can form a reliable recommendation.",
            )
        )
    else:
        checks.append(
            _build_check(
                key="required-fields",
                label="Required trade context",
                status="good",
                detail="Core deal descriptors are present, so downstream checks can be evaluated with captured context.",
            )
        )

    if _is_blank(draft.counterparty):
        stance = _max_stance(stance, "WAIT_FOR_DATA")
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="block",
                detail="Counterparty is missing, so credit coverage and exposure concentration cannot be verified yet.",
            )
        )
    elif not has_credit_profile:
        stance = _max_stance(stance, "ESCALATE")
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="block",
                detail=f"No captured internal credit profile was found for {draft.counterparty}. Escalate before booking.",
            )
        )
    elif breach_action == "BLOCK":
        stance = _max_stance(stance, "ESCALATE")
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="block",
                detail=f"{draft.counterparty} is configured to block new activity when credit checks fail.",
            )
        )
    elif projected_credit_utilization_pct is not None and projected_credit_utilization_pct >= 90:
        stance = _max_stance(stance, "ESCALATE")
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="block",
                detail=f"Projected credit utilization reaches {_format_percent(projected_credit_utilization_pct)} of the captured limit.",
            )
        )
    elif projected_credit_utilization_pct is not None and projected_credit_utilization_pct >= 75:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="watch",
                detail=f"Projected credit utilization reaches {_format_percent(projected_credit_utilization_pct)} of the captured limit.",
            )
        )
    else:
        rating = _payload_text(input_snapshots, ("external_rating_value", "credit_rating", "rating_value")) or "No rating"
        checks.append(
            _build_check(
                key="counterparty",
                label="Counterparty readiness",
                status="good",
                detail=f"Captured credit coverage is in place. Latest available rating context: {rating}.",
            )
        )

    if draft.pricing_type.upper() != "FIXED" and _is_blank(draft.price_index_code):
        stance = _max_stance(stance, "WAIT_FOR_DATA")
        checks.append(
            _build_check(
                key="pricing",
                label="Pricing coverage",
                status="block",
                detail="Floating structures need a price index before the recommendation engine can compare current marks.",
            )
        )
    elif latest_mark is None:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="pricing",
                label="Pricing coverage",
                status="watch",
                detail="No captured mark was available for the chosen index, so the price view is directional rather than confirmed.",
            )
        )
    elif mark_gap_pct is not None and mark_gap_pct >= 15:
        stance = _max_stance(stance, "ESCALATE")
        checks.append(
            _build_check(
                key="pricing",
                label="Pricing coverage",
                status="block",
                detail=f"Target pricing is {_format_percent(mark_gap_pct)} away from the captured mark.",
            )
        )
    elif mark_gap_pct is not None and mark_gap_pct >= 7:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="pricing",
                label="Pricing coverage",
                status="watch",
                detail=f"Target pricing is {_format_percent(mark_gap_pct)} away from the captured mark.",
            )
        )
    else:
        checks.append(
            _build_check(
                key="pricing",
                label="Pricing coverage",
                status="good",
                detail="Target economics are close to the captured mark.",
            )
        )

    weather_high_risk_count = _payload_number(input_snapshots, ("weather_high_risk_count", "elevated_weather_risk_count")) or 0
    if _snapshot_has_degraded_external_context(input_snapshots) or weather_high_risk_count > 0:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="external-context",
                label="External context",
                status="watch",
                detail=(
                    "Weather-driven regional risk is elevated for this commodity class."
                    if weather_high_risk_count > 0
                    else "Some captured external market context is stale or degraded, so conviction should stay measured."
                ),
            )
        )
    else:
        checks.append(
            _build_check(
                key="external-context",
                label="External context",
                status="good",
                detail="Captured market and weather context do not add an obvious external blocker.",
            )
        )

    if current_net_position is not None and draft.target_volume is not None:
        same_direction = (
            (current_net_position >= 0 and draft.trade_side == "BUY")
            or (current_net_position <= 0 and draft.trade_side == "SELL")
        )
        if abs(current_net_position) >= draft.target_volume * 3 and same_direction:
            stance = _max_stance(stance, "PROCEED_WITH_CARE")
            checks.append(
                _build_check(
                    key="positioning",
                    label="Positioning impact",
                    status="watch",
                    detail="The proposed trade adds to an already concentrated directional position in the same commodity.",
                )
            )
        else:
            checks.append(
                _build_check(
                    key="positioning",
                    label="Positioning impact",
                    status="good",
                    detail="Current net position does not create an obvious concentration warning for the proposed size.",
                )
            )
    else:
        stance = _max_stance(stance, "PROCEED_WITH_CARE")
        checks.append(
            _build_check(
                key="positioning",
                label="Positioning impact",
                status="watch",
                detail="Position impact is only partially available because net position or target size is missing.",
            )
        )

    next_actions = [check.detail for check in checks if check.status != "good"][:3]
    watch_count = sum(1 for check in checks if check.status == "watch")
    block_count = sum(1 for check in checks if check.status == "block")
    score = max(0, min(100, 100 + sum(check.score_impact for check in checks)))
    confidence = "LOW" if block_count > 0 or len(input_snapshots) < 2 else "MEDIUM" if watch_count > 1 else "HIGH"

    headline_by_stance = {
        "PROCEED": "Proceed with standard controls.",
        "PROCEED_WITH_CARE": "Proceed, but keep the desk close to pricing and risk drift.",
        "ESCALATE": "Escalate before capture.",
        "WAIT_FOR_DATA": "Wait for missing inputs before recommending action.",
    }
    summary_by_stance = {
        "PROCEED": "Core trade context, pricing, and credit checks are aligned enough to hand off into capture.",
        "PROCEED_WITH_CARE": "The setup is viable, but one or more checks need tighter operator attention during execution.",
        "ESCALATE": "A material credit or pricing concern needs review before the desk should book the ticket.",
        "WAIT_FOR_DATA": "The recommendation is intentionally blocked until essential trade context is filled in.",
    }

    return PreTradeRecommendationResultOut(
        stance=stance,
        headline=headline_by_stance[stance],
        summary=summary_by_stance[stance],
        confidence=confidence,  # type: ignore[arg-type]
        score=score,
        estimated_notional=estimated_notional,
        projected_credit_utilization_pct=projected_credit_utilization_pct,
        current_net_position=current_net_position,
        related_active_trade_count=related_active_trade_count,
        latest_mark=latest_mark,
        mark_gap_pct=mark_gap_pct,
        checks=checks,
        next_actions=next_actions
        or ["No blocking gaps were detected. Hand the scenario into trade capture when the desk is ready."],
    )


def build_recommendation_run_payload(
    *,
    thesis: str | None,
    draft: PreTradeScenarioDraft,
    source_scenario_id: int | None,
    source_review_id: int | None,
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    recommendation: PreTradeRecommendationResultOut,
) -> dict[str, object | None]:
    return {
        "thesis": thesis,
        "draft": draft.model_dump(mode="json", exclude_none=True),
        "source_scenario_id": source_scenario_id,
        "source_review_id": source_review_id,
        "input_snapshots": [snapshot.model_dump(mode="json", exclude_none=True) for snapshot in input_snapshots],
        "recommendation": recommendation.model_dump(mode="json", exclude_none=True),
    }


def recommendation_run_source_scenario_id(record: ReportPreset) -> int | None:
    source_scenario_id = recommendation_run_payload(record).get("source_scenario_id")
    return source_scenario_id if isinstance(source_scenario_id, int) else None


def recommendation_run_source_review_id(record: ReportPreset) -> int | None:
    source_review_id = recommendation_run_payload(record).get("source_review_id")
    return source_review_id if isinstance(source_review_id, int) else None


def recommendation_run_input_snapshots(record: ReportPreset) -> list[PreTradeRecommendationSourceSnapshot]:
    raw_snapshots = recommendation_run_payload(record).get("input_snapshots")
    if not isinstance(raw_snapshots, list):
        return []

    snapshots: list[PreTradeRecommendationSourceSnapshot] = []
    for item in raw_snapshots:
        try:
            snapshots.append(PreTradeRecommendationSourceSnapshot.model_validate(item))
        except ValidationError:
            continue
    return snapshots


def to_recommendation_run_out(record: ReportPreset, *, actor_id: str) -> PreTradeRecommendationRunOut:
    payload = recommendation_run_payload(record)
    draft = PreTradeScenarioDraft.model_validate(payload.get("draft") or {})
    input_snapshots = normalize_recommendation_input_snapshots(
        recommendation_run_input_snapshots(record),
        as_of=record.created_at,
        actor_id=record.created_by,
    )
    raw_recommendation = payload.get("recommendation")
    try:
        recommendation = PreTradeRecommendationResultOut.model_validate(raw_recommendation)
    except ValidationError:
        recommendation = build_pretrade_recommendation_result(
            draft=draft,
            input_snapshots=input_snapshots,
        )

    thesis = payload.get("thesis")
    return PreTradeRecommendationRunOut(
        run_id=record.id,
        run_key=record.name_key,
        name=record.name,
        thesis=thesis if isinstance(thesis, str) else None,
        draft=draft,
        source_scenario_id=recommendation_run_source_scenario_id(record),
        source_review_id=recommendation_run_source_review_id(record),
        input_snapshots=input_snapshots,
        recommendation=recommendation,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.scope_owner_key == actor_id or record.created_by == actor_id,
    )


def to_recommendation_summary(record: ReportPreset) -> PreTradeReviewRecommendationSummary:
    run = to_recommendation_run_out(record, actor_id=record.created_by)
    return PreTradeReviewRecommendationSummary(
        run_id=run.run_id,
        run_key=run.run_key,
        name=run.name,
        stance=run.recommendation.stance,
        headline=run.recommendation.headline,
        confidence=run.recommendation.confidence,
        score=run.recommendation.score,
        source_scenario_id=run.source_scenario_id,
        source_review_id=run.source_review_id,
        input_snapshot_count=len(run.input_snapshots),
        created_at=run.created_at,
        created_by=run.created_by,
    )


def build_recommendation_summary_lookup(
    db,
    recommendation_run_ids: Iterable[int],
) -> dict[int, PreTradeReviewRecommendationSummary]:
    normalized_ids = sorted({run_id for run_id in recommendation_run_ids if run_id > 0})
    if not normalized_ids:
        return {}

    records = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
            ReportPreset.id.in_(normalized_ids),
        )
    ).scalars().all()
    return {record.id: to_recommendation_summary(record) for record in records}
