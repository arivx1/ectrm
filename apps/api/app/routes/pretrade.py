from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_REVIEW_PRESET_KEY,
    PRETRADE_SHARED_OWNER_KEY,
    REVIEW_APPROVAL_GOVERNANCE_SNAPSHOT_KEY,
    append_review_activity,
    build_linked_trade_status_lookup,
    get_pretrade_review_record,
    persist_review_governance_snapshot,
    review_draft,
    review_linked_trade_id,
    review_owner,
    review_recommendation_override_reason,
    review_recommendation_run_id,
    review_record_payload,
    review_source_scenario_id,
    review_status,
    review_thesis,
    to_review_out,
)
from apps.api.app.domains.reports.services.pretrade_governance import (
    build_pretrade_governance_audit_export,
    build_pretrade_governance_items,
    build_pretrade_governance_summary,
)
from apps.api.app.domains.reports.services.pretrade_hedge_recommendations import (
    PreTradeHedgeRecommendationPromotionError,
    promote_governance_hedge_recommendation_draft,
    to_pretrade_hedge_recommendation_out,
    visible_pretrade_hedge_recommendation_records,
)
from apps.api.app.domains.reports.services.pretrade_netting_sets import (
    PreTradeNettingSetPromotionError,
    promote_governance_netting_set_draft,
    to_pretrade_netting_set_out,
    visible_pretrade_netting_set_records,
)
from apps.api.app.domains.reports.services.pretrade_risk_scenarios import (
    PreTradeRiskScenarioPromotionError,
    promote_governance_risk_scenario_draft,
    to_pretrade_risk_scenario_out,
    visible_pretrade_risk_scenario_records,
)
from apps.api.app.domains.reports.services.pretrade_review_drift import (
    build_pretrade_review_drift,
)
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
    accessible_recommendation_run_records,
    build_pretrade_recommendation_draft_analysis,
    build_pretrade_scenario_enrichment,
    build_recommendation_run_payload,
    build_recommendation_summary_lookup,
    get_accessible_recommendation_run_record,
    list_pretrade_source_adapters,
    latest_accessible_recommendation_run_record,
    pretrade_recommendation_run_records_stmt,
    prepare_pretrade_recommendation_evaluation,
    previous_recommendation_run_record,
    recommendation_run_source_review_id,
    recommendation_run_source_scenario_id,
    resolve_pretrade_recommendation_input_snapshots,
    to_recommendation_run_out,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeGovernanceAuditCategory,
    PreTradeGovernanceAuditExportOut,
    PreTradeGovernanceAuditRowOut,
    PreTradeHedgeRecommendationOut,
    PreTradeHedgeRecommendationPromoteCreate,
    PreTradeGovernanceItemsOut,
    PreTradeGovernanceSummaryOut,
    PreTradeNettingSetOut,
    PreTradeNettingSetPromoteCreate,
    PreTradeRecommendationDraftAnalysisCreate,
    PreTradeRecommendationDraftAnalysisOut,
    PreTradeGovernanceStaleEvidenceRunOut,
    PreTradeRecommendationRunCreate,
    PreTradeRecommendationRunOut,
    PreTradeRecommendationSourceSnapshot,
    PreTradeRecommendationSourceAdapterOut,
    PreTradeReviewActivityAction,
    PreTradeReviewActivityCreate,
    PreTradeReviewDriftOut,
    PreTradeReviewItemCreate,
    PreTradeReviewItemOut,
    PreTradeReviewItemUpdate,
    PreTradeRiskScenarioOut,
    PreTradeRiskScenarioPromoteCreate,
    PreTradeScenarioCreate,
    PreTradeScenarioDraft,
    PreTradeScenarioEnrichmentOut,
    PreTradeScenarioOut,
    PreTradeScenarioUpdate,
)

router = APIRouter(prefix="/pretrade", tags=["pretrade"])

PRETRADE_SCENARIO_PRESET_KEY = "pretrade"
RECOMMENDATION_OVERRIDE_STANCES = {"ESCALATE", "WAIT_FOR_DATA"}
IMPAIRED_SOURCE_QUALITY_STATUSES = {"STALE", "DEGRADED", "MISSING"}


def _preset_name_key(name: str) -> str:
    return name.strip().casefold()


