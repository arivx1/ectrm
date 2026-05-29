from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timezone
from typing import Iterable

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.market_context import build_market_context
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_REVIEW_PRESET_KEY,
    PRETRADE_SHARED_OWNER_KEY,
    review_recommendation_run_id,
)
from apps.api.app.domains.weather.services import build_weather_intelligence_overview
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationDraftAnalysisOut,
    PreTradeArbitrageCandidateStatus,
    PreTradeArbitrageFamily,
    PreTradeRecommendationCheckOut,
    PreTradeRecommendationConfidence,
    PreTradeRecommendationArbitrageCandidateOut,
    PreTradeRecommendationCommodityStateOut,
    PreTradeRecommendationEvidenceRefOut,
    PreTradeExecutablePriceBasis,
    PreTradeExposureDirection,
    PreTradeExposureEffect,
    PreTradeRecommendationExplanationOut,
    PreTradeRecommendationHedgeRecommendationOut,
    PreTradeRecommendationInputDeltaOut,
    PreTradeRecommendationMissingEvidenceOut,
    PreTradeRecommendationNettingCandidateOut,
    PreTradeOpportunityCategory,
    PreTradeRecommendationOpportunitySummaryOut,
    PreTradeRecommendationResultOut,
    PreTradeRecommendationRejectedAlternativeOut,
    PreTradeRecommendationResidualExposureOut,
    PreTradeRecommendationRunComparisonOut,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceAdapterOut,
    PreTradeRecommendationSourceProvenance,
    PreTradeRecommendationSourceQuality,
    PreTradeRecommendationSourceQualityDeltaOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeRecommendationStance,
    PreTradeRecommendationSourceType,
    PreTradeRecommendationTransformationEdgeOut,
    PreTradeReviewRecommendationSummary,
    PreTradeScenarioDraft,
    PreTradeScenarioEnrichmentOut,
    PreTradeTransformationEdgeType,
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

ARBITRAGE_POSITIVE_THRESHOLD = 0.0

EDGE_FAMILY_BY_TYPE: dict[PreTradeTransformationEdgeType, PreTradeArbitrageFamily] = {
    "PRODUCT_CONVERSION": "PRODUCT_QUALITY",
    "STORAGE": "TIME",
    "TRANSPORT": "GEOGRAPHIC",
}

REQUIRED_EDGE_TYPES_BY_FAMILY: dict[PreTradeArbitrageFamily, set[PreTradeTransformationEdgeType]] = {
    "PRODUCT_QUALITY": {"PRODUCT_CONVERSION"},
    "TIME": {"STORAGE"},
    "GEOGRAPHIC": {"TRANSPORT"},
    "COMBINED": set(),
}

ARBITRAGE_COST_FIELD_SPECS: tuple[tuple[PreTradeTransformationEdgeType, tuple[str, ...], str, str], ...] = (
    (
        "PRODUCT_CONVERSION",
        ("conversion_cost_per_unit", "conversion_cost", "quality_conversion_cost", "product_conversion_cost"),
        "Product or quality conversion",
        "Product or quality conversion cost applied to bridge the buy and sell states.",
    ),
    (
        "STORAGE",
        ("storage_cost_per_unit", "storage_cost", "calendar_storage_cost"),
        "Calendar storage",
        "Storage cost applied to bridge the delivery timing between the buy and sell states.",
    ),
    (
        "TRANSPORT",
        ("transportation_cost_per_unit", "transportation_cost", "transport_cost", "freight_cost"),
        "Geographic transport",
        "Transportation cost applied to bridge the origin and destination states.",
    ),
    (
        "FINANCING",
        ("financing_cost_per_unit", "financing_cost"),
        "Financing",
        "Financing cost applied to carry the opportunity.",
    ),
    (
        "FEES",
        ("fees_cost_per_unit", "fees_cost", "fee_cost", "taxes_and_fees_cost"),
        "Fees and taxes",
        "Fees, taxes, terminal, or inspection costs applied to the bridge.",
    ),
    (
        "RISK_BUFFER",
        ("risk_buffer_per_unit", "risk_buffer", "slippage_buffer"),
        "Risk buffer",
        "Risk, slippage, or uncertainty buffer applied before surfacing the net opportunity.",
    ),
)


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


@dataclass(frozen=True)
class PreparedPreTradeRecommendationEvaluation:
    input_snapshots: list[PreTradeRecommendationSourceSnapshot]
    recommendation: PreTradeRecommendationResultOut


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
    SourceAdapterDefinition(
        adapter_key="option-exposure",
        label="Option exposure",
        source_type="DERIVED",
        description="Derived option delta and sensitivity context used to avoid treating nonlinear exposure as simple linear delta.",
        freshness_sla_hours=24,
        required_for_recommendation=False,
        payload_keys=("has_option_exposure", "option_delta", "option_gamma", "option_vega"),
        provenance_dataset="option-exposures",
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


def _to_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    return None


def _observed_age_hours(observed_at: datetime | None, as_of: datetime) -> float | None:
    if observed_at is None:
        return None
    if observed_at.tzinfo is None and as_of.tzinfo is not None:
        observed_at = observed_at.replace(tzinfo=as_of.tzinfo)
    if observed_at.tzinfo is not None and as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=observed_at.tzinfo)
    return max(0.0, (as_of - observed_at).total_seconds() / 3600)


def _freshness_from_observed_at(
    observed_at: datetime | None,
    *,
    as_of: datetime,
    stale_after_hours: int,
) -> str:
    age_hours = _observed_age_hours(observed_at, as_of)
    if age_hours is None:
        return "UNKNOWN"
    return "STALE" if age_hours > stale_after_hours else "FRESH"


def _latest_datetime(*values: datetime | None) -> datetime | None:
    candidates = [value for value in values if value is not None]
    if not candidates:
        return None
    return max(candidates)


def _market_freshness_issue_count(payload: dict[str, object]) -> int:
    freshness_rows = payload.get("freshness")
    if not isinstance(freshness_rows, list):
        return 0

    issue_count = 0
    for row in freshness_rows:
        if not isinstance(row, dict):
            continue
        health_status = str(row.get("health_status") or "").strip().upper()
        observation_age_hours = _to_float(row.get("observation_age_hours"))
        if health_status != "HEALTHY" or (observation_age_hours is not None and observation_age_hours > 24):
            issue_count += 1
    return issue_count


def _weather_high_risk_count(payload: dict[str, object]) -> int:
    regional_signals = payload.get("regional_signals")
    if not isinstance(regional_signals, list):
        return 0

    high_risk_count = 0
    for signal in regional_signals:
        if not isinstance(signal, dict):
            continue
        risk_values = [
            str(signal.get(key) or "").strip().upper()
            for key in ("demand_risk", "supply_risk", "storm_risk")
        ]
        if any(value == "HIGH" for value in risk_values):
            high_risk_count += 1
    return high_risk_count


def _signed_volume(trade_side: str | None, value: object) -> float | None:
    numeric_value = _to_float(value)
    if numeric_value is None:
        return None
    return -numeric_value if (trade_side or "").strip().upper() == "SELL" else numeric_value


def _collect_desk_context_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
    as_of: datetime,
) -> PreTradeRecommendationSourceSnapshot:
    related_trades = db.execute(
        select(Trade).where(
            Trade.status == "ACTIVE",
            Trade.book == draft.book,
            Trade.commodity_class == draft.commodity_class,
            Trade.commodity == draft.commodity,
        )
    ).scalars().all()
    counterparty_trades = (
        db.execute(
            select(Trade).where(
                Trade.status == "ACTIVE",
                Trade.counterparty == draft.counterparty,
            )
        ).scalars().all()
        if not _is_blank(draft.counterparty)
        else []
    )
    position = db.get(Position, draft.commodity) if not _is_blank(draft.commodity) else None
    current_counterparty_exposure = sum(
        abs((_to_float(trade.price) or 0) * (_to_float(trade.volume) or 0))
        for trade in counterparty_trades
    )
    latest_observed_at = _latest_datetime(
        position.updated_at if position is not None else None,
        *(trade.updated_at for trade in related_trades),
        *(trade.updated_at for trade in counterparty_trades),
    )
    return PreTradeRecommendationSourceSnapshot(
        source_key="desk-context",
        adapter_key="desk-context",
        adapter_label="Desk exposure context",
        source_type="INTERNAL",
        source_available=True,
        captured_at=latest_observed_at,
        freshness=_freshness_from_observed_at(latest_observed_at, as_of=as_of, stale_after_hours=24),
        summary=(
            f"{len(related_trades)} active trade{'s' if len(related_trades) != 1 else ''} "
            "match the selected book and commodity."
        ),
        provenance=PreTradeRecommendationSourceProvenance(
            provider="ECTRM",
            dataset="active-trades-and-positions",
            record_id=f"{draft.book}:{draft.commodity}",
            observed_at=latest_observed_at,
            ingested_at=latest_observed_at,
            captured_by=actor_id,
        ),
        payload={
            "related_active_trade_count": len(related_trades),
            "current_net_position": _to_float(position.net_volume) if position is not None else None,
            "current_counterparty_exposure": current_counterparty_exposure,
        },
    )


