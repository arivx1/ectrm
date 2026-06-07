from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import normalize_role
from apps.api.app.core.request_context import get_request_identity
from apps.api.app.domains.trading.services.trade_command_contracts import (
    ALLOWED_GOVERNED_TRADE_WRITE_ROLES,
    TradeWriteCommand,
)
from apps.api.app.models.trade import Trade


def ensure_trade_write_authorized() -> None:
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


def load_existing_trade(db: Session, trade_id: str) -> Trade:
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


def ensure_trade_absent(db: Session, trade_id: str) -> None:
    existing = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Trade already exists")


def enforce_trade_write_stale_state(trade: Trade, command: TradeWriteCommand) -> None:
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


def require_expected_last_event_id(command: TradeWriteCommand) -> None:
    if command.expected_last_event_id:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{command.command_type} requires expected_last_event_id",
    )
