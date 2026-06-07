from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_recommendations import (
    accessible_recommendation_run_records,
    build_recommendation_summary_lookup,
    previous_recommendation_run_record,
    recommendation_run_source_review_id,
    recommendation_run_source_scenario_id,
    to_recommendation_run_out,
)
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_REVIEW_PRESET_KEY,
    PRETRADE_SHARED_OWNER_KEY,
    build_linked_trade_status_lookup,
    review_linked_trade_id,
    review_record_payload,
    review_recommendation_override_reason,
    review_recommendation_run_id,
    review_status,
    to_review_out,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeGovernanceAuditCategory,
    PreTradeGovernanceAuditExportOut,
    PreTradeGovernanceAuditRowOut,
    PreTradeGovernanceItemsOut,
    PreTradeGovernancePromotionCandidateOut,
    PreTradeGovernanceStaleEvidenceRunOut,
    PreTradeGovernanceSummaryOut,
    PreTradePromotionCandidateType,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeReviewItemOut,
    PreTradeReviewRecommendationSummary,
)

RECOMMENDATION_OVERRIDE_STANCES = {"ESCALATE", "WAIT_FOR_DATA"}
IMPAIRED_SOURCE_QUALITY_STATUSES = {"STALE", "DEGRADED", "MISSING"}
PROMOTABLE_HEDGE_INSTRUMENTS = {"FUTURES", "OPTIONS", "SWAP", "PHYSICAL_OFFSET"}
PROMOTABLE_NETTING_MATCH_QUALITIES = {"EXACT", "PARTIAL"}
PROMOTABLE_MARKET_OPPORTUNITY_CATEGORIES = {"MARK_GAP", "ARBITRAGE"}
RISK_TRIAGE_PROMOTION_MARKERS = (
    "risk workspace triage",
    "risk triage",
    "risk pre-trade",
    "risk pretrade",
)
PROMOTION_CANDIDATE_LABELS: dict[PreTradePromotionCandidateType, str] = {
    "NETTING_SET": "Netting Set",
    "HEDGE_RECOMMENDATION": "Hedge Recommendation",
    "RISK_SCENARIO": "Risk Scenario",
    "MARKET_OPPORTUNITY": "Market Opportunity",
}
PROMOTION_CANDIDATE_ORDER: tuple[PreTradePromotionCandidateType, ...] = (
    "NETTING_SET",
    "HEDGE_RECOMMENDATION",
    "RISK_SCENARIO",
    "MARKET_OPPORTUNITY",
)


@dataclass
class _PromotionCandidateEvidence:
    candidate_type: PreTradePromotionCandidateType
    review_records: dict[int, ReportPreset] = field(default_factory=dict)
    approved_review_ids: set[int] = field(default_factory=set)
    booked_review_ids: set[int] = field(default_factory=set)
    override_review_ids: set[int] = field(default_factory=set)
    runs: dict[int, PreTradeRecommendationRunOut] = field(default_factory=dict)
    evidence_notes: list[str] = field(default_factory=list)
    has_exact_netting_match: bool = False
    has_policy_stops: bool = False
    has_blocking_missing_evidence: bool = False


def _visible_reviews_stmt():
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
        ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
    )


def _review_recommendation_summary_lookup(
    db: Session,
    records: list[ReportPreset],
) -> dict[int, PreTradeReviewRecommendationSummary]:
    return build_recommendation_summary_lookup(
        db,
        [
            recommendation_run_id
            for recommendation_run_id in (review_recommendation_run_id(record) for record in records)
            if recommendation_run_id is not None
        ],
    )


def _governance_recommendation_run_group_key(record: ReportPreset) -> tuple[str, int]:
    source_review_id = recommendation_run_source_review_id(record)
    if source_review_id is not None:
        return ("review", source_review_id)

    source_scenario_id = recommendation_run_source_scenario_id(record)
    if source_scenario_id is not None:
        return ("scenario", source_scenario_id)
    return ("run", record.id)


def _latest_governance_recommendation_run_records(records: list[ReportPreset]) -> list[ReportPreset]:
    latest_by_group: dict[tuple[str, int], ReportPreset] = {}
    for record in records:
        group_key = _governance_recommendation_run_group_key(record)
        existing_record = latest_by_group.get(group_key)
        if existing_record is None or (record.created_at, record.id) > (existing_record.created_at, existing_record.id):
            latest_by_group[group_key] = record
    return sorted(latest_by_group.values(), key=lambda record: (record.created_at, record.id), reverse=True)


