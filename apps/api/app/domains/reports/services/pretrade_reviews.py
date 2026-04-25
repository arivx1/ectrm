from __future__ import annotations

from datetime import datetime
from typing import Iterable
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.pretrade import (
    PreTradeGovernanceAuditExportOut,
    PreTradeReviewActivityAction,
    PreTradeReviewActivityOut,
    PreTradeReviewItemOut,
    PreTradeReviewRecommendationSummary,
    PreTradeScenarioDraft,
)

PRETRADE_REVIEW_PRESET_KEY = "pretrade_review"
PRETRADE_SHARED_OWNER_KEY = "__shared__"
REVIEW_APPROVAL_GOVERNANCE_SNAPSHOT_KEY = "approval_governance_snapshot"
REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY = "booking_governance_snapshot"


def pretrade_review_record_stmt():
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
        ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
    )


def review_record_payload(record: ReportPreset) -> dict[str, object]:
    payload = record.filters_json or {}
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def review_draft(record: ReportPreset) -> PreTradeScenarioDraft:
    return PreTradeScenarioDraft.model_validate(review_record_payload(record).get("draft") or {})


def review_thesis(record: ReportPreset) -> str | None:
    thesis = review_record_payload(record).get("thesis")
    return thesis if isinstance(thesis, str) else None


def review_status(record: ReportPreset) -> str:
    status = review_record_payload(record).get("review_status")
    return status if isinstance(status, str) else "OPEN"


def review_owner(record: ReportPreset) -> str | None:
    owner = review_record_payload(record).get("owner")
    return owner if isinstance(owner, str) else None


def review_notes(record: ReportPreset) -> str | None:
    notes = review_record_payload(record).get("review_notes")
    return notes if isinstance(notes, str) else None


def review_due_at(record: ReportPreset) -> datetime | None:
    raw_due_at = review_record_payload(record).get("due_at")
    if not isinstance(raw_due_at, str) or not raw_due_at.strip():
        return None
    return datetime.fromisoformat(raw_due_at)


def review_source_scenario_id(record: ReportPreset) -> int | None:
    source_scenario_id = review_record_payload(record).get("source_scenario_id")
    return source_scenario_id if isinstance(source_scenario_id, int) else None


def review_recommendation_run_id(record: ReportPreset) -> int | None:
    recommendation_run_id = review_record_payload(record).get("recommendation_run_id")
    return recommendation_run_id if isinstance(recommendation_run_id, int) else None


def review_recommendation_override_reason(record: ReportPreset) -> str | None:
    reason = review_record_payload(record).get("recommendation_override_reason")
    return reason if isinstance(reason, str) and reason.strip() else None


def review_recommendation_override_by(record: ReportPreset) -> str | None:
    actor_id = review_record_payload(record).get("recommendation_override_by")
    return actor_id if isinstance(actor_id, str) and actor_id.strip() else None


def review_recommendation_override_at(record: ReportPreset) -> datetime | None:
    raw_override_at = review_record_payload(record).get("recommendation_override_at")
    if not isinstance(raw_override_at, str) or not raw_override_at.strip():
        return None
    return datetime.fromisoformat(raw_override_at)


def review_linked_trade_id(record: ReportPreset) -> str | None:
    linked_trade_id = review_record_payload(record).get("linked_trade_id")
    return linked_trade_id if isinstance(linked_trade_id, str) and linked_trade_id.strip() else None


def review_booked_at(record: ReportPreset) -> datetime | None:
    raw_booked_at = review_record_payload(record).get("booked_at")
    if not isinstance(raw_booked_at, str) or not raw_booked_at.strip():
        return None
    return datetime.fromisoformat(raw_booked_at)


def review_booked_by(record: ReportPreset) -> str | None:
    booked_by = review_record_payload(record).get("booked_by")
    return booked_by if isinstance(booked_by, str) and booked_by.strip() else None


