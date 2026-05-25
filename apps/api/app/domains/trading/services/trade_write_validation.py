from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
    get_trade_credit_hold_state,
)
from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
    evaluate_counterparty_credit_policy,
)
from apps.api.app.domains.reports.services.pretrade_review_drift import (
    ensure_pretrade_review_booking_alignment,
)
from apps.api.app.domains.reports.services.pretrade_reviews import parse_pretrade_review_id
from apps.api.app.domains.trading.services import trade_event_support as support
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    PaymentStatus,
    PricingStatus,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeStatus,
    TradeStructure,
)


@dataclass(frozen=True)
class ValidatedBookTradeWrite:
    pretrade_review_id: str | None
    instrument_type: str
    trade_nature: str
    trade_structure: str
    trade_side: str | None
    legs_payload: list[dict[str, object]]
    book: str
    commodity_class: str
    commodity: str
    price: float | None
    volume: float | None
    external_trade_id: str | None
    source_system: str
    execution_timestamp: datetime | None
    trade_date: date
    effective_start_date: date | None
    effective_end_date: date | None
    quality_spec: str | None
    unit_of_measure: str
    trade_currency_code: str
    location_code: str | None
    delivery_start: date | None
    delivery_end: date | None
    price_unit_code: str | None
    counterparty: str
    portfolio: str | None
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    settlement_status: str
    invoice_status: str
    payment_status: str
    trader_user: str | None
    pricing_type: str
    price_index_code: str | None
    option_type: str | None
    option_style: str | None
    option_strike_price: float | None
    option_expiration_date: date | None
    originating_option_trade_id: str | None
    requested_trade_status: str
    counterparty_credit_policy: dict[str, Any] | None


@dataclass(frozen=True)
class ValidatedAmendTradeWrite:
    instrument_type: str
    trade_nature: str
    trade_structure: str
    trade_side: str | None
    legs_payload: list[dict[str, object]] | None
    should_sync_legs: bool
    book: str
    external_trade_id: str | None
    source_system: str | None
    execution_timestamp: datetime | None
    trade_date: date | None
    effective_start_date: date | None
    effective_end_date: date | None
    quality_spec: str | None
    unit_of_measure: str | None
    trade_currency_code: str | None
    location_code: str | None
    delivery_start: date | None
    delivery_end: date | None
    price_unit_code: str | None
    commodity_class: str
    commodity: str
    pricing_type: str
    price_index_code: str | None
    price: float | None
    volume: float | None
    counterparty: str
    portfolio: str | None
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    invoice_status: str
    payment_status: str
    settlement_status: str
    trader_user: str | None
    status: str
    option_type: str | None
    option_style: str | None
    option_strike_price: float | None
    option_expiration_date: date | None
    counterparty_credit_policy: dict[str, Any] | None


