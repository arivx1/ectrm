from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.event import Event
from apps.api.app.schemas.event import EventCreate, EventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def append_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)) -> EventOut:
    correlation_id = request.headers.get("x-correlation-id")

    e = Event(
        event_id=str(uuid.uuid4()),
        aggregate_type=payload.aggregate_type,
        aggregate_id=payload.aggregate_id,
        event_type=payload.event_type,
        occurred_at=payload.occurred_at,
        recorded_at=datetime.now(timezone.utc),
        actor_id=payload.actor_id,
        correlation_id=correlation_id,
        causation_id=payload.causation_id,
        schema_version=payload.schema_version,
        payload=payload.payload,
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    return EventOut(
        event_id=e.event_id,
        aggregate_type=e.aggregate_type,
        aggregate_id=e.aggregate_id,
        event_type=e.event_type,
        occurred_at=e.occurred_at,
        recorded_at=e.recorded_at,
        actor_id=e.actor_id,
        correlation_id=e.correlation_id,
        causation_id=e.causation_id,
        schema_version=e.schema_version,
        payload=e.payload,
    )


@router.get("", response_model=List[EventOut])
def list_events(
    aggregate_type: Optional[str] = None,
    aggregate_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> List[EventOut]:
    limit = max(1, min(limit, 500))

    stmt = select(Event).order_by(Event.recorded_at.desc()).limit(limit)

    if aggregate_type:
        stmt = stmt.where(Event.aggregate_type == aggregate_type)
    if aggregate_id:
        stmt = stmt.where(Event.aggregate_id == aggregate_id)

    rows = db.execute(stmt).scalars().all()
    return [
        EventOut(
            event_id=r.event_id,
            aggregate_type=r.aggregate_type,
            aggregate_id=r.aggregate_id,
            event_type=r.event_type,
            occurred_at=r.occurred_at,
            recorded_at=r.recorded_at,
            actor_id=r.actor_id,
            correlation_id=r.correlation_id,
            causation_id=r.causation_id,
            schema_version=r.schema_version,
            payload=r.payload,
        )
        for r in rows
    ]