def _review_governance_snapshot(
    record: ReportPreset,
    *,
    snapshot_key: str,
) -> PreTradeGovernanceAuditExportOut | None:
    raw_snapshot = review_record_payload(record).get(snapshot_key)
    if not isinstance(raw_snapshot, dict):
        return None
    try:
        return PreTradeGovernanceAuditExportOut.model_validate(raw_snapshot)
    except ValidationError:
        return None


def review_approval_governance_snapshot(record: ReportPreset) -> PreTradeGovernanceAuditExportOut | None:
    return _review_governance_snapshot(record, snapshot_key=REVIEW_APPROVAL_GOVERNANCE_SNAPSHOT_KEY)


def review_booking_governance_snapshot(record: ReportPreset) -> PreTradeGovernanceAuditExportOut | None:
    return _review_governance_snapshot(record, snapshot_key=REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY)


def build_review_activity_entry(
    *,
    action: PreTradeReviewActivityAction,
    actor_id: str,
    occurred_at: datetime,
    comment: str | None = None,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "activity_id": uuid4().hex,
        "action": action,
        "actor_id": actor_id,
        "occurred_at": occurred_at.isoformat(),
        "comment": comment,
        "payload": payload or {},
    }


def review_activity_payloads(record: ReportPreset) -> list[dict[str, object]]:
    raw_activity = review_record_payload(record).get("activity")
    if not isinstance(raw_activity, list):
        return []

    entries: list[dict[str, object]] = []
    for item in raw_activity:
        if isinstance(item, dict):
            entries.append(dict(item))
    return entries


def review_activity(record: ReportPreset) -> list[PreTradeReviewActivityOut]:
    entries: list[PreTradeReviewActivityOut] = []
    for item in review_activity_payloads(record):
        try:
            entries.append(PreTradeReviewActivityOut.model_validate(item))
        except ValidationError:
            continue
    return entries


def append_review_activity(
    record: ReportPreset,
    *,
    action: PreTradeReviewActivityAction,
    actor_id: str,
    occurred_at: datetime,
    comment: str | None = None,
    payload: dict[str, object] | None = None,
) -> None:
    next_payload = review_record_payload(record)
    activity = review_activity_payloads(record)
    activity.append(
        build_review_activity_entry(
            action=action,
            actor_id=actor_id,
            occurred_at=occurred_at,
            comment=comment,
            payload=payload,
        )
    )
    next_payload["activity"] = activity
    record.filters_json = next_payload


def persist_review_governance_snapshot(
    record: ReportPreset,
    *,
    snapshot: PreTradeGovernanceAuditExportOut,
    snapshot_key: str,
    activity_action: PreTradeReviewActivityAction | None = None,
) -> None:
    next_payload = review_record_payload(record)
    next_payload[snapshot_key] = snapshot.model_dump(mode="json")

    if activity_action is not None:
        activity = review_activity_payloads(record)
        for entry in reversed(activity):
            if entry.get("action") != activity_action:
                continue
            payload = entry.get("payload")
            if not isinstance(payload, dict):
                payload = {}
                entry["payload"] = payload
            payload["governance_snapshot_generated_at"] = snapshot.generated_at.isoformat()
            payload["governance_snapshot_format_version"] = snapshot.format_version
            break
        next_payload["activity"] = activity

    record.filters_json = next_payload


def build_linked_trade_status_lookup(db: Session, linked_trade_ids: Iterable[str]) -> dict[str, str]:
    normalized_ids = sorted({trade_id.strip() for trade_id in linked_trade_ids if trade_id and trade_id.strip()})
    if not normalized_ids:
        return {}

    rows = db.execute(select(Trade.trade_id, Trade.status).where(Trade.trade_id.in_(normalized_ids))).all()
    return {trade_id: status for trade_id, status in rows}