def _governance_impaired_snapshots(
    run: PreTradeRecommendationRunOut,
) -> list[PreTradeRecommendationSourceSnapshot]:
    return [
        snapshot
        for snapshot in run.input_snapshots
        if snapshot.source_available and snapshot.quality_status in IMPAIRED_SOURCE_QUALITY_STATUSES
    ]


def _promotion_note_once(evidence: _PromotionCandidateEvidence, note: str) -> None:
    if note not in evidence.evidence_notes:
        evidence.evidence_notes.append(note)


def _promotion_run_lookup(
    records: list[ReportPreset],
    *,
    actor_id: str,
) -> dict[int, PreTradeRecommendationRunOut]:
    return {
        record.id: to_recommendation_run_out(
            record,
            actor_id=actor_id,
            previous_record=previous_recommendation_run_record(records, record),
        )
        for record in records
    }


def _netting_promotion_note(run: PreTradeRecommendationRunOut) -> tuple[str | None, bool]:
    supported_candidates = [
        candidate
        for candidate in run.recommendation.netting_candidates
        if candidate.match_quality in PROMOTABLE_NETTING_MATCH_QUALITIES
    ]
    if not supported_candidates:
        return None, False

    best_candidate = next(
        (candidate for candidate in supported_candidates if candidate.match_quality == "EXACT"),
        supported_candidates[0],
    )
    matched_quantity = best_candidate.matched_quantity or best_candidate.offset_quantity
    quantity_summary = f" matched {matched_quantity:g}" if matched_quantity is not None else ""
    return f"{best_candidate.label} carried a {best_candidate.match_quality.lower()} netting match{quantity_summary}.", (
        best_candidate.match_quality == "EXACT"
    )


def _hedge_promotion_note(run: PreTradeRecommendationRunOut) -> tuple[str | None, bool]:
    hedge = run.recommendation.hedge_recommendation
    if hedge is None or hedge.instrument_type not in PROMOTABLE_HEDGE_INSTRUMENTS:
        return None, False

    target_summary = f" for {hedge.target_delta:g}" if hedge.target_delta is not None else ""
    return f"{hedge.instrument_type.replace('_', ' ').lower()} hedge recommendation{target_summary}.", bool(
        hedge.policy_stops
    )


def _market_opportunity_promotion_note(run: PreTradeRecommendationRunOut) -> tuple[str | None, bool]:
    opportunity = run.recommendation.opportunity_summary
    if opportunity is None or opportunity.category not in PROMOTABLE_MARKET_OPPORTUNITY_CATEGORIES:
        return None, False

    has_blocking_missing_evidence = any(
        missing.severity == "BLOCKING"
        for missing in run.recommendation.missing_evidence
    )
    arbitrage_candidate = run.recommendation.arbitrage_candidate
    if opportunity.category == "ARBITRAGE" and arbitrage_candidate is not None:
        has_blocking_missing_evidence = has_blocking_missing_evidence or bool(
            arbitrage_candidate.missing_evidence
            or arbitrage_candidate.stop_reasons
            or arbitrage_candidate.status != "SUPPORTED"
        )

    category = opportunity.category.replace("_", " ").lower()
    return f"{category} opportunity evidence: {opportunity.title}.", has_blocking_missing_evidence


def _review_mentions_risk_triage(record: ReportPreset) -> bool:
    payload = review_record_payload(record)
    text_parts: list[str] = [record.name]
    for key in ("thesis", "review_notes"):
        value = payload.get(key)
        if isinstance(value, str):
            text_parts.append(value)

    enrichment = payload.get("enrichment")
    if isinstance(enrichment, dict):
        for key in ("opportunity_category", "residual_exposure_summary", "reviewer_focus"):
            value = enrichment.get(key)
            if isinstance(value, str):
                text_parts.append(value)
            elif isinstance(value, list):
                text_parts.extend(item for item in value if isinstance(item, str))

    review_text = " ".join(text_parts).casefold()
    return any(marker in review_text for marker in RISK_TRIAGE_PROMOTION_MARKERS)


