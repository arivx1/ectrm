from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_governance import build_pretrade_governance_items
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    get_accessible_recommendation_run_record,
    to_recommendation_run_out,
)
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_SHARED_OWNER_KEY,
    get_pretrade_review_record,
    review_notes,
    review_owner,
    review_status,
    review_thesis,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeGovernancePromotionCandidateOut,
    PreTradeMarketOpportunityOut,
    PreTradeMarketOpportunityPromoteCreate,
    PreTradeRecommendationArbitrageCandidateOut,
    PreTradeRecommendationMissingEvidenceOut,
    PreTradeRecommendationOpportunitySummaryOut,
    PreTradeRecommendationResidualExposureOut,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeScenarioDraft,
)

PRETRADE_MARKET_OPPORTUNITY_PRESET_KEY = "pretrade_market_opportunity"
PROMOTABLE_MARKET_OPPORTUNITY_CATEGORIES = {"MARK_GAP", "ARBITRAGE"}


class PreTradeMarketOpportunityPromotionError(ValueError):
    pass


def _record_payload(record: ReportPreset) -> dict[str, object]:
    payload = record.filters_json or {}
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _payload_int(payload: dict[str, object], key: str) -> int | None:
    value = payload.get(key)
    return value if isinstance(value, int) else None


def _payload_int_list(payload: dict[str, object], key: str) -> list[int]:
    value = payload.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, int)]


def _payload_text(payload: dict[str, object], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) and value.strip() else None


