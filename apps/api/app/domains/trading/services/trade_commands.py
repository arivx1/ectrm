from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Mapping

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import normalize_role
from apps.api.app.core.request_context import get_request_identity
from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.domains.trading.services.trade_write_validation import (
    validate_amend_trade_write,
    validate_book_trade_write,
    validate_cancel_trade_write,
)
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.event import EventCreate

TradeCommandType = Literal["BookTrade", "AmendTradeTerms", "CancelTrade", "CorrectTrade"]
ALLOWED_GOVERNED_TRADE_WRITE_ROLES = frozenset({"TRADER", "DESK_LEAD", "OPS_ADMIN", "ADMIN"})

TRADE_COMMAND_EVENT_TYPES: dict[TradeCommandType, str] = {
    "BookTrade": "TradeCreated",
    "AmendTradeTerms": "TradeAmended",
    "CancelTrade": "TradeCancelled",
    "CorrectTrade": "TradeAmended",
}

TRADE_EVENT_COMMAND_TYPES: dict[str, TradeCommandType] = {
    "TradeCreated": "BookTrade",
    "TradeAmended": "AmendTradeTerms",
    "TradeCancelled": "CancelTrade",
}

CORRECTABLE_TRADE_EVENT_TYPES = frozenset(TRADE_EVENT_COMMAND_TYPES.keys())


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


def append_trade_write_command(
    db: Session,
    command: TradeWriteCommand,
    *,
    commit: bool = False,
    refresh: bool = False,
) -> Event:
    event_payload = _precheck_trade_write(db, command)
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


def _precheck_trade_write(db: Session, command: TradeWriteCommand) -> Mapping[str, Any]:
    _ensure_trade_write_authorized()
    if command.command_type == "BookTrade":
        return _precheck_book_trade(db, command)
    if command.command_type == "AmendTradeTerms":
        trade = _load_existing_trade(db, command.trade_id)
        _enforce_trade_write_stale_state(trade, command)
        return _precheck_amend_trade(db, command, trade=trade)
    if command.command_type == "CancelTrade":
        trade = _load_existing_trade(db, command.trade_id)
        _enforce_trade_write_stale_state(trade, command)
        _precheck_cancel_trade(trade=trade)
        return dict(command.payload or {})
    if command.command_type == "CorrectTrade":
        _require_expected_last_event_id(command)
        trade = _load_existing_trade(db, command.trade_id)
        _enforce_trade_write_stale_state(trade, command)
        return _precheck_correct_trade(db, command, trade=trade)
    return dict(command.payload or {})


def _ensure_trade_write_authorized() -> None:
    actor_role = normalize_role(get_request_identity().role)
    if not actor_role:
        return
    if actor_role not in ALLOWED_GOVERNED_TRADE_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only TRADER, DESK_LEAD, OPS_ADMIN, or ADMIN sessions can manage governed "
                "trade writes."
            ),
        )


def _load_existing_trade(db: Session, trade_id: str) -> Trade:
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


def _enforce_trade_write_stale_state(trade: Trade, command: TradeWriteCommand) -> None:
    if not command.expected_last_event_id:
        return

    if trade.last_event_id != command.expected_last_event_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Trade {command.trade_id} stale-state check failed: expected last_event_id "
                f"{command.expected_last_event_id} but current last_event_id is {trade.last_event_id}."
            ),
        )


def _require_expected_last_event_id(command: TradeWriteCommand) -> None:
    if command.expected_last_event_id:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{command.command_type} requires expected_last_event_id",
    )


def _precheck_book_trade(db: Session, command: TradeWriteCommand) -> Mapping[str, Any]:
    existing = db.execute(select(Trade).where(Trade.trade_id == command.trade_id)).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Trade already exists")
    payload = dict(command.payload or {})
    validated = validate_book_trade_write(
        db,
        trade_id=command.trade_id,
        payload_data=payload,
        occurred_at=command.occurred_at,
        actor_id=command.actor_id or "system.command",
        checked_at=command.recorded_at,
    )
    payload["unit_of_measure"] = validated.unit_of_measure
    payload["price_unit_code"] = validated.price_unit_code
    return payload


def _precheck_correct_trade(
    db: Session,
    command: TradeWriteCommand,
    *,
    trade: Trade,
) -> Mapping[str, Any]:
    payload = dict(command.payload or {})
    correction_reason = _require_correction_text(
        payload.get("correction_reason"),
        field_name="correction_reason",
        command_type=command.command_type,
    )
    corrects_event_id = _require_correction_text(
        payload.get("corrects_event_id"),
        field_name="corrects_event_id",
        command_type=command.command_type,
    )
    corrected_event = _load_corrected_trade_event(db, command, corrects_event_id)
    if corrected_event.event_type not in CORRECTABLE_TRADE_EVENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="corrects_event_id must reference a known prior trade event",
        )

    payload["correction_reason"] = correction_reason
    payload["corrects_event_id"] = corrects_event_id
    validated = validate_amend_trade_write(
        db,
        trade=trade,
        payload_data=payload,
    )
    payload["unit_of_measure"] = validated.unit_of_measure
    payload["price_unit_code"] = validated.price_unit_code
    return payload


def _require_correction_text(
    value: object,
    *,
    field_name: str,
    command_type: TradeCommandType,
) -> str:
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is required for {command_type}",
        )
    normalized = str(value).strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is required for {command_type}",
        )
    return normalized


def _load_corrected_trade_event(
    db: Session,
    command: TradeWriteCommand,
    corrects_event_id: str,
) -> Event:
    event = (
        db.execute(
            select(Event).where(
                Event.event_id == corrects_event_id,
                Event.aggregate_type == "trade",
                Event.aggregate_id == command.trade_id,
            )
        )
        .scalars()
        .first()
    )
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trade event {corrects_event_id} was not found for trade {command.trade_id}",
        )
    return event


def _precheck_amend_trade(
    db: Session,
    command: TradeWriteCommand,
    *,
    trade: Trade,
) -> Mapping[str, Any]:
    payload = dict(command.payload or {})
    validated = validate_amend_trade_write(
        db,
        trade=trade,
        payload_data=payload,
    )
    payload["unit_of_measure"] = validated.unit_of_measure
    payload["price_unit_code"] = validated.price_unit_code
    return payload


def _precheck_cancel_trade(*, trade: Trade) -> None:
    validate_cancel_trade_write(trade)


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