def _add_promotion_evidence(
    evidence_by_type: dict[PreTradePromotionCandidateType, _PromotionCandidateEvidence],
    *,
    candidate_type: PreTradePromotionCandidateType,
    review_record: ReportPreset,
    run: PreTradeRecommendationRunOut | None = None,
    note: str | None = None,
    has_exact_netting_match: bool = False,
    has_policy_stops: bool = False,
    has_blocking_missing_evidence: bool = False,
) -> None:
    if review_status(review_record) == "REJECTED":
        return

    evidence = evidence_by_type.setdefault(
        candidate_type,
        _PromotionCandidateEvidence(candidate_type=candidate_type),
    )
    evidence.review_records[review_record.id] = review_record
    if review_status(review_record) == "APPROVED":
        evidence.approved_review_ids.add(review_record.id)
    if review_linked_trade_id(review_record):
        evidence.booked_review_ids.add(review_record.id)
    if review_recommendation_override_reason(review_record):
        evidence.override_review_ids.add(review_record.id)
    if run is not None:
        evidence.runs[run.run_id] = run
    if note:
        _promotion_note_once(evidence, note)
    evidence.has_exact_netting_match = evidence.has_exact_netting_match or has_exact_netting_match
    evidence.has_policy_stops = evidence.has_policy_stops or has_policy_stops
    evidence.has_blocking_missing_evidence = (
        evidence.has_blocking_missing_evidence
        or has_blocking_missing_evidence
    )


def _latest_promotion_review_id(evidence: _PromotionCandidateEvidence) -> int | None:
    if not evidence.review_records:
        return None
    return max(
        evidence.review_records.values(),
        key=lambda record: (record.updated_at, record.id),
    ).id


def _latest_promotion_run_id(evidence: _PromotionCandidateEvidence) -> int | None:
    if not evidence.runs:
        return None
    return max(evidence.runs.values(), key=lambda run: (run.created_at, run.run_id)).run_id


def _promotion_sample_review_ids(evidence: _PromotionCandidateEvidence) -> list[int]:
    return [
        record.id
        for record in sorted(
            evidence.review_records.values(),
            key=lambda record: (record.updated_at, record.id),
            reverse=True,
        )[:5]
    ]


def _promotion_sample_run_ids(evidence: _PromotionCandidateEvidence) -> list[int]:
    return [
        run.run_id
        for run in sorted(
            evidence.runs.values(),
            key=lambda run: (run.created_at, run.run_id),
            reverse=True,
        )[:5]
    ]


def _promotion_stop_reasons(evidence: _PromotionCandidateEvidence) -> list[str]:
    stop_reasons: list[str] = []
    if not evidence.approved_review_ids:
        stop_reasons.append("No approved reviews have reused this pattern yet.")
    if not evidence.booked_review_ids:
        stop_reasons.append("No booked trade has reused this pattern yet.")
    if evidence.override_review_ids:
        stop_reasons.append("Promotion evidence includes override decisions; confirm the durable rule with the policy owner first.")
    if evidence.candidate_type == "NETTING_SET" and not evidence.has_exact_netting_match:
        stop_reasons.append("Only partial netting evidence is visible; define matching tolerances before creating a durable netting set.")
    if evidence.candidate_type == "HEDGE_RECOMMENDATION" and evidence.has_policy_stops:
        stop_reasons.append("At least one hedge recommendation still carries policy stops.")
    if evidence.candidate_type == "MARKET_OPPORTUNITY" and evidence.has_blocking_missing_evidence:
        stop_reasons.append("Market opportunity evidence still carries blocking missing evidence.")
    if not evidence.runs and evidence.candidate_type != "RISK_SCENARIO":
        stop_reasons.append("No linked recommendation run evidence is attached to the reviews yet.")
    return stop_reasons


def _promotion_rationale(evidence: _PromotionCandidateEvidence) -> str:
    review_count = len(evidence.review_records)
    run_count = len(evidence.runs)
    label = PROMOTION_CANDIDATE_LABELS[evidence.candidate_type].lower()
    base = (
        f"Reviewer activity reused {label} evidence across {review_count} review"
        f"{'' if review_count == 1 else 's'} and {run_count} recommendation run"
        f"{'' if run_count == 1 else 's'}."
    )
    if evidence.candidate_type == "RISK_SCENARIO":
        base = (
            f"Risk triage activity has staged {review_count} pre-trade review"
            f"{'' if review_count == 1 else 's'} for the same durable scenario-review pattern."
        )
    if evidence.evidence_notes:
        return f"{base} Evidence: {' '.join(evidence.evidence_notes[:3])}"
    return base