def _collect_counterparty_credit_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
    as_of: datetime,
) -> PreTradeRecommendationSourceSnapshot:
    profile = (
        db.get(ReferenceCounterpartyCreditProfile, draft.counterparty)
        if not _is_blank(draft.counterparty)
        else None
    )
    external_snapshot = (
        db.execute(
            select(ReferenceCounterpartyExternalCreditSnapshot)
            .where(ReferenceCounterpartyExternalCreditSnapshot.counterparty_code == draft.counterparty)
            .order_by(
                ReferenceCounterpartyExternalCreditSnapshot.as_of_date.desc(),
                ReferenceCounterpartyExternalCreditSnapshot.downloaded_at.desc(),
                ReferenceCounterpartyExternalCreditSnapshot.id.desc(),
            )
        ).scalars().first()
        if not _is_blank(draft.counterparty)
        else None
    )
    observed_at = _latest_datetime(
        profile.updated_at if profile is not None else None,
        external_snapshot.downloaded_at if external_snapshot is not None else None,
    )
    return PreTradeRecommendationSourceSnapshot(
        source_key="counterparty-credit",
        adapter_key="counterparty-credit",
        adapter_label="Counterparty credit profile",
        source_type="INTERNAL",
        source_available=True,
        captured_at=observed_at,
        freshness=_freshness_from_observed_at(observed_at, as_of=as_of, stale_after_hours=168),
        summary=(
            f"Internal credit profile captured for {profile.counterparty_code}."
            if profile is not None
            else "No internal credit profile was captured for the selected counterparty."
        ),
        provenance=PreTradeRecommendationSourceProvenance(
            provider=external_snapshot.provider if external_snapshot is not None else "ECTRM Credit",
            dataset="counterparty-credit-profiles",
            record_id=draft.counterparty,
            observed_at=observed_at,
            ingested_at=external_snapshot.downloaded_at if external_snapshot is not None else observed_at,
            captured_by=actor_id,
        ),
        payload={
            "has_credit_profile": profile is not None,
            "credit_limit_amount": _to_float(profile.limit_amount) if profile is not None else None,
            "breach_action": profile.breach_action if profile is not None else None,
            "credit_rating": profile.credit_rating if profile is not None else None,
            "external_rating_value": external_snapshot.rating_value if external_snapshot is not None else None,
            "recommended_limit_amount": (
                _to_float(external_snapshot.recommended_limit_amount)
                if external_snapshot is not None
                else None
            ),
        },
    )


def _collect_latest_mark_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
    as_of: datetime,
) -> PreTradeRecommendationSourceSnapshot:
    observation = (
        db.execute(
            select(PriceIndexObservation)
            .where(PriceIndexObservation.price_index_code == draft.price_index_code)
            .order_by(
                PriceIndexObservation.observation_date.desc(),
                PriceIndexObservation.downloaded_at.desc(),
                PriceIndexObservation.id.desc(),
            )
        ).scalars().first()
        if not _is_blank(draft.price_index_code)
        else None
    )
    observed_at = (
        observation.source_published_at
        if observation is not None and observation.source_published_at is not None
        else observation.downloaded_at if observation is not None else None
    )
    return PreTradeRecommendationSourceSnapshot(
        source_key="latest-mark",
        adapter_key="latest-mark",
        adapter_label="Latest price-index mark",
        source_type="EXTERNAL",
        source_available=True,
        captured_at=observation.downloaded_at if observation is not None else None,
        freshness=_freshness_from_observed_at(observed_at, as_of=as_of, stale_after_hours=48),
        summary=(
            f"{observation.price_index_code} mark captured for {observation.observation_date.isoformat()}."
            if observation is not None
            else "No compatible latest mark was captured for the selected price index."
        ),
        provenance=PreTradeRecommendationSourceProvenance(
            provider=observation.source_provider if observation is not None else "Price index marks",
            dataset="price-index-observations",
            record_id=(
                f"{observation.price_index_code}:{observation.observation_date.isoformat()}"
                if observation is not None
                else draft.price_index_code
            ),
            observed_at=observed_at,
            ingested_at=observation.downloaded_at if observation is not None else None,
            captured_by=actor_id,
        ),
        payload={
            "latest_mark": _to_float(observation.value) if observation is not None else None,
            "price_index_code": observation.price_index_code if observation is not None else draft.price_index_code,
            "observation_date": (
                observation.observation_date.isoformat()
                if observation is not None
                else None
            ),
            "source_provider": observation.source_provider if observation is not None else None,
            "source_series_id": observation.source_series_id if observation is not None else None,
        },
    )


def _collect_market_context_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
) -> PreTradeRecommendationSourceSnapshot:
    market_context = build_market_context(db, commodity=draft.commodity, limit=6)
    generated_at = market_context.get("generated_at")
    generated_at_value = generated_at if isinstance(generated_at, datetime) else None
    issue_count = _market_freshness_issue_count(market_context)
    fundamentals = market_context.get("fundamentals")
    macro = market_context.get("macro")
    fundamental_count = len(fundamentals) if isinstance(fundamentals, list) else 0
    macro_count = len(macro) if isinstance(macro, list) else 0
    freshness = "DEGRADED" if issue_count > 0 else "FRESH"
    return PreTradeRecommendationSourceSnapshot(
        source_key="market-context",
        adapter_key="market-context",
        adapter_label="Market context",
        source_type="EXTERNAL",
        source_available=True,
        captured_at=generated_at_value,
        freshness=freshness,  # type: ignore[arg-type]
        summary=(
            f"Captured {fundamental_count + macro_count} market driver row"
            f"{'' if fundamental_count + macro_count == 1 else 's'}."
        ),
        provenance=PreTradeRecommendationSourceProvenance(
            provider="ECTRM Market Context",
            dataset="market-context",
            record_id=draft.commodity,
            observed_at=generated_at_value,
            ingested_at=generated_at_value,
            captured_by=actor_id,
        ),
        payload={
            "market_freshness_issue_count": issue_count,
            "fundamental_count": fundamental_count,
            "macro_count": macro_count,
            "stale_source_count": issue_count,
        },
    )


def _collect_weather_intelligence_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
    as_of: datetime,
) -> PreTradeRecommendationSourceSnapshot:
    weather_overview = build_weather_intelligence_overview(
        db,
        commodity_class=draft.commodity_class or None,
    )
    latest_weather_update_at = weather_overview.get("latest_weather_update_at")
    latest_weather_update_value = (
        latest_weather_update_at if isinstance(latest_weather_update_at, datetime) else None
    )
    freshness = _freshness_from_observed_at(
        latest_weather_update_value,
        as_of=as_of,
        stale_after_hours=24,
    )
    if freshness == "UNKNOWN":
        freshness = "FRESH"
    live_weather_location_count = _to_float(weather_overview.get("live_weather_location_count")) or 0
    return PreTradeRecommendationSourceSnapshot(
        source_key="weather-intelligence",
        adapter_key="weather-intelligence",
        adapter_label="Weather intelligence",
        source_type="EXTERNAL",
        source_available=True,
        captured_at=latest_weather_update_value,
        freshness=freshness,  # type: ignore[arg-type]
        summary=str(weather_overview.get("headline") or "No weather intelligence snapshot was captured."),
        provenance=PreTradeRecommendationSourceProvenance(
            provider="Weather Intelligence",
            dataset="weather-intelligence",
            record_id=draft.commodity_class,
            observed_at=latest_weather_update_value,
            ingested_at=latest_weather_update_value,
            captured_by=actor_id,
        ),
        payload={
            "weather_high_risk_count": _weather_high_risk_count(weather_overview),
            "live_weather_location_count": int(live_weather_location_count),
        },
    )


def _collect_option_exposure_snapshot(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    actor_id: str | None,
    as_of: datetime,
) -> PreTradeRecommendationSourceSnapshot:
    stmt = select(OptionExposure).where(
        OptionExposure.book == draft.book,
        OptionExposure.commodity_class == draft.commodity_class,
        OptionExposure.commodity == draft.commodity,
    )
    if not _is_blank(draft.portfolio):
        stmt = stmt.where(OptionExposure.portfolio == draft.portfolio)
    rows = db.execute(
        stmt.order_by(
            OptionExposure.updated_at.desc(),
            OptionExposure.trade_id.asc(),
        )
    ).scalars().all()
    latest_updated_at = _latest_datetime(*(row.updated_at for row in rows))
    option_delta = sum(
        signed_volume
        for signed_volume in (
            _signed_volume(row.trade_side, row.underlying_equivalent_volume)
            for row in rows
        )
        if signed_volume is not None
    )
    return PreTradeRecommendationSourceSnapshot(
        source_key="option-exposure",
        adapter_key="option-exposure",
        adapter_label="Option exposure",
        source_type="DERIVED",
        source_available=True,
        captured_at=latest_updated_at,
        freshness=_freshness_from_observed_at(latest_updated_at, as_of=as_of, stale_after_hours=24),
        summary=(
            f"{len(rows)} option exposure row{'s' if len(rows) != 1 else ''} match the selected desk context."
            if rows
            else "No matching option exposure rows were found for the selected desk context."
        ),
        provenance=PreTradeRecommendationSourceProvenance(
            provider="ECTRM Risk",
            dataset="option-exposures",
            record_id=f"{draft.book}:{draft.portfolio or 'ALL'}:{draft.commodity}",
            observed_at=latest_updated_at,
            ingested_at=latest_updated_at,
            captured_by=actor_id,
        ),
        payload={
            "has_option_exposure": bool(rows),
            "option_delta": option_delta if rows else None,
            "option_gamma": None,
            "option_vega": None,
            "option_trade_count": len(rows),
        },
    )