def to_review_out(
    record: ReportPreset,
    *,
    linked_trade_status_by_id: dict[str, str] | None = None,
    recommendation_summary_by_id: dict[int, PreTradeReviewRecommendationSummary] | None = None,
) -> PreTradeReviewItemOut:
    linked_trade_id = review_linked_trade_id(record)
    recommendation_run_id = review_recommendation_run_id(record)
    return PreTradeReviewItemOut(
        review_id=record.id,
        name=record.name,
        thesis=review_thesis(record),
        draft=review_draft(record),
        source_scenario_id=review_source_scenario_id(record),
        recommendation_run_id=recommendation_run_id,
        recommendation_summary=(
            recommendation_summary_by_id.get(recommendation_run_id)
            if recommendation_run_id is not None and recommendation_summary_by_id
            else None
        ),
        recommendation_override_reason=review_recommendation_override_reason(record),
        recommendation_override_by=review_recommendation_override_by(record),
        recommendation_override_at=review_recommendation_override_at(record),
        review_status=review_status(record),  # type: ignore[arg-type]
        owner=review_owner(record),
        due_at=review_due_at(record),
        review_notes=review_notes(record),
        linked_trade_id=linked_trade_id,
        linked_trade_status=linked_trade_status_by_id.get(linked_trade_id) if linked_trade_id and linked_trade_status_by_id else None,
        booked_at=review_booked_at(record),
        booked_by=review_booked_by(record),
        approval_governance_snapshot=review_approval_governance_snapshot(record),
        booking_governance_snapshot=review_booking_governance_snapshot(record),
        activity=review_activity(record),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=True,
    )


def get_pretrade_review_record(db: Session, review_id: int) -> ReportPreset | None:
    return db.execute(pretrade_review_record_stmt().where(ReportPreset.id == review_id)).scalars().first()


def parse_pretrade_review_id(value: object | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("pretrade_review_id must be an integer")
    if isinstance(value, int):
        if value < 1:
            raise ValueError("pretrade_review_id must be greater than zero")
        return value
    if isinstance(value, float) and value.is_integer():
        normalized_value = int(value)
        if normalized_value < 1:
            raise ValueError("pretrade_review_id must be greater than zero")
        return normalized_value
    raise ValueError("pretrade_review_id must be an integer")


def link_approved_pretrade_review_to_trade(
    db: Session,
    *,
    review_id: int,
    trade_id: str,
    actor_id: str,
    booked_at: datetime,
) -> ReportPreset:
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise LookupError(f"Pre-trade review '{review_id}' was not found.")

    current_status = review_status(record)
    if current_status != "APPROVED":
        raise ValueError(f"Pre-trade review '{review_id}' must be approved before a trade can be booked.")

    current_linked_trade_id = review_linked_trade_id(record)
    if current_linked_trade_id and current_linked_trade_id != trade_id:
        raise ValueError(
            f"Pre-trade review '{review_id}' is already linked to trade '{current_linked_trade_id}'."
        )
    if current_linked_trade_id == trade_id:
        return record

    next_payload = review_record_payload(record)
    next_payload["linked_trade_id"] = trade_id
    next_payload["booked_at"] = booked_at.isoformat()
    next_payload["booked_by"] = actor_id
    record.filters_json = next_payload
    booked_payload: dict[str, object] = {"linked_trade_id": trade_id}
    recommendation_run_id = review_recommendation_run_id(record)
    if recommendation_run_id is not None:
        booked_payload["recommendation_run_id"] = recommendation_run_id
    recommendation_override_reason = review_recommendation_override_reason(record)
    if recommendation_override_reason is not None:
        booked_payload["recommendation_override_reason"] = recommendation_override_reason
        recommendation_override_by = review_recommendation_override_by(record)
        recommendation_override_at = review_recommendation_override_at(record)
        if recommendation_override_by is not None:
            booked_payload["recommendation_override_by"] = recommendation_override_by
        if recommendation_override_at is not None:
            booked_payload["recommendation_override_at"] = recommendation_override_at.isoformat()
    append_review_activity(
        record,
        action="BOOKED",
        actor_id=actor_id,
        occurred_at=booked_at,
        payload=booked_payload,
    )
    record.updated_at = booked_at
    record.updated_by = actor_id
    record.version += 1
    db.flush()
    return record
