from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_governance import PROMOTION_CANDIDATE_LABELS
from apps.api.app.domains.reports.services.pretrade_hedge_recommendations import (
    PRETRADE_HEDGE_RECOMMENDATION_PRESET_KEY,
)
from apps.api.app.domains.reports.services.pretrade_market_opportunities import (
    PRETRADE_MARKET_OPPORTUNITY_PRESET_KEY,
)
from apps.api.app.domains.reports.services.pretrade_netting_sets import PRETRADE_NETTING_SET_PRESET_KEY
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_SHARED_OWNER_KEY,
    build_linked_trade_status_lookup,
    get_pretrade_review_record,
    review_booked_at,
    review_linked_trade_id,
    review_record_payload,
    review_status,
)
from apps.api.app.domains.reports.services.pretrade_risk_scenarios import PRETRADE_RISK_SCENARIO_PRESET_KEY
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradePromotionCandidateType,
    PreTradePromotionOutcomeByDraftTypeOut,
    PreTradePromotionOutcomeDraftOut,
    PreTradePromotionOutcomeMetricOut,
    PreTradePromotionOutcomeSummaryOut,
    PreTradePromotionOutcomeType,
    PreTradeReviewStatus,
)

_DRAFT_TYPE_BY_PRESET_KEY: dict[str, PreTradePromotionCandidateType] = {
    PRETRADE_NETTING_SET_PRESET_KEY: "NETTING_SET",
    PRETRADE_HEDGE_RECOMMENDATION_PRESET_KEY: "HEDGE_RECOMMENDATION",
    PRETRADE_RISK_SCENARIO_PRESET_KEY: "RISK_SCENARIO",
    PRETRADE_MARKET_OPPORTUNITY_PRESET_KEY: "MARKET_OPPORTUNITY",
}

_OUTCOME_ORDER: tuple[PreTradePromotionOutcomeType, ...] = (
    "CREATED",
    "REUSED",
    "RETIRED",
    "REJECTED",
    "MERGED_INTO_BOOKED_TRADE",
    "BLOCKED_BY_MISSING_EVIDENCE",
)


def _record_payload(record: ReportPreset) -> dict[str, object]:
    payload = record.filters_json or {}
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _payload_int(payload: dict[str, object], key: str) -> int | None:
    value = payload.get(key)
    return value if isinstance(value, int) else None


def _payload_text(payload: dict[str, object], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) and value.strip() else None


def _payload_datetime(payload: dict[str, object], key: str) -> datetime | None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _visible_promoted_draft_records(db: Session) -> list[ReportPreset]:
    return db.execute(
        select(ReportPreset)
        .where(
            ReportPreset.preset_key.in_(tuple(_DRAFT_TYPE_BY_PRESET_KEY.keys())),
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
        .order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc(), ReportPreset.id.desc())
    ).scalars().all()


def _blocking_missing_evidence(payload: dict[str, object]) -> bool:
    raw_missing = payload.get("missing_evidence")
    if isinstance(raw_missing, list):
        for item in raw_missing:
            if not isinstance(item, dict):
                continue
            severity = item.get("severity")
            if isinstance(severity, str) and severity.upper() == "BLOCKING":
                return True

    raw_stop_reasons = payload.get("source_stop_reasons")
    if isinstance(raw_stop_reasons, list):
        for item in raw_stop_reasons:
            if isinstance(item, str) and "blocking missing evidence" in item.casefold():
                return True
    return False


def _review_context(
    db: Session,
    *,
    source_review_id: int | None,
    payload: dict[str, object],
) -> tuple[PreTradeReviewStatus | None, str | None, datetime | None]:
    review_record = get_pretrade_review_record(db, source_review_id) if source_review_id is not None else None
    if review_record is None:
        review_status_value = payload.get("source_review_status")
        fallback_status = review_status_value if isinstance(review_status_value, str) else None
        return fallback_status, _payload_text(payload, "source_linked_trade_id"), _payload_datetime(payload, "source_booked_at")

    return (
        review_status(review_record),  # type: ignore[return-value]
        review_linked_trade_id(review_record),
        review_booked_at(review_record),
    )


def _trade_status_lookup(
    db: Session,
    *,
    linked_trade_ids: Iterable[str | None],
) -> dict[str, str]:
    return build_linked_trade_status_lookup(db, [trade_id or "" for trade_id in linked_trade_ids])


def _outcomes_for_record(
    *,
    payload: dict[str, object],
    status: str,
    review_status_value: str | None,
    linked_trade_id: str | None,
    has_blocking_missing_evidence: bool,
) -> tuple[list[PreTradePromotionOutcomeType], list[str]]:
    outcomes: list[PreTradePromotionOutcomeType] = ["CREATED"]
    reasons: list[str] = ["Draft was created from a governance promotion signal."]

    source_review_count = _payload_int(payload, "source_review_count") or 0
    source_run_count = _payload_int(payload, "source_run_count") or 0
    if source_review_count > 1 or source_run_count > 1:
        outcomes.append("REUSED")
        reasons.append("Source promotion evidence has repeated review or recommendation-run reuse.")

    if status == "RETIRED":
        outcomes.append("RETIRED")
        reasons.append("Draft status is RETIRED.")

    if review_status_value == "REJECTED":
        outcomes.append("REJECTED")
        reasons.append("Linked source review is rejected.")

    if linked_trade_id:
        outcomes.append("MERGED_INTO_BOOKED_TRADE")
        reasons.append(f"Linked source review was booked into trade {linked_trade_id}.")

    if has_blocking_missing_evidence:
        outcomes.append("BLOCKED_BY_MISSING_EVIDENCE")
        reasons.append("Draft retains blocking missing-evidence signals.")

    return outcomes, reasons