def collect_live_pretrade_recommendation_input_snapshots(
    db: Session,
    *,
    draft: PreTradeScenarioDraft,
    as_of: datetime | None = None,
    actor_id: str | None = None,
) -> list[PreTradeRecommendationSourceSnapshot]:
    effective_as_of = as_of or datetime.now(timezone.utc)
    return [
        _collect_desk_context_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
            as_of=effective_as_of,
        ),
        _collect_counterparty_credit_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
            as_of=effective_as_of,
        ),
        _collect_latest_mark_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
            as_of=effective_as_of,
        ),
        _collect_market_context_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
        ),
        _collect_weather_intelligence_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
            as_of=effective_as_of,
        ),
        _collect_option_exposure_snapshot(
            db,
            draft=draft,
            actor_id=actor_id,
            as_of=effective_as_of,
        ),
    ]


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


def _evidence_ref(snapshot: PreTradeRecommendationSourceSnapshot) -> PreTradeRecommendationEvidenceRefOut:
    return PreTradeRecommendationEvidenceRefOut(
        source_key=snapshot.source_key,
        adapter_key=snapshot.adapter_key,
        adapter_label=snapshot.adapter_label,
        source_type=snapshot.source_type,
        freshness=snapshot.freshness,
        quality_status=snapshot.quality_status,
        record_id=snapshot.provenance.record_id,
        summary=snapshot.summary,
    )


def _evidence_refs_for_adapter_keys(
    snapshots: Iterable[PreTradeRecommendationSourceSnapshot],
    adapter_keys: Iterable[str],
) -> list[PreTradeRecommendationEvidenceRefOut]:
    wanted = set(adapter_keys)
    return [
        _evidence_ref(snapshot)
        for snapshot in snapshots
        if (snapshot.adapter_key or snapshot.source_key) in wanted
    ]


def _payload_object(payload: dict[str, object], keys: Iterable[str]) -> object | None:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _payload_mapping(payload: dict[str, object], keys: Iterable[str]) -> dict[str, object] | None:
    value = _payload_object(payload, keys)
    return value if isinstance(value, dict) else None


def _payload_items(value: object) -> list[dict[str, object]]:
    if isinstance(value, dict):
        return [value]
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _normalize_text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _payload_flag(payload: dict[str, object], keys: Iterable[str]) -> bool | None:
    value = _payload_object(payload, keys)
    return value if isinstance(value, bool) else None


def _normalize_price_basis(value: object, *, default: PreTradeExecutablePriceBasis) -> PreTradeExecutablePriceBasis:
    normalized = _normalize_text(value)
    if normalized is None:
        return default
    candidate = normalized.upper().replace("-", "_").replace(" ", "_")
    if candidate in {"ASK", "BID", "LAST", "TARGET", "ASSUMPTION"}:
        return candidate  # type: ignore[return-value]
    return default


def _normalize_arbitrage_family(value: object) -> PreTradeArbitrageFamily | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    candidate = normalized.upper().replace("-", "_").replace(" ", "_")
    aliases = {
        "PRODUCT": "PRODUCT_QUALITY",
        "QUALITY": "PRODUCT_QUALITY",
        "PRODUCT_OR_QUALITY": "PRODUCT_QUALITY",
        "PRODUCT_QUALITY": "PRODUCT_QUALITY",
        "CALENDAR": "TIME",
        "TIME": "TIME",
        "GEOGRAPHIC": "GEOGRAPHIC",
        "LOCATION": "GEOGRAPHIC",
        "TRANSPORT": "GEOGRAPHIC",
        "COMBINED": "COMBINED",
    }
    family = aliases.get(candidate)
    return family if family is not None else None  # type: ignore[return-value]


def _normalize_edge_type(value: object) -> PreTradeTransformationEdgeType | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    candidate = normalized.upper().replace("-", "_").replace(" ", "_")
    aliases = {
        "CONVERSION": "PRODUCT_CONVERSION",
        "PRODUCT": "PRODUCT_CONVERSION",
        "QUALITY": "PRODUCT_CONVERSION",
        "PRODUCT_CONVERSION": "PRODUCT_CONVERSION",
        "QUALITY_CONVERSION": "PRODUCT_CONVERSION",
        "STORAGE": "STORAGE",
        "CALENDAR": "STORAGE",
        "TRANSPORT": "TRANSPORT",
        "TRANSPORTATION": "TRANSPORT",
        "FREIGHT": "TRANSPORT",
        "FINANCING": "FINANCING",
        "FINANCE": "FINANCING",
        "FEES": "FEES",
        "FEE": "FEES",
        "TAX": "FEES",
        "RISK_BUFFER": "RISK_BUFFER",
        "BUFFER": "RISK_BUFFER",
        "SLIPPAGE": "RISK_BUFFER",
    }
    edge_type = aliases.get(candidate)
    return edge_type if edge_type is not None else None  # type: ignore[return-value]


def _first_number(payload: dict[str, object], keys: Iterable[str]) -> float | None:
    for key in keys:
        value = _to_float(payload.get(key))
        if value is not None:
            return value
    return None


def _price_from_candidate(
    *,
    candidate_payload: dict[str, object],
    draft: PreTradeScenarioDraft,
    side: str,
) -> tuple[float | None, PreTradeExecutablePriceBasis | None]:
    if side == "BUY":
        ask_price = _first_number(candidate_payload, ("buy_ask_price", "ask_price", "executable_buy_price"))
        if ask_price is not None:
            return ask_price, "ASK"
        explicit_price = _first_number(candidate_payload, ("buy_price",))
        if explicit_price is not None:
            return explicit_price, _normalize_price_basis(candidate_payload.get("buy_price_basis"), default="ASSUMPTION")
        last_price = _first_number(candidate_payload, ("buy_last_price", "last_price"))
        if last_price is not None:
            return last_price, "LAST"
        if draft.trade_side == "BUY" and draft.target_price is not None:
            return draft.target_price, "TARGET"
        return None, None

    bid_price = _first_number(candidate_payload, ("sell_bid_price", "bid_price", "executable_sell_price"))
    if bid_price is not None:
        return bid_price, "BID"
    explicit_price = _first_number(candidate_payload, ("sell_price",))
    if explicit_price is not None:
        return explicit_price, _normalize_price_basis(candidate_payload.get("sell_price_basis"), default="ASSUMPTION")
    last_price = _first_number(candidate_payload, ("sell_last_price", "last_price"))
    if last_price is not None:
        return last_price, "LAST"
    if draft.trade_side == "SELL" and draft.target_price is not None:
        return draft.target_price, "TARGET"
    return None, None


def _state_value(
    *,
    state_payload: dict[str, object],
    candidate_payload: dict[str, object],
    field_name: str,
    prefix: str,
    fallback: object,
) -> object | None:
    return (
        state_payload.get(field_name)
        or candidate_payload.get(f"{prefix}_{field_name}")
        or candidate_payload.get(f"{prefix}_{field_name.replace('_code', '')}")
        or fallback
    )


def _state_from_candidate_payload(
    *,
    candidate_payload: dict[str, object],
    draft: PreTradeScenarioDraft,
    key: str,
    prefix: str,
) -> PreTradeRecommendationCommodityStateOut:
    state_payload = _payload_mapping(candidate_payload, (key, f"{prefix}_state")) or {}
    return PreTradeRecommendationCommodityStateOut(
        commodity_class=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="commodity_class",
                prefix=prefix,
                fallback=draft.commodity_class,
            )
        ),
        commodity=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="commodity",
                prefix=prefix,
                fallback=draft.commodity,
            )
        ),
        quality_spec=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="quality_spec",
                prefix=prefix,
                fallback=None,
            )
        ),
        location_code=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="location_code",
                prefix=prefix,
                fallback=draft.location_code,
            )
        ),
        delivery_start=_state_value(
            state_payload=state_payload,
            candidate_payload=candidate_payload,
            field_name="delivery_start",
            prefix=prefix,
            fallback=draft.delivery_start,
        ),
        delivery_end=_state_value(
            state_payload=state_payload,
            candidate_payload=candidate_payload,
            field_name="delivery_end",
            prefix=prefix,
            fallback=draft.delivery_end,
        ),
        price_index_code=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="price_index_code",
                prefix=prefix,
                fallback=draft.price_index_code,
            )
        ),
        unit_of_measure=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="unit_of_measure",
                prefix=prefix,
                fallback=draft.unit_of_measure,
            )
        ),
        currency_code=_normalize_text(
            _state_value(
                state_payload=state_payload,
                candidate_payload=candidate_payload,
                field_name="currency_code",
                prefix=prefix,
                fallback=draft.trade_currency_code,
            )
        ),
    )


