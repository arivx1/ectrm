from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pretrade_governance import (
    build_pretrade_governance_audit_export,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    build_trade_confirmation_revision_snapshot,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    ensure_trade_confirmation_draft_for_trade_capture,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    maybe_supersede_trade_confirmation_for_trade_amendment,
)
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items
from apps.api.app.domains.reports.services.pretrade_reviews import (
    REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY,
    link_approved_pretrade_review_to_trade,
    persist_review_governance_snapshot,
)
from apps.api.app.domains.accruals.services import synchronize_trade_accruals
from apps.api.app.domains.trading.services import trade_event_support as support
from apps.api.app.domains.trading.services.trade_write_validation import (
    validate_amend_trade_write,
    validate_book_trade_write,
    validate_cancel_trade_write,
)
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    OptionSettlementStatus,
    TradeStatus,
    TradeWorkflowType,
)


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
    before = support.trade_snapshot(context.db, existing)

    if context.event.event_type == "TradeCreated" and existing is not None:
        raise HTTPException(status_code=409, detail="Trade already exists")
    if (
        context.event.event_type
        in {"TradeAmended", "TradeCancelled", *support.OPTION_LIFECYCLE_EVENT_TYPES}
        and existing is None
    ):
        raise HTTPException(status_code=404, detail="Trade not found")

    if context.event.event_type == "TradeCreated":
        existing = _apply_trade_created(context, payload_data=payload_data)
    elif context.event.event_type == "TradeAmended" and existing is not None:
        _apply_trade_amended(context, trade=existing, payload_data=payload_data)
    elif context.event.event_type == "TradeCancelled" and existing is not None:
        _apply_trade_cancelled(context, trade=existing)
    elif context.event.event_type in support.OPTION_LIFECYCLE_EVENT_TYPES and existing is not None:
        _apply_option_lifecycle(context, trade=existing)

    after = support.trade_snapshot(context.db, existing)
    support.sync_positions_for_trade_change(context.db, before, after, context.recorded_at)
    support.sync_option_exposures_for_trade_change(
        context.db,
        before,
        after,
        context.recorded_at,
    )
    synchronize_trade_accruals(
        context.db,
        trade_id=context.event.aggregate_id,
        actor_id=_workflow_actor_id(context.event),
        now=context.recorded_at,
    )


