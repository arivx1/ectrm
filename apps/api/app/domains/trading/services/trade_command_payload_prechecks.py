from __future__ import annotations

from typing import Any, Mapping

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_amend_validation import validate_amend_trade_write
from apps.api.app.domains.trading.services.trade_book_validation import validate_book_trade_write
from apps.api.app.domains.trading.services.trade_cancel_validation import validate_cancel_trade_write
from apps.api.app.domains.trading.services.trade_command_contracts import (
    CORRECTABLE_TRADE_EVENT_TYPES,
    TradeCommandType,
    TradeWriteCommand,
)
from apps.api.app.domains.trading.services.trade_command_guards import ensure_trade_absent
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


def precheck_book_trade(db: Session, command: TradeWriteCommand) -> Mapping[str, Any]:
    ensure_trade_absent(db, command.trade_id)
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


def precheck_amend_trade(
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


def precheck_cancel_trade(
    command: TradeWriteCommand,
    *,
    trade: Trade,
) -> Mapping[str, Any]:
    validate_cancel_trade_write(trade)
    return dict(command.payload or {})


def precheck_correct_trade(
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
