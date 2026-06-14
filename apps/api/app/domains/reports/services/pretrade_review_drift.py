from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_governance import (
    IMPAIRED_SOURCE_QUALITY_STATUSES,
)
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
    recommendation_run_source_review_id,
    recommendation_run_source_scenario_id,
    to_recommendation_run_out,
)
from apps.api.app.domains.reports.services.pretrade_reviews import (
    get_pretrade_review_record,
    review_activity_payloads,
    review_approval_governance_snapshot,
    review_recommendation_override_by,
    review_recommendation_override_reason,
    review_recommendation_run_id,
    review_source_scenario_id,
    review_status,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeReviewDriftOut,
    PreTradeReviewDriftReasonOut,
)


@dataclass(frozen=True)
class _ApprovalBaseline:
    approved_by: str | None
    approved_at: datetime | None
    recommendation_run_id: int | None
    recommendation_stance: str | None
    recommendation_score: int | None
    override_reason: str | None
    override_by: str | None
    override_at: datetime | None


class PreTradeReviewDriftError(ValueError):
    def __init__(self, review_id: int, drift: PreTradeReviewDriftOut) -> None:
        self.review_id = review_id
        self.drift = drift
        super().__init__(self._message())

    def _message(self) -> str:
        if not self.drift.reasons:
            return (
                f"Pre-trade review '{self.review_id}' no longer matches the approved evidence and must be "
                "re-approved before booking."
            )
        reason_summary = "; ".join(reason.summary for reason in self.drift.reasons)
        return (
            f"Pre-trade review '{self.review_id}' no longer matches the approved evidence and must be "
            f"re-approved before booking. {reason_summary}"
        )


def _parse_optional_datetime(value: object | None) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return datetime.fromisoformat(value)


def _normalize_optional_text(value: object | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_optional_int(value: object | None) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _latest_approval_baseline(record: ReportPreset) -> _ApprovalBaseline | None:
    for entry in reversed(review_activity_payloads(record)):
        if entry.get("action") != "APPROVED":
            continue

        payload = entry.get("payload")
        payload_dict = payload if isinstance(payload, dict) else {}
        return _ApprovalBaseline(
            approved_by=_normalize_optional_text(entry.get("actor_id")),
            approved_at=_parse_optional_datetime(entry.get("occurred_at")),
            recommendation_run_id=_normalize_optional_int(payload_dict.get("recommendation_run_id")),
            recommendation_stance=_normalize_optional_text(payload_dict.get("recommendation_stance")),
            recommendation_score=_normalize_optional_int(payload_dict.get("recommendation_score")),
            override_reason=_normalize_optional_text(payload_dict.get("recommendation_override_reason")),
            override_by=_normalize_optional_text(payload_dict.get("recommendation_override_by")),
            override_at=_parse_optional_datetime(payload_dict.get("recommendation_override_at")),
        )
    return None


def _related_recommendation_run_records(
    db: Session,
    *,
    review_record: ReportPreset,
) -> list[ReportPreset]:
    review_id = review_record.id
    source_scenario_id = review_source_scenario_id(review_record)
    records = db.execute(
        select(ReportPreset).where(ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY)
    ).scalars().all()
    related = [
        record
        for record in records
        if recommendation_run_source_review_id(record) == review_id
        or (
            source_scenario_id is not None
            and recommendation_run_source_scenario_id(record) == source_scenario_id
        )
    ]
    return sorted(related, key=lambda record: (record.created_at, record.id), reverse=True)


def _recommendation_run_record_by_id(db: Session, *, run_id: int | None) -> ReportPreset | None:
    if run_id is None:
        return None
    return db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
            ReportPreset.id == run_id,
        )
    ).scalars().first()


def _impaired_snapshots(run: PreTradeRecommendationRunOut | None) -> list[PreTradeRecommendationSourceSnapshot]:
    if run is None:
        return []
    return [
        snapshot
        for snapshot in run.input_snapshots
        if snapshot.source_available and snapshot.quality_status in IMPAIRED_SOURCE_QUALITY_STATUSES
    ]


def _snapshot_key(snapshot: PreTradeRecommendationSourceSnapshot) -> str:
    return snapshot.adapter_key or snapshot.source_key


def _snapshot_label(snapshot: PreTradeRecommendationSourceSnapshot) -> str:
    return snapshot.adapter_label or snapshot.source_key


def _approval_snapshot_impaired_sources(record: ReportPreset, *, approved_run_id: int | None) -> dict[str, str]:
    if approved_run_id is None:
        return {}
    approval_snapshot = review_approval_governance_snapshot(record)
    if approval_snapshot is None:
        return {}

    impaired_sources: dict[str, str] = {}
    for stale_evidence_run in approval_snapshot.items.stale_evidence_runs:
        if stale_evidence_run.run.run_id != approved_run_id:
            continue
        for snapshot in stale_evidence_run.impaired_snapshots:
            impaired_sources[_snapshot_key(snapshot)] = _snapshot_label(snapshot)
    return impaired_sources


