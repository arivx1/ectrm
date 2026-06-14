from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_confirmations import (
    build_trade_confirmation_revision_snapshot,
)
from apps.api.app.domains.trading.services.trade_event_side_effects import (
    sync_trade_event_side_effects,
    workflow_actor_id,
)
from apps.api.app.domains.trading.services.trade_event_workflow_effects import (
    sync_option_settlement_workflow,
    sync_trade_amended_workflows,
    sync_trade_created_workflows,
)
from apps.api.app.domains.trading.services.trade_option_validation import (
    OPTION_LIFECYCLE_EVENT_TYPES,
)
from apps.api.app.domains.trading.services.trade_position_projection import (
    trade_snapshot,
)
from apps.api.app.domains.trading.services.trade_record_mutation import (
    apply_amend_validation_to_trade,
    apply_cancel_event_to_trade,
    apply_option_lifecycle_event_to_trade,
    build_trade_from_book_validation,
)
from apps.api.app.domains.trading.services.trade_event_term_sync import (
    sync_amended_trade_terms,
    sync_booked_trade_terms,
)
from apps.api.app.domains.trading.services.trade_amend_validation import validate_amend_trade_write
from apps.api.app.domains.trading.services.trade_book_validation import validate_book_trade_write
from apps.api.app.domains.trading.services.trade_cancel_validation import validate_cancel_trade_write
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


@dataclass(frozen=True)
class TradeEventApplicationContext:
    db: Session
    event: Event
    recorded_at: datetime


def apply_trade_event(context: TradeEventApplicationContext) -> None:
    payload_data = context.event.payload or {}
    existing = context.db.execute(
        select(Trade).where(Trade.trade_id == context.event.aggregate_id)
    ).scalars().first()
    before = trade_snapshot(context.db, existing)

    if context.event.event_type == "TradeCreated" and existing is not None:
        raise HTTPException(status_code=409, detail="Trade already exists")
    if (
        context.event.event_type
        in {"TradeAmended", "TradeCancelled", *OPTION_LIFECYCLE_EVENT_TYPES}
        and existing is None
    ):
        raise HTTPException(status_code=404, detail="Trade not found")

    if context.event.event_type == "TradeCreated":
        existing = _apply_trade_created(context, payload_data=payload_data)
    elif context.event.event_type == "TradeAmended" and existing is not None:
        _apply_trade_amended(context, trade=existing, payload_data=payload_data)
    elif context.event.event_type == "TradeCancelled" and existing is not None:
        _apply_trade_cancelled(context, trade=existing)
    elif context.event.event_type in OPTION_LIFECYCLE_EVENT_TYPES and existing is not None:
        _apply_option_lifecycle(context, trade=existing)

    after = trade_snapshot(context.db, existing)
    sync_trade_event_side_effects(
        context.db,
        event=context.event,
        recorded_at=context.recorded_at,
        before_snapshot=before,
        after_snapshot=after,
    )


def _apply_trade_created(
    context: TradeEventApplicationContext,
    *,
    payload_data: dict[str, object],
) -> Trade:
    actor_id = workflow_actor_id(context.event)
    validated = validate_book_trade_write(
        context.db,
        trade_id=context.event.aggregate_id,
        payload_data=payload_data,
        occurred_at=context.event.occurred_at,
        actor_id=actor_id,
        checked_at=context.recorded_at,
    )

    trade = build_trade_from_book_validation(
        event=context.event,
        recorded_at=context.recorded_at,
        validated=validated,
    )
    context.db.add(trade)
    sync_booked_trade_terms(
        context.db,
        event=context.event,
        validated=validated,
        recorded_at=context.recorded_at,
    )
    sync_trade_created_workflows(
        context.db,
        trade=trade,
        validated=validated,
        payload_data=payload_data,
        actor_id=actor_id,
        recorded_at=context.recorded_at,
    )
    return trade


def _apply_trade_amended(
    context: TradeEventApplicationContext,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> None:
    before_confirmation_revision = build_trade_confirmation_revision_snapshot(context.db, trade=trade)
    validated = validate_amend_trade_write(
        context.db,
        trade=trade,
        payload_data=payload_data,
    )
    apply_amend_validation_to_trade(
        trade=trade,
        event=context.event,
        recorded_at=context.recorded_at,
        validated=validated,
    )
    sync_amended_trade_terms(
        context.db,
        event=context.event,
        trade=trade,
        validated=validated,
        recorded_at=context.recorded_at,
    )
    actor_id = workflow_actor_id(context.event)
    sync_trade_amended_workflows(
        context.db,
        trade=trade,
        validated=validated,
        payload_data=payload_data,
        actor_id=actor_id,
        recorded_at=context.recorded_at,
        before_confirmation_revision=before_confirmation_revision,
    )


def _apply_trade_cancelled(
    context: TradeEventApplicationContext,
    *,
    trade: Trade,
) -> None:
    validate_cancel_trade_write(trade)
    apply_cancel_event_to_trade(
        trade=trade,
        event=context.event,
        recorded_at=context.recorded_at,
    )


def _apply_option_lifecycle(
    context: TradeEventApplicationContext,
    *,
    trade: Trade,
) -> None:
    apply_option_lifecycle_event_to_trade(
        trade=trade,
        event=context.event,
        recorded_at=context.recorded_at,
    )
    sync_option_settlement_workflow(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id(context.event),
        recorded_at=context.recorded_at,
    )