def _record_payload(record: ReportPreset) -> dict[str, object]:
    payload = record.filters_json or {}
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _draft_from_record(record: ReportPreset) -> PreTradeScenarioDraft:
    return PreTradeScenarioDraft.model_validate(_record_payload(record).get("draft") or {})


def _scenario_thesis(record: ReportPreset) -> str | None:
    thesis = _record_payload(record).get("thesis")
    return thesis if isinstance(thesis, str) else None


def _payload_enrichment_json(enrichment: PreTradeScenarioEnrichmentOut | None) -> dict[str, object] | None:
    if enrichment is None:
        return None
    return enrichment.model_dump(mode="json", exclude_none=True)


def _scenario_enrichment(record: ReportPreset) -> PreTradeScenarioEnrichmentOut | None:
    raw_enrichment = _record_payload(record).get("enrichment")
    if not isinstance(raw_enrichment, dict):
        return None
    try:
        return PreTradeScenarioEnrichmentOut.model_validate(raw_enrichment)
    except ValidationError:
        return None


def _to_scenario_out(record: ReportPreset, *, actor_id: str) -> PreTradeScenarioOut:
    return PreTradeScenarioOut(
        scenario_id=record.id,
        name=record.name,
        thesis=_scenario_thesis(record),
        draft=_draft_from_record(record),
        enrichment=_scenario_enrichment(record),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id,
    )


def _scenario_payload_json(
    *,
    thesis: str | None,
    draft: PreTradeScenarioDraft,
    enrichment: PreTradeScenarioEnrichmentOut | None = None,
) -> dict[str, object | None]:
    payload: dict[str, object | None] = {
        "thesis": thesis,
        "draft": draft.model_dump(mode="json", exclude_none=True),
    }
    enrichment_json = _payload_enrichment_json(enrichment)
    if enrichment_json is not None:
        payload["enrichment"] = enrichment_json
    return payload


def _review_payload_json(
    *,
    thesis: str | None,
    draft: PreTradeScenarioDraft,
    source_scenario_id: int | None,
    recommendation_run_id: int | None,
    enrichment: PreTradeScenarioEnrichmentOut | None,
    review_status: str,
    owner: str | None,
    due_at: datetime | None,
    review_notes: str | None,
) -> dict[str, object | None]:
    return {
        "thesis": thesis,
        "draft": draft.model_dump(mode="json", exclude_none=True),
        "source_scenario_id": source_scenario_id,
        "recommendation_run_id": recommendation_run_id,
        "enrichment": _payload_enrichment_json(enrichment),
        "recommendation_override_reason": None,
        "recommendation_override_by": None,
        "recommendation_override_at": None,
        "review_status": review_status,
        "owner": owner,
        "due_at": due_at.isoformat() if due_at else None,
        "review_notes": review_notes,
    }


def _visible_scenarios_stmt(actor_id: str):
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_SCENARIO_PRESET_KEY,
        ReportPreset.scope_owner_key == actor_id,
    )


def _visible_reviews_stmt():
    return select(ReportPreset).where(
        ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
        ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
    )


def _get_visible_recommendation_run_record_or_404(
    db: Session,
    *,
    recommendation_run_id: int,
    actor_id: str,
) -> ReportPreset:
    record = get_accessible_recommendation_run_record(
        db,
        recommendation_run_id=recommendation_run_id,
        actor_id=actor_id,
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pre-trade recommendation run was not found.",
        )
    return record


def _recommendation_record_enrichment(
    recommendation_record: ReportPreset,
    *,
    actor_id: str,
) -> PreTradeScenarioEnrichmentOut:
    return build_pretrade_scenario_enrichment(
        to_recommendation_run_out(
            recommendation_record,
            actor_id=actor_id,
        )
    )


def _validate_review_recommendation_attachment(
    *,
    recommendation_record: ReportPreset,
    source_scenario_id: int | None,
) -> None:
    recommendation_source_scenario_id = recommendation_run_source_scenario_id(recommendation_record)
    if (
        source_scenario_id is not None
        and recommendation_source_scenario_id is not None
        and recommendation_source_scenario_id != source_scenario_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Recommendation run source scenario does not match the review source scenario.",
        )