def _edge_from_payload(
    *,
    raw_edge: dict[str, object],
    source_refs: list[PreTradeRecommendationEvidenceRefOut],
) -> PreTradeRecommendationTransformationEdgeOut | None:
    edge_type = _normalize_edge_type(raw_edge.get("edge_type") or raw_edge.get("type"))
    cost = _first_number(raw_edge, ("bridge_cost_per_unit", "cost_per_unit", "cost", "variable_cost"))
    if edge_type is None or cost is None or cost < 0:
        return None
    label = _normalize_text(raw_edge.get("label")) or edge_type.replace("_", " ").title()
    detail = _normalize_text(raw_edge.get("detail")) or f"{label} cost contributes {cost:g} per unit."
    supported = _payload_flag(raw_edge, ("supported", "is_supported")) is not False
    return PreTradeRecommendationTransformationEdgeOut(
        edge_type=edge_type,
        label=label,
        bridge_cost_per_unit=cost,
        supported=supported,
        detail=detail,
        source_refs=source_refs,
    )


def _arbitrage_edges_from_candidate(
    *,
    candidate_payload: dict[str, object],
    source_refs: list[PreTradeRecommendationEvidenceRefOut],
) -> list[PreTradeRecommendationTransformationEdgeOut]:
    edges: list[PreTradeRecommendationTransformationEdgeOut] = []
    seen_edge_types: set[PreTradeTransformationEdgeType] = set()
    for raw_edge in _payload_items(candidate_payload.get("edges") or candidate_payload.get("path_edges")):
        edge = _edge_from_payload(raw_edge=raw_edge, source_refs=source_refs)
        if edge is None:
            continue
        edges.append(edge)
        seen_edge_types.add(edge.edge_type)

    for edge_type, keys, label, detail in ARBITRAGE_COST_FIELD_SPECS:
        if edge_type in seen_edge_types:
            continue
        cost = _first_number(candidate_payload, keys)
        if cost is None or cost < 0:
            continue
        edges.append(
            PreTradeRecommendationTransformationEdgeOut(
                edge_type=edge_type,
                label=label,
                bridge_cost_per_unit=cost,
                supported=True,
                detail=detail,
                source_refs=source_refs,
            )
        )
    return edges


def _infer_arbitrage_family(
    *,
    candidate_payload: dict[str, object],
    edges: list[PreTradeRecommendationTransformationEdgeOut],
) -> PreTradeArbitrageFamily:
    explicit_family = _normalize_arbitrage_family(
        candidate_payload.get("family")
        or candidate_payload.get("arbitrage_family")
        or candidate_payload.get("candidate_family")
    )
    if explicit_family is not None:
        return explicit_family

    edge_families = {
        EDGE_FAMILY_BY_TYPE[edge.edge_type]
        for edge in edges
        if edge.edge_type in EDGE_FAMILY_BY_TYPE
    }
    if len(edge_families) > 1:
        return "COMBINED"
    if len(edge_families) == 1:
        return next(iter(edge_families))
    return "COMBINED"