def build_pretrade_promotion_outcome_summary(
    db: Session,
    *,
    generated_at: datetime | None = None,
) -> PreTradePromotionOutcomeSummaryOut:
    now = generated_at or datetime.now(timezone.utc)
    records = _visible_promoted_draft_records(db)
    draft_contexts: list[tuple[ReportPreset, dict[str, object], str, str | None, datetime | None]] = []
    for record in records:
        payload = _record_payload(record)
        source_review_id = _payload_int(payload, "source_latest_review_id")
        review_status_value, linked_trade_id, booked_at = _review_context(
            db,
            source_review_id=source_review_id,
            payload=payload,
        )
        draft_contexts.append((record, payload, review_status_value or "", linked_trade_id, booked_at))

    trade_status_by_id = _trade_status_lookup(
        db,
        linked_trade_ids=[linked_trade_id for _, _, _, linked_trade_id, _ in draft_contexts],
    )

    drafts: list[PreTradePromotionOutcomeDraftOut] = []
    metric_counts: Counter[str] = Counter()
    type_counts: dict[PreTradePromotionCandidateType, Counter[str]] = {
        draft_type: Counter()
        for draft_type in _DRAFT_TYPE_BY_PRESET_KEY.values()
    }

    for record, payload, review_status_value, linked_trade_id, booked_at in draft_contexts:
        draft_type = _DRAFT_TYPE_BY_PRESET_KEY[record.preset_key]
        status = _payload_text(payload, "status") or "REVIEW_DRAFT"
        has_blocking_missing_evidence = _blocking_missing_evidence(payload)
        outcomes, reasons = _outcomes_for_record(
            payload=payload,
            status=status,
            review_status_value=review_status_value,
            linked_trade_id=linked_trade_id,
            has_blocking_missing_evidence=has_blocking_missing_evidence,
        )

        for outcome in outcomes:
            metric_counts[outcome] += 1
            type_counts[draft_type][outcome] += 1
        type_counts[draft_type]["TOTAL"] += 1

        drafts.append(
            PreTradePromotionOutcomeDraftOut(
                draft_type=draft_type,
                draft_id=record.id,
                draft_key=record.name_key,
                name=record.name,
                status=status,
                source_promotion_score=_payload_int(payload, "source_promotion_score") or 0,
                source_review_count=_payload_int(payload, "source_review_count") or 0,
                source_approved_review_count=_payload_int(payload, "source_approved_review_count") or 0,
                source_booked_review_count=_payload_int(payload, "source_booked_review_count") or 0,
                source_run_count=_payload_int(payload, "source_run_count") or 0,
                source_latest_review_id=_payload_int(payload, "source_latest_review_id"),
                source_latest_run_id=_payload_int(payload, "source_latest_run_id"),
                source_review_status=review_status_value or None,  # type: ignore[arg-type]
                source_linked_trade_id=linked_trade_id,
                source_linked_trade_status=(
                    trade_status_by_id.get(linked_trade_id)
                    if linked_trade_id is not None
                    else None
                ),
                source_booked_at=booked_at,
                has_blocking_missing_evidence=has_blocking_missing_evidence,
                outcomes=outcomes,
                outcome_reasons=reasons,
                created_at=record.created_at,
                created_by=record.created_by,
                updated_at=record.updated_at,
                updated_by=record.updated_by,
            )
        )

    return PreTradePromotionOutcomeSummaryOut(
        generated_at=now,
        total_draft_count=len(drafts),
        metrics=[
            PreTradePromotionOutcomeMetricOut(outcome=outcome, count=metric_counts[outcome])
            for outcome in _OUTCOME_ORDER
        ],
        by_draft_type=[
            PreTradePromotionOutcomeByDraftTypeOut(
                draft_type=draft_type,
                label=PROMOTION_CANDIDATE_LABELS[draft_type],
                total_count=type_counts[draft_type]["TOTAL"],
                created_count=type_counts[draft_type]["CREATED"],
                reused_count=type_counts[draft_type]["REUSED"],
                retired_count=type_counts[draft_type]["RETIRED"],
                rejected_count=type_counts[draft_type]["REJECTED"],
                merged_into_booked_trade_count=type_counts[draft_type]["MERGED_INTO_BOOKED_TRADE"],
                blocked_by_missing_evidence_count=type_counts[draft_type]["BLOCKED_BY_MISSING_EVIDENCE"],
            )
            for draft_type in _DRAFT_TYPE_BY_PRESET_KEY.values()
        ],
        drafts=drafts,
    )