def _promotion_candidate_status(evidence: _PromotionCandidateEvidence) -> str:
    if evidence.override_review_ids:
        return "WATCH"
    if evidence.booked_review_ids or len(evidence.approved_review_ids) >= 2:
        return "CANDIDATE"
    return "WATCH"


def _promotion_candidate_score(evidence: _PromotionCandidateEvidence) -> int:
    score = (
        len(evidence.review_records) * 10
        + len(evidence.runs) * 8
        + len(evidence.approved_review_ids) * 25
        + len(evidence.booked_review_ids) * 30
        - len(evidence.override_review_ids) * 15
    )
    return max(0, min(100, score))


def _to_promotion_candidate_out(
    evidence: _PromotionCandidateEvidence,
) -> PreTradeGovernancePromotionCandidateOut:
    stop_reasons = _promotion_stop_reasons(evidence)
    review_count = len(evidence.review_records)
    approved_review_count = len(evidence.approved_review_ids)
    booked_review_count = len(evidence.booked_review_ids)
    override_count = len(evidence.override_review_ids)
    run_count = len(evidence.runs)
    evidence_summary = (
        f"{review_count} review{'' if review_count == 1 else 's'}, "
        f"{approved_review_count} approved, {booked_review_count} booked, "
        f"{override_count} override{'' if override_count == 1 else 's'}, "
        f"{run_count} recommendation run{'' if run_count == 1 else 's'}."
    )
    return PreTradeGovernancePromotionCandidateOut(
        candidate_type=evidence.candidate_type,
        label=PROMOTION_CANDIDATE_LABELS[evidence.candidate_type],
        status=_promotion_candidate_status(evidence),  # type: ignore[arg-type]
        score=_promotion_candidate_score(evidence),
        review_count=review_count,
        approved_review_count=approved_review_count,
        booked_review_count=booked_review_count,
        override_count=override_count,
        run_count=run_count,
        latest_review_id=_latest_promotion_review_id(evidence),
        latest_run_id=_latest_promotion_run_id(evidence),
        evidence_summary=evidence_summary,
        promotion_rationale=_promotion_rationale(evidence),
        stop_reasons=stop_reasons,
        sample_review_ids=_promotion_sample_review_ids(evidence),
        sample_run_ids=_promotion_sample_run_ids(evidence),
    )


def _promotion_candidate_sort_key(candidate: PreTradeGovernancePromotionCandidateOut) -> tuple[int, int, int]:
    status_rank = 0 if candidate.status == "CANDIDATE" else 1
    type_rank = PROMOTION_CANDIDATE_ORDER.index(candidate.candidate_type)
    return (status_rank, -candidate.score, type_rank)


def _build_promotion_candidates(
    review_records: list[ReportPreset],
    recommendation_run_records: list[ReportPreset],
    *,
    actor_id: str,
) -> list[PreTradeGovernancePromotionCandidateOut]:
    run_by_id = _promotion_run_lookup(recommendation_run_records, actor_id=actor_id)
    evidence_by_type: dict[PreTradePromotionCandidateType, _PromotionCandidateEvidence] = {}

    for review_record in review_records:
        run_id = review_recommendation_run_id(review_record)
        run = run_by_id.get(run_id) if run_id is not None else None

        if run is not None:
            netting_note, has_exact_netting_match = _netting_promotion_note(run)
            if netting_note is not None:
                _add_promotion_evidence(
                    evidence_by_type,
                    candidate_type="NETTING_SET",
                    review_record=review_record,
                    run=run,
                    note=netting_note,
                    has_exact_netting_match=has_exact_netting_match,
                )

            hedge_note, has_policy_stops = _hedge_promotion_note(run)
            if hedge_note is not None:
                _add_promotion_evidence(
                    evidence_by_type,
                    candidate_type="HEDGE_RECOMMENDATION",
                    review_record=review_record,
                    run=run,
                    note=hedge_note,
                    has_policy_stops=has_policy_stops,
                )

            market_note, has_blocking_missing_evidence = _market_opportunity_promotion_note(run)
            if market_note is not None:
                _add_promotion_evidence(
                    evidence_by_type,
                    candidate_type="MARKET_OPPORTUNITY",
                    review_record=review_record,
                    run=run,
                    note=market_note,
                    has_blocking_missing_evidence=has_blocking_missing_evidence,
                )

        if _review_mentions_risk_triage(review_record):
            _add_promotion_evidence(
                evidence_by_type,
                candidate_type="RISK_SCENARIO",
                review_record=review_record,
                run=run,
                note="Review notes identify this as Risk workspace triage.",
            )

    candidates = [
        _to_promotion_candidate_out(evidence)
        for evidence in evidence_by_type.values()
        if evidence.review_records
    ]
    return sorted(candidates, key=_promotion_candidate_sort_key)


