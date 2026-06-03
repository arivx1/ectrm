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
    PreTradeNettingSetOut,
    PreTradeNettingSetPromoteCreate,
    PreTradeRecommendationNettingCandidateOut,
    PreTradeRecommendationRunOut,
    PreTradeScenarioDraft,
)

PRETRADE_NETTING_SET_PRESET_KEY = "pretrade_netting_set"
SUPPORTED_NETTING_MATCH_QUALITIES = {"EXACT", "PARTIAL"}


class PreTradeNettingSetPromotionError(ValueError):
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


def visible_pretrade_netting_set_records(db: Session) -> list[ReportPreset]:
    return db.execute(
        select(ReportPreset)
        .where(
            ReportPreset.preset_key == PRETRADE_NETTING_SET_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
        )
        .order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()


def _candidate_for_netting_set(
    db: Session,
    *,
    actor_id: str,
    generated_at: datetime,
) -> PreTradeGovernancePromotionCandidateOut:
    items = build_pretrade_governance_items(db, actor_id=actor_id, generated_at=generated_at)
    candidate = next(
        (item for item in items.promotion_candidates if item.candidate_type == "NETTING_SET"),
        None,
    )
    if candidate is None:
        raise PreTradeNettingSetPromotionError("No promotable netting-set governance signal is available.")
    if candidate.latest_run_id is None:
        raise PreTradeNettingSetPromotionError("Netting-set promotion requires a linked recommendation run.")
    return candidate


def _supported_netting_candidates(
    run: PreTradeRecommendationRunOut,
) -> list[PreTradeRecommendationNettingCandidateOut]:
    return [
        candidate
        for candidate in run.recommendation.netting_candidates
        if candidate.match_quality in SUPPORTED_NETTING_MATCH_QUALITIES
    ]


def _existing_netting_set_record(
    db: Session,
    *,
    source_latest_run_id: int | None,
    source_latest_review_id: int | None,
) -> ReportPreset | None:
    for record in visible_pretrade_netting_set_records(db):
        payload = _record_payload(record)
        if payload.get("status") == "RETIRED":
            continue
        if (
            _payload_int(payload, "source_latest_run_id") == source_latest_run_id
            and _payload_int(payload, "source_latest_review_id") == source_latest_review_id
        ):
            return record
    return None


def _netting_set_name(
    *,
    run: PreTradeRecommendationRunOut,
    netting_candidates: list[PreTradeRecommendationNettingCandidateOut],
) -> str:
    best_candidate = netting_candidates[0]
    book = run.draft.book or "Desk"
    commodity = run.draft.commodity or "commodity"
    match_quality = best_candidate.match_quality.replace("_", " ").title()
    return f"{book} {commodity} {match_quality} netting review draft"[:120]


def _netting_set_payload_json(
    *,
    candidate: PreTradeGovernancePromotionCandidateOut,
    run: PreTradeRecommendationRunOut,
    netting_candidates: list[PreTradeRecommendationNettingCandidateOut],
    payload: PreTradeNettingSetPromoteCreate,
) -> dict[str, object]:
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
        "draft": run.draft.model_dump(mode="json", exclude_none=True),
        "netting_candidates": [
            netting_candidate.model_dump(mode="json", exclude_none=True)
            for netting_candidate in netting_candidates
        ],
    }


def promote_governance_netting_set_draft(
    db: Session,
    *,
    actor_id: str,
    payload: PreTradeNettingSetPromoteCreate,
    generated_at: datetime | None = None,
) -> ReportPreset:
    now = generated_at or datetime.now(timezone.utc)
    candidate = _candidate_for_netting_set(db, actor_id=actor_id, generated_at=now)
    existing = _existing_netting_set_record(
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
        raise PreTradeNettingSetPromotionError("Linked recommendation run is no longer visible.")

    run = to_recommendation_run_out(run_record, actor_id=actor_id)
    netting_candidates = _supported_netting_candidates(run)
    if not netting_candidates:
        raise PreTradeNettingSetPromotionError("Linked recommendation run no longer carries a supported netting candidate.")

    record = ReportPreset(
        preset_key=PRETRADE_NETTING_SET_PRESET_KEY,
        scope="SHARED",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY,
        name=_netting_set_name(run=run, netting_candidates=netting_candidates),
        name_key=uuid4().hex,
        filters_json=_netting_set_payload_json(
            candidate=candidate,
            run=run,
            netting_candidates=netting_candidates,
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


def to_pretrade_netting_set_out(record: ReportPreset, *, actor_id: str) -> PreTradeNettingSetOut:
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

    netting_candidates: list[PreTradeRecommendationNettingCandidateOut] = []
    raw_candidates = payload.get("netting_candidates")
    if isinstance(raw_candidates, list):
        for item in raw_candidates:
            if not isinstance(item, dict):
                continue
            try:
                netting_candidates.append(PreTradeRecommendationNettingCandidateOut.model_validate(item))
            except ValidationError:
                continue

    return PreTradeNettingSetOut(
        netting_set_id=record.id,
        netting_set_key=record.name_key,
        name=record.name,
        status=_payload_text(payload, "status") or "REVIEW_DRAFT",  # type: ignore[arg-type]
        owner=_payload_text(payload, "owner"),
        review_note=_payload_text(payload, "review_note"),
        source_promotion_candidate_type=(payload.get("source_promotion_candidate_type") or "NETTING_SET"),  # type: ignore[arg-type]
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
        draft=draft,
        netting_candidates=netting_candidates,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id or record.updated_by == actor_id,
    )