def _review_recommendation_summary_lookup(
    db: Session,
    records: list[ReportPreset],
):
    return build_recommendation_summary_lookup(
        db,
        [
            recommendation_run_id
            for recommendation_run_id in (review_recommendation_run_id(record) for record in records)
            if recommendation_run_id is not None
        ],
    )


def _governance_recommendation_run_records(
    db: Session,
    *,
    actor_id: str,
    review_records: list[ReportPreset],
) -> list[ReportPreset]:
    del review_records
    return accessible_recommendation_run_records(db, actor_id=actor_id)


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


@router.get("/scenarios", response_model=list[PreTradeScenarioOut])
def get_pretrade_scenarios(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeScenarioOut]:
    actor_id = require_authenticated_actor(request)
    records = db.execute(
        _visible_scenarios_stmt(actor_id).order_by(ReportPreset.updated_at.desc(), ReportPreset.name.asc())
    ).scalars().all()
    return [_to_scenario_out(record, actor_id=actor_id) for record in records]


@router.post("/scenarios", response_model=PreTradeScenarioOut, status_code=status.HTTP_201_CREATED)
def create_pretrade_scenario(
    payload: PreTradeScenarioCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeScenarioOut:
    actor_id = require_authenticated_actor(request)
    name_key = _preset_name_key(payload.name)
    existing = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_SCENARIO_PRESET_KEY,
            ReportPreset.scope_owner_key == actor_id,
            ReportPreset.name_key == name_key,
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pre-trade scenario '{payload.name}' already exists.",
        )

    now = datetime.now(timezone.utc)
    record = ReportPreset(
        preset_key=PRETRADE_SCENARIO_PRESET_KEY,
        scope="PERSONAL",
        scope_owner_key=actor_id,
        name=payload.name,
        name_key=name_key,
        filters_json=_scenario_payload_json(
            thesis=payload.thesis,
            draft=payload.draft,
            enrichment=payload.enrichment,
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
    return _to_scenario_out(record, actor_id=actor_id)


@router.patch("/scenarios/{scenario_id}", response_model=PreTradeScenarioOut)
def update_pretrade_scenario(
    scenario_id: int,
    payload: PreTradeScenarioUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeScenarioOut:
    actor_id = require_authenticated_actor(request)
    record = db.execute(_visible_scenarios_stmt(actor_id).where(ReportPreset.id == scenario_id)).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade scenario was not found.")

    changes = changes_from_payload(payload, empty_detail="Provide at least one scenario field to update.")

    if "name" in changes:
        next_name = payload.name
        if next_name is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name must not be blank")
        next_name_key = _preset_name_key(next_name)
        duplicate = db.execute(
            select(ReportPreset).where(
                ReportPreset.preset_key == PRETRADE_SCENARIO_PRESET_KEY,
                ReportPreset.scope_owner_key == actor_id,
                ReportPreset.name_key == next_name_key,
                ReportPreset.id != record.id,
            )
        ).scalars().first()
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Pre-trade scenario '{next_name}' already exists.",
            )
        record.name = next_name
        record.name_key = next_name_key

    next_payload = _record_payload(record)
    if "thesis" in changes:
        next_payload["thesis"] = payload.thesis
    if "draft" in changes:
        if payload.draft is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="draft is required when provided")
        next_payload["draft"] = payload.draft.model_dump(mode="json", exclude_none=True)
    if "enrichment" in changes:
        enrichment_json = _payload_enrichment_json(payload.enrichment)
        if enrichment_json is None:
            next_payload.pop("enrichment", None)
        else:
            next_payload["enrichment"] = enrichment_json
    record.filters_json = next_payload

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_scenario_out(record, actor_id=actor_id)


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_pretrade_scenario(
    scenario_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    actor_id = require_authenticated_actor(request)
    record = db.execute(_visible_scenarios_stmt(actor_id).where(ReportPreset.id == scenario_id)).scalars().first()
    if record is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    db.delete(record)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/recommendations/source-adapters", response_model=list[PreTradeRecommendationSourceAdapterOut])
def get_pretrade_recommendation_source_adapters(
    request: Request,
) -> list[PreTradeRecommendationSourceAdapterOut]:
    require_authenticated_actor(request)
    return list_pretrade_source_adapters()


@router.post("/recommendations/draft-analysis", response_model=PreTradeRecommendationDraftAnalysisOut)
def analyze_pretrade_recommendation_draft(
    payload: PreTradeRecommendationDraftAnalysisCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeRecommendationDraftAnalysisOut:
    actor_id = require_authenticated_actor(request)
    evaluated_at = datetime.now(timezone.utc)
    previous_record = latest_accessible_recommendation_run_record(
        db,
        actor_id=actor_id,
        source_scenario_id=payload.source_scenario_id,
        source_review_id=payload.source_review_id,
    )
    return build_pretrade_recommendation_draft_analysis(
        thesis=payload.thesis,
        draft=payload.draft,
        source_scenario_id=payload.source_scenario_id,
        source_review_id=payload.source_review_id,
        input_snapshots=payload.input_snapshots,
        db=db,
        as_of=evaluated_at,
        actor_id=actor_id,
        previous_record=previous_record,
    )


@router.get("/governance/summary", response_model=PreTradeGovernanceSummaryOut)
def get_pretrade_governance_summary(
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeGovernanceSummaryOut:
    actor_id = require_authenticated_actor(request)
    return build_pretrade_governance_summary(
        db,
        actor_id=actor_id,
    )


@router.get("/governance/items", response_model=PreTradeGovernanceItemsOut)
def get_pretrade_governance_items(
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeGovernanceItemsOut:
    actor_id = require_authenticated_actor(request)
    return build_pretrade_governance_items(
        db,
        actor_id=actor_id,
    )


@router.get("/governance/export", response_model=PreTradeGovernanceAuditExportOut)
def export_pretrade_governance_audit(
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeGovernanceAuditExportOut:
    actor_id = require_authenticated_actor(request)
    return build_pretrade_governance_audit_export(
        db,
        actor_id=actor_id,
    )


@router.get("/netting-sets", response_model=list[PreTradeNettingSetOut])
def get_pretrade_netting_sets(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeNettingSetOut]:
    actor_id = require_authenticated_actor(request)
    return [
        to_pretrade_netting_set_out(record, actor_id=actor_id)
        for record in visible_pretrade_netting_set_records(db)
    ]


@router.post("/netting-sets/from-promotion", response_model=PreTradeNettingSetOut, status_code=status.HTTP_201_CREATED)
def promote_pretrade_netting_set_from_governance(
    payload: PreTradeNettingSetPromoteCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeNettingSetOut:
    actor_id = require_authenticated_actor(request)
    try:
        record = promote_governance_netting_set_draft(
            db,
            actor_id=actor_id,
            payload=payload,
        )
    except PreTradeNettingSetPromotionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_pretrade_netting_set_out(record, actor_id=actor_id)


@router.get("/hedge-recommendations", response_model=list[PreTradeHedgeRecommendationOut])
def get_pretrade_hedge_recommendations(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeHedgeRecommendationOut]:
    actor_id = require_authenticated_actor(request)
    return [
        to_pretrade_hedge_recommendation_out(record, actor_id=actor_id)
        for record in visible_pretrade_hedge_recommendation_records(db)
    ]


@router.post(
    "/hedge-recommendations/from-promotion",
    response_model=PreTradeHedgeRecommendationOut,
    status_code=status.HTTP_201_CREATED,
)
def promote_pretrade_hedge_recommendation_from_governance(
    payload: PreTradeHedgeRecommendationPromoteCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeHedgeRecommendationOut:
    actor_id = require_authenticated_actor(request)
    try:
        record = promote_governance_hedge_recommendation_draft(
            db,
            actor_id=actor_id,
            payload=payload,
        )
    except PreTradeHedgeRecommendationPromotionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_pretrade_hedge_recommendation_out(record, actor_id=actor_id)


@router.get("/risk-scenarios", response_model=list[PreTradeRiskScenarioOut])
def get_pretrade_risk_scenarios(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeRiskScenarioOut]:
    actor_id = require_authenticated_actor(request)
    return [
        to_pretrade_risk_scenario_out(record, actor_id=actor_id)
        for record in visible_pretrade_risk_scenario_records(db)
    ]


@router.post(
    "/risk-scenarios/from-promotion",
    response_model=PreTradeRiskScenarioOut,
    status_code=status.HTTP_201_CREATED,
)
def promote_pretrade_risk_scenario_from_governance(
    payload: PreTradeRiskScenarioPromoteCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeRiskScenarioOut:
    actor_id = require_authenticated_actor(request)
    try:
        record = promote_governance_risk_scenario_draft(
            db,
            actor_id=actor_id,
            payload=payload,
        )
    except PreTradeRiskScenarioPromotionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_pretrade_risk_scenario_out(record, actor_id=actor_id)


@router.get("/recommendations/runs", response_model=list[PreTradeRecommendationRunOut])
def get_pretrade_recommendation_runs(
    request: Request,
    source_scenario_id: int | None = Query(default=None, ge=1),
    source_review_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[PreTradeRecommendationRunOut]:
    actor_id = require_authenticated_actor(request)
    records = db.execute(
        pretrade_recommendation_run_records_stmt(actor_id).order_by(
            ReportPreset.created_at.desc(),
            ReportPreset.id.desc(),
        )
    ).scalars().all()

    filtered_records: list[ReportPreset] = []
    for record in records:
        if source_scenario_id is not None and recommendation_run_source_scenario_id(record) != source_scenario_id:
            continue
        if source_review_id is not None and recommendation_run_source_review_id(record) != source_review_id:
            continue
        filtered_records.append(record)

    runs: list[PreTradeRecommendationRunOut] = []
    for record in filtered_records[:limit]:
        runs.append(
            to_recommendation_run_out(
                record,
                actor_id=actor_id,
                previous_record=previous_recommendation_run_record(filtered_records, record),
            )
        )
        if len(runs) >= limit:
            break
    return runs


@router.get("/recommendations/runs/{run_id}", response_model=PreTradeRecommendationRunOut)
def get_pretrade_recommendation_run(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeRecommendationRunOut:
    actor_id = require_authenticated_actor(request)
    record = _get_visible_recommendation_run_record_or_404(
        db,
        recommendation_run_id=run_id,
        actor_id=actor_id,
    )
    records = db.execute(
        pretrade_recommendation_run_records_stmt(actor_id).order_by(
            ReportPreset.created_at.desc(),
            ReportPreset.id.desc(),
        )
    ).scalars().all()
    return to_recommendation_run_out(
        record,
        actor_id=actor_id,
        previous_record=previous_recommendation_run_record(records, record),
    )


@router.post("/recommendations/runs", response_model=PreTradeRecommendationRunOut, status_code=status.HTTP_201_CREATED)
def create_pretrade_recommendation_run(
    payload: PreTradeRecommendationRunCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeRecommendationRunOut:
    actor_id = require_authenticated_actor(request)

    source_scenario_record: ReportPreset | None = None
    if payload.source_scenario_id is not None:
        source_scenario_record = db.execute(
            _visible_scenarios_stmt(actor_id).where(ReportPreset.id == payload.source_scenario_id)
        ).scalars().first()
        if source_scenario_record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source pre-trade scenario was not found.",
            )

    source_review_record: ReportPreset | None = None
    if payload.source_review_id is not None:
        source_review_record = get_pretrade_review_record(db, payload.source_review_id)
        if source_review_record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source pre-trade review was not found.",
            )

    draft = (
        payload.draft
        or (review_draft(source_review_record) if source_review_record else None)
        or (_draft_from_record(source_scenario_record) if source_scenario_record else None)
    )
    if draft is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="draft, source_scenario_id, or source_review_id is required",
        )

    source_scenario_id = payload.source_scenario_id
    if source_scenario_id is None and source_review_record is not None:
        source_scenario_id = review_source_scenario_id(source_review_record)

    thesis = payload.thesis
    if thesis is None and source_review_record is not None:
        thesis = review_thesis(source_review_record)
    if thesis is None and source_scenario_record is not None:
        thesis = _scenario_thesis(source_scenario_record)

    now = datetime.now(timezone.utc)
    resolved_input_snapshots = resolve_pretrade_recommendation_input_snapshots(
        db=db,
        draft=draft,
        input_snapshots=payload.input_snapshots,
        as_of=now,
        actor_id=actor_id,
    )
    evaluation = prepare_pretrade_recommendation_evaluation(
        draft=draft,
        input_snapshots=resolved_input_snapshots,
        as_of=now,
        actor_id=actor_id,
    )
    name = (
        payload.name
        or f"{draft.book or 'Desk'} {draft.commodity or 'trade'} recommendation"
    )[:120]
    record = ReportPreset(
        preset_key=PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
        scope="SHARED" if payload.source_review_id is not None else "PERSONAL",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY if payload.source_review_id is not None else actor_id,
        name=name,
        name_key=uuid4().hex,
        filters_json=build_recommendation_run_payload(
            thesis=thesis,
            draft=draft,
            source_scenario_id=source_scenario_id,
            source_review_id=payload.source_review_id,
            input_snapshots=evaluation.input_snapshots,
            recommendation=evaluation.recommendation,
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
    return to_recommendation_run_out(record, actor_id=actor_id)


@router.get("/reviews", response_model=list[PreTradeReviewItemOut])
def get_pretrade_reviews(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeReviewItemOut]:
    require_authenticated_actor(request)
    records = db.execute(
        _visible_reviews_stmt().order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()
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


@router.get("/reviews/{review_id}", response_model=PreTradeReviewItemOut)
def get_pretrade_review(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    require_authenticated_actor(request)
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade review item was not found.")

    linked_trade_status_by_id = build_linked_trade_status_lookup(
        db,
        [review_linked_trade_id(record) or ""],
    )
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, [record])
    return to_review_out(
        record,
        linked_trade_status_by_id=linked_trade_status_by_id,
        recommendation_summary_by_id=recommendation_summary_by_id,
    )


@router.get("/reviews/{review_id}/drift", response_model=PreTradeReviewDriftOut)
def get_pretrade_review_drift(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewDriftOut:
    actor_id = require_authenticated_actor(request)
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade review item was not found.")
    return build_pretrade_review_drift(
        db,
        review_record=record,
        actor_id=actor_id,
    )


@router.post("/reviews", response_model=PreTradeReviewItemOut, status_code=status.HTTP_201_CREATED)
def create_pretrade_review(
    payload: PreTradeReviewItemCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    actor_id = require_authenticated_actor(request)

    source_record: ReportPreset | None = None
    if payload.source_scenario_id is not None:
        source_record = db.execute(
            _visible_scenarios_stmt(actor_id).where(ReportPreset.id == payload.source_scenario_id)
        ).scalars().first()
        if source_record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source pre-trade scenario was not found.",
            )

    recommendation_record: ReportPreset | None = None
    if payload.recommendation_run_id is not None:
        recommendation_record = _get_visible_recommendation_run_record_or_404(
            db,
            recommendation_run_id=payload.recommendation_run_id,
            actor_id=actor_id,
        )
        _validate_review_recommendation_attachment(
            recommendation_record=recommendation_record,
            source_scenario_id=payload.source_scenario_id,
        )

    resolved_enrichment = payload.enrichment
    if resolved_enrichment is None and source_record is not None:
        resolved_enrichment = _scenario_enrichment(source_record)
    if recommendation_record is not None:
        resolved_enrichment = _recommendation_record_enrichment(
            recommendation_record,
            actor_id=actor_id,
        )

    now = datetime.now(timezone.utc)
    record = ReportPreset(
        preset_key=PRETRADE_REVIEW_PRESET_KEY,
        scope="SHARED",
        scope_owner_key=PRETRADE_SHARED_OWNER_KEY,
        name=payload.name,
        name_key=uuid4().hex,
        filters_json=_review_payload_json(
            thesis=payload.thesis,
            draft=payload.draft,
            source_scenario_id=payload.source_scenario_id,
            recommendation_run_id=payload.recommendation_run_id,
            enrichment=resolved_enrichment,
            review_status="OPEN",
            owner=payload.owner,
            due_at=payload.due_at,
            review_notes=payload.review_notes,
        ),
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    append_review_activity(
        record,
        action="SUBMITTED",
        actor_id=actor_id,
        occurred_at=now,
        comment=payload.review_notes or payload.thesis,
        payload={
            key: value
            for key, value in {
                "source_scenario_id": payload.source_scenario_id,
                "recommendation_run_id": payload.recommendation_run_id,
                "opportunity_category": resolved_enrichment.opportunity_category if resolved_enrichment else None,
            }.items()
            if value is not None
        },
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    linked_trade_status_by_id = build_linked_trade_status_lookup(db, [])
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, [record])
    return to_review_out(
        record,
        linked_trade_status_by_id=linked_trade_status_by_id,
        recommendation_summary_by_id=recommendation_summary_by_id,
    )


@router.patch("/reviews/{review_id}", response_model=PreTradeReviewItemOut)
def update_pretrade_review(
    review_id: int,
    payload: PreTradeReviewItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    actor_id = require_authenticated_actor(request)
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade review item was not found.")

    changes = changes_from_payload(payload, empty_detail="Provide at least one review field to update.")
    current_linked_trade_id = review_linked_trade_id(record)
    current_review_status = review_status(record)
    current_owner = review_owner(record)
    current_recommendation_run_id = review_recommendation_run_id(record)
    next_recommendation_run_id = (
        payload.recommendation_run_id if "recommendation_run_id" in changes else current_recommendation_run_id
    )

    if current_linked_trade_id and "review_status" in changes and payload.review_status != current_review_status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pre-trade review is already linked to trade '{current_linked_trade_id}' and can no longer change approval status.",
        )
    if (
        current_linked_trade_id
        and "recommendation_run_id" in changes
        and payload.recommendation_run_id != current_recommendation_run_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pre-trade review is already linked to trade '{current_linked_trade_id}' and can no longer change recommendation provenance.",
        )
    if "review_status" in changes and payload.review_status == "APPROVED" and not payload.activity_comment:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Approval comment is required.",
        )
    recommendation_enrichment: PreTradeScenarioEnrichmentOut | None = None
    if "recommendation_run_id" in changes and payload.recommendation_run_id is not None:
        recommendation_record = _get_visible_recommendation_run_record_or_404(
            db,
            recommendation_run_id=payload.recommendation_run_id,
            actor_id=actor_id,
        )
        _validate_review_recommendation_attachment(
            recommendation_record=recommendation_record,
            source_scenario_id=review_source_scenario_id(record),
        )
        recommendation_enrichment = _recommendation_record_enrichment(
            recommendation_record,
            actor_id=actor_id,
        )

    recommendation_summary = (
        build_recommendation_summary_lookup(db, [next_recommendation_run_id]).get(next_recommendation_run_id)
        if next_recommendation_run_id is not None
        else None
    )
    if (
        "review_status" in changes
        and payload.review_status == "APPROVED"
        and recommendation_summary is not None
        and recommendation_summary.stance in RECOMMENDATION_OVERRIDE_STANCES
        and not payload.recommendation_override_reason
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Recommendation override reason is required to approve an "
                f"{recommendation_summary.stance} recommendation."
            ),
        )

    if "name" in changes and payload.name is not None:
        record.name = payload.name

    next_payload = review_record_payload(record)
    now = datetime.now(timezone.utc)
    if "thesis" in changes:
        next_payload["thesis"] = payload.thesis
    if "draft" in changes:
        if payload.draft is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="draft is required when provided")
        next_payload["draft"] = payload.draft.model_dump(mode="json", exclude_none=True)
    if "recommendation_run_id" in changes:
        next_payload["recommendation_run_id"] = payload.recommendation_run_id
        if recommendation_enrichment is not None:
            next_payload["enrichment"] = _payload_enrichment_json(recommendation_enrichment)
        elif payload.recommendation_run_id is None:
            next_payload.pop("enrichment", None)
    if "enrichment" in changes:
        enrichment_json = _payload_enrichment_json(payload.enrichment)
        if enrichment_json is None:
            next_payload.pop("enrichment", None)
        else:
            next_payload["enrichment"] = enrichment_json
    if "recommendation_override_reason" in changes:
        next_payload["recommendation_override_reason"] = payload.recommendation_override_reason
        next_payload["recommendation_override_by"] = actor_id if payload.recommendation_override_reason else None
        next_payload["recommendation_override_at"] = now.isoformat() if payload.recommendation_override_reason else None
    if "review_status" in changes:
        next_payload["review_status"] = payload.review_status
    if "owner" in changes:
        next_payload["owner"] = payload.owner
    if "due_at" in changes:
        next_payload["due_at"] = payload.due_at.isoformat() if payload.due_at else None
    if "review_notes" in changes:
        next_payload["review_notes"] = payload.review_notes
    if "activity_comment" in changes and "review_notes" not in changes and payload.activity_comment:
        next_payload["review_notes"] = payload.activity_comment
    record.filters_json = next_payload

    activity_action: PreTradeReviewActivityAction | None = None
    activity_payload: dict[str, object] = {}
    activity_comment = payload.activity_comment or payload.review_notes
    if "review_status" in changes and payload.review_status and payload.review_status != current_review_status:
        activity_action = payload.review_status if payload.review_status in {"APPROVED", "REJECTED"} else "CLAIMED"
        activity_payload["from_status"] = current_review_status
        activity_payload["to_status"] = payload.review_status
        if payload.review_status == "APPROVED" and recommendation_summary is not None:
            activity_payload["recommendation_run_id"] = recommendation_summary.run_id
            activity_payload["recommendation_stance"] = recommendation_summary.stance
            activity_payload["recommendation_score"] = recommendation_summary.score
        if payload.review_status == "APPROVED" and payload.recommendation_override_reason:
            activity_payload["recommendation_override_reason"] = payload.recommendation_override_reason
            activity_payload["recommendation_override_by"] = actor_id
            activity_payload["recommendation_override_at"] = now.isoformat()
    elif "owner" in changes and payload.owner and payload.owner != current_owner:
        activity_action = "CLAIMED"
        activity_payload["from_owner"] = current_owner
        activity_payload["to_owner"] = payload.owner
    elif "recommendation_run_id" in changes and payload.recommendation_run_id != current_recommendation_run_id:
        activity_action = "COMMENTED"
        activity_payload["from_recommendation_run_id"] = current_recommendation_run_id
        activity_payload["to_recommendation_run_id"] = payload.recommendation_run_id
        if recommendation_enrichment is not None and recommendation_enrichment.opportunity_category is not None:
            activity_payload["opportunity_category"] = recommendation_enrichment.opportunity_category
    elif "activity_comment" in changes or "review_notes" in changes:
        activity_action = "COMMENTED"
    elif "recommendation_override_reason" in changes:
        activity_action = "COMMENTED"
        activity_payload["recommendation_override_reason"] = payload.recommendation_override_reason
        activity_payload["recommendation_override_by"] = actor_id if payload.recommendation_override_reason else None
        activity_payload["recommendation_override_at"] = now.isoformat() if payload.recommendation_override_reason else None

    if activity_action:
        append_review_activity(
            record,
            action=activity_action,
            actor_id=actor_id,
            occurred_at=now,
            comment=activity_comment,
            payload=activity_payload,
        )

    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    if "review_status" in changes and payload.review_status == "APPROVED" and payload.review_status != current_review_status:
        persist_review_governance_snapshot(
            record,
            snapshot=build_pretrade_governance_audit_export(
                db,
                actor_id=actor_id,
                generated_at=now,
            ),
            snapshot_key=REVIEW_APPROVAL_GOVERNANCE_SNAPSHOT_KEY,
            activity_action="APPROVED",
        )
    db.commit()
    db.refresh(record)
    linked_trade_status_by_id = build_linked_trade_status_lookup(
        db,
        [review_linked_trade_id(record) or ""],
    )
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, [record])
    return to_review_out(
        record,
        linked_trade_status_by_id=linked_trade_status_by_id,
        recommendation_summary_by_id=recommendation_summary_by_id,
    )


@router.post("/reviews/{review_id}/activity", response_model=PreTradeReviewItemOut, status_code=status.HTTP_201_CREATED)
def comment_on_pretrade_review(
    review_id: int,
    payload: PreTradeReviewActivityCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    actor_id = require_authenticated_actor(request)
    record = get_pretrade_review_record(db, review_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade review item was not found.")

    now = datetime.now(timezone.utc)
    next_payload = review_record_payload(record)
    next_payload["review_notes"] = payload.comment
    record.filters_json = next_payload
    append_review_activity(
        record,
        action="COMMENTED",
        actor_id=actor_id,
        occurred_at=now,
        comment=payload.comment,
    )
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    linked_trade_status_by_id = build_linked_trade_status_lookup(
        db,
        [review_linked_trade_id(record) or ""],
    )
    recommendation_summary_by_id = _review_recommendation_summary_lookup(db, [record])
    return to_review_out(
        record,
        linked_trade_status_by_id=linked_trade_status_by_id,
        recommendation_summary_by_id=recommendation_summary_by_id,
    )