def _to_review_items(
    db: Session,
    records: list[ReportPreset],
) -> list[PreTradeReviewItemOut]:
    linked_trade_status_by_id = build_linked_trade_status_lookup(
        db,
        [review_linked_trade_id(record) or "" for record in records],
    )
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, records)
    return [
        to_review_out(
            record,
            linked_trade_status_by_id=linked_trade_status_by_id,
            recommendation_summary_by_id=recommendation_summary_by_id,
        )
        for record in records
    ]


def _governance_review_audit_row(
    *,
    category: PreTradeGovernanceAuditCategory,
    review: PreTradeReviewItemOut,
) -> PreTradeGovernanceAuditRowOut:
    recommendation_summary = review.recommendation_summary
    summary_parts = [
        review.thesis or review.review_notes or "Pre-trade review item.",
    ]
    if recommendation_summary is not None:
        summary_parts.append(f"Recommendation {recommendation_summary.stance} scored {recommendation_summary.score}.")
    if review.recommendation_override_reason:
        summary_parts.append(f"Override: {review.recommendation_override_reason}")
    if review.linked_trade_id:
        summary_parts.append(f"Booked as {review.linked_trade_id}.")

    return PreTradeGovernanceAuditRowOut(
        category=category,
        review_id=review.review_id,
        run_id=recommendation_summary.run_id if recommendation_summary else review.recommendation_run_id,
        run_key=recommendation_summary.run_key if recommendation_summary else None,
        linked_trade_id=review.linked_trade_id,
        name=review.name,
        book=review.draft.book,
        commodity=review.draft.commodity,
        review_status=review.review_status,
        recommendation_stance=recommendation_summary.stance if recommendation_summary else None,
        recommendation_score=recommendation_summary.score if recommendation_summary else None,
        override_reason=review.recommendation_override_reason,
        override_by=review.recommendation_override_by,
        override_at=review.recommendation_override_at,
        booked_by=review.booked_by,
        booked_at=review.booked_at,
        summary=" ".join(summary_parts),
    )


def _governance_stale_evidence_audit_row(
    *,
    stale_evidence_run: PreTradeGovernanceStaleEvidenceRunOut,
    snapshot: PreTradeRecommendationSourceSnapshot,
) -> PreTradeGovernanceAuditRowOut:
    run = stale_evidence_run.run
    return PreTradeGovernanceAuditRowOut(
        category="STALE_EVIDENCE",
        run_id=run.run_id,
        run_key=run.run_key,
        name=run.name,
        book=run.draft.book,
        commodity=run.draft.commodity,
        recommendation_stance=run.recommendation.stance,
        recommendation_score=run.recommendation.score,
        source_adapter_key=snapshot.adapter_key or snapshot.source_key,
        source_adapter_label=snapshot.adapter_label or snapshot.source_key,
        source_quality_status=snapshot.quality_status,
        source_freshness=snapshot.freshness,
        source_provider=snapshot.provenance.provider,
        source_dataset=snapshot.provenance.dataset,
        source_observed_at=snapshot.provenance.observed_at or snapshot.captured_at,
        summary=snapshot.summary or run.recommendation.explanation.source_quality_rationale,
    )


