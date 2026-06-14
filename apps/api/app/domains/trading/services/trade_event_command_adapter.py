from __future__ import annotations

import uuid
from datetime import datetime

from apps.api.app.domains.trading.services.trade_command_contracts import (
    TRADE_EVENT_COMMAND_TYPES,
    TradeCommandValidationError,
    TradeWriteCommand,
)
from apps.api.app.schemas.event import EventCreate


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

    if payload.command_type == "CorrectTrade" and payload.event_type == "TradeAmended":
        command_type = "CorrectTrade"
    elif payload.command_type and payload.command_type != command_type:
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
