from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_confirmations import (
    build_trade_confirmation_revision_snapshot,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    ensure_trade_confirmation_draft_for_trade_capture,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    maybe_supersede_trade_confirmation_for_trade_amendment,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items
from apps.api.app.domains.reports.services.pretrade_reviews import (
    link_approved_pretrade_review_to_trade,
    parse_pretrade_review_id,
)
from apps.api.app.domains.accruals.services import synchronize_trade_accruals
from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
    evaluate_counterparty_credit_policy,
)
from apps.api.app.domains.trading.services import trade_event_support as support
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    OptionSettlementStatus,
    PaymentStatus,
    PricingStatus,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeStatus,
    TradeStructure,
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
    try:
        pretrade_review_id = parse_pretrade_review_id(payload_data.get("pretrade_review_id"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    instrument_type = support.normalize_instrument_type(payload_data.get("instrument_type"))
    trade_nature_value = payload_data.get("trade_nature")
    if instrument_type == TradeInstrumentType.OPTION.value and trade_nature_value in {None, ""}:
        trade_nature_value = TradeNature.FINANCIAL.value
    trade_nature = support.normalize_trade_nature(trade_nature_value)
    workflow_defaults = support.default_trade_workflow_statuses(trade_nature)
    trade_structure = support.normalize_trade_structure(payload_data.get("trade_structure"))
    trade_side, legs_payload = support.validate_trade_structure_payload(
        trade_structure,
        payload_data.get("trade_side"),
        payload_data.get("legs"),
    )
    book = support.require_active_book(context.db, payload_data.get("book"))
    commodity_class, commodity = support.require_active_commodity(
        context.db,
        payload_data.get("commodity_class"),
        payload_data.get("commodity"),
    )
    price = support.normalize_optional_number(
        payload_data.get("price"),
        field_name="Price Differential",
    )
    volume = support.normalize_optional_number(
        payload_data.get("volume"),
        field_name="Volume",
    )
    external_trade_id = support.normalize_optional_text(payload_data.get("external_trade_id"))
    source_system = (
        support.normalize_optional_text(payload_data.get("source_system"), uppercase=True)
        or support.DEFAULT_SOURCE_SYSTEM
    )
    execution_timestamp = support.parse_execution_timestamp(payload_data.get("execution_timestamp"))
    trade_date = support.parse_optional_date(
        payload_data.get("trade_date"),
        field_name="trade_date",
    )
    if trade_date is None:
        trade_date = (execution_timestamp or context.event.occurred_at).date()
    effective_start_date = support.parse_optional_date(
        payload_data.get("effective_start_date"),
        field_name="effective_start_date",
    )
    effective_end_date = support.parse_optional_date(
        payload_data.get("effective_end_date"),
        field_name="effective_end_date",
    )
    quality_spec = support.normalize_optional_text(payload_data.get("quality_spec"))
    unit_of_measure = support.require_active_unit(context.db, payload_data.get("unit_of_measure"))
    trade_currency_code = support.require_active_currency(
        context.db,
        payload_data.get("trade_currency_code"),
    )
    location_code = support.require_active_location(context.db, payload_data.get("location_code"))
    delivery_start = support.parse_optional_date(
        payload_data.get("delivery_start"),
        field_name="delivery_start",
    )
    delivery_end = support.parse_optional_date(
        payload_data.get("delivery_end"),
        field_name="delivery_end",
    )
    price_unit_code = support.require_active_unit(context.db, payload_data.get("price_unit_code"))
    counterparty = support.require_active_counterparty(
        context.db,
        payload_data.get("counterparty"),
    )
    portfolio = support.require_active_portfolio(
        context.db,
        payload_data.get("portfolio"),
        book_code=book,
    )
    pricing_status = support.normalize_trade_header_status(
        payload_data.get("pricing_status"),
        default="PENDING",
        field_name="Pricing status",
        valid_values={pricing_status.value for pricing_status in PricingStatus},
    )
    confirmation_status = support.normalize_trade_header_status(
        payload_data.get("confirmation_status"),
        default=workflow_defaults["confirmation_status"],
        field_name="Confirmation status",
        valid_values={confirmation_status.value for confirmation_status in ConfirmationStatus},
    )
    nomination_status = support.normalize_trade_header_status(
        payload_data.get("nomination_status"),
        default=workflow_defaults["nomination_status"],
        field_name="Nomination status",
        valid_values={nomination_status.value for nomination_status in NominationStatus},
    )
    allocation_status = support.normalize_trade_header_status(
        payload_data.get("allocation_status"),
        default=workflow_defaults["allocation_status"],
        field_name="Allocation status",
        valid_values={allocation_status.value for allocation_status in AllocationStatus},
    )
    actualization_status = support.normalize_trade_header_status(
        payload_data.get("actualization_status"),
        default=workflow_defaults["actualization_status"],
        field_name="Actualization status",
        valid_values={actualization_status.value for actualization_status in ActualizationStatus},
    )
    settlement_status = support.normalize_trade_header_status(
        payload_data.get("settlement_status"),
        default="PENDING",
        field_name="Settlement status",
        valid_values={settlement_status.value for settlement_status in SettlementStatus},
    )
    invoice_status = support.normalize_trade_header_status(
        payload_data.get("invoice_status"),
        default=workflow_defaults["invoice_status"],
        field_name="Invoice status",
        valid_values={invoice_status.value for invoice_status in InvoiceStatus},
    )
    payment_status = support.normalize_trade_header_status(
        payload_data.get("payment_status"),
        default=workflow_defaults["payment_status"],
        field_name="Payment status",
        valid_values={payment_status.value for payment_status in PaymentStatus},
    )
    trader_user = support.normalize_optional_text(payload_data.get("trader_user"))
    pricing_type, price_index_code = support.require_active_price_index(
        context.db,
        payload_data.get("pricing_type"),
        payload_data.get("price_index_code"),
    )
    option_type, option_style, option_strike_price, option_expiration_date = (
        support.validate_option_fields(
            instrument_type=instrument_type,
            trade_nature=trade_nature,
            trade_structure=trade_structure,
            pricing_type=pricing_type,
            option_type=payload_data.get("option_type"),
            option_style=payload_data.get("option_style"),
            option_strike_price=payload_data.get("option_strike_price"),
            option_expiration_date=payload_data.get("option_expiration_date"),
        )
    )
    originating_option_trade_id = support.validate_originating_option_trade_reference(
        context.db,
        trade_id=context.event.aggregate_id,
        instrument_type=instrument_type,
        originating_option_trade_id=payload_data.get("originating_option_trade_id"),
    )
    support.validate_date_range(
        effective_start_date,
        effective_end_date,
        start_field="effective_start_date",
        end_field="effective_end_date",
    )
    support.validate_date_range(
        delivery_start,
        delivery_end,
        start_field="delivery_start",
        end_field="delivery_end",
    )
    support.validate_trade_measurements(
        trade_structure=trade_structure,
        pricing_type=pricing_type,
        price=price,
        volume=volume,
    )
    counterparty_credit_policy = evaluate_counterparty_credit_policy(
        context.db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=context.event.aggregate_id,
            counterparty_code=counterparty,
            trade_currency_code=trade_currency_code,
            price=price,
            volume=volume,
        ),
    )
    if (
        counterparty_credit_policy is not None
        and counterparty_credit_policy["limit_breached"]
        and counterparty_credit_policy["breach_action"] == "BLOCK"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{support._format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                "Booking stays blocked until credit raises the limit or changes the breach action."
            ),
        )

    requested_trade_status = support.normalize_trade_status(payload_data.get("status"))
    if requested_trade_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Trades must be created with ACTIVE status",
        )

    trade = Trade(
        trade_id=context.event.aggregate_id,
        originating_option_trade_id=originating_option_trade_id,
        external_trade_id=external_trade_id,
        source_system=source_system,
        created_at=context.recorded_at,
        updated_at=context.recorded_at,
        execution_timestamp=execution_timestamp,
        trade_date=trade_date,
        effective_start_date=effective_start_date,
        effective_end_date=effective_end_date,
        quality_spec=quality_spec,
        unit_of_measure=unit_of_measure,
        trade_currency_code=trade_currency_code,
        location_code=location_code,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        price_unit_code=price_unit_code,
        instrument_type=instrument_type,
        option_type=option_type,
        option_style=option_style,
        option_strike_price=option_strike_price,
        option_expiration_date=option_expiration_date,
        trade_nature=trade_nature,
        trade_structure=trade_structure,
        trade_side=trade_side,
        book=book,
        portfolio=portfolio,
        counterparty=counterparty,
        commodity_class=commodity_class,
        commodity=commodity,
        pricing_type=pricing_type,
        pricing_status=pricing_status,
        confirmation_status=confirmation_status,
        nomination_status=nomination_status,
        allocation_status=allocation_status,
        actualization_status=actualization_status,
        price_index_code=price_index_code,
        price=price,
        volume=volume,
        invoice_status=invoice_status,
        payment_status=payment_status,
        settlement_status=settlement_status,
        trader_user=trader_user,
        status=requested_trade_status,
        last_event_id=context.event.event_id,
    )
    context.db.add(trade)
    support.sync_primary_price_term(
        context.db,
        context.event.aggregate_id,
        pricing_type,
        price,
        price_index_code,
        trade_currency_code,
        price_unit_code,
        context.recorded_at,
    )
    support.sync_trade_legs(
        context.db,
        context.event.aggregate_id,
        trade_structure,
        trade_side,
        commodity_class,
        commodity,
        volume,
        location_code,
        unit_of_measure,
        delivery_start,
        delivery_end,
        legs_payload,
        context.recorded_at,
    )
    workflow_actor_id = _workflow_actor_id(context.event)
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
        policy_result=counterparty_credit_policy,
    )
    ensure_trade_confirmation_draft_for_trade_capture(
        context.db,
        trade=trade,
        actor_id=workflow_actor_id,
        now=context.recorded_at,
    )
    if pretrade_review_id is not None:
        try:
            link_approved_pretrade_review_to_trade(
                context.db,
                review_id=pretrade_review_id,
                trade_id=trade.trade_id,
                actor_id=workflow_actor_id,
                booked_at=context.recorded_at,
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
    if (
        support.normalize_instrument_type(trade.instrument_type)
        == TradeInstrumentType.OPTION.value
        and not support.trade_status_is_active(trade.status)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{support.normalize_trade_status(trade.status)} and cannot be amended"
            ),
        )
    trade.updated_at = context.recorded_at
    if "originating_option_trade_id" in payload_data:
        requested_originating_trade_id = support.normalize_optional_text(
            payload_data.get("originating_option_trade_id")
        )
        if requested_originating_trade_id != trade.originating_option_trade_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="originating_option_trade_id is immutable and can only be set when the trade is created",
            )
    if trade.originating_option_trade_id is not None and "instrument_type" in payload_data:
        requested_instrument_type = support.normalize_instrument_type(payload_data.get("instrument_type"))
        if requested_instrument_type != TradeInstrumentType.LINEAR.value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Trades linked from an originating_option_trade_id must remain LINEAR instruments",
            )
    support.reject_invoice_projection_override(
        context.db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    support.reject_actualization_projection_override(
        context.db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    credit_hold_state = get_trade_credit_hold_state(context.db, trade_id=trade.trade_id)
    blocked_fields = (
        support._requested_credit_hold_blocked_fields(trade, payload_data)
        if credit_hold_state.hold_active
        else []
    )
    if blocked_fields:
        field_summary = ", ".join(blocked_fields)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=format_trade_credit_hold_message(
                trade.trade_id,
                credit_hold_state,
                blocked_action=(
                    f"Changing {field_summary} lifecycle status is blocked until credit approves "
                    "the trade or the trade is amended back within limit."
                ),
            ),
        )
    support.reject_confirmation_projection_override(
        context.db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )

    legs_payload: list[dict[str, object]] | None = None
    should_sync_legs = False
    if "instrument_type" in payload_data and payload_data["instrument_type"] is not None:
        trade.instrument_type = support.normalize_instrument_type(payload_data["instrument_type"])
    if "trade_nature" in payload_data and payload_data["trade_nature"] is not None:
        trade.trade_nature = support.normalize_trade_nature(payload_data["trade_nature"])
    if "trade_structure" in payload_data and payload_data["trade_structure"] is not None:
        trade.trade_structure = support.normalize_trade_structure(payload_data["trade_structure"])
    if "trade_structure" in payload_data or "trade_side" in payload_data or "legs" in payload_data:
        trade_side_value = (
            payload_data.get("trade_side")
            if "trade_side" in payload_data
            else (trade.trade_side if trade.trade_structure == TradeStructure.SINGLE.value else None)
        )
        normalized_trade_side, legs_payload = support.validate_trade_structure_payload(
            trade.trade_structure,
            trade_side_value,
            payload_data.get("legs"),
        )
        trade.trade_side = normalized_trade_side
        should_sync_legs = True
    if "book" in payload_data and payload_data["book"] is not None:
        trade.book = support.require_active_book(context.db, payload_data["book"])
    if "external_trade_id" in payload_data:
        trade.external_trade_id = support.normalize_optional_text(
            payload_data.get("external_trade_id")
        )
    if "source_system" in payload_data:
        trade.source_system = support.normalize_optional_text(
            payload_data.get("source_system"),
            uppercase=True,
        )
    if "execution_timestamp" in payload_data:
        trade.execution_timestamp = support.parse_execution_timestamp(
            payload_data.get("execution_timestamp")
        )
    if "trade_date" in payload_data:
        trade.trade_date = support.parse_optional_date(
            payload_data.get("trade_date"),
            field_name="trade_date",
        )
    if "effective_start_date" in payload_data:
        trade.effective_start_date = support.parse_optional_date(
            payload_data.get("effective_start_date"),
            field_name="effective_start_date",
        )
    if "effective_end_date" in payload_data:
        trade.effective_end_date = support.parse_optional_date(
            payload_data.get("effective_end_date"),
            field_name="effective_end_date",
        )
    if "quality_spec" in payload_data:
        trade.quality_spec = support.normalize_optional_text(payload_data.get("quality_spec"))
    if "unit_of_measure" in payload_data:
        trade.unit_of_measure = support.require_active_unit(
            context.db,
            payload_data.get("unit_of_measure"),
        )
        should_sync_legs = True
    if "trade_currency_code" in payload_data:
        trade.trade_currency_code = support.require_active_currency(
            context.db,
            payload_data.get("trade_currency_code"),
        )
    if "location_code" in payload_data:
        trade.location_code = support.require_active_location(
            context.db,
            payload_data.get("location_code"),
        )
        should_sync_legs = True
    if "delivery_start" in payload_data:
        trade.delivery_start = support.parse_optional_date(
            payload_data.get("delivery_start"),
            field_name="delivery_start",
        )
        should_sync_legs = True
    if "delivery_end" in payload_data:
        trade.delivery_end = support.parse_optional_date(
            payload_data.get("delivery_end"),
            field_name="delivery_end",
        )
        should_sync_legs = True
    if "price_unit_code" in payload_data:
        trade.price_unit_code = support.require_active_unit(
            context.db,
            payload_data.get("price_unit_code"),
        )
    if (
        "commodity" in payload_data and payload_data["commodity"] is not None
    ) or (
        "commodity_class" in payload_data and payload_data["commodity_class"] is not None
    ):
        commodity_class, commodity = support.require_active_commodity(
            context.db,
            payload_data.get("commodity_class", trade.commodity_class),
            payload_data.get("commodity", trade.commodity),
        )
        trade.commodity_class = commodity_class
        trade.commodity = commodity
        if trade.trade_structure == TradeStructure.SINGLE.value or legs_payload is not None:
            should_sync_legs = True
    if (
        "pricing_type" in payload_data and payload_data["pricing_type"] is not None
    ) or ("price_index_code" in payload_data):
        pricing_type, price_index_code = support.require_active_price_index(
            context.db,
            payload_data.get("pricing_type", trade.pricing_type),
            payload_data.get("price_index_code", trade.price_index_code),
        )
        trade.pricing_type = pricing_type
        trade.price_index_code = price_index_code
    if "price" in payload_data:
        trade.price = support.normalize_optional_number(
            payload_data.get("price"),
            field_name="Price Differential",
        )
    if "volume" in payload_data:
        trade.volume = support.normalize_optional_number(
            payload_data.get("volume"),
            field_name="Volume",
        )
        if trade.trade_structure == TradeStructure.SINGLE.value:
            should_sync_legs = True
    if "counterparty" in payload_data:
        trade.counterparty = support.require_active_counterparty(
            context.db,
            payload_data.get("counterparty"),
        )
    else:
        trade.counterparty = support.require_active_counterparty(
            context.db,
            trade.counterparty,
        )
    if "portfolio" in payload_data or "book" in payload_data:
        trade.portfolio = support.require_active_portfolio(
            context.db,
            payload_data.get("portfolio", trade.portfolio),
            book_code=trade.book,
        )
    if "pricing_status" in payload_data:
        trade.pricing_status = support.normalize_trade_header_status(
            payload_data.get("pricing_status"),
            default=trade.pricing_status,
            field_name="Pricing status",
            valid_values={pricing_status.value for pricing_status in PricingStatus},
        )
    if "confirmation_status" in payload_data:
        trade.confirmation_status = support.normalize_trade_header_status(
            payload_data.get("confirmation_status"),
            default=trade.confirmation_status,
            field_name="Confirmation status",
            valid_values={confirmation_status.value for confirmation_status in ConfirmationStatus},
        )
    if "nomination_status" in payload_data:
        trade.nomination_status = support.normalize_trade_header_status(
            payload_data.get("nomination_status"),
            default=trade.nomination_status,
            field_name="Nomination status",
            valid_values={nomination_status.value for nomination_status in NominationStatus},
        )
    if "allocation_status" in payload_data:
        trade.allocation_status = support.normalize_trade_header_status(
            payload_data.get("allocation_status"),
            default=trade.allocation_status,
            field_name="Allocation status",
            valid_values={allocation_status.value for allocation_status in AllocationStatus},
        )
    if "actualization_status" in payload_data:
        trade.actualization_status = support.normalize_trade_header_status(
            payload_data.get("actualization_status"),
            default=trade.actualization_status,
            field_name="Actualization status",
            valid_values={actualization_status.value for actualization_status in ActualizationStatus},
        )
    if "invoice_status" in payload_data:
        trade.invoice_status = support.normalize_trade_header_status(
            payload_data.get("invoice_status"),
            default=trade.invoice_status,
            field_name="Invoice status",
            valid_values={invoice_status.value for invoice_status in InvoiceStatus},
        )
    if "payment_status" in payload_data:
        trade.payment_status = support.normalize_trade_header_status(
            payload_data.get("payment_status"),
            default=trade.payment_status,
            field_name="Payment status",
            valid_values={payment_status.value for payment_status in PaymentStatus},
        )
    if "settlement_status" in payload_data:
        trade.settlement_status = support.normalize_trade_header_status(
            payload_data.get("settlement_status"),
            default=trade.settlement_status,
            field_name="Settlement status",
            valid_values={settlement_status.value for settlement_status in SettlementStatus},
        )
    if "trader_user" in payload_data:
        trade.trader_user = support.normalize_optional_text(payload_data.get("trader_user"))
    if "status" in payload_data and payload_data["status"] is not None:
        next_status = support.normalize_trade_status(payload_data["status"])
        if next_status != TradeStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Use TradeCancelled, OptionExercised, OptionExpired, or "
                    "OptionAssigned events to close a trade"
                ),
            )
        trade.status = next_status

    option_type_value = trade.option_type
    if "option_type" in payload_data:
        option_type_value = payload_data.get("option_type")
    option_style_value = trade.option_style
    if "option_style" in payload_data:
        option_style_value = payload_data.get("option_style")
    option_strike_price_value = trade.option_strike_price
    if "option_strike_price" in payload_data:
        option_strike_price_value = payload_data.get("option_strike_price")
    option_expiration_date_value = trade.option_expiration_date
    if "option_expiration_date" in payload_data:
        option_expiration_date_value = payload_data.get("option_expiration_date")
    if "instrument_type" in payload_data and trade.instrument_type != TradeInstrumentType.OPTION.value:
        option_type_value = payload_data.get("option_type")
        option_style_value = payload_data.get("option_style")
        option_strike_price_value = payload_data.get("option_strike_price")
        option_expiration_date_value = payload_data.get("option_expiration_date")

    support.validate_date_range(
        trade.effective_start_date,
        trade.effective_end_date,
        start_field="effective_start_date",
        end_field="effective_end_date",
    )
    support.validate_date_range(
        trade.delivery_start,
        trade.delivery_end,
        start_field="delivery_start",
        end_field="delivery_end",
    )
    support.validate_trade_measurements(
        trade_structure=trade.trade_structure,
        pricing_type=trade.pricing_type,
        price=trade.price,
        volume=trade.volume,
    )
    (
        trade.option_type,
        trade.option_style,
        trade.option_strike_price,
        trade.option_expiration_date,
    ) = support.validate_option_fields(
        instrument_type=trade.instrument_type,
        trade_nature=trade.trade_nature,
        trade_structure=trade.trade_structure,
        pricing_type=trade.pricing_type,
        option_type=option_type_value,
        option_style=option_style_value,
        option_strike_price=option_strike_price_value,
        option_expiration_date=option_expiration_date_value,
    )
    counterparty_credit_policy = evaluate_counterparty_credit_policy(
        context.db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade.trade_id,
            counterparty_code=trade.counterparty,
            trade_currency_code=trade.trade_currency_code,
            price=trade.price,
            volume=trade.volume,
            status=trade.status,
        ),
    )
    if (
        counterparty_credit_policy is not None
        and counterparty_credit_policy["limit_breached"]
        and counterparty_credit_policy["breach_action"] == "BLOCK"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{support._format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                "Amendment stays blocked until credit raises the limit or changes the breach action."
            ),
        )
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
    if should_sync_legs:
        support.sync_trade_legs(
            context.db,
            context.event.aggregate_id,
            trade.trade_structure,
            trade.trade_side,
            trade.commodity_class,
            trade.commodity,
            trade.volume,
            trade.location_code,
            trade.unit_of_measure,
            trade.delivery_start,
            trade.delivery_end,
            legs_payload or [],
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
        policy_result=counterparty_credit_policy,
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
    if not support.trade_status_is_active(trade.status):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{support.normalize_trade_status(trade.status)} and cannot be cancelled"
            ),
        )
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