def _governance_promotion_candidate_audit_row(
    candidate: PreTradeGovernancePromotionCandidateOut,
) -> PreTradeGovernanceAuditRowOut:
    stop_summary = f" Stops: {' '.join(candidate.stop_reasons)}" if candidate.stop_reasons else ""
    return PreTradeGovernanceAuditRowOut(
        category="PROMOTION_CANDIDATE",
        review_id=candidate.latest_review_id,
        run_id=candidate.latest_run_id,
        name=candidate.label,
        promotion_candidate_type=candidate.candidate_type,
        promotion_status=candidate.status,
        promotion_score=candidate.score,
        summary=f"{candidate.evidence_summary} {candidate.promotion_rationale}{stop_summary}",
    )


def _governance_audit_rows(items: PreTradeGovernanceItemsOut) -> list[PreTradeGovernanceAuditRowOut]:
    rows: list[PreTradeGovernanceAuditRowOut] = []
    for category, reviews in (
        ("PENDING_REVIEW", items.pending_reviews),
        ("RISKY_RECOMMENDATION", items.risky_recommendation_reviews),
        ("UNRESOLVED_RISKY_RECOMMENDATION", items.unresolved_risky_recommendation_reviews),
        ("OVERRIDE", items.override_reviews),
        ("BOOKED_WITH_OVERRIDE", items.booked_with_override_reviews),
    ):
        rows.extend(
            _governance_review_audit_row(
                category=category,  # type: ignore[arg-type]
                review=review,
            )
            for review in reviews
        )

    for stale_evidence_run in items.stale_evidence_runs:
        rows.extend(
            _governance_stale_evidence_audit_row(
                stale_evidence_run=stale_evidence_run,
                snapshot=snapshot,
            )
            for snapshot in stale_evidence_run.impaired_snapshots
        )
    rows.extend(
        _governance_promotion_candidate_audit_row(candidate)
        for candidate in items.promotion_candidates
    )
    return rows


def build_pretrade_governance_summary(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime | None = None,
) -> PreTradeGovernanceSummaryOut:
    snapshot_at = generated_at or datetime.now(timezone.utc)
    review_records = db.execute(_visible_reviews_stmt()).scalars().all()
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, review_records)

    open_review_count = 0
    in_review_count = 0
    approved_review_count = 0
    rejected_review_count = 0
    booked_review_count = 0
    risky_recommendation_count = 0
    unresolved_risky_recommendation_count = 0
    override_count = 0
    booked_with_override_count = 0

    for record in review_records:
        status_value = review_status(record)
        if status_value == "OPEN":
            open_review_count += 1
        elif status_value == "IN_REVIEW":
            in_review_count += 1
        elif status_value == "APPROVED":
            approved_review_count += 1
        elif status_value == "REJECTED":
            rejected_review_count += 1

        override_reason = review_recommendation_override_reason(record)
        linked_trade_id = review_linked_trade_id(record)
        if override_reason is not None:
            override_count += 1
        if linked_trade_id is not None:
            booked_review_count += 1
            if override_reason is not None:
                booked_with_override_count += 1

        recommendation_run_id = review_recommendation_run_id(record)
        recommendation_summary = (
            recommendation_summary_by_id.get(recommendation_run_id)
            if recommendation_run_id is not None
            else None
        )
        if recommendation_summary is not None and recommendation_summary.stance in RECOMMENDATION_OVERRIDE_STANCES:
            risky_recommendation_count += 1
            if status_value != "APPROVED" or override_reason is None:
                unresolved_risky_recommendation_count += 1

    all_recommendation_run_records = accessible_recommendation_run_records(db, actor_id=actor_id)
    recommendation_run_records = _latest_governance_recommendation_run_records(all_recommendation_run_records)
    stale_evidence_run_count = 0
    stale_evidence_source_count = 0
    for record in recommendation_run_records:
        run = to_recommendation_run_out(
            record,
            actor_id=actor_id,
            previous_record=previous_recommendation_run_record(all_recommendation_run_records, record),
        )
        impaired_source_count = len(_governance_impaired_snapshots(run))
        if impaired_source_count:
            stale_evidence_run_count += 1
            stale_evidence_source_count += impaired_source_count

    promotion_candidates = _build_promotion_candidates(
        review_records,
        all_recommendation_run_records,
        actor_id=actor_id,
    )
    pending_review_count = open_review_count + in_review_count
    if pending_review_count or unresolved_risky_recommendation_count:
        risk_status = "ACTION_REQUIRED"
    elif (
        stale_evidence_run_count
        or override_count
        or booked_with_override_count
        or approved_review_count
        or promotion_candidates
    ):
        risk_status = "WATCH"
    else:
        risk_status = "CLEAR"

    return PreTradeGovernanceSummaryOut(
        generated_at=snapshot_at,
        risk_status=risk_status,  # type: ignore[arg-type]
        open_review_count=open_review_count,
        in_review_count=in_review_count,
        approved_review_count=approved_review_count,
        rejected_review_count=rejected_review_count,
        pending_review_count=pending_review_count,
        booked_review_count=booked_review_count,
        risky_recommendation_count=risky_recommendation_count,
        unresolved_risky_recommendation_count=unresolved_risky_recommendation_count,
        override_count=override_count,
        booked_with_override_count=booked_with_override_count,
        stale_evidence_run_count=stale_evidence_run_count,
        stale_evidence_source_count=stale_evidence_source_count,
        recommendation_run_count=len(recommendation_run_records),
        promotion_candidate_count=len(promotion_candidates),
        top_promotion_candidate_type=promotion_candidates[0].candidate_type if promotion_candidates else None,
    )


