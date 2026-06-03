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
    review_draft,
    review_enrichment,
    review_notes,
    review_owner,
    review_recommendation_run_id,
    review_status,
    review_thesis,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeGovernancePromotionCandidateOut,
    PreTradeRecommendationMissingEvidenceOut,
    PreTradeRecommendationResidualExposureOut,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeRiskScenarioOut,
    PreTradeRiskScenarioPromoteCreate,
    PreTradeScenarioDraft,
    PreTradeScenarioEnrichmentOut,
)

PRETRADE_RISK_SCENARIO_PRESET_KEY = "pretrade_risk_scenario"


class PreTradeRiskScenarioPromotionError(ValueError):
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


def visible_pretrade_risk_scenario_records(db: Session) -> list[ReportPreset]:
    return db.execute(
        select(ReportPreset)
        .where(
            ReportPreset.preset_key == PRETRADE_RISK_SCENARIO_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
        .order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()


def _candidate_for_risk_scenario(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime,
) -> PreTradeGovernancePromotionCandidateOut:
    items = build_pretrade_governance_items(db, actor_id=actor_id, generated_at=generated_at)
    candidate = next(
        (item for item in items.promotion_candidates if item.candidate_type == "RISK_SCENARIO"),
        None,
    )
    if candidate is None:
        raise PreTradeRiskScenarioPromotionError("No promotable risk-scenario governance signal is available.")
    if candidate.latest_review_id is None:
        raise PreTradeRiskScenarioPromotionError("Risk-scenario promotion requires a linked pre-trade review.")
    return candidate


def _existing_risk_scenario_record(
    db: Session,
    *,
    source_latest_run_id: int | None,
    source_latest_review_id: int | None,
) -> ReportPreset | None:
    for record in visible_pretrade_risk_scenario_records(db):
        payload = _record_payload(record)
        if payload.get("status") == "RETIRED":
            continue
        if (
            _payload_int(payload, "source_latest_run_id") == source_latest_run_id
            and _payload_int(payload, "source_latest_review_id") == source_latest_review_id
        ):
            return record
    return None


def _risk_scenario_name(*, review_record: ReportPreset, draft: PreTradeScenarioDraft) -> str:
    book = draft.book or "Desk"
    commodity = draft.commodity or "commodity"
    return f"{book} {commodity} risk scenario review draft from {review_record.name}"[:120]


def _reviewer_focus(
    *,
    enrichment: PreTradeScenarioEnrichmentOut | None,
    run: PreTradeRecommendationRunOut | None,
) -> list[str]:
    items: list[str] = []
    if enrichment is not None:
        items.extend(enrichment.reviewer_focus)
    if run is not None:
        items.extend(run.recommendation.explanation.reviewer_focus)
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
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


def _risk_scenario_payload_json(
    *,
    candidate: PreTradeGovernancePromotionCandidateOut,
    review_record: ReportPreset,
    draft: PreTradeScenarioDraft,
    enrichment: PreTradeScenarioEnrichmentOut | None,
    run: PreTradeRecommendationRunOut | None,
    payload: PreTradeRiskScenarioPromoteCreate,
) -> dict[str, object]:
    recommendation = run.recommendation if run is not None else None
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
        "source_recommendation_stance": recommendation.stance if recommendation is not None else None,
        "source_recommendation_score": recommendation.score if recommendation is not None else None,
        "source_recommendation_headline": recommendation.headline if recommendation is not None else None,
        "draft": draft.model_dump(mode="json", exclude_none=True),
        "enrichment": enrichment.model_dump(mode="json", exclude_none=True) if enrichment is not None else None,
        "residual_exposure": (
            recommendation.residual_exposure.model_dump(mode="json", exclude_none=True)
            if recommendation is not None and recommendation.residual_exposure is not None
            else None
        ),
        "input_snapshots": [
            snapshot.model_dump(mode="json", exclude_none=True)
            for snapshot in (run.input_snapshots if run is not None else [])
        ],
        "missing_evidence": [
            missing.model_dump(mode="json", exclude_none=True)
            for missing in (recommendation.missing_evidence if recommendation is not None else [])
        ],
        "reviewer_focus": _reviewer_focus(enrichment=enrichment, run=run),
    }


def promote_governance_risk_scenario_draft(
    db: Session,
    *,
    actor_id: str,
    payload: PreTradeRiskScenarioPromoteCreate,
    generated_at: datetime | None = None,
) -> ReportPreset:
    now = generated_at or datetime.now(timezone.utc)
    candidate = _candidate_for_risk_scenario(db, actor_id=actor_id, generated_at=now)
    source_review_id = candidate.latest_review_id
    source_run_id = candidate.latest_run_id
    existing = _existing_risk_scenario_record(
        db,
        source_latest_run_id=source_run_id,
        source_latest_review_id=source_review_id,
    )
    if existing is not None:
        return existing

    review_record = get_pretrade_review_record(db, source_review_id)
    if review_record is None:
        raise PreTradeRiskScenarioPromotionError("Linked pre-trade review is no longer visible.")

    if source_run_id is None:
        source_run_id = review_recommendation_run_id(review_record)

    run: PreTradeRecommendationRunOut | None = None
    if source_run_id is not None:
        run_record = get_accessible_recommendation_run_record(
            db,
            recommendation_run_id=source_run_id,
            actor_id=actor_id,
        )
        if run_record is None:
            raise PreTradeRiskScenarioPromotionError("Linked recommendation run is no longer visible.")
        run = to_recommendation_run_out(run_record, actor_id=actor_id)

    draft = review_draft(review_record)
    enrichment = review_enrichment(review_record)
    record = ReportPreset(
        preset_key=PRETRADE_RISK_SCENARIO_PRESET_KEY,
        scope="SHARED",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY,
        name=_risk_scenario_name(review_record=review_record, draft=draft),
        name_key=uuid4().hex,
        filters_json=_risk_scenario_payload_json(
            candidate=candidate,
            review_record=review_record,
            draft=draft,
            enrichment=enrichment,
            run=run,
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


def to_pretrade_risk_scenario_out(record: ReportPreset, *, actor_id: str) -> PreTradeRiskScenarioOut:
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

    enrichment: PreTradeScenarioEnrichmentOut | None = None
    raw_enrichment = payload.get("enrichment")
    if isinstance(raw_enrichment, dict):
        try:
            enrichment = PreTradeScenarioEnrichmentOut.model_validate(raw_enrichment)
        except ValidationError:
            enrichment = None

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

    return PreTradeRiskScenarioOut(
        risk_scenario_id=record.id,
        risk_scenario_key=record.name_key,
        name=record.name,
        status=_payload_text(payload, "status") or "REVIEW_DRAFT",  # type: ignore[arg-type]
        owner=_payload_text(payload, "owner"),
        review_note=_payload_text(payload, "review_note"),
        source_promotion_candidate_type=(payload.get("source_promotion_candidate_type") or "RISK_SCENARIO"),  # type: ignore[arg-type]
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
        source_recommendation_stance=payload.get("source_recommendation_stance"),  # type: ignore[arg-type]
        source_recommendation_score=_payload_int(payload, "source_recommendation_score"),
        source_recommendation_headline=_payload_text(payload, "source_recommendation_headline"),
        draft=draft,
        enrichment=enrichment,
        residual_exposure=residual_exposure,
        input_snapshots=input_snapshots,
        missing_evidence=missing_evidence,
        reviewer_focus=_payload_text_list(payload, "reviewer_focus"),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id or record.updated_by == actor_id,
    )
