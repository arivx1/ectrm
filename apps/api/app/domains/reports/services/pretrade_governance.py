from __future__ import annotations

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
    PreTradeGovernanceStaleEvidenceRunOut,
    PreTradeGovernanceSummaryOut,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeReviewItemOut,
    PreTradeReviewRecommendationSummary,
)

RECOMMENDATION_OVERRIDE_STANCES = {"ESCALATE", "WAIT_FOR_DATA"}
IMPAIRED_SOURCE_QUALITY_STATUSES = {"STALE", "DEGRADED", "MISSING"}


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

    pending_review_count = open_review_count + in_review_count
    if pending_review_count or unresolved_risky_recommendation_count:
        risk_status = "ACTION_REQUIRED"
    elif stale_evidence_run_count or override_count or booked_with_override_count or approved_review_count:
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
