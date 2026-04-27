from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Mapping

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.models.event import Event
from apps.api.app.schemas.event import EventCreate

TradeCommandType = Literal["BookTrade", "AmendTradeTerms", "CancelTrade"]

TRADE_COMMAND_EVENT_TYPES: dict[TradeCommandType, str] = {
    "BookTrade": "TradeCreated",
    "AmendTradeTerms": "TradeAmended",
    "CancelTrade": "TradeCancelled",
}

TRADE_EVENT_COMMAND_TYPES: dict[str, TradeCommandType] = {
    event_type: command_type for command_type, event_type in TRADE_COMMAND_EVENT_TYPES.items()
}


class TradeCommandValidationError(ValueError):
    """Raised when a trade command envelope does not match the event adapter."""


@dataclass(frozen=True)
class TradeWriteCommand:
    command_id: str
    command_type: TradeCommandType
    trade_id: str
    payload: Mapping[str, Any] | None = None
    occurred_at: datetime | None = None
    recorded_at: datetime | None = None
    actor_id: str | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    schema_version: int = 1
    source_surface: str = "events"
    expected_last_event_id: str | None = None


def build_trade_write_command_from_event(
    payload: EventCreate,
    *,
    actor_id: str | None,
    correlation_id: str | None,
    recorded_at: datetime | None = None,
) -> TradeWriteCommand | None:
    if payload.aggregate_type != "trade":
        return None

    command_type = TRADE_EVENT_COMMAND_TYPES.get(payload.event_type)
    if command_type is None:
        return None

    if payload.command_type and payload.command_type != command_type:
        raise TradeCommandValidationError(
            f"Trade event {payload.event_type} does not match command_type {payload.command_type}."
        )

    return TradeWriteCommand(
        command_id=payload.command_id or str(uuid.uuid4()),
        command_type=command_type,
        trade_id=payload.aggregate_id,
        payload=payload.payload,
        occurred_at=payload.occurred_at,
        recorded_at=recorded_at,
        actor_id=actor_id,
        correlation_id=correlation_id,
        causation_id=payload.causation_id,
        schema_version=payload.schema_version,
        source_surface=payload.source_surface or "events",
        expected_last_event_id=payload.expected_last_event_id,
    )


def append_trade_write_command(
    db: Session,
    command: TradeWriteCommand,
    *,
    commit: bool = False,
    refresh: bool = False,
) -> Event:
    return append_domain_event(
        db,
        AppendDomainEventCommand(
            aggregate_type="trade",
            aggregate_id=command.trade_id,
            event_type=TRADE_COMMAND_EVENT_TYPES[command.command_type],
            payload=command.payload,
            occurred_at=command.occurred_at,
            recorded_at=command.recorded_at,
            actor_id=command.actor_id,
            correlation_id=command.correlation_id,
            causation_id=command.causation_id,
            schema_version=command.schema_version,
            operation_key=f"trade_command.{command.command_type}",
            source_surface=command.source_surface,
            provenance_details={
                "command_id": command.command_id,
                "command_type": command.command_type,
                **(
                    {"expected_last_event_id": command.expected_last_event_id}
                    if command.expected_last_event_id
                    else {}
                ),
            },
        ),
        commit=commit,
        refresh=refresh,
    )
