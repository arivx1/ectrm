from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.domains.trading.services.trade_command_contracts import (
    TRADE_COMMAND_EVENT_TYPES,
    TradeCommandType,
    TradeCommandValidationError,
    TradeWriteCommand,
)
from apps.api.app.domains.trading.services.trade_command_prechecks import precheck_trade_write
from apps.api.app.domains.trading.services.trade_event_command_adapter import (
    build_trade_write_command_from_event,
)
from apps.api.app.models.event import Event

__all__ = [
    "TradeCommandType",
    "TradeCommandValidationError",
    "TradeWriteCommand",
    "append_trade_write_command",
    "build_trade_write_command_from_event",
]


def append_trade_write_command(
    db: Session,
    command: TradeWriteCommand,
    *,
    commit: bool = False,
    refresh: bool = False,
) -> Event:
    event_payload = precheck_trade_write(db, command)
    return append_domain_event(
        db,
        AppendDomainEventCommand(
            aggregate_type="trade",
            aggregate_id=command.trade_id,
            event_type=TRADE_COMMAND_EVENT_TYPES[command.command_type],
            payload=event_payload,
            occurred_at=command.occurred_at,
            recorded_at=command.recorded_at,
            actor_id=command.actor_id,
            correlation_id=command.correlation_id,
            causation_id=command.causation_id,
            schema_version=command.schema_version,
            operation_key=f"trade_command.{command.command_type}",
            source_surface=command.source_surface,
            provenance_details=_trade_command_provenance_details(command, event_payload),
        ),
        commit=commit,
        refresh=refresh,
    )


def _trade_command_provenance_details(
    command: TradeWriteCommand,
    event_payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    details: dict[str, Any] = {
        "command_id": command.command_id,
        "command_type": command.command_type,
    }
    if command.expected_last_event_id:
        details["expected_last_event_id"] = command.expected_last_event_id
    if command.command_type == "CorrectTrade":
        corrects_event_id = event_payload.get("corrects_event_id")
        correction_reason = event_payload.get("correction_reason")
        if corrects_event_id:
            details["corrects_event_id"] = corrects_event_id
        if correction_reason:
            details["correction_reason"] = correction_reason
    return details
