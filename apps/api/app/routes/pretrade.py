from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.deps.db import get_db
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.pretrade import (
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
PRETRADE_REVIEW_PRESET_KEY = "pretrade_review"
PRETRADE_SHARED_OWNER_KEY = "__shared__"


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


def _review_status(record: ReportPreset) -> str:
    review_status = _record_payload(record).get("review_status")
    return review_status if isinstance(review_status, str) else "OPEN"


def _review_owner(record: ReportPreset) -> str | None:
    owner = _record_payload(record).get("owner")
    return owner if isinstance(owner, str) else None


def _review_notes(record: ReportPreset) -> str | None:
    review_notes = _record_payload(record).get("review_notes")
    return review_notes if isinstance(review_notes, str) else None


def _review_due_at(record: ReportPreset) -> datetime | None:
    raw_due_at = _record_payload(record).get("due_at")
    if not isinstance(raw_due_at, str) or not raw_due_at.strip():
        return None
    return datetime.fromisoformat(raw_due_at)


def _source_scenario_id(record: ReportPreset) -> int | None:
    scenario_id = _record_payload(record).get("source_scenario_id")
    return scenario_id if isinstance(scenario_id, int) else None


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


def _to_review_out(record: ReportPreset) -> PreTradeReviewItemOut:
    return PreTradeReviewItemOut(
        review_id=record.id,
        name=record.name,
        thesis=_scenario_thesis(record),
        draft=_draft_from_record(record),
        source_scenario_id=_source_scenario_id(record),
        review_status=_review_status(record),  # type: ignore[arg-type]
        owner=_review_owner(record),
        due_at=_review_due_at(record),
        review_notes=_review_notes(record),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=True,
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
    review_status: str,
    owner: str | None,
    due_at: datetime | None,
    review_notes: str | None,
) -> dict[str, object | None]:
    return {
        "thesis": thesis,
        "draft": draft.model_dump(mode="json", exclude_none=True),
        "source_scenario_id": source_scenario_id,
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


@router.get("/reviews", response_model=list[PreTradeReviewItemOut])
def get_pretrade_reviews(
    request: Request,
    db: Session = Depends(get_db),
) -> list[PreTradeReviewItemOut]:
    require_authenticated_actor(request)
    records = db.execute(
        _visible_reviews_stmt().order_by(ReportPreset.updated_at.desc(), ReportPreset.created_at.desc())
    ).scalars().all()
    return [_to_review_out(record) for record in records]


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
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_review_out(record)


@router.patch("/reviews/{review_id}", response_model=PreTradeReviewItemOut)
def update_pretrade_review(
    review_id: int,
    payload: PreTradeReviewItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> PreTradeReviewItemOut:
    actor_id = require_authenticated_actor(request)
    record = db.execute(_visible_reviews_stmt().where(ReportPreset.id == review_id)).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-trade review item was not found.")

    changes = changes_from_payload(payload, empty_detail="Provide at least one review field to update.")

    if "name" in changes and payload.name is not None:
        record.name = payload.name

    next_payload = _record_payload(record)
    if "thesis" in changes:
        next_payload["thesis"] = payload.thesis
    if "draft" in changes:
        if payload.draft is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="draft is required when provided")
        next_payload["draft"] = payload.draft.model_dump(mode="json", exclude_none=True)
    if "review_status" in changes:
        next_payload["review_status"] = payload.review_status
    if "owner" in changes:
        next_payload["owner"] = payload.owner
    if "due_at" in changes:
        next_payload["due_at"] = payload.due_at.isoformat() if payload.due_at else None
    if "review_notes" in changes:
        next_payload["review_notes"] = payload.review_notes
    record.filters_json = next_payload

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_review_out(record)