def _payload_text_list(payload: dict[str, object], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def visible_pretrade_market_opportunity_records(db: Session) -> list[ReportPreset]:
    return db.execute(
        select(ReportPreset)
        .where(
            ReportPreset.preset_key == PRETRADE_MARKET_OPPORTUNITY_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
        .order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()


def _candidate_for_market_opportunity(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime,
) -> PreTradeGovernancePromotionCandidateOut:
    items = build_pretrade_governance_items(db, actor_id=actor_id, generated_at=generated_at)
    candidate = next(
        (item for item in items.promotion_candidates if item.candidate_type == "MARKET_OPPORTUNITY"),
        None,
    )
    if candidate is None:
        raise PreTradeMarketOpportunityPromotionError("No promotable market-opportunity governance signal is available.")
    if candidate.latest_review_id is None:
        raise PreTradeMarketOpportunityPromotionError("Market-opportunity promotion requires a linked pre-trade review.")
    if candidate.latest_run_id is None:
        raise PreTradeMarketOpportunityPromotionError("Market-opportunity promotion requires a linked recommendation run.")
    return candidate


def _supported_market_opportunity(
    run: PreTradeRecommendationRunOut,
) -> PreTradeRecommendationOpportunitySummaryOut | None:
    opportunity = run.recommendation.opportunity_summary
    if opportunity is None or opportunity.category not in PROMOTABLE_MARKET_OPPORTUNITY_CATEGORIES:
        return None
    return opportunity


def _existing_market_opportunity_record(
    db: Session,
    *,
    source_latest_run_id: int | None,
    source_latest_review_id: int | None,
) -> ReportPreset | None:
    for record in visible_pretrade_market_opportunity_records(db):
        payload = _record_payload(record)
        if payload.get("status") == "RETIRED":
            continue
        if (
            _payload_int(payload, "source_latest_run_id") == source_latest_run_id
            and _payload_int(payload, "source_latest_review_id") == source_latest_review_id
        ):
            return record
    return None


def _market_opportunity_name(
    *,
    run: PreTradeRecommendationRunOut,
    opportunity: PreTradeRecommendationOpportunitySummaryOut,
) -> str:
    book = run.draft.book or "Desk"
    commodity = run.draft.commodity or "commodity"
    category = opportunity.category.replace("_", " ").title()
    return f"{book} {commodity} {category} market opportunity review draft"[:120]


def _reviewer_focus(run: PreTradeRecommendationRunOut) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in run.recommendation.explanation.reviewer_focus:
        normalized_item = item.strip()
        if not normalized_item:
            continue
        item_key = normalized_item.casefold()
        if item_key in seen:
            continue
        normalized.append(normalized_item[:500])
        seen.add(item_key)
        if len(normalized) >= 8:
            break
    return normalized


def _market_opportunity_payload_json(
    *,
    candidate: PreTradeGovernancePromotionCandidateOut,
    review_record: ReportPreset,
    run: PreTradeRecommendationRunOut,
    opportunity: PreTradeRecommendationOpportunitySummaryOut,
    payload: PreTradeMarketOpportunityPromoteCreate,
) -> dict[str, object]:
    recommendation = run.recommendation
    return {
        "status": "REVIEW_DRAFT",
        "owner": payload.owner,
        "review_note": payload.review_note,
        "source_promotion_candidate_type": candidate.candidate_type,
        "source_promotion_status": candidate.status,
        "source_promotion_score": candidate.score,
        "source_review_count": candidate.review_count,
        "source_approved_review_count": candidate.approved_review_count,
        "source_booked_review_count": candidate.booked_review_count,
        "source_override_count": candidate.override_count,
        "source_run_count": candidate.run_count,
        "source_latest_review_id": candidate.latest_review_id,
        "source_latest_run_id": candidate.latest_run_id,
        "source_sample_review_ids": candidate.sample_review_ids,
        "source_sample_run_ids": candidate.sample_run_ids,
        "source_evidence_summary": candidate.evidence_summary,
        "source_promotion_rationale": candidate.promotion_rationale,
        "source_stop_reasons": candidate.stop_reasons,
        "source_review_name": review_record.name,
        "source_review_status": review_status(review_record),
        "source_review_thesis": review_thesis(review_record),
        "source_review_notes": review_notes(review_record),
        "source_review_owner": review_owner(review_record),
        "source_recommendation_stance": recommendation.stance,
        "source_recommendation_score": recommendation.score,
        "source_recommendation_headline": recommendation.headline,
        "draft": run.draft.model_dump(mode="json", exclude_none=True),
        "opportunity_summary": opportunity.model_dump(mode="json", exclude_none=True),
        "arbitrage_candidate": (
            recommendation.arbitrage_candidate.model_dump(mode="json", exclude_none=True)
            if recommendation.arbitrage_candidate is not None
            else None
        ),
        "residual_exposure": (
            recommendation.residual_exposure.model_dump(mode="json", exclude_none=True)
            if recommendation.residual_exposure is not None
            else None
        ),
        "input_snapshots": [
            snapshot.model_dump(mode="json", exclude_none=True)
            for snapshot in run.input_snapshots
        ],
        "missing_evidence": [
            missing.model_dump(mode="json", exclude_none=True)
            for missing in recommendation.missing_evidence
        ],
        "next_actions": recommendation.next_actions,
        "reviewer_focus": _reviewer_focus(run),
    }


def promote_governance_market_opportunity_draft(
    db: Session,
    *,
    actor_id: str,
    payload: PreTradeMarketOpportunityPromoteCreate,
    generated_at: datetime | None = None,
) -> ReportPreset:
    now = generated_at or datetime.now(timezone.utc)
    candidate = _candidate_for_market_opportunity(db, actor_id=actor_id, generated_at=now)
    existing = _existing_market_opportunity_record(
        db,
        source_latest_run_id=candidate.latest_run_id,
        source_latest_review_id=candidate.latest_review_id,
    )
    if existing is not None:
        return existing

    review_record = get_pretrade_review_record(db, candidate.latest_review_id)
    if review_record is None:
        raise PreTradeMarketOpportunityPromotionError("Linked pre-trade review is no longer visible.")

    run_record = get_accessible_recommendation_run_record(
        db,
        recommendation_run_id=candidate.latest_run_id,
        actor_id=actor_id,
    )
    if run_record is None:
        raise PreTradeMarketOpportunityPromotionError("Linked recommendation run is no longer visible.")

    run = to_recommendation_run_out(run_record, actor_id=actor_id)
    opportunity = _supported_market_opportunity(run)
    if opportunity is None:
        raise PreTradeMarketOpportunityPromotionError(
            "Linked recommendation run no longer carries a supported market-opportunity summary."
        )

    record = ReportPreset(
        preset_key=PRETRADE_MARKET_OPPORTUNITY_PRESET_KEY,
        scope="SHARED",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY,
        name=_market_opportunity_name(run=run, opportunity=opportunity),
        name_key=uuid4().hex,
        filters_json=_market_opportunity_payload_json(
            candidate=candidate,
            review_record=review_record,
            run=run,
            opportunity=opportunity,
            payload=payload,
        ),
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def to_pretrade_market_opportunity_out(record: ReportPreset, *, actor_id: str) -> PreTradeMarketOpportunityOut:
    payload = _record_payload(record)
    try:
        draft = PreTradeScenarioDraft.model_validate(payload.get("draft") or {})
    except ValidationError:
        draft = PreTradeScenarioDraft(
            book="UNKNOWN",
            commodity_class="UNKNOWN",
            commodity="UNKNOWN",
            pricing_type="UNKNOWN",
        )

    try:
        opportunity_summary = PreTradeRecommendationOpportunitySummaryOut.model_validate(
            payload.get("opportunity_summary") or {}
        )
    except ValidationError:
        opportunity_summary = PreTradeRecommendationOpportunitySummaryOut(
            category="WAIT_FOR_DATA",
            title="Market opportunity evidence unavailable",
            detail="Market opportunity payload could not be validated.",
        )

    arbitrage_candidate: PreTradeRecommendationArbitrageCandidateOut | None = None
    raw_arbitrage = payload.get("arbitrage_candidate")
    if isinstance(raw_arbitrage, dict):
        try:
            arbitrage_candidate = PreTradeRecommendationArbitrageCandidateOut.model_validate(raw_arbitrage)
        except ValidationError:
            arbitrage_candidate = None

    residual_exposure: PreTradeRecommendationResidualExposureOut | None = None
    raw_residual = payload.get("residual_exposure")
    if isinstance(raw_residual, dict):
        try:
            residual_exposure = PreTradeRecommendationResidualExposureOut.model_validate(raw_residual)
        except ValidationError:
            residual_exposure = None

    input_snapshots: list[PreTradeRecommendationSourceSnapshot] = []
    raw_snapshots = payload.get("input_snapshots")
    if isinstance(raw_snapshots, list):
        for item in raw_snapshots:
            if not isinstance(item, dict):
                continue
            try:
                input_snapshots.append(PreTradeRecommendationSourceSnapshot.model_validate(item))
            except ValidationError:
                continue

    missing_evidence: list[PreTradeRecommendationMissingEvidenceOut] = []
    raw_missing_evidence = payload.get("missing_evidence")
    if isinstance(raw_missing_evidence, list):
        for item in raw_missing_evidence:
            if not isinstance(item, dict):
                continue
            try:
                missing_evidence.append(PreTradeRecommendationMissingEvidenceOut.model_validate(item))
            except ValidationError:
                continue

    return PreTradeMarketOpportunityOut(
        market_opportunity_id=record.id,
        market_opportunity_key=record.name_key,
        name=record.name,
        status=_payload_text(payload, "status") or "REVIEW_DRAFT",  # type: ignore[arg-type]
        owner=_payload_text(payload, "owner"),
        review_note=_payload_text(payload, "review_note"),
        source_promotion_candidate_type=(payload.get("source_promotion_candidate_type") or "MARKET_OPPORTUNITY"),  # type: ignore[arg-type]
        source_promotion_status=(payload.get("source_promotion_status") or "WATCH"),  # type: ignore[arg-type]
        source_promotion_score=_payload_int(payload, "source_promotion_score") or 0,
        source_review_count=_payload_int(payload, "source_review_count") or 0,
        source_approved_review_count=_payload_int(payload, "source_approved_review_count") or 0,
        source_booked_review_count=_payload_int(payload, "source_booked_review_count") or 0,
        source_override_count=_payload_int(payload, "source_override_count") or 0,
        source_run_count=_payload_int(payload, "source_run_count") or 0,
        source_latest_review_id=_payload_int(payload, "source_latest_review_id"),
        source_latest_run_id=_payload_int(payload, "source_latest_run_id"),
        source_sample_review_ids=_payload_int_list(payload, "source_sample_review_ids"),
        source_sample_run_ids=_payload_int_list(payload, "source_sample_run_ids"),
        source_evidence_summary=_payload_text(payload, "source_evidence_summary") or "Promotion evidence was not captured.",
        source_promotion_rationale=_payload_text(payload, "source_promotion_rationale") or "Promotion rationale was not captured.",
        source_stop_reasons=_payload_text_list(payload, "source_stop_reasons"),
        source_review_name=_payload_text(payload, "source_review_name") or "Pre-trade review",
        source_review_status=(payload.get("source_review_status") or "OPEN"),  # type: ignore[arg-type]
        source_review_thesis=_payload_text(payload, "source_review_thesis"),
        source_review_notes=_payload_text(payload, "source_review_notes"),
        source_review_owner=_payload_text(payload, "source_review_owner"),
        source_recommendation_stance=(payload.get("source_recommendation_stance") or "WAIT_FOR_DATA"),  # type: ignore[arg-type]
        source_recommendation_score=_payload_int(payload, "source_recommendation_score") or 0,
        source_recommendation_headline=(
            _payload_text(payload, "source_recommendation_headline")
            or "Recommendation headline was not captured."
        ),
        draft=draft,
        opportunity_summary=opportunity_summary,
        arbitrage_candidate=arbitrage_candidate,
        residual_exposure=residual_exposure,
        input_snapshots=input_snapshots,
        missing_evidence=missing_evidence,
        next_actions=_payload_text_list(payload, "next_actions"),
        reviewer_focus=_payload_text_list(payload, "reviewer_focus"),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id or record.updated_by == actor_id,
    )
