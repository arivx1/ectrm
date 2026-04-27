from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.trading.services import trade_event_support as support
from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.domains.trading.services.trade_commands import (
    TradeCommandValidationError,
    append_trade_write_command,
    build_trade_write_command_from_event,
)
from apps.api.app.models.event import Event
from apps.api.app.schemas.event import EventCreate, EventOut

router = APIRouter(prefix="/events", tags=["events"])

OPTION_LIFECYCLE_EVENT_TYPES = support.OPTION_LIFECYCLE_EVENT_TYPES
trade_snapshot = support.trade_snapshot
sync_positions_for_trade_change = support.sync_positions_for_trade_change
sync_option_exposures_for_trade_change = support.sync_option_exposures_for_trade_change


@router.post("", response_model=EventOut, status_code=201)
def append_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)) -> EventOut:
    correlation_id = getattr(request.state, "correlation_id", None) or request.headers.get(
        "x-correlation-id"
    )
    recorded_at = datetime.now(timezone.utc)
    actor_id = getattr(request.state, "actor_id", None) or payload.actor_id

    try:
        trade_command = build_trade_write_command_from_event(
            payload,
            actor_id=actor_id,
            correlation_id=correlation_id,
            recorded_at=recorded_at,
        )
    except TradeCommandValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if trade_command is not None:
        event = append_trade_write_command(
            db,
            trade_command,
            commit=True,
            refresh=True,
        )
    else:
        event = append_domain_event(
            db,
            AppendDomainEventCommand(
                aggregate_type=payload.aggregate_type,
                aggregate_id=payload.aggregate_id,
                event_type=payload.event_type,
                occurred_at=payload.occurred_at,
                recorded_at=recorded_at,
                actor_id=actor_id,
                correlation_id=correlation_id,
                causation_id=payload.causation_id,
                schema_version=payload.schema_version,
                payload=payload.payload,
                source_surface=payload.source_surface or "events",
            ),
            commit=True,
            refresh=True,
        )

    return EventOut(
        event_id=event.event_id,
        aggregate_type=event.aggregate_type,
        aggregate_id=event.aggregate_id,
        event_type=event.event_type,
        occurred_at=event.occurred_at,
        recorded_at=event.recorded_at,
        actor_id=event.actor_id,
        correlation_id=event.correlation_id,
        causation_id=event.causation_id,
        schema_version=event.schema_version,
        payload=event.payload,
    )


@router.get("", response_model=List[EventOut])
def list_events(
    aggregate_type: Optional[str] = None,
    aggregate_id: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> List[EventOut]:
    stmt = select(Event).order_by(Event.recorded_at.desc()).limit(limit)

    if aggregate_type:
        stmt = stmt.where(Event.aggregate_type == aggregate_type)
    if aggregate_id:
        stmt = stmt.where(Event.aggregate_id == aggregate_id)

    rows = db.execute(stmt).scalars().all()
    return [
        EventOut(
            event_id=row.event_id,
            aggregate_type=row.aggregate_type,
            aggregate_id=row.aggregate_id,
            event_type=row.event_type,
            occurred_at=row.occurred_at,
            recorded_at=row.recorded_at,
            actor_id=row.actor_id,
            correlation_id=row.correlation_id,
            causation_id=row.causation_id,
            schema_version=row.schema_version,
            payload=row.payload,
        )
        for row in rows
    ]
