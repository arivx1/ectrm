from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_REVIEW_PRESET_KEY,
    PRETRADE_SHARED_OWNER_KEY,
    append_review_activity,
    build_linked_trade_status_lookup,
    get_pretrade_review_record,
    review_draft,
    review_linked_trade_id,
    review_owner,
    review_recommendation_run_id,
    review_record_payload,
    review_source_scenario_id,
    review_status,
    review_thesis,
    to_review_out,
)
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    PRETRADE_RECOMMENDATION_RUN_PRESET_KEY,
    build_pretrade_recommendation_result,
    build_recommendation_run_payload,
    build_recommendation_summary_lookup,
    pretrade_recommendation_run_records_stmt,
    pretrade_recommendation_run_record_stmt,
    recommendation_run_source_review_id,
    recommendation_run_source_scenario_id,
    to_recommendation_run_out,
)
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationRunCreate,
    PreTradeRecommendationRunOut,
    PreTradeReviewActivityAction,
    PreTradeReviewActivityCreate,
    PreTradeReviewItemCreate,
    PreTradeReviewItemOut,
    PreTradeReviewItemUpdate,
    PreTradeScenarioCreate,
    PreTradeScenarioDraft,
    PreTradeScenarioOut,
    PreTradeScenarioUpdate,
)

router = APIRouter(prefix="/pretrade", tags=["pretrade"])

PRETRADE_SCENARIO_PRESET_KEY = "pretrade"
RECOMMENDATION_OVERRIDE_STANCES = {"ESCALATE", "WAIT_FOR_DATA"}


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


def _to_scenario_out(record: ReportPreset, *, actor_id: str) -> PreTradeScenarioOut:
    return PreTradeScenarioOut(
        scenario_id=record.id,
        name=record.name,
        thesis=_scenario_thesis(record),
        draft=_draft_from_record(record),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=record.created_by == actor_id,
    )


def _scenario_payload_json(*, thesis: str | None, draft: PreTradeScenarioDraft) -> dict[str, object | None]:
    return {
        "thesis": thesis,
        "draft": draft.model_dump(mode="json", exclude_none=True),
    }


def _review_payload_json(
    *,
    thesis: str | None,
    draft: PreTradeScenarioDraft,
    source_scenario_id: int | None,
    recommendation_run_id: int | None,
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


def _recommendation_run_attached_to_shared_review(db: Session, recommendation_run_id: int) -> bool:
    records = db.execute(_visible_reviews_stmt()).scalars().all()
    return any(review_recommendation_run_id(record) == recommendation_run_id for record in records)


def _get_accessible_recommendation_run_record(
    db: Session,
    *,
    recommendation_run_id: int,
    actor_id: str,
) -> ReportPreset | None:
    record = db.execute(pretrade_recommendation_run_record_stmt(recommendation_run_id)).scalars().first()
    if record is None:
        return None
    if record.scope_owner_key in {actor_id, PRETRADE_SHARED_OWNER_KEY} or _recommendation_run_attached_to_shared_review(db, recommendation_run_id):
        return record
    return None


def _get_visible_recommendation_run_record_or_404(
    db: Session,
    *,
    recommendation_run_id: int,
    actor_id: str,
) -> ReportPreset:
    record = _get_accessible_recommendation_run_record(
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
        filters_json=_scenario_payload_json(thesis=payload.thesis, draft=payload.draft),
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

    runs: list[PreTradeRecommendationRunOut] = []
    for record in records:
        if source_scenario_id is not None and recommendation_run_source_scenario_id(record) != source_scenario_id:
            continue
        if source_review_id is not None and recommendation_run_source_review_id(record) != source_review_id:
            continue
        runs.append(to_recommendation_run_out(record, actor_id=actor_id))
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
    return to_recommendation_run_out(record, actor_id=actor_id)


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

    recommendation = build_pretrade_recommendation_result(
        draft=draft,
        input_snapshots=payload.input_snapshots,
    )
    name = (
        payload.name
        or f"{draft.book or 'Desk'} {draft.commodity or 'trade'} recommendation"
    )[:120]
    now = datetime.now(timezone.utc)
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
            input_snapshots=payload.input_snapshots,
            recommendation=recommendation,
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


@router.post("/reviews", response_model=PreTradeReviewItemOut, status_code=status.HTTP_201_CREATED)
def create_pretrade_review(
    payload: PreTradeReviewItemCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    actor_id = require_authenticated_actor(request)

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