def build_pretrade_governance_items(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime | None = None,
) -> PreTradeGovernanceItemsOut:
    snapshot_at = generated_at or datetime.now(timezone.utc)
    review_records = db.execute(
        _visible_reviews_stmt().order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, review_records)

    pending_records: list[ReportPreset] = []
    risky_records: list[ReportPreset] = []
    unresolved_risky_records: list[ReportPreset] = []
    override_records: list[ReportPreset] = []
    booked_with_override_records: list[ReportPreset] = []

    for record in review_records:
        status_value = review_status(record)
        override_reason = review_recommendation_override_reason(record)
        linked_trade_id = review_linked_trade_id(record)
        recommendation_run_id = review_recommendation_run_id(record)
        recommendation_summary = (
            recommendation_summary_by_id.get(recommendation_run_id)
            if recommendation_run_id is not None
            else None
        )

        if status_value in {"OPEN", "IN_REVIEW"}:
            pending_records.append(record)
        if override_reason is not None:
            override_records.append(record)
            if linked_trade_id is not None:
                booked_with_override_records.append(record)
        if recommendation_summary is not None and recommendation_summary.stance in RECOMMENDATION_OVERRIDE_STANCES:
            risky_records.append(record)
            if status_value != "APPROVED" or override_reason is None:
                unresolved_risky_records.append(record)

    all_recommendation_run_records = accessible_recommendation_run_records(db, actor_id=actor_id)
    stale_evidence_runs: list[PreTradeGovernanceStaleEvidenceRunOut] = []
    for record in _latest_governance_recommendation_run_records(all_recommendation_run_records):
        run = to_recommendation_run_out(
            record,
            actor_id=actor_id,
            previous_record=previous_recommendation_run_record(all_recommendation_run_records, record),
        )
        impaired_snapshots = _governance_impaired_snapshots(run)
        if impaired_snapshots:
            stale_evidence_runs.append(
                PreTradeGovernanceStaleEvidenceRunOut(
                    run=run,
                    impaired_snapshots=impaired_snapshots,
                )
            )

    return PreTradeGovernanceItemsOut(
        generated_at=snapshot_at,
        pending_reviews=_to_review_items(db, pending_records),
        risky_recommendation_reviews=_to_review_items(db, risky_records),
        unresolved_risky_recommendation_reviews=_to_review_items(db, unresolved_risky_records),
        override_reviews=_to_review_items(db, override_records),
        booked_with_override_reviews=_to_review_items(db, booked_with_override_records),
        stale_evidence_runs=stale_evidence_runs,
        promotion_candidates=_build_promotion_candidates(
            review_records,
            all_recommendation_run_records,
            actor_id=actor_id,
        ),
    )


def build_pretrade_governance_audit_export(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime | None = None,
) -> PreTradeGovernanceAuditExportOut:
    snapshot_at = generated_at or datetime.now(timezone.utc)
    summary = build_pretrade_governance_summary(db, actor_id=actor_id, generated_at=snapshot_at)
    items = build_pretrade_governance_items(db, actor_id=actor_id, generated_at=snapshot_at)
    return PreTradeGovernanceAuditExportOut(
        generated_at=snapshot_at,
        exported_by=actor_id,
        summary=summary,
        items=items,
        audit_rows=_governance_audit_rows(items),
    )