def validate_book_trade_write(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
    occurred_at: datetime | None,
    actor_id: str,
    checked_at: datetime | None = None,
) -> ValidatedBookTradeWrite:
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
    book = support.require_active_book(db, payload_data.get("book"))
    commodity_class, commodity = support.require_active_commodity(
        db,
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
    pricing_type, price_index_code = support.require_active_price_index(
        db,
        payload_data.get("pricing_type"),
        payload_data.get("price_index_code"),
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
        basis_timestamp = execution_timestamp or occurred_at or checked_at or datetime.utcnow()
        trade_date = basis_timestamp.date()
    effective_start_date = support.parse_optional_date(
        payload_data.get("effective_start_date"),
        field_name="effective_start_date",
    )
    effective_end_date = support.parse_optional_date(
        payload_data.get("effective_end_date"),
        field_name="effective_end_date",
    )
    quality_spec = support.normalize_optional_text(payload_data.get("quality_spec"))
    unit_of_measure = support.resolve_trade_quantity_unit(
        db,
        payload_data.get("unit_of_measure"),
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    trade_currency_code = support.require_active_currency(
        db,
        payload_data.get("trade_currency_code"),
    )
    location_code = support.require_active_location(db, payload_data.get("location_code"))
    delivery_start = support.parse_optional_date(
        payload_data.get("delivery_start"),
        field_name="delivery_start",
    )
    delivery_end = support.parse_optional_date(
        payload_data.get("delivery_end"),
        field_name="delivery_end",
    )
    price_unit_code = support.resolve_trade_price_unit(
        db,
        payload_data.get("price_unit_code"),
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    counterparty = support.require_active_counterparty(db, payload_data.get("counterparty"))
    portfolio = support.require_active_portfolio(
        db,
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
        db,
        trade_id=trade_id,
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
        db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade_id,
            counterparty_code=counterparty,
            trade_currency_code=trade_currency_code,
            price=price,
            volume=volume,
        ),
    )
    _ensure_counterparty_credit_allowed(
        counterparty_credit_policy,
        blocked_action=(
            "Booking stays blocked until credit raises the limit or changes the breach action."
        ),
    )

    requested_trade_status = support.normalize_trade_status(payload_data.get("status"))
    if requested_trade_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Trades must be created with ACTIVE status",
        )

    if pretrade_review_id is not None:
        try:
            ensure_pretrade_review_booking_alignment(
                db,
                review_id=pretrade_review_id,
                actor_id=actor_id,
                checked_at=checked_at or occurred_at or datetime.utcnow(),
            )
        except LookupError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return ValidatedBookTradeWrite(
        pretrade_review_id=pretrade_review_id,
        instrument_type=instrument_type,
        trade_nature=trade_nature,
        trade_structure=trade_structure,
        trade_side=trade_side,
        legs_payload=legs_payload,
        book=book,
        commodity_class=commodity_class,
        commodity=commodity,
        price=price,
        volume=volume,
        external_trade_id=external_trade_id,
        source_system=source_system,
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
        counterparty=counterparty,
        portfolio=portfolio,
        pricing_status=pricing_status,
        confirmation_status=confirmation_status,
        nomination_status=nomination_status,
        allocation_status=allocation_status,
        actualization_status=actualization_status,
        settlement_status=settlement_status,
        invoice_status=invoice_status,
        payment_status=payment_status,
        trader_user=trader_user,
        pricing_type=pricing_type,
        price_index_code=price_index_code,
        option_type=option_type,
        option_style=option_style,
        option_strike_price=option_strike_price,
        option_expiration_date=option_expiration_date,
        originating_option_trade_id=originating_option_trade_id,
        requested_trade_status=requested_trade_status,
        counterparty_credit_policy=counterparty_credit_policy,
    )


def validate_amend_trade_write(
    db: Session,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> ValidatedAmendTradeWrite:
    if (
        support.normalize_instrument_type(trade.instrument_type) == TradeInstrumentType.OPTION.value
        and not support.trade_status_is_active(trade.status)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{support.normalize_trade_status(trade.status)} and cannot be amended"
            ),
        )

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
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    support.reject_actualization_projection_override(
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )
    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
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
        db,
        trade_id=trade.trade_id,
        payload_data=payload_data,
    )

    instrument_type = trade.instrument_type
    if "instrument_type" in payload_data and payload_data["instrument_type"] is not None:
        instrument_type = support.normalize_instrument_type(payload_data["instrument_type"])
    trade_nature = trade.trade_nature
    if "trade_nature" in payload_data and payload_data["trade_nature"] is not None:
        trade_nature = support.normalize_trade_nature(payload_data["trade_nature"])
    trade_structure = trade.trade_structure
    if "trade_structure" in payload_data and payload_data["trade_structure"] is not None:
        trade_structure = support.normalize_trade_structure(payload_data["trade_structure"])

    trade_side = trade.trade_side
    legs_payload: list[dict[str, object]] | None = None
    should_sync_legs = False
    if "trade_structure" in payload_data or "trade_side" in payload_data or "legs" in payload_data:
        trade_side_value = (
            payload_data.get("trade_side")
            if "trade_side" in payload_data
            else (trade.trade_side if trade_structure == TradeStructure.SINGLE.value else None)
        )
        trade_side, legs_payload = support.validate_trade_structure_payload(
            trade_structure,
            trade_side_value,
            payload_data.get("legs"),
        )
        should_sync_legs = True

    book = trade.book
    if "book" in payload_data and payload_data["book"] is not None:
        book = support.require_active_book(db, payload_data["book"])

    external_trade_id = (
        support.normalize_optional_text(payload_data.get("external_trade_id"))
        if "external_trade_id" in payload_data
        else trade.external_trade_id
    )
    source_system = (
        support.normalize_optional_text(payload_data.get("source_system"), uppercase=True)
        if "source_system" in payload_data
        else trade.source_system
    )
    execution_timestamp = (
        support.parse_execution_timestamp(payload_data.get("execution_timestamp"))
        if "execution_timestamp" in payload_data
        else trade.execution_timestamp
    )
    trade_date = (
        support.parse_optional_date(payload_data.get("trade_date"), field_name="trade_date")
        if "trade_date" in payload_data
        else trade.trade_date
    )
    effective_start_date = (
        support.parse_optional_date(
            payload_data.get("effective_start_date"),
            field_name="effective_start_date",
        )
        if "effective_start_date" in payload_data
        else trade.effective_start_date
    )
    effective_end_date = (
        support.parse_optional_date(
            payload_data.get("effective_end_date"),
            field_name="effective_end_date",
        )
        if "effective_end_date" in payload_data
        else trade.effective_end_date
    )
    quality_spec = (
        support.normalize_optional_text(payload_data.get("quality_spec"))
        if "quality_spec" in payload_data
        else trade.quality_spec
    )
    unit_of_measure_input = (
        payload_data.get("unit_of_measure")
        if "unit_of_measure" in payload_data
        else trade.unit_of_measure
    )
    trade_currency_code = (
        support.require_active_currency(db, payload_data.get("trade_currency_code"))
        if "trade_currency_code" in payload_data
        else trade.trade_currency_code
    )
    location_code = (
        support.require_active_location(db, payload_data.get("location_code"))
        if "location_code" in payload_data
        else trade.location_code
    )
    if "location_code" in payload_data:
        should_sync_legs = True
    delivery_start = (
        support.parse_optional_date(payload_data.get("delivery_start"), field_name="delivery_start")
        if "delivery_start" in payload_data
        else trade.delivery_start
    )
    if "delivery_start" in payload_data:
        should_sync_legs = True
    delivery_end = (
        support.parse_optional_date(payload_data.get("delivery_end"), field_name="delivery_end")
        if "delivery_end" in payload_data
        else trade.delivery_end
    )
    if "delivery_end" in payload_data:
        should_sync_legs = True
    price_unit_code_input = (
        payload_data.get("price_unit_code")
        if "price_unit_code" in payload_data
        else trade.price_unit_code
    )

    commodity_class = trade.commodity_class
    commodity = trade.commodity
    if (
        "commodity" in payload_data and payload_data["commodity"] is not None
    ) or (
        "commodity_class" in payload_data and payload_data["commodity_class"] is not None
    ):
        commodity_class, commodity = support.require_active_commodity(
            db,
            payload_data.get("commodity_class", trade.commodity_class),
            payload_data.get("commodity", trade.commodity),
        )
        if trade_structure == TradeStructure.SINGLE.value or legs_payload is not None:
            should_sync_legs = True

    pricing_type = trade.pricing_type
    price_index_code = trade.price_index_code
    if (
        "pricing_type" in payload_data and payload_data["pricing_type"] is not None
    ) or ("price_index_code" in payload_data):
        pricing_type, price_index_code = support.require_active_price_index(
            db,
            payload_data.get("pricing_type", trade.pricing_type),
            payload_data.get("price_index_code", trade.price_index_code),
        )

    unit_of_measure = support.resolve_trade_quantity_unit(
        db,
        unit_of_measure_input,
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )
    if unit_of_measure != trade.unit_of_measure:
        should_sync_legs = True

    price_unit_code = support.resolve_trade_price_unit(
        db,
        price_unit_code_input,
        commodity_class=commodity_class,
        commodity=commodity,
        price_index_code=price_index_code,
    )

    price = (
        support.normalize_optional_number(payload_data.get("price"), field_name="Price Differential")
        if "price" in payload_data
        else trade.price
    )
    volume = (
        support.normalize_optional_number(payload_data.get("volume"), field_name="Volume")
        if "volume" in payload_data
        else trade.volume
    )
    if "volume" in payload_data and trade_structure == TradeStructure.SINGLE.value:
        should_sync_legs = True

    if "counterparty" in payload_data:
        counterparty = support.require_active_counterparty(
            db,
            payload_data.get("counterparty"),
        )
    else:
        counterparty = support.require_active_counterparty(db, trade.counterparty)

    portfolio = trade.portfolio
    if "portfolio" in payload_data or "book" in payload_data:
        portfolio = support.require_active_portfolio(
            db,
            payload_data.get("portfolio", trade.portfolio),
            book_code=book,
        )

    pricing_status = (
        support.normalize_trade_header_status(
            payload_data.get("pricing_status"),
            default=trade.pricing_status,
            field_name="Pricing status",
            valid_values={pricing_status.value for pricing_status in PricingStatus},
        )
        if "pricing_status" in payload_data
        else trade.pricing_status
    )
    confirmation_status = (
        support.normalize_trade_header_status(
            payload_data.get("confirmation_status"),
            default=trade.confirmation_status,
            field_name="Confirmation status",
            valid_values={confirmation_status.value for confirmation_status in ConfirmationStatus},
        )
        if "confirmation_status" in payload_data
        else trade.confirmation_status
    )
    nomination_status = (
        support.normalize_trade_header_status(
            payload_data.get("nomination_status"),
            default=trade.nomination_status,
            field_name="Nomination status",
            valid_values={nomination_status.value for nomination_status in NominationStatus},
        )
        if "nomination_status" in payload_data
        else trade.nomination_status
    )
    allocation_status = (
        support.normalize_trade_header_status(
            payload_data.get("allocation_status"),
            default=trade.allocation_status,
            field_name="Allocation status",
            valid_values={allocation_status.value for allocation_status in AllocationStatus},
        )
        if "allocation_status" in payload_data
        else trade.allocation_status
    )
    actualization_status = (
        support.normalize_trade_header_status(
            payload_data.get("actualization_status"),
            default=trade.actualization_status,
            field_name="Actualization status",
            valid_values={actualization_status.value for actualization_status in ActualizationStatus},
        )
        if "actualization_status" in payload_data
        else trade.actualization_status
    )
    invoice_status = (
        support.normalize_trade_header_status(
            payload_data.get("invoice_status"),
            default=trade.invoice_status,
            field_name="Invoice status",
            valid_values={invoice_status.value for invoice_status in InvoiceStatus},
        )
        if "invoice_status" in payload_data
        else trade.invoice_status
    )
    payment_status = (
        support.normalize_trade_header_status(
            payload_data.get("payment_status"),
            default=trade.payment_status,
            field_name="Payment status",
            valid_values={payment_status.value for payment_status in PaymentStatus},
        )
        if "payment_status" in payload_data
        else trade.payment_status
    )
    settlement_status = (
        support.normalize_trade_header_status(
            payload_data.get("settlement_status"),
            default=trade.settlement_status,
            field_name="Settlement status",
            valid_values={settlement_status.value for settlement_status in SettlementStatus},
        )
        if "settlement_status" in payload_data
        else trade.settlement_status
    )
    trader_user = (
        support.normalize_optional_text(payload_data.get("trader_user"))
        if "trader_user" in payload_data
        else trade.trader_user
    )
    status_value = trade.status
    if "status" in payload_data and payload_data["status"] is not None:
        status_value = support.normalize_trade_status(payload_data["status"])
        if status_value != TradeStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Use TradeCancelled, OptionExercised, OptionExpired, or "
                    "OptionAssigned events to close a trade"
                ),
            )

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
    if "instrument_type" in payload_data and instrument_type != TradeInstrumentType.OPTION.value:
        option_type_value = payload_data.get("option_type")
        option_style_value = payload_data.get("option_style")
        option_strike_price_value = payload_data.get("option_strike_price")
        option_expiration_date_value = payload_data.get("option_expiration_date")

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
    option_type, option_style, option_strike_price, option_expiration_date = (
        support.validate_option_fields(
            instrument_type=instrument_type,
            trade_nature=trade_nature,
            trade_structure=trade_structure,
            pricing_type=pricing_type,
            option_type=option_type_value,
            option_style=option_style_value,
            option_strike_price=option_strike_price_value,
            option_expiration_date=option_expiration_date_value,
        )
    )

    counterparty_credit_policy = evaluate_counterparty_credit_policy(
        db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade.trade_id,
            counterparty_code=counterparty,
            trade_currency_code=trade_currency_code,
            price=price,
            volume=volume,
            status=trade.status,
        ),
    )
    _ensure_counterparty_credit_allowed(
        counterparty_credit_policy,
        blocked_action=(
            "Amendment stays blocked until credit raises the limit or changes the breach action."
        ),
    )

    return ValidatedAmendTradeWrite(
        instrument_type=instrument_type,
        trade_nature=trade_nature,
        trade_structure=trade_structure,
        trade_side=trade_side,
        legs_payload=legs_payload,
        should_sync_legs=should_sync_legs,
        book=book,
        external_trade_id=external_trade_id,
        source_system=source_system,
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
        commodity_class=commodity_class,
        commodity=commodity,
        pricing_type=pricing_type,
        price_index_code=price_index_code,
        price=price,
        volume=volume,
        counterparty=counterparty,
        portfolio=portfolio,
        pricing_status=pricing_status,
        confirmation_status=confirmation_status,
        nomination_status=nomination_status,
        allocation_status=allocation_status,
        actualization_status=actualization_status,
        invoice_status=invoice_status,
        payment_status=payment_status,
        settlement_status=settlement_status,
        trader_user=trader_user,
        status=status_value,
        option_type=option_type,
        option_style=option_style,
        option_strike_price=option_strike_price,
        option_expiration_date=option_expiration_date,
        counterparty_credit_policy=counterparty_credit_policy,
    )


def validate_cancel_trade_write(trade: Trade) -> None:
    if not support.trade_status_is_active(trade.status):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as "
                f"{support.normalize_trade_status(trade.status)} and cannot be cancelled"
            ),
        )


def _ensure_counterparty_credit_allowed(
    counterparty_credit_policy: dict[str, Any] | None,
    *,
    blocked_action: str,
) -> None:
    if (
        counterparty_credit_policy is not None
        and counterparty_credit_policy["limit_breached"]
        and counterparty_credit_policy["breach_action"] == "BLOCK"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{support._format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                f"{blocked_action}"
            ),
        )
