from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
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

    if e.aggregate_type == "trade" and e.event_type == "TradeCreated":
        commodity = (e.payload or {}).get("commodity") or "UNKNOWN"
        price = (e.payload or {}).get("price")
        volume = (e.payload or {}).get("volume")
        now = datetime.now(timezone.utc)

        existing = db.execute(
            select(Trade).where(Trade.trade_id == e.aggregate_id)
        ).scalars().first()

        if existing is None:
            db.add(
                Trade(
                    trade_id=e.aggregate_id,
                    created_at=now,
                    updated_at=now,
                    commodity=commodity,
                    price=price,
                    volume=volume,
                    status="ACTIVE",
                    last_event_id=e.event_id,
                )
            )
        else:
            existing.updated_at = now
            existing.commodity = commodity
            existing.price = price
            existing.volume = volume
            existing.last_event_id = e.event_id

        db.commit()

    if e.aggregate_type == "trade" and e.event_type == "TradeAmended":
        existing = db.execute(
            select(Trade).where(Trade.trade_id == e.aggregate_id)
        ).scalars().first()

        if existing is not None:
            payload_data = e.payload or {}
            existing.updated_at = datetime.now(timezone.utc)

            if "commodity" in payload_data and payload_data["commodity"] is not None:
                existing.commodity = payload_data["commodity"]
            if "price" in payload_data and payload_data["price"] is not None:
                existing.price = payload_data["price"]
            if "volume" in payload_data and payload_data["volume"] is not None:
                existing.volume = payload_data["volume"]
            if "status" in payload_data and payload_data["status"] is not None:
                existing.status = payload_data["status"]

            existing.last_event_id = e.event_id
            db.commit()

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