def _arbitrage_candidate_payloads(
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> list[tuple[dict[str, object], PreTradeRecommendationSourceSnapshot]]:
    candidates: list[tuple[dict[str, object], PreTradeRecommendationSourceSnapshot]] = []
    candidate_keys = ("arbitrage_candidates", "arbitrage_candidate", "arbitrage")
    for snapshot in snapshots:
        for key in candidate_keys:
            raw_value = snapshot.payload.get(key)
            for item in _payload_items(raw_value):
                candidates.append((item, snapshot))
    return candidates


def _status_for_arbitrage_candidate(
    *,
    family: PreTradeArbitrageFamily,
    buy_price: float | None,
    buy_price_basis: PreTradeExecutablePriceBasis | None,
    sell_price: float | None,
    sell_price_basis: PreTradeExecutablePriceBasis | None,
    edges: list[PreTradeRecommendationTransformationEdgeOut],
    candidate_payload: dict[str, object],
) -> tuple[PreTradeArbitrageCandidateStatus, list[str], list[str]]:
    missing_evidence: list[str] = []
    stop_reasons: list[str] = []

    if buy_price is None:
        missing_evidence.append("Executable buy ask price is missing.")
    elif buy_price_basis != "ASK":
        missing_evidence.append("Buy economics did not use an executable ask price.")

    if sell_price is None:
        missing_evidence.append("Executable sell bid price is missing.")
    elif sell_price_basis != "BID":
        missing_evidence.append("Sell economics did not use an executable bid price.")

    supported_edges = {edge.edge_type for edge in edges if edge.supported}
    unsupported_edges = [edge for edge in edges if not edge.supported]
    for edge in unsupported_edges:
        stop_reasons.append(f"{edge.label} is marked unsupported.")

    required_edge_types = REQUIRED_EDGE_TYPES_BY_FAMILY[family]
    for edge_type in sorted(required_edge_types):
        if edge_type not in supported_edges:
            label = edge_type.replace("_", " ").title()
            missing_evidence.append(f"{label} evidence is required for {family.replace('_', ' ').lower()} arbitrage.")

    if family == "COMBINED":
        bridge_families = {
            EDGE_FAMILY_BY_TYPE[edge.edge_type]
            for edge in edges
            if edge.supported and edge.edge_type in EDGE_FAMILY_BY_TYPE
        }
        if len(bridge_families) < 2:
            missing_evidence.append("Combined arbitrage requires at least two supported product, time, or geographic bridge edges.")

    supported_flag = _payload_flag(candidate_payload, ("supported", "is_supported"))
    unsupported_reason = _normalize_text(candidate_payload.get("unsupported_reason") or candidate_payload.get("stop_reason"))
    if supported_flag is False:
        stop_reasons.append(unsupported_reason or "The transformation mapping is marked unsupported.")

    if stop_reasons:
        return "UNSUPPORTED", missing_evidence, stop_reasons
    if missing_evidence:
        return "INCOMPLETE", missing_evidence, stop_reasons
    return "SUPPORTED", missing_evidence, stop_reasons


def _build_single_arbitrage_candidate(
    *,
    draft: PreTradeScenarioDraft,
    candidate_payload: dict[str, object],
    source_snapshot: PreTradeRecommendationSourceSnapshot,
) -> PreTradeRecommendationArbitrageCandidateOut:
    source_refs = [_evidence_ref(source_snapshot)]
    buy_state = _state_from_candidate_payload(
        candidate_payload=candidate_payload,
        draft=draft,
        key="buy_state",
        prefix="buy",
    )
    sell_state = _state_from_candidate_payload(
        candidate_payload=candidate_payload,
        draft=draft,
        key="sell_state",
        prefix="sell",
    )
    edges = _arbitrage_edges_from_candidate(
        candidate_payload=candidate_payload,
        source_refs=source_refs,
    )
    family = _infer_arbitrage_family(candidate_payload=candidate_payload, edges=edges)
    buy_price, buy_price_basis = _price_from_candidate(
        candidate_payload=candidate_payload,
        draft=draft,
        side="BUY",
    )
    sell_price, sell_price_basis = _price_from_candidate(
        candidate_payload=candidate_payload,
        draft=draft,
        side="SELL",
    )
    bridge_cost = sum(edge.bridge_cost_per_unit for edge in edges if edge.supported)
    gross_spread = sell_price - buy_price if buy_price is not None and sell_price is not None else None
    net_opportunity = gross_spread - bridge_cost if gross_spread is not None else None
    net_opportunity_pct = (
        _safe_divide(net_opportunity, abs(buy_price))
        if net_opportunity is not None and buy_price is not None and buy_price != 0
        else None
    )
    estimated_value = (
        net_opportunity * draft.target_volume
        if net_opportunity is not None and draft.target_volume is not None
        else None
    )
    status, missing_evidence, stop_reasons = _status_for_arbitrage_candidate(
        family=family,
        buy_price=buy_price,
        buy_price_basis=buy_price_basis,
        sell_price=sell_price,
        sell_price_basis=sell_price_basis,
        edges=edges,
        candidate_payload=candidate_payload,
    )
    if status == "SUPPORTED" and net_opportunity is not None and net_opportunity <= ARBITRAGE_POSITIVE_THRESHOLD:
        stop_reasons.append("Net opportunity is not positive after bridge costs.")

    return PreTradeRecommendationArbitrageCandidateOut(
        family=family,
        status=status,
        buy_state=buy_state,
        sell_state=sell_state,
        buy_price=buy_price,
        buy_price_basis=buy_price_basis,
        sell_price=sell_price,
        sell_price_basis=sell_price_basis,
        gross_spread=gross_spread,
        bridge_cost=bridge_cost,
        net_opportunity=net_opportunity,
        net_opportunity_pct=net_opportunity_pct,
        estimated_value=estimated_value,
        edges=edges,
        missing_evidence=missing_evidence,
        stop_reasons=stop_reasons,
        source_refs=source_refs,
    )


def _build_arbitrage_candidate(
    *,
    draft: PreTradeScenarioDraft,
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> PreTradeRecommendationArbitrageCandidateOut | None:
    candidates = [
        _build_single_arbitrage_candidate(
            draft=draft,
            candidate_payload=candidate_payload,
            source_snapshot=source_snapshot,
        )
        for candidate_payload, source_snapshot in _arbitrage_candidate_payloads(snapshots)
    ]
    if not candidates:
        return None

    def sort_key(candidate: PreTradeRecommendationArbitrageCandidateOut) -> tuple[int, float]:
        is_positive_supported = (
            candidate.status == "SUPPORTED"
            and candidate.net_opportunity is not None
            and candidate.net_opportunity > ARBITRAGE_POSITIVE_THRESHOLD
        )
        status_rank = 3 if is_positive_supported else 2 if candidate.status == "SUPPORTED" else 1 if candidate.status == "INCOMPLETE" else 0
        return (status_rank, candidate.net_opportunity if candidate.net_opportunity is not None else float("-inf"))

    return max(candidates, key=sort_key)


def _format_unit_amount(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:,.4f}".rstrip("0").rstrip(".")


def _direction(value: float | None) -> PreTradeExposureDirection:
    if value is None:
        return "UNKNOWN"
    if value > 0:
        return "LONG"
    if value < 0:
        return "SHORT"
    return "FLAT"


def _proposed_trade_delta(draft: PreTradeScenarioDraft) -> float | None:
    if draft.target_volume is None:
        return None
    return draft.target_volume if draft.trade_side == "BUY" else -draft.target_volume


def _exposure_effect(
    *,
    current_net_position: float | None,
    proposed_trade_delta: float | None,
) -> PreTradeExposureEffect:
    if current_net_position is None or proposed_trade_delta is None:
        return "UNKNOWN"
    before_abs = abs(current_net_position)
    after_abs = abs(current_net_position + proposed_trade_delta)
    if after_abs < before_abs:
        return "OFFSETS"
    if after_abs > before_abs:
        return "DEEPENS"
    return "NEUTRAL"


def _build_missing_evidence(
    *,
    snapshots: list[PreTradeRecommendationSourceSnapshot],
    required_adapter_keys: set[str],
) -> list[PreTradeRecommendationMissingEvidenceOut]:
    missing: list[PreTradeRecommendationMissingEvidenceOut] = []
    for snapshot in snapshots:
        adapter_key = snapshot.adapter_key or snapshot.source_key
        if snapshot.quality_status not in {"STALE", "DEGRADED", "MISSING"}:
            continue

        required = adapter_key in required_adapter_keys
        label = snapshot.adapter_label or snapshot.source_key.replace("-", " ").title()
        if snapshot.quality_status == "MISSING":
            detail = f"{label} did not provide usable evidence for this recommendation."
        else:
            detail = f"{label} evidence is {snapshot.quality_status.lower()} for this recommendation."

        missing.append(
            PreTradeRecommendationMissingEvidenceOut(
                evidence_key=adapter_key,
                label=label,
                severity="BLOCKING" if required and snapshot.quality_status == "MISSING" else "WARNING",
                detail=detail,
                source_refs=[_evidence_ref(snapshot)],
            )
        )
    return missing


def _build_arbitrage_missing_evidence(
    arbitrage_candidate: PreTradeRecommendationArbitrageCandidateOut | None,
) -> list[PreTradeRecommendationMissingEvidenceOut]:
    if arbitrage_candidate is None:
        return []

    missing: list[PreTradeRecommendationMissingEvidenceOut] = []
    for index, detail in enumerate(arbitrage_candidate.missing_evidence, start=1):
        missing.append(
            PreTradeRecommendationMissingEvidenceOut(
                evidence_key=f"arbitrage-missing-{index}",
                label="Arbitrage evidence",
                severity="WARNING",
                detail=detail,
                source_refs=arbitrage_candidate.source_refs,
            )
        )
    if arbitrage_candidate.status == "UNSUPPORTED":
        missing.append(
            PreTradeRecommendationMissingEvidenceOut(
                evidence_key="arbitrage-unsupported-mapping",
                label="Arbitrage mapping",
                severity="WARNING",
                detail=(
                    arbitrage_candidate.stop_reasons[0]
                    if arbitrage_candidate.stop_reasons
                    else "The arbitrage transformation path is unsupported."
                ),
                source_refs=arbitrage_candidate.source_refs,
            )
        )
    return missing


def _build_residual_exposure(
    *,
    draft: PreTradeScenarioDraft,
    current_net_position: float | None,
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> PreTradeRecommendationResidualExposureOut:
    proposed_delta = _proposed_trade_delta(draft)
    residual_after_trade = (
        current_net_position + proposed_delta
        if current_net_position is not None and proposed_delta is not None
        else None
    )
    effect = _exposure_effect(current_net_position=current_net_position, proposed_trade_delta=proposed_delta)
    detail_by_effect = {
        "OFFSETS": "The proposed trade reduces the absolute open position for the selected commodity.",
        "DEEPENS": "The proposed trade increases the absolute open position for the selected commodity.",
        "NEUTRAL": "The proposed trade leaves the absolute open position broadly unchanged.",
        "UNKNOWN": "Residual exposure cannot be calculated until current position and target size are both available.",
    }
    return PreTradeRecommendationResidualExposureOut(
        current_net_position=current_net_position,
        proposed_trade_delta=proposed_delta,
        residual_after_trade=residual_after_trade,
        direction_before=_direction(current_net_position),
        direction_after=_direction(residual_after_trade),
        exposure_effect=effect,
        detail=detail_by_effect[effect],
        source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context",)),
    )


def _build_netting_candidates(
    *,
    draft: PreTradeScenarioDraft,
    residual_exposure: PreTradeRecommendationResidualExposureOut,
) -> list[PreTradeRecommendationNettingCandidateOut]:
    current = residual_exposure.current_net_position
    proposed = residual_exposure.proposed_trade_delta
    residual = residual_exposure.residual_after_trade
    if current is None or proposed is None or residual is None:
        return []

    constraints = [
        f"commodity={draft.commodity}",
        f"unit={draft.unit_of_measure or 'UNKNOWN'}",
        f"location={draft.location_code or 'UNKNOWN'}",
    ]
    if residual_exposure.exposure_effect == "OFFSETS":
        matched_quantity = min(abs(current), abs(proposed))
        return [
            PreTradeRecommendationNettingCandidateOut(
                candidate_id="current-position-offset",
                label="Current net position offset",
                match_quality="EXACT" if residual == 0 else "PARTIAL",
                matched_quantity=matched_quantity,
                residual_quantity=abs(residual),
                constraints=constraints,
                source_refs=residual_exposure.source_refs,
            )
        ]

    return [
        PreTradeRecommendationNettingCandidateOut(
            candidate_id="current-position-offset",
            label="Current net position offset",
            match_quality="REJECTED",
            matched_quantity=0,
            residual_quantity=abs(residual),
            constraints=constraints,
            rejection_reasons=["The proposed side does not reduce the current net position."],
            source_refs=residual_exposure.source_refs,
        )
    ]


def _build_opportunity_summary(
    *,
    stance: PreTradeRecommendationStance,
    mark_gap_pct: float | None,
    arbitrage_candidate: PreTradeRecommendationArbitrageCandidateOut | None,
    residual_exposure: PreTradeRecommendationResidualExposureOut,
    checks: list[PreTradeRecommendationCheckOut],
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> PreTradeRecommendationOpportunitySummaryOut:
    attention_keys = [check.key for check in checks if check.status != "good"]
    if stance == "WAIT_FOR_DATA":
        category: PreTradeOpportunityCategory = "WAIT_FOR_DATA"
        title = "Wait for required evidence"
        detail = "Required context or source evidence is missing, so this should not be promoted as an opportunity yet."
    elif (
        arbitrage_candidate is not None
        and arbitrage_candidate.status == "SUPPORTED"
        and arbitrage_candidate.net_opportunity is not None
        and arbitrage_candidate.net_opportunity > ARBITRAGE_POSITIVE_THRESHOLD
    ):
        category = "ARBITRAGE"
        title = f"{arbitrage_candidate.family.replace('_', ' ').title()} arbitrage review"
        detail = (
            f"Gross spread is {_format_unit_amount(arbitrage_candidate.gross_spread)} per unit, "
            f"bridge cost is {_format_unit_amount(arbitrage_candidate.bridge_cost)}, "
            f"and net opportunity is {_format_unit_amount(arbitrage_candidate.net_opportunity)}."
        )
        if "arbitrage" not in attention_keys:
            attention_keys.append("arbitrage")
    elif mark_gap_pct is not None and mark_gap_pct >= 7:
        category = "MARK_GAP"
        title = "Pricing gap review"
        detail = f"Target economics are {_format_percent(mark_gap_pct)} away from the captured mark."
    elif residual_exposure.exposure_effect == "OFFSETS":
        before_abs = abs(residual_exposure.current_net_position or 0)
        after_abs = abs(residual_exposure.residual_after_trade or 0)
        if before_abs > 0 and after_abs <= before_abs / 2:
            category = "RISK_REDUCTION"
            title = "Risk reduction review"
            detail = "The draft appears to materially reduce current net exposure."
        else:
            category = "EXPOSURE_OFFSET"
            title = "Exposure offset review"
            detail = "The draft appears to reduce current net exposure and may be useful for risk reduction."
    elif residual_exposure.exposure_effect == "DEEPENS":
        category = "RISK_INCREASE"
        title = "Risk-increasing review"
        detail = "The draft appears to deepen current net exposure, so sizing and hedge intent need review."
    else:
        category = "STANDARD_REVIEW"
        title = "Standard pre-trade review"
        detail = "No single pricing or exposure driver dominates the recommendation."

    return PreTradeRecommendationOpportunitySummaryOut(
        category=category,
        title=title,
        detail=detail,
        driver_keys=attention_keys,
        source_refs=(
            arbitrage_candidate.source_refs
            if category == "ARBITRAGE" and arbitrage_candidate is not None
            else _evidence_refs_for_adapter_keys(
                snapshots,
                ("desk-context", "latest-mark", "market-context", "weather-intelligence"),
            )
        ),
    )


def _build_hedge_recommendation(
    *,
    draft: PreTradeScenarioDraft,
    stance: PreTradeRecommendationStance,
    residual_exposure: PreTradeRecommendationResidualExposureOut,
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> PreTradeRecommendationHedgeRecommendationOut:
    residual = residual_exposure.residual_after_trade
    option_delta = _payload_number(snapshots, ("option_delta", "delta"))
    option_gamma = _payload_number(snapshots, ("option_gamma", "gamma"))
    has_option_exposure = _payload_bool(snapshots, ("has_option_exposure",))
    policy_stops: list[str] = []

    if stance == "WAIT_FOR_DATA" or residual is None:
        if residual is None:
            policy_stops.append("Residual exposure is unavailable.")
        return PreTradeRecommendationHedgeRecommendationOut(
            instrument_type="WAIT_FOR_DATA",
            rationale="Do not select a hedge instrument until residual exposure and required evidence are available.",
            policy_stops=policy_stops,
            source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context", "latest-mark", "option-exposure")),
        )

    if residual == 0:
        return PreTradeRecommendationHedgeRecommendationOut(
            instrument_type="NO_HEDGE",
            rationale="The draft fully offsets the current net position, so no residual hedge delta is suggested.",
            target_delta=0,
            hedge_ratio=0,
            source_refs=residual_exposure.source_refs,
        )

    if has_option_exposure or (option_delta is not None and option_delta != 0) or (option_gamma is not None and option_gamma != 0):
        return PreTradeRecommendationHedgeRecommendationOut(
            instrument_type="OPTIONS",
            rationale="Review option hedges because nonlinear option exposure evidence is present.",
            target_delta=-residual,
            hedge_ratio=1,
            source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context", "option-exposure")),
        )

    if draft.pricing_type.upper() == "FIXED":
        return PreTradeRecommendationHedgeRecommendationOut(
            instrument_type="FUTURES",
            rationale="Review a listed futures hedge for the remaining linear fixed-price delta.",
            target_delta=-residual,
            hedge_ratio=1,
            source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context", "latest-mark")),
        )

    return PreTradeRecommendationHedgeRecommendationOut(
        instrument_type="SWAP",
        rationale="Review an index-linked swap for the remaining floating-price exposure and basis profile.",
        target_delta=-residual,
        hedge_ratio=1,
        source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context", "latest-mark")),
    )


def _build_rejected_alternatives(
    *,
    hedge_recommendation: PreTradeRecommendationHedgeRecommendationOut,
    snapshots: list[PreTradeRecommendationSourceSnapshot],
) -> list[PreTradeRecommendationRejectedAlternativeOut]:
    selected = hedge_recommendation.instrument_type
    rejected: list[PreTradeRecommendationRejectedAlternativeOut] = []
    if selected not in {"OPTIONS", "WAIT_FOR_DATA"}:
        rejected.append(
            PreTradeRecommendationRejectedAlternativeOut(
                alternative="OPTIONS",
                reason="No fresh option exposure evidence requires an option hedge in this draft.",
                source_refs=_evidence_refs_for_adapter_keys(snapshots, ("option-exposure",)),
            )
        )
    if selected not in {"FUTURES", "NO_HEDGE", "WAIT_FOR_DATA"}:
        rejected.append(
            PreTradeRecommendationRejectedAlternativeOut(
                alternative="FUTURES",
                reason="A futures hedge may not match the draft's floating or basis-sensitive exposure as directly as the selected instrument.",
                source_refs=_evidence_refs_for_adapter_keys(snapshots, ("latest-mark",)),
            )
        )
    if selected not in {"PHYSICAL_OFFSET", "NO_HEDGE", "WAIT_FOR_DATA"}:
        rejected.append(
            PreTradeRecommendationRejectedAlternativeOut(
                alternative="PHYSICAL_OFFSET",
                reason="No separate physical offset candidate has been validated beyond the draft scenario itself.",
                source_refs=_evidence_refs_for_adapter_keys(snapshots, ("desk-context",)),
            )
        )
    return rejected[:3]


def _build_recommendation_explanation(
    *,
    stance: PreTradeRecommendationStance,
    confidence: PreTradeRecommendationConfidence,
    score: int,
    checks: list[PreTradeRecommendationCheckOut],
) -> PreTradeRecommendationExplanationOut:
    blocking_checks = [check for check in checks if check.status == "block"]
    watch_checks = [check for check in checks if check.status == "watch"]
    attention_checks = blocking_checks or watch_checks
    source_quality_check = next((check for check in checks if check.key == "source-quality"), None)
    primary_drivers = [check.detail for check in attention_checks[:3]]
    if not primary_drivers:
        primary_drivers = ["All required source, pricing, credit, and positioning checks are aligned enough for standard controls."]

    reviewer_focus = [check.detail for check in attention_checks[:3]]
    if not reviewer_focus:
        reviewer_focus = ["Confirm desk intent, sizing, and standard booking controls before capture."]

    driver_summary = primary_drivers[0]
    stance_prefix = {
        "PROCEED": "Proceed is supported because",
        "PROCEED_WITH_CARE": "Proceed with care because",
        "ESCALATE": "Escalate because",
        "WAIT_FOR_DATA": "Wait for data because",
    }[stance]
    confidence_detail = (
        f"{confidence.title()} confidence is based on {len(blocking_checks)} blocking check"
        f"{'' if len(blocking_checks) == 1 else 's'}, {len(watch_checks)} watch check"
        f"{'' if len(watch_checks) == 1 else 's'}, and a recommendation score of {score}."
    )

    return PreTradeRecommendationExplanationOut(
        stance_rationale=f"{stance_prefix} {driver_summary[0].lower() + driver_summary[1:]}",
        source_quality_rationale=(
            source_quality_check.detail
            if source_quality_check is not None
            else "Source adapter quality was not available for this recommendation run."
        ),
        confidence_rationale=confidence_detail,
        primary_drivers=primary_drivers,
        reviewer_focus=reviewer_focus,
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
    arbitrage_candidate = _build_arbitrage_candidate(
        draft=draft,
        snapshots=input_snapshots,
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

    if arbitrage_candidate is not None:
        if (
            arbitrage_candidate.status == "SUPPORTED"
            and arbitrage_candidate.net_opportunity is not None
            and arbitrage_candidate.net_opportunity > ARBITRAGE_POSITIVE_THRESHOLD
        ):
            checks.append(
                _build_check(
                    key="arbitrage",
                    label="Arbitrage economics",
                    status="good",
                    detail=(
                        f"{arbitrage_candidate.family.replace('_', ' ').title()} arbitrage candidate "
                        f"shows gross spread {_format_unit_amount(arbitrage_candidate.gross_spread)}, "
                        f"bridge cost {_format_unit_amount(arbitrage_candidate.bridge_cost)}, and "
                        f"net opportunity {_format_unit_amount(arbitrage_candidate.net_opportunity)} per unit."
                    ),
                )
            )
        elif arbitrage_candidate.status == "SUPPORTED":
            checks.append(
                _build_check(
                    key="arbitrage",
                    label="Arbitrage economics",
                    status="good",
                    detail="Captured arbitrage economics do not show a positive net opportunity after bridge costs.",
                )
            )
        elif arbitrage_candidate.status == "INCOMPLETE":
            stance = _max_stance(stance, "PROCEED_WITH_CARE")
            checks.append(
                _build_check(
                    key="arbitrage",
                    label="Arbitrage economics",
                    status="watch",
                    detail=(
                        "Arbitrage evidence is incomplete: "
                        + "; ".join(arbitrage_candidate.missing_evidence[:2])
                    ),
                )
            )
        else:
            stance = _max_stance(stance, "PROCEED_WITH_CARE")
            checks.append(
                _build_check(
                    key="arbitrage",
                    label="Arbitrage economics",
                    status="watch",
                    detail=(
                        "Arbitrage mapping is unsupported: "
                        + "; ".join(arbitrage_candidate.stop_reasons[:2])
                    ),
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
    explanation = _build_recommendation_explanation(
        stance=stance,
        confidence=confidence,  # type: ignore[arg-type]
        score=score,
        checks=checks,
    )
    residual_exposure = _build_residual_exposure(
        draft=draft,
        current_net_position=current_net_position,
        snapshots=input_snapshots,
    )
    opportunity_summary = _build_opportunity_summary(
        stance=stance,
        mark_gap_pct=mark_gap_pct,
        arbitrage_candidate=arbitrage_candidate,
        residual_exposure=residual_exposure,
        checks=checks,
        snapshots=input_snapshots,
    )
    hedge_recommendation = _build_hedge_recommendation(
        draft=draft,
        stance=stance,
        residual_exposure=residual_exposure,
        snapshots=input_snapshots,
    )

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
        explanation=explanation,
        checks=checks,
        next_actions=next_actions
        or ["No blocking gaps were detected. Hand the scenario into trade capture when the desk is ready."],
        opportunity_summary=opportunity_summary,
        arbitrage_candidate=arbitrage_candidate,
        residual_exposure=residual_exposure,
        netting_candidates=_build_netting_candidates(
            draft=draft,
            residual_exposure=residual_exposure,
        ),
        hedge_recommendation=hedge_recommendation,
        rejected_alternatives=_build_rejected_alternatives(
            hedge_recommendation=hedge_recommendation,
            snapshots=input_snapshots,
        ),
        missing_evidence=_build_missing_evidence(
            snapshots=input_snapshots,
            required_adapter_keys=required_adapter_keys,
        )
        + _build_arbitrage_missing_evidence(arbitrage_candidate),
    )


def prepare_pretrade_recommendation_evaluation(
    *,
    draft: PreTradeScenarioDraft,
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    as_of: datetime | None = None,
    actor_id: str | None = None,
) -> PreparedPreTradeRecommendationEvaluation:
    effective_as_of = as_of or datetime.now(timezone.utc)
    normalized_input_snapshots = normalize_recommendation_input_snapshots(
        input_snapshots,
        as_of=effective_as_of,
        actor_id=actor_id,
    )
    recommendation = build_pretrade_recommendation_result(
        draft=draft,
        input_snapshots=normalized_input_snapshots,
        as_of=effective_as_of,
    )
    return PreparedPreTradeRecommendationEvaluation(
        input_snapshots=normalized_input_snapshots,
        recommendation=recommendation,
    )


def resolve_pretrade_recommendation_input_snapshots(
    *,
    db: Session | None,
    draft: PreTradeScenarioDraft,
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    as_of: datetime | None = None,
    actor_id: str | None = None,
) -> list[PreTradeRecommendationSourceSnapshot]:
    if input_snapshots:
        return input_snapshots
    if db is None:
        return input_snapshots
    return collect_live_pretrade_recommendation_input_snapshots(
        db,
        draft=draft,
        as_of=as_of,
        actor_id=actor_id,
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


def _enrichment_source_freshness_summary(snapshots: list[PreTradeRecommendationSourceSnapshot]) -> str | None:
    if not snapshots:
        return "No source snapshots were captured with this recommendation run."

    impaired_snapshots = [
        snapshot
        for snapshot in snapshots
        if not snapshot.source_available
        or snapshot.quality_status != "OK"
        or snapshot.freshness in {"STALE", "DEGRADED", "UNKNOWN"}
    ]
    if not impaired_snapshots:
        return f"All {len(snapshots)} source snapshot{'s' if len(snapshots) != 1 else ''} were OK at capture."

    labels = [
        snapshot.adapter_label or snapshot.adapter_key or snapshot.source_key
        for snapshot in impaired_snapshots[:4]
    ]
    suffix = f" plus {len(impaired_snapshots) - 4} more" if len(impaired_snapshots) > 4 else ""
    return (
        f"{len(impaired_snapshots)} of {len(snapshots)} source snapshot"
        f"{'s' if len(snapshots) != 1 else ''} need review: {', '.join(labels)}{suffix}."
    )


def _enrichment_residual_exposure_summary(recommendation: PreTradeRecommendationResultOut) -> str | None:
    residual_exposure = recommendation.residual_exposure
    if residual_exposure is None:
        return None

    values = [
        f"current {residual_exposure.current_net_position:g}"
        if residual_exposure.current_net_position is not None
        else None,
        f"delta {residual_exposure.proposed_trade_delta:+g}"
        if residual_exposure.proposed_trade_delta is not None
        else None,
        f"residual {residual_exposure.residual_after_trade:g}"
        if residual_exposure.residual_after_trade is not None
        else None,
        residual_exposure.exposure_effect.replace("_", " ").lower()
        if residual_exposure.exposure_effect != "UNKNOWN"
        else None,
    ]
    numeric_summary = "; ".join(value for value in values if value)
    if numeric_summary:
        return f"{residual_exposure.detail} ({numeric_summary})."
    return residual_exposure.detail


def _enrichment_review_focus(recommendation: PreTradeRecommendationResultOut) -> list[str]:
    focus_items: list[str] = []
    focus_items.extend(recommendation.explanation.reviewer_focus)
    focus_items.extend(recommendation.next_actions)
    focus_items.extend(
        f"{item.severity}: {item.detail}"
        for item in recommendation.missing_evidence
    )
    if recommendation.hedge_recommendation is not None:
        focus_items.extend(recommendation.hedge_recommendation.policy_stops)
    if recommendation.arbitrage_candidate is not None:
        focus_items.extend(recommendation.arbitrage_candidate.missing_evidence)
        focus_items.extend(recommendation.arbitrage_candidate.stop_reasons)

    normalized_items: list[str] = []
    seen_items: set[str] = set()
    for item in focus_items:
        normalized_item = item.strip()
        if not normalized_item:
            continue
        item_key = normalized_item.casefold()
        if item_key in seen_items:
            continue
        normalized_items.append(normalized_item)
        seen_items.add(item_key)
        if len(normalized_items) >= 8:
            break
    return normalized_items


def build_pretrade_scenario_enrichment(run: PreTradeRecommendationRunOut) -> PreTradeScenarioEnrichmentOut:
    recommendation = run.recommendation
    return PreTradeScenarioEnrichmentOut(
        opportunity_category=(
            recommendation.opportunity_summary.category
            if recommendation.opportunity_summary is not None
            else None
        ),
        hedge_intent=(
            recommendation.hedge_recommendation.instrument_type
            if recommendation.hedge_recommendation is not None
            else None
        ),
        residual_exposure_summary=_enrichment_residual_exposure_summary(recommendation),
        source_freshness_summary=_enrichment_source_freshness_summary(run.input_snapshots),
        reviewer_focus=_enrichment_review_focus(recommendation),
        recommendation_run_id=run.run_id if run.run_id > 0 else None,
        recommendation_run_key=run.run_key,
        recommendation_stance=recommendation.stance,
        recommendation_score=recommendation.score,
        recommendation_headline=recommendation.headline,
        captured_at=run.created_at,
    )


def build_pretrade_recommendation_draft_analysis(
    *,
    thesis: str | None,
    draft: PreTradeScenarioDraft,
    source_scenario_id: int | None,
    source_review_id: int | None,
    input_snapshots: list[PreTradeRecommendationSourceSnapshot],
    db: Session | None = None,
    as_of: datetime | None = None,
    actor_id: str | None = None,
    previous_record: ReportPreset | None = None,
) -> PreTradeRecommendationDraftAnalysisOut:
    effective_as_of = as_of or datetime.now(timezone.utc)
    resolved_input_snapshots = resolve_pretrade_recommendation_input_snapshots(
        db=db,
        draft=draft,
        input_snapshots=input_snapshots,
        as_of=effective_as_of,
        actor_id=actor_id,
    )
    evaluation = prepare_pretrade_recommendation_evaluation(
        draft=draft,
        input_snapshots=resolved_input_snapshots,
        as_of=effective_as_of,
        actor_id=actor_id,
    )

    comparison = None
    if previous_record is not None:
        previous_run = _to_recommendation_run_out_base(
            previous_record,
            actor_id=actor_id or previous_record.created_by,
        )
        current_run = PreTradeRecommendationRunOut(
            run_id=0,
            run_key="draft-analysis",
            name="Draft analysis",
            thesis=thesis,
            draft=draft,
            source_scenario_id=source_scenario_id,
            source_review_id=source_review_id,
            input_snapshots=evaluation.input_snapshots,
            recommendation=evaluation.recommendation,
            created_at=effective_as_of,
            created_by=actor_id or "system",
            updated_at=effective_as_of,
            updated_by=actor_id or "system",
            version=0,
            can_edit=actor_id is not None,
        )
        comparison = build_recommendation_run_comparison(
            current=current_run,
            previous=previous_run,
        )

    return PreTradeRecommendationDraftAnalysisOut(
        thesis=thesis,
        draft=draft,
        source_scenario_id=source_scenario_id,
        source_review_id=source_review_id,
        input_snapshots=evaluation.input_snapshots,
        recommendation=evaluation.recommendation,
        comparison=comparison,
        evaluated_at=effective_as_of,
    )


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


def _snapshot_audit_key(snapshot: PreTradeRecommendationSourceSnapshot) -> str:
    return snapshot.adapter_key or snapshot.source_key


def _snapshot_audit_label(snapshot: PreTradeRecommendationSourceSnapshot) -> str:
    return snapshot.adapter_label or snapshot.source_key.replace("-", " ").title()


def _snapshot_audit_payload(snapshot: PreTradeRecommendationSourceSnapshot) -> dict[str, object]:
    return {
        "payload": snapshot.payload,
        "freshness": snapshot.freshness,
        "quality_status": snapshot.quality_status,
        "source_available": snapshot.source_available,
        "captured_at": snapshot.captured_at.isoformat() if snapshot.captured_at else None,
        "provenance": snapshot.provenance.model_dump(mode="json", exclude_none=True),
    }


def _ordered_text_delta(current: list[str], previous: list[str]) -> tuple[list[str], list[str]]:
    current_set = set(current)
    previous_set = set(previous)
    return (
        [item for item in current if item not in previous_set],
        [item for item in previous if item not in current_set],
    )


def same_recommendation_comparison_group(left: ReportPreset, right: ReportPreset) -> bool:
    left_review_id = recommendation_run_source_review_id(left)
    right_review_id = recommendation_run_source_review_id(right)
    if left_review_id is not None or right_review_id is not None:
        return left_review_id is not None and left_review_id == right_review_id

    left_scenario_id = recommendation_run_source_scenario_id(left)
    right_scenario_id = recommendation_run_source_scenario_id(right)
    return left_scenario_id is not None and left_scenario_id == right_scenario_id


def previous_recommendation_run_record(
    records: list[ReportPreset],
    current_record: ReportPreset,
) -> ReportPreset | None:
    matching_older_records = [
        record
        for record in records
        if record.id != current_record.id
        and same_recommendation_comparison_group(current_record, record)
        and (record.created_at, record.id) < (current_record.created_at, current_record.id)
    ]
    return max(matching_older_records, key=lambda record: (record.created_at, record.id), default=None)


def recommendation_run_attached_to_shared_review(db, recommendation_run_id: int) -> bool:
    review_records = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
    ).scalars().all()
    return any(review_recommendation_run_id(record) == recommendation_run_id for record in review_records)


def get_accessible_recommendation_run_record(
    db,
    *,
    recommendation_run_id: int,
    actor_id: str,
) -> ReportPreset | None:
    record = db.execute(pretrade_recommendation_run_record_stmt(recommendation_run_id)).scalars().first()
    if record is None:
        return None
    if record.scope_owner_key in {actor_id, PRETRADE_SHARED_OWNER_KEY} or recommendation_run_attached_to_shared_review(db, recommendation_run_id):
        return record
    return None


def accessible_recommendation_run_records(
    db,
    *,
    actor_id: str,
) -> list[ReportPreset]:
    records_by_id = {
        record.id: record
        for record in db.execute(pretrade_recommendation_run_records_stmt(actor_id)).scalars().all()
    }
    review_records = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
    ).scalars().all()
    attached_run_ids = sorted(
        {
            recommendation_run_id
            for recommendation_run_id in (review_recommendation_run_id(record) for record in review_records)
            if recommendation_run_id is not None and recommendation_run_id not in records_by_id
        }
    )
    if attached_run_ids:
        attached_records = db.execute(
            select(ReportPreset).where(
                ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
                ReportPreset.id.in_(attached_run_ids),
            )
        ).scalars().all()
        records_by_id.update({record.id: record for record in attached_records})
    return sorted(records_by_id.values(), key=lambda record: (record.created_at, record.id), reverse=True)


def latest_accessible_recommendation_run_record(
    db,
    *,
    actor_id: str,
    source_scenario_id: int | None = None,
    source_review_id: int | None = None,
) -> ReportPreset | None:
    if source_scenario_id is None and source_review_id is None:
        return None

    matching_records = [
        record
        for record in accessible_recommendation_run_records(db, actor_id=actor_id)
        if (
            source_review_id is not None and recommendation_run_source_review_id(record) == source_review_id
        )
        or (
            source_review_id is None
            and source_scenario_id is not None
            and recommendation_run_source_scenario_id(record) == source_scenario_id
        )
    ]
    return max(matching_records, key=lambda record: (record.created_at, record.id), default=None)


def build_recommendation_run_comparison(
    *,
    current: PreTradeRecommendationRunOut,
    previous: PreTradeRecommendationRunOut,
) -> PreTradeRecommendationRunComparisonOut:
    current_snapshots = {_snapshot_audit_key(snapshot): snapshot for snapshot in current.input_snapshots}
    previous_snapshots = {_snapshot_audit_key(snapshot): snapshot for snapshot in previous.input_snapshots}

    source_quality_changes: list[PreTradeRecommendationSourceQualityDeltaOut] = []
    input_snapshot_changes: list[PreTradeRecommendationInputDeltaOut] = []
    for adapter_key in sorted(set(current_snapshots) | set(previous_snapshots)):
        current_snapshot = current_snapshots.get(adapter_key)
        previous_snapshot = previous_snapshots.get(adapter_key)
        label = _snapshot_audit_label(current_snapshot or previous_snapshot)  # type: ignore[arg-type]

        if current_snapshot is None:
            input_snapshot_changes.append(
                PreTradeRecommendationInputDeltaOut(
                    adapter_key=adapter_key,
                    adapter_label=label,
                    change_type="REMOVED",
                )
            )
            continue
        if previous_snapshot is None:
            input_snapshot_changes.append(
                PreTradeRecommendationInputDeltaOut(
                    adapter_key=adapter_key,
                    adapter_label=label,
                    change_type="ADDED",
                )
            )
            continue

        if (
            current_snapshot.quality_status != previous_snapshot.quality_status
            or current_snapshot.freshness != previous_snapshot.freshness
        ):
            source_quality_changes.append(
                PreTradeRecommendationSourceQualityDeltaOut(
                    adapter_key=adapter_key,
                    adapter_label=label,
                    previous_quality_status=previous_snapshot.quality_status,
                    current_quality_status=current_snapshot.quality_status,
                    previous_freshness=previous_snapshot.freshness,
                    current_freshness=current_snapshot.freshness,
                )
            )
        if _snapshot_audit_payload(current_snapshot) != _snapshot_audit_payload(previous_snapshot):
            input_snapshot_changes.append(
                PreTradeRecommendationInputDeltaOut(
                    adapter_key=adapter_key,
                    adapter_label=label,
                    change_type="CHANGED",
                )
            )

    added_drivers, removed_drivers = _ordered_text_delta(
        current.recommendation.explanation.primary_drivers,
        previous.recommendation.explanation.primary_drivers,
    )
    score_delta = current.recommendation.score - previous.recommendation.score
    stance_changed = current.recommendation.stance != previous.recommendation.stance
    stance_summary = (
        f"Stance changed from {previous.recommendation.stance.replace('_', ' ')} to {current.recommendation.stance.replace('_', ' ')}."
        if stance_changed
        else f"Stance held at {current.recommendation.stance.replace('_', ' ')}."
    )
    score_summary = f" Score moved {score_delta:+d} points."
    driver_summary = f" {len(added_drivers)} new driver{'s' if len(added_drivers) != 1 else ''}."
    source_summary = f" {len(source_quality_changes)} source quality change{'s' if len(source_quality_changes) != 1 else ''}."

    return PreTradeRecommendationRunComparisonOut(
        previous_run_id=previous.run_id,
        previous_run_key=previous.run_key,
        previous_created_at=previous.created_at,
        previous_stance=previous.recommendation.stance,
        previous_score=previous.recommendation.score,
        stance_changed=stance_changed,
        score_delta=score_delta,
        added_primary_drivers=added_drivers,
        removed_primary_drivers=removed_drivers,
        source_quality_changes=source_quality_changes,
        input_snapshot_changes=input_snapshot_changes,
        summary=f"{stance_summary}{score_summary}{driver_summary}{source_summary}",
    )


def _to_recommendation_run_out_base(record: ReportPreset, *, actor_id: str) -> PreTradeRecommendationRunOut:
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


def to_recommendation_run_out(
    record: ReportPreset,
    *,
    actor_id: str,
    previous_record: ReportPreset | None = None,
) -> PreTradeRecommendationRunOut:
    run = _to_recommendation_run_out_base(record, actor_id=actor_id)
    if previous_record is None:
        return run
    previous_run = _to_recommendation_run_out_base(previous_record, actor_id=actor_id)
    return run.model_copy(
        update={
            "comparison": build_recommendation_run_comparison(
                current=run,
                previous=previous_run,
            )
        }
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
        explanation=run.recommendation.explanation,
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