def _run_out(record: ReportPreset | None, *, actor_id: str) -> PreTradeRecommendationRunOut | None:
    if record is None:
        return None
    return to_recommendation_run_out(record, actor_id=actor_id)


def _stance_summary(stance: str | None) -> str:
    if not stance:
        return "no stance"
    return stance.replace("_", " ").lower()


def _score_summary(score: int | None) -> str:
    return "unknown score" if score is None else f"score {score}"


def _recommendation_changed_reason(
    *,
    approved_run_id: int | None,
    approved_stance: str | None,
    approved_score: int | None,
    current_run: PreTradeRecommendationRunOut | None,
) -> PreTradeReviewDriftReasonOut:
    current_run_id = current_run.run_id if current_run else None
    current_stance = current_run.recommendation.stance if current_run else None
    current_score = current_run.recommendation.score if current_run else None
    return PreTradeReviewDriftReasonOut(
        code="RECOMMENDATION_CHANGED",
        summary="Attached recommendation changed since approval.",
        detail=(
            f"Approved on recommendation #{approved_run_id or 'unknown'} with {_stance_summary(approved_stance)} "
            f"and {_score_summary(approved_score)}. Current attachment is recommendation "
            f"#{current_run_id or 'none'} with {_stance_summary(current_stance)} and {_score_summary(current_score)}."
        ),
    )


def _newer_recommendation_reason(
    *,
    approved_run_id: int | None,
    latest_run: PreTradeRecommendationRunOut,
) -> PreTradeReviewDriftReasonOut:
    return PreTradeReviewDriftReasonOut(
        code="NEWER_RECOMMENDATION_AVAILABLE",
        summary="A newer recommendation run exists for this review context.",
        detail=(
            f"Recommendation #{latest_run.run_id} was generated at {latest_run.created_at.isoformat()} for the same "
            f"review or source scenario after approved recommendation #{approved_run_id or 'unknown'}."
        ),
    )


def _source_impairment_reason(
    *,
    appeared_labels: list[str],
) -> PreTradeReviewDriftReasonOut:
    joined_labels = ", ".join(appeared_labels)
    return PreTradeReviewDriftReasonOut(
        code="SOURCE_IMPAIRMENT_APPEARED",
        summary="Evidence quality degraded after approval.",
        detail=(
            f"The live recommendation evidence now includes impaired sources that were not impaired at approval time: "
            f"{joined_labels}."
        ),
    )


def _override_changed_reason(
    *,
    approved_override_reason: str | None,
    approved_override_by: str | None,
    current_override_reason: str | None,
    current_override_by: str | None,
) -> PreTradeReviewDriftReasonOut:
    return PreTradeReviewDriftReasonOut(
        code="OVERRIDE_CHANGED",
        summary="Override context changed after approval.",
        detail=(
            f"Approved override was {approved_override_reason or 'not set'}"
            f"{f' by {approved_override_by}' if approved_override_by else ''}. "
            f"Current override is {current_override_reason or 'not set'}"
            f"{f' by {current_override_by}' if current_override_by else ''}."
        ),
    )


