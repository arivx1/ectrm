from __future__ import annotations

from datetime import datetime

from apps.api.app.domains.trading.services.trade_option_validation import (
    validate_option_lifecycle_transition,
)
from apps.api.app.domains.trading.services.trade_write_contracts import (
    ValidatedAmendTradeWrite,
    ValidatedBookTradeWrite,
)
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import TradeStatus


def build_trade_from_book_validation(
    *,
    event: Event,
    recorded_at: datetime,
    validated: ValidatedBookTradeWrite,
) -> Trade:
    return Trade(
        trade_id=event.aggregate_id,
        originating_option_trade_id=validated.originating_option_trade_id,
        external_trade_id=validated.external_trade_id,
        source_system=validated.source_system,
        created_at=recorded_at,
        updated_at=recorded_at,
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
        last_event_id=event.event_id,
    )


def apply_amend_validation_to_trade(
    *,
    trade: Trade,
    event: Event,
    recorded_at: datetime,
    validated: ValidatedAmendTradeWrite,
) -> None:
    trade.updated_at = recorded_at
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
    trade.last_event_id = event.event_id


def apply_cancel_event_to_trade(
    *,
    trade: Trade,
    event: Event,
    recorded_at: datetime,
) -> None:
    trade.updated_at = recorded_at
    trade.status = TradeStatus.CANCELLED.value
    trade.last_event_id = event.event_id


def apply_option_lifecycle_event_to_trade(
    *,
    trade: Trade,
    event: Event,
    recorded_at: datetime,
) -> None:
    trade.updated_at = recorded_at
    trade.status = validate_option_lifecycle_transition(
        trade,
        event_type=event.event_type,
        occurred_at=event.occurred_at,
    )
    trade.last_event_id = event.event_id
