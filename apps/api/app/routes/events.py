from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.event import EventCreate, EventOut

router = APIRouter(prefix="/events", tags=["events"])

ZERO = Decimal("0")


def trade_snapshot(trade: Trade | None) -> dict[str, object] | None:
    if trade is None:
        return None

    return {
        "commodity": trade.commodity,
        "volume": Decimal(str(trade.volume or 0)),
        "status": trade.status,
    }


def active_volume_by_commodity(trade: dict[str, object] | None) -> dict[str, Decimal]:
    if trade is None or trade.get("status") == "CANCELLED":
        return {}

    commodity = str(trade.get("commodity") or "UNKNOWN")
    volume = Decimal(str(trade.get("volume") or 0))
    return {commodity: volume}


def apply_position_delta(db: Session, commodity: str, delta: Decimal, updated_at: datetime) -> None:
    if delta == ZERO:
        return

    existing = db.execute(
        select(Position).where(Position.commodity == commodity)
    ).scalars().first()

    if existing is None:
        if delta != ZERO:
            db.add(Position(commodity=commodity, net_volume=delta, updated_at=updated_at))
        return

    next_volume = Decimal(str(existing.net_volume)) + delta
    if next_volume == ZERO:
        db.delete(existing)
        return

    existing.net_volume = next_volume
    existing.updated_at = updated_at


def sync_positions_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_contrib = active_volume_by_commodity(before)
    after_contrib = active_volume_by_commodity(after)
    commodities = set(before_contrib) | set(after_contrib)

    for commodity in commodities:
        delta = after_contrib.get(commodity, ZERO) - before_contrib.get(commodity, ZERO)
        apply_position_delta(db, commodity, delta, updated_at)


@router.post("", response_model=EventOut, status_code=201)
def append_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)) -> EventOut:
    correlation_id = getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")
    recorded_at = datetime.now(timezone.utc)

    e = Event(
        event_id=str(uuid.uuid4()),
        aggregate_type=payload.aggregate_type,
        aggregate_id=payload.aggregate_id,
        event_type=payload.event_type,
        occurred_at=payload.occurred_at,
        recorded_at=recorded_at,
        actor_id=payload.actor_id,
        correlation_id=correlation_id,
        causation_id=payload.causation_id,
        schema_version=payload.schema_version,
        payload=payload.payload,
    )
    try:
        db.add(e)
        db.flush()

        if e.aggregate_type == "trade" and e.event_type in {"TradeCreated", "TradeAmended", "TradeCancelled"}:
            payload_data = e.payload or {}
            existing = db.execute(
                select(Trade).where(Trade.trade_id == e.aggregate_id)
            ).scalars().first()
            before = trade_snapshot(existing)

            if e.event_type == "TradeCreated":
                book = payload_data.get("book") or "CRUDE_PHYS"
                commodity = payload_data.get("commodity") or "UNKNOWN"
                price = payload_data.get("price")
                volume = payload_data.get("volume")

                if existing is None:
                    existing = Trade(
                        trade_id=e.aggregate_id,
                        created_at=recorded_at,
                        updated_at=recorded_at,
                        book=book,
                        commodity=commodity,
                        price=price,
                        volume=volume,
                        status="ACTIVE",
                        last_event_id=e.event_id,
                    )
                    db.add(existing)
                else:
                    existing.updated_at = recorded_at
                    existing.book = book
                    existing.commodity = commodity
                    existing.price = price
                    existing.volume = volume
                    existing.status = "ACTIVE"
                    existing.last_event_id = e.event_id

            elif e.event_type == "TradeAmended" and existing is not None:
                existing.updated_at = recorded_at

                if "book" in payload_data and payload_data["book"] is not None:
                    existing.book = payload_data["book"]
                if "commodity" in payload_data and payload_data["commodity"] is not None:
                    existing.commodity = payload_data["commodity"]
                if "price" in payload_data and payload_data["price"] is not None:
                    existing.price = payload_data["price"]
                if "volume" in payload_data and payload_data["volume"] is not None:
                    existing.volume = payload_data["volume"]
                if "status" in payload_data and payload_data["status"] is not None:
                    existing.status = payload_data["status"]

                existing.last_event_id = e.event_id

            elif e.event_type == "TradeCancelled" and existing is not None:
                existing.updated_at = recorded_at
                existing.status = "CANCELLED"
                existing.last_event_id = e.event_id

            after = trade_snapshot(existing)
            sync_positions_for_trade_change(db, before, after, recorded_at)

        db.commit()
        db.refresh(e)
    except Exception:
        db.rollback()
        raise

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
