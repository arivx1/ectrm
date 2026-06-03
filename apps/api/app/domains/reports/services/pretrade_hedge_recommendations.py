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
from apps.api.app.domains.reports.services.pretrade_reviews import PRETRADE_SHARED_OWNER_KEY
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeGovernancePromotionCandidateOut,
    PreTradeHedgeRecommendationOut,
    PreTradeHedgeRecommendationPromoteCreate,
    PreTradeRecommendationHedgeRecommendationOut,
    PreTradeRecommendationMissingEvidenceOut,
    PreTradeRecommendationRejectedAlternativeOut,
    PreTradeRecommendationResidualExposureOut,
    PreTradeRecommendationRunOut,
    PreTradeScenarioDraft,
)

PRETRADE_HEDGE_RECOMMENDATION_PRESET_KEY = "pretrade_hedge_recommendation"
PROMOTABLE_HEDGE_INSTRUMENTS = {"FUTURES", "OPTIONS", "SWAP", "PHYSICAL_OFFSET"}


class PreTradeHedgeRecommendationPromotionError(ValueError):
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


def visible_pretrade_hedge_recommendation_records(db: Session) -> list[ReportPreset]:
    return db.execute(
        select(ReportPreset)
        .where(
            ReportPreset.preset_key == PRETRADE_HEDGE_RECOMMENDATION_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
        .order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()


def _candidate_for_hedge_recommendation(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime,
) -> PreTradeGovernancePromotionCandidateOut:
    items = build_pretrade_governance_items(db, actor_id=actor_id, generated_at=generated_at)
    candidate = next(
        (item for item in items.promotion_candidates if item.candidate_type == "HEDGE_RECOMMENDATION"),
        None,
    )
    if candidate is None:
        raise PreTradeHedgeRecommendationPromotionError("No promotable hedge-recommendation governance signal is available.")
    if candidate.latest_run_id is None:
        raise PreTradeHedgeRecommendationPromotionError("Hedge-recommendation promotion requires a linked recommendation run.")
    return candidate


def _supported_hedge_recommendation(
    run: PreTradeRecommendationRunOut,
) -> PreTradeRecommendationHedgeRecommendationOut | None:
    hedge = run.recommendation.hedge_recommendation
    if hedge is None or hedge.instrument_type not in PROMOTABLE_HEDGE_INSTRUMENTS:
        return None
    return hedge


def _existing_hedge_recommendation_record(
    db: Session,
    *,
    source_latest_run_id: int | None,
    source_latest_review_id: int | None,
) -> ReportPreset | None:
    for record in visible_pretrade_hedge_recommendation_records(db):
        payload = _record_payload(record)
        if payload.get("status") == "RETIRED":
            continue
        if (
            _payload_int(payload, "source_latest_run_id") == source_latest_run_id
            and _payload_int(payload, "source_latest_review_id") == source_latest_review_id
        ):
            return record
    return None


def _hedge_recommendation_name(
    *,
    run: PreTradeRecommendationRunOut,
    hedge_recommendation: PreTradeRecommendationHedgeRecommendationOut,
) -> str:
    book = run.draft.book or "Desk"
    commodity = run.draft.commodity or "commodity"
    instrument = hedge_recommendation.instrument_type.replace("_", " ").title()
    return f"{book} {commodity} {instrument} hedge review draft"[:120]


def _hedge_recommendation_payload_json(
    *,
    candidate: PreTradeGovernancePromotionCandidateOut,
    run: PreTradeRecommendationRunOut,
    hedge_recommendation: PreTradeRecommendationHedgeRecommendationOut,
    payload: PreTradeHedgeRecommendationPromoteCreate,
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
        "source_recommendation_stance": recommendation.stance,
        "source_recommendation_score": recommendation.score,
        "source_recommendation_headline": recommendation.headline,
        "draft": run.draft.model_dump(mode="json", exclude_none=True),
        "residual_exposure": (
            recommendation.residual_exposure.model_dump(mode="json", exclude_none=True)
            if recommendation.residual_exposure is not None
            else None
        ),
        "hedge_recommendation": hedge_recommendation.model_dump(mode="json", exclude_none=True),
        "rejected_alternatives": [
            alternative.model_dump(mode="json", exclude_none=True)
            for alternative in recommendation.rejected_alternatives
        ],
        "missing_evidence": [
            missing.model_dump(mode="json", exclude_none=True)
            for missing in recommendation.missing_evidence
        ],
    }


def promote_governance_hedge_recommendation_draft(
    db: Session,
    *,
    actor_id: str,
    payload: PreTradeHedgeRecommendationPromoteCreate,
    generated_at: datetime | None = None,
) -> ReportPreset:
    now = generated_at or datetime.now(timezone.utc)
    candidate = _candidate_for_hedge_recommendation(db, actor_id=actor_id, generated_at=now)
    existing = _existing_hedge_recommendation_record(
        db,
        source_latest_run_id=candidate.latest_run_id,
        source_latest_review_id=candidate.latest_review_id,
    )
    if existing is not None:
        return existing

    run_record = get_accessible_recommendation_run_record(
        db,
        recommendation_run_id=candidate.latest_run_id,
        actor_id=actor_id,
    )
    if run_record is None:
        raise PreTradeHedgeRecommendationPromotionError("Linked recommendation run is no longer visible.")

    run = to_recommendation_run_out(run_record, actor_id=actor_id)
    hedge_recommendation = _supported_hedge_recommendation(run)
    if hedge_recommendation is None:
        raise PreTradeHedgeRecommendationPromotionError(
            "Linked recommendation run no longer carries a supported hedge recommendation."
        )

    record = ReportPreset(
        preset_key=PRETRADE_HEDGE_RECOMMENDATION_PRESET_KEY,
        scope="SHARED",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY,
        name=_hedge_recommendation_name(run=run, hedge_recommendation=hedge_recommendation),
        name_key=uuid4().hex,
        filters_json=_hedge_recommendation_payload_json(
            candidate=candidate,
            run=run,
            hedge_recommendation=hedge_recommendation,
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


def to_pretrade_hedge_recommendation_out(record: ReportPreset, *, actor_id: str) -> PreTradeHedgeRecommendationOut:
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

    residual_exposure: PreTradeRecommendationResidualExposureOut | None = None
    raw_residual = payload.get("residual_exposure")
    if isinstance(raw_residual, dict):
        try:
            residual_exposure = PreTradeRecommendationResidualExposureOut.model_validate(raw_residual)
        except ValidationError:
            residual_exposure = None

    try:
        hedge_recommendation = PreTradeRecommendationHedgeRecommendationOut.model_validate(
            payload.get("hedge_recommendation") or {}
        )
    except ValidationError:
        hedge_recommendation = PreTradeRecommendationHedgeRecommendationOut(
            instrument_type="WAIT_FOR_DATA",
            decision_key="missing_hedge_review_payload",
            rationale="Hedge recommendation payload could not be validated.",
            policy_stops=["Hedge recommendation payload could not be validated."],
        )

    rejected_alternatives: list[PreTradeRecommendationRejectedAlternativeOut] = []
    raw_alternatives = payload.get("rejected_alternatives")
    if isinstance(raw_alternatives, list):
        for item in raw_alternatives:
            if not isinstance(item, dict):
                continue
            try:
                rejected_alternatives.append(PreTradeRecommendationRejectedAlternativeOut.model_validate(item))
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

    return PreTradeHedgeRecommendationOut(
        hedge_recommendation_id=record.id,
        hedge_recommendation_key=record.name_key,
        name=record.name,
        status=_payload_text(payload, "status") or "REVIEW_DRAFT",  # type: ignore[arg-type]
        owner=_payload_text(payload, "owner"),
        review_note=_payload_text(payload, "review_note"),
        source_promotion_candidate_type=(payload.get("source_promotion_candidate_type") or "HEDGE_RECOMMENDATION"),  # type: ignore[arg-type]
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
        source_stop_reasons=[
            item
            for item in payload.get("source_stop_reasons", [])
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(payload.get("source_stop_reasons"), list)
        else [],
        source_recommendation_stance=(payload.get("source_recommendation_stance") or "WAIT_FOR_DATA"),  # type: ignore[arg-type]
        source_recommendation_score=_payload_int(payload, "source_recommendation_score") or 0,
        source_recommendation_headline=(
            _payload_text(payload, "source_recommendation_headline")
            or "Recommendation headline was not captured."
        ),
        draft=draft,
        residual_exposure=residual_exposure,
        hedge_recommendation=hedge_recommendation,
        rejected_alternatives=rejected_alternatives,
        missing_evidence=missing_evidence,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id or record.updated_by == actor_id,
    )
