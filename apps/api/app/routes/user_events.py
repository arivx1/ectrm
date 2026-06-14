from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.query_params import (
    LIST_OFFSET_QUERY,
    STANDARD_LIST_LIMIT_DEFAULT,
    STANDARD_LIST_LIMIT_QUERY,
)
from apps.api.app.deps.db import get_db
from apps.api.app.domains.user_events.services import (
    coerce_utc,
    ensure_valid_user_event_kind,
    ensure_valid_user_event_timezone,
    ensure_valid_user_event_window,
    expand_user_event_occurrences,
    recurrence_from_record,
)
from apps.api.app.models.user_defined_event import UserDefinedEvent
from apps.api.app.schemas.user_event import (
    UserEventCreate,
    UserEventOccurrenceOut,
    UserEventOut,
    UserEventRecurrence,
    UserEventStatusUpdate,
    UserEventUpdate,
)

router = APIRouter(prefix="/user-events", tags=["user-events"])


@router.get("/occurrences", response_model=list[UserEventOccurrenceOut])
def list_user_event_occurrences(
    window_start: datetime,
    window_end: datetime,
    kind: Optional[str] = None,
    place: Optional[str] = None,
    is_active: bool = True,
    limit: int = Query(default=STANDARD_LIST_LIMIT_DEFAULT, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[UserEventOccurrenceOut]:
    try:
        normalized_kind = ensure_valid_user_event_kind(kind) if kind else None
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    normalized_place = place.strip() if place and place.strip() else None

    stmt = select(UserDefinedEvent).order_by(UserDefinedEvent.starts_at.asc(), UserDefinedEvent.id.asc())
    stmt = stmt.where(UserDefinedEvent.is_active.is_(is_active))
    if normalized_kind is not None:
        stmt = stmt.where(UserDefinedEvent.kind == normalized_kind)
    if normalized_place is not None:
        stmt = stmt.where(UserDefinedEvent.place.ilike(f"%{normalized_place}%"))

    records = db.execute(stmt).scalars().all()
    try:
        occurrences = expand_user_event_occurrences(
            records,
            window_start=window_start,
            window_end=window_end,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    records_by_id = {record.id: record for record in records}
    return [
        UserEventOccurrenceOut(
            user_event_id=occurrence.user_event_id,
            occurrence_index=occurrence.occurrence_index,
            title=records_by_id[occurrence.user_event_id].title,
            kind=records_by_id[occurrence.user_event_id].kind,
            starts_at=occurrence.starts_at,
            ends_at=occurrence.ends_at,
            all_day=records_by_id[occurrence.user_event_id].all_day,
            timezone=records_by_id[occurrence.user_event_id].timezone,
            place=records_by_id[occurrence.user_event_id].place,
            description=records_by_id[occurrence.user_event_id].description,
            is_active=records_by_id[occurrence.user_event_id].is_active,
            is_recurring=records_by_id[occurrence.user_event_id].recurrence_frequency is not None,
        )
        for occurrence in occurrences
    ]


@router.post("", response_model=UserEventOut, status_code=status.HTTP_201_CREATED)
def create_user_event(
    payload: UserEventCreate,
    db: Session = Depends(get_db),
) -> UserEventOut:
    actor_id = resolve_audit_actor_id(payload.created_by)
    timezone_name = ensure_valid_user_event_timezone(payload.timezone)
    try:
        ensure_valid_user_event_window(
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            timezone_name=timezone_name,
            recurrence=payload.recurrence,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    record = UserDefinedEvent(
        title=payload.title,
        kind=payload.kind,
        starts_at=coerce_utc(payload.starts_at, field_name="starts_at"),
        ends_at=coerce_utc(payload.ends_at, field_name="ends_at") if payload.ends_at is not None else None,
        all_day=payload.all_day,
        timezone=timezone_name,
        place=payload.place,
        description=payload.description,
        recurrence_frequency=payload.recurrence.frequency if payload.recurrence is not None else None,
        recurrence_interval=payload.recurrence.interval if payload.recurrence is not None else None,
        recurrence_count=payload.recurrence.count if payload.recurrence is not None else None,
        recurrence_until_at=(
            coerce_utc(payload.recurrence.until_at, field_name="recurrence.until_at")
            if payload.recurrence is not None and payload.recurrence.until_at is not None
            else None
        ),
        recurrence_by_weekday=(
            list(payload.recurrence.by_weekday or []) if payload.recurrence is not None else None
        ),
        is_active=True,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_user_event_out(record)


@router.get("", response_model=list[UserEventOut])
def list_user_events(
    kind: Optional[str] = None,
    place: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[UserEventOut]:
    try:
        normalized_kind = ensure_valid_user_event_kind(kind) if kind else None
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    normalized_place = place.strip() if place and place.strip() else None

    stmt = (
        select(UserDefinedEvent)
        .order_by(UserDefinedEvent.starts_at.asc(), UserDefinedEvent.id.asc())
        .limit(limit)
        .offset(offset)
    )
    if normalized_kind is not None:
        stmt = stmt.where(UserDefinedEvent.kind == normalized_kind)
    if normalized_place is not None:
        stmt = stmt.where(UserDefinedEvent.place.ilike(f"%{normalized_place}%"))
    if is_active is not None:
        stmt = stmt.where(UserDefinedEvent.is_active.is_(is_active))
    return [_to_user_event_out(row) for row in db.execute(stmt).scalars().all()]


@router.get("/{event_id}", response_model=UserEventOut)
def get_user_event(event_id: int, db: Session = Depends(get_db)) -> UserEventOut:
    record = _get_user_event_record(db, event_id=event_id)
    return _to_user_event_out(record)


@router.put("/{event_id}", response_model=UserEventOut)
def update_user_event(
    event_id: int,
    payload: UserEventUpdate,
    db: Session = Depends(get_db),
) -> UserEventOut:
    record = _get_user_event_record(db, event_id=event_id)
    actor_id = resolve_audit_actor_id(payload.updated_by)

    current_recurrence = recurrence_from_record(record)
    next_starts_at = payload.starts_at if "starts_at" in payload.model_fields_set else record.starts_at
    next_ends_at = payload.ends_at if "ends_at" in payload.model_fields_set else record.ends_at
    next_timezone = payload.timezone if "timezone" in payload.model_fields_set else record.timezone
    next_recurrence = payload.recurrence if "recurrence" in payload.model_fields_set else current_recurrence
    next_kind = payload.kind if "kind" in payload.model_fields_set and payload.kind is not None else record.kind

    try:
        ensure_valid_user_event_window(
            starts_at=next_starts_at,
            ends_at=next_ends_at,
            timezone_name=next_timezone,
            recurrence=next_recurrence,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if "title" in payload.model_fields_set and payload.title is not None:
        record.title = payload.title
    if "kind" in payload.model_fields_set and payload.kind is not None:
        record.kind = next_kind
    if "starts_at" in payload.model_fields_set and payload.starts_at is not None:
        record.starts_at = coerce_utc(payload.starts_at, field_name="starts_at")
    if "ends_at" in payload.model_fields_set:
        record.ends_at = coerce_utc(payload.ends_at, field_name="ends_at") if payload.ends_at is not None else None
    if "all_day" in payload.model_fields_set and payload.all_day is not None:
        record.all_day = payload.all_day
    if "timezone" in payload.model_fields_set:
        record.timezone = ensure_valid_user_event_timezone(payload.timezone)
    if "place" in payload.model_fields_set:
        record.place = payload.place
    if "description" in payload.model_fields_set:
        record.description = payload.description
    if "recurrence" in payload.model_fields_set:
        _apply_recurrence(record, payload.recurrence)

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_user_event_out(record)


@router.patch("/{event_id}/status", response_model=UserEventOut)
def set_user_event_active(
    event_id: int,
    is_active: bool,
    payload: UserEventStatusUpdate,
    db: Session = Depends(get_db),
) -> UserEventOut:
    record = _get_user_event_record(db, event_id=event_id)
    record.is_active = is_active
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_user_event_out(record)


def _get_user_event_record(db: Session, *, event_id: int) -> UserDefinedEvent:
    record = db.get(UserDefinedEvent, event_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User-defined event not found")
    return record


def _apply_recurrence(record: UserDefinedEvent, recurrence: UserEventRecurrence | None) -> None:
    if recurrence is None:
        record.recurrence_frequency = None
        record.recurrence_interval = None
        record.recurrence_count = None
        record.recurrence_until_at = None
        record.recurrence_by_weekday = None
        return

    record.recurrence_frequency = recurrence.frequency
    record.recurrence_interval = recurrence.interval
    record.recurrence_count = recurrence.count
    record.recurrence_until_at = (
        coerce_utc(recurrence.until_at, field_name="recurrence.until_at")
        if recurrence.until_at is not None
        else None
    )
    record.recurrence_by_weekday = list(recurrence.by_weekday or [])


def _to_user_event_out(record: UserDefinedEvent) -> UserEventOut:
    return UserEventOut(
        id=record.id,
        title=record.title,
        kind=record.kind,
        starts_at=record.starts_at,
        ends_at=record.ends_at,
        all_day=record.all_day,
        timezone=record.timezone,
        place=record.place,
        description=record.description,
        recurrence=recurrence_from_record(record),
        is_active=record.is_active,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