def _apply_trade_created(
    context: TradeEventApplicationContext,
    *,
    payload_data: dict[str, object],
) -> Trade:
    workflow_actor_id = _workflow_actor_id(context.event)
    validated = validate_book_trade_write(
        context.db,
        trade_id=context.event.aggregate_id,
        payload_data=payload_data,
        occurred_at=context.event.occurred_at,
        actor_id=workflow_actor_id,
        checked_at=context.recorded_at,
    )

    trade = Trade(
        trade_id=context.event.aggregate_id,
        originating_option_trade_id=validated.originating_option_trade_id,
        external_trade_id=validated.external_trade_id,
        source_system=validated.source_system,
        created_at=context.recorded_at,
        updated_at=context.recorded_at,
        execution_timestamp=validated.execution_timestamp,
        trade_date=validated.trade_date,
        effective_start_date=validated.effective_start_date,
        effective_end_date=validated.effective_end_date,
        quality_spec=validated.quality_spec,
        unit_of_measure=validated.unit_of_measure,
        trade_currency_code=validated.trade_currency_code,
        location_code=validated.location_code,
        delivery_start=validated.delivery_start,
        delivery_end=validated.delivery_end,
        price_unit_code=validated.price_unit_code,
        instrument_type=validated.instrument_type,
        option_type=validated.option_type,
        option_style=validated.option_style,
        option_strike_price=validated.option_strike_price,
        option_expiration_date=validated.option_expiration_date,
        trade_nature=validated.trade_nature,
        trade_structure=validated.trade_structure,
        trade_side=validated.trade_side,
        book=validated.book,
        portfolio=validated.portfolio,
        counterparty=validated.counterparty,
        commodity_class=validated.commodity_class,
        commodity=validated.commodity,
        pricing_type=validated.pricing_type,
        pricing_status=validated.pricing_status,
        confirmation_status=validated.confirmation_status,
        nomination_status=validated.nomination_status,
        allocation_status=validated.allocation_status,
        actualization_status=validated.actualization_status,
        price_index_code=validated.price_index_code,
        price=validated.price,
        volume=validated.volume,
        invoice_status=validated.invoice_status,
        payment_status=validated.payment_status,
        settlement_status=validated.settlement_status,
        trader_user=validated.trader_user,
        status=validated.requested_trade_status,
        last_event_id=context.event.event_id,
    )
    context.db.add(trade)
    support.sync_primary_price_term(
        context.db,
        context.event.aggregate_id,
        validated.pricing_type,
        validated.price,
        validated.price_index_code,
        validated.trade_currency_code,
        validated.price_unit_code,
        context.recorded_at,
    )
    support.sync_trade_legs(
        context.db,
        context.event.aggregate_id,
        validated.trade_structure,
        validated.trade_side,
        validated.commodity_class,
        validated.commodity,
        validated.volume,
        validated.location_code,
        validated.unit_of_measure,
        validated.delivery_start,
        validated.delivery_end,
        validated.legs_payload,
        context.recorded_at,
    )
    synchronize_trade_workflow_items(
        context.db,
        trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
        rollup_settlement_status="settlement_status" not in payload_data,
    )
    support._sync_credit_approval_workflow_item(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
        policy_result=validated.counterparty_credit_policy,
    )
    ensure_trade_confirmation_draft_for_trade_capture(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
    )
    if validated.pretrade_review_id is not None:
        try:
            linked_review = link_approved_pretrade_review_to_trade(
                context.db,
                review_id=validated.pretrade_review_id,
                trade_id=trade.trade_id,
                actor_id=workflow_actor_id,
                booked_at=context.recorded_at,
            )
            persist_review_governance_snapshot(
                linked_review,
                snapshot=build_pretrade_governance_audit_export(
                    context.db,
                    actor_id=workflow_actor_id,
                    generated_at=context.recorded_at,
                ),
                snapshot_key=REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY,
                activity_action="BOOKED",
            )
        except LookupError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
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
    trade.updated_at = context.recorded_at
    trade.instrument_type = validated.instrument_type
    trade.trade_nature = validated.trade_nature
    trade.trade_structure = validated.trade_structure
    trade.trade_side = validated.trade_side
    trade.book = validated.book
    trade.external_trade_id = validated.external_trade_id
    trade.source_system = validated.source_system
    trade.execution_timestamp = validated.execution_timestamp
    trade.trade_date = validated.trade_date
    trade.effective_start_date = validated.effective_start_date
    trade.effective_end_date = validated.effective_end_date
    trade.quality_spec = validated.quality_spec
    trade.unit_of_measure = validated.unit_of_measure
    trade.trade_currency_code = validated.trade_currency_code
    trade.location_code = validated.location_code
    trade.delivery_start = validated.delivery_start
    trade.delivery_end = validated.delivery_end
    trade.price_unit_code = validated.price_unit_code
    trade.commodity_class = validated.commodity_class
    trade.commodity = validated.commodity
    trade.pricing_type = validated.pricing_type
    trade.price_index_code = validated.price_index_code
    trade.price = validated.price
    trade.volume = validated.volume
    trade.counterparty = validated.counterparty
    trade.portfolio = validated.portfolio
    trade.pricing_status = validated.pricing_status
    trade.confirmation_status = validated.confirmation_status
    trade.nomination_status = validated.nomination_status
    trade.allocation_status = validated.allocation_status
    trade.actualization_status = validated.actualization_status
    trade.invoice_status = validated.invoice_status
    trade.payment_status = validated.payment_status
    trade.settlement_status = validated.settlement_status
    trade.trader_user = validated.trader_user
    trade.status = validated.status
    trade.option_type = validated.option_type
    trade.option_style = validated.option_style
    trade.option_strike_price = validated.option_strike_price
    trade.option_expiration_date = validated.option_expiration_date
    trade.last_event_id = context.event.event_id
    support.sync_primary_price_term(
        context.db,
        context.event.aggregate_id,
        trade.pricing_type,
        trade.price,
        trade.price_index_code,
        trade.trade_currency_code,
        trade.price_unit_code,
        context.recorded_at,
    )
    if validated.should_sync_legs:
        support.sync_trade_legs(
            context.db,
            context.event.aggregate_id,
            validated.trade_structure,
            validated.trade_side,
            validated.commodity_class,
            validated.commodity,
            validated.volume,
            validated.location_code,
            validated.unit_of_measure,
            validated.delivery_start,
            validated.delivery_end,
            validated.legs_payload or [],
            context.recorded_at,
        )
    workflow_actor_id = _workflow_actor_id(context.event)
    synchronize_trade_workflow_items(
        context.db,
        trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
        rollup_settlement_status=(
            "settlement_status" not in payload_data
            and bool({"invoice_status", "payment_status"} & set(payload_data))
        ),
    )
    support._sync_credit_approval_workflow_item(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
        policy_result=validated.counterparty_credit_policy,
    )
    maybe_supersede_trade_confirmation_for_trade_amendment(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
        before_revision_snapshot=before_confirmation_revision,
    )


def _apply_trade_cancelled(
    context: TradeEventApplicationContext,
    *,
    trade: Trade,
) -> None:
    validate_cancel_trade_write(trade)
    trade.updated_at = context.recorded_at
    trade.status = TradeStatus.CANCELLED.value
    trade.last_event_id = context.event.event_id


def _apply_option_lifecycle(
    context: TradeEventApplicationContext,
    *,
    trade: Trade,
) -> None:
    trade.updated_at = context.recorded_at
    trade.status = support.validate_option_lifecycle_transition(
        trade,
        event_type=context.event.event_type,
        occurred_at=context.event.occurred_at,
    )
    trade.last_event_id = context.event.event_id
    if trade.status in {TradeStatus.EXERCISED.value, TradeStatus.ASSIGNED.value}:
        create_trade_workflow_item(
            context.db,
            trade_id=trade.trade_id,
            workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
            actor_id=_workflow_actor_id(context.event),
            enforce_credit_authorization=False,
            status=OptionSettlementStatus.PENDING.value,
            now=context.recorded_at,
        )


def _workflow_actor_id(event: Event) -> str:
    return event.actor_id or "system.event"
