from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from apps.api.app.models.event import Event


@dataclass(frozen=True)
class AppendDomainEventCommand:
    aggregate_type: str
    aggregate_id: str
    event_type: str
    payload: Mapping[str, Any] | None = None
    occurred_at: datetime | None = None
    actor_id: str | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    schema_version: int = 1
    event_id: str | None = None
    recorded_at: datetime | None = None


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _should_apply_trade_projection(event: Event) -> bool:
    if event.aggregate_type != "trade":
        return False

    from apps.api.app.domains.trading.services import trade_event_support as support

    tracked_trade_event_types = {
        "TradeCreated",
        "TradeAmended",
        "TradeCancelled",
        *support.OPTION_LIFECYCLE_EVENT_TYPES,
    }
    return event.event_type in tracked_trade_event_types


def append_domain_event(
    db: Session,
    command: AppendDomainEventCommand,
    *,
    commit: bool = False,
    refresh: bool = False,
) -> Event:
    effective_recorded_at = _coerce_utc(command.recorded_at) or datetime.now(timezone.utc)
    effective_occurred_at = _coerce_utc(command.occurred_at) or effective_recorded_at
    event = Event(
        event_id=command.event_id or str(uuid.uuid4()),
        aggregate_type=command.aggregate_type,
        aggregate_id=command.aggregate_id,
        event_type=command.event_type,
        occurred_at=effective_occurred_at,
        recorded_at=effective_recorded_at,
        actor_id=command.actor_id,
        correlation_id=command.correlation_id,
        causation_id=command.causation_id,
        schema_version=command.schema_version,
        payload=jsonable_encoder(dict(command.payload or {})),
    )

    try:
        db.add(event)
        db.flush()

        if _should_apply_trade_projection(event):
            from apps.api.app.domains.trading.services.trade_event_application import (
                TradeEventApplicationContext,
                apply_trade_event,
            )

            apply_trade_event(
                TradeEventApplicationContext(
                    db=db,
                    event=event,
                    recorded_at=effective_recorded_at,
                )
            )

        if commit:
            db.commit()

        if refresh:
            db.refresh(event)
    except Exception:
        if commit:
            db.rollback()
        raise

    return event