def build_pretrade_review_drift(
    db: Session,
    *,
    review_record: ReportPreset,
    actor_id: str,
    checked_at: datetime | None = None,
) -> PreTradeReviewDriftOut:
    checked_at_value = checked_at or datetime.now(timezone.utc)
    current_status = review_status(review_record)
    approval_snapshot = review_approval_governance_snapshot(review_record)
    approval_baseline = _latest_approval_baseline(review_record)

    current_run_id = review_recommendation_run_id(review_record)
    related_records = _related_recommendation_run_records(db, review_record=review_record)
    records_by_id = {record.id: record for record in related_records}

    current_record = records_by_id.get(current_run_id) or _recommendation_run_record_by_id(db, run_id=current_run_id)
    if current_record is not None:
        records_by_id[current_record.id] = current_record

    approved_record = (
        records_by_id.get(approval_baseline.recommendation_run_id)
        if approval_baseline is not None
        else None
    )
    if approved_record is None and approval_baseline is not None:
        approved_record = _recommendation_run_record_by_id(db, run_id=approval_baseline.recommendation_run_id)
        if approved_record is not None:
            records_by_id[approved_record.id] = approved_record

    latest_record = max(records_by_id.values(), key=lambda record: (record.created_at, record.id), default=None)

    current_run = _run_out(current_record, actor_id=actor_id)
    latest_run = _run_out(latest_record, actor_id=actor_id)

    reasons: list[PreTradeReviewDriftReasonOut] = []
    if current_status == "APPROVED":
        if approval_snapshot is None:
            reasons.append(
                PreTradeReviewDriftReasonOut(
                    code="MISSING_APPROVAL_SNAPSHOT",
                    summary="Approval-time governance snapshot is missing.",
                    detail="The review no longer has the immutable governance artifact recorded at approval time.",
                )
            )

        if approval_baseline is None or (
            approval_baseline.recommendation_run_id is None
            or approval_baseline.recommendation_stance is None
        ):
            reasons.append(
                PreTradeReviewDriftReasonOut(
                    code="MISSING_APPROVAL_BASELINE",
                    summary="Approval-time recommendation baseline is incomplete.",
                    detail="The approval activity is missing the recommendation run, stance, or score needed to verify drift.",
                )
            )
        else:
            if (
                current_run is None
                or current_run.run_id != approval_baseline.recommendation_run_id
                or current_run.recommendation.stance != approval_baseline.recommendation_stance
                or current_run.recommendation.score != approval_baseline.recommendation_score
            ):
                reasons.append(
                    _recommendation_changed_reason(
                        approved_run_id=approval_baseline.recommendation_run_id,
                        approved_stance=approval_baseline.recommendation_stance,
                        approved_score=approval_baseline.recommendation_score,
                        current_run=current_run,
                    )
                )

            if (
                latest_record is not None
                and approved_record is not None
                and latest_record.id != approved_record.id
                and (latest_record.created_at, latest_record.id) > (approved_record.created_at, approved_record.id)
            ):
                reasons.append(
                    _newer_recommendation_reason(
                        approved_run_id=approval_baseline.recommendation_run_id,
                        latest_run=latest_run or current_run,  # type: ignore[arg-type]
                    )
                )

            live_reference_run = latest_run or current_run
            approved_impaired_sources = _approval_snapshot_impaired_sources(
                review_record,
                approved_run_id=approval_baseline.recommendation_run_id,
            )
            live_impaired_sources = {
                _snapshot_key(snapshot): _snapshot_label(snapshot)
                for snapshot in _impaired_snapshots(live_reference_run)
            }
            appeared_impaired_labels = sorted(
                label
                for key, label in live_impaired_sources.items()
                if key not in approved_impaired_sources
            )
            if appeared_impaired_labels:
                reasons.append(
                    _source_impairment_reason(
                        appeared_labels=appeared_impaired_labels,
                    )
                )

            current_override_reason = review_recommendation_override_reason(review_record)
            current_override_by = review_recommendation_override_by(review_record)
            if (
                current_override_reason != approval_baseline.override_reason
                or current_override_by != approval_baseline.override_by
            ):
                reasons.append(
                    _override_changed_reason(
                        approved_override_reason=approval_baseline.override_reason,
                        approved_override_by=approval_baseline.override_by,
                        current_override_reason=current_override_reason,
                        current_override_by=current_override_by,
                    )
                )

    alignment_status = (
        "NOT_APPROVED"
        if current_status != "APPROVED"
        else "REAPPROVAL_REQUIRED"
        if reasons
        else "ALIGNED"
    )
    live_reference_run = latest_run or current_run

    return PreTradeReviewDriftOut(
        review_id=review_record.id,
        checked_at=checked_at_value,
        review_status=current_status,  # type: ignore[arg-type]
        alignment_status=alignment_status,  # type: ignore[arg-type]
        requires_reapproval=current_status == "APPROVED" and len(reasons) > 0,
        approval_snapshot_generated_at=approval_snapshot.generated_at if approval_snapshot else None,
        approval_snapshot_exported_by=approval_snapshot.exported_by if approval_snapshot else None,
        approved_by=approval_baseline.approved_by if approval_baseline else None,
        approved_at=approval_baseline.approved_at if approval_baseline else None,
        approved_recommendation_run_id=approval_baseline.recommendation_run_id if approval_baseline else None,
        approved_recommendation_stance=approval_baseline.recommendation_stance if approval_baseline else None,  # type: ignore[arg-type]
        approved_recommendation_score=approval_baseline.recommendation_score if approval_baseline else None,
        current_recommendation_run_id=current_run.run_id if current_run else current_run_id,
        current_recommendation_stance=current_run.recommendation.stance if current_run else None,
        current_recommendation_score=current_run.recommendation.score if current_run else None,
        latest_recommendation_run_id=latest_run.run_id if latest_run else (current_run.run_id if current_run else None),
        latest_recommendation_stance=latest_run.recommendation.stance if latest_run else (current_run.recommendation.stance if current_run else None),
        latest_recommendation_score=latest_run.recommendation.score if latest_run else (current_run.recommendation.score if current_run else None),
        current_impaired_sources=sorted({_snapshot_label(snapshot) for snapshot in _impaired_snapshots(live_reference_run)}),
        reasons=reasons,
    )


def ensure_pretrade_review_booking_alignment(
    db: Session,
    *,
    review_id: int,
    actor_id: str,
    checked_at: datetime | None = None,
) -> PreTradeReviewDriftOut:
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise LookupError(f"Pre-trade review '{review_id}' was not found.")

    drift = build_pretrade_review_drift(
        db,
        review_record=record,
        actor_id=actor_id,
        checked_at=checked_at,
    )
    if drift.requires_reapproval:
        raise PreTradeReviewDriftError(review_id, drift)
    return drift
