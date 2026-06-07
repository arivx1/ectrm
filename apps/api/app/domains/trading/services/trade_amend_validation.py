from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_credit_write_validation import (
    validate_amend_trade_counterparty_credit,
)
from apps.api.app.domains.trading.services.trade_write_contracts import ValidatedAmendTradeWrite
from apps.api.app.domains.trading.services.trade_amend_field_resolution import (
    resolve_amend_trade_fields,
)
from apps.api.app.domains.trading.services.trade_amend_guards import enforce_amend_trade_guards
from apps.api.app.domains.trading.services.trade_option_validation import validate_option_fields
from apps.api.app.domains.trading.services.trade_write_rules import (
    validate_trade_date_ranges,
    validate_trade_measurements,
)
from apps.api.app.domains.trading.services.trade_workflow_status_validation import (
    normalize_amend_trade_workflow_statuses,
)
from apps.api.app.domains.trading.services.trade_status_write_validation import (
    resolve_amend_trade_status,
)
from apps.api.app.models.trade import Trade


def validate_amend_trade_write(
    db: Session,
    *,
    trade: Trade,
    payload_data: dict[str, object],
) -> ValidatedAmendTradeWrite:
    enforce_amend_trade_guards(
        db,
        trade=trade,
        payload_data=payload_data,
    )
    resolved = resolve_amend_trade_fields(
        db,
        trade=trade,
        payload_data=payload_data,
    )

    workflow_statuses = normalize_amend_trade_workflow_statuses(
        payload_data,
        trade=trade,
    )
    status_value = resolve_amend_trade_status(trade.status, payload_data)

    validate_trade_date_ranges(
        effective_start_date=resolved.effective_start_date,
        effective_end_date=resolved.effective_end_date,
        delivery_start=resolved.delivery_start,
        delivery_end=resolved.delivery_end,
    )
    validate_trade_measurements(
        trade_structure=resolved.trade_structure,
        pricing_type=resolved.pricing_type,
        price=resolved.price,
        volume=resolved.volume,
    )
    option_type, option_style, option_strike_price, option_expiration_date = (
        validate_option_fields(
            instrument_type=resolved.instrument_type,
            trade_nature=resolved.trade_nature,
            trade_structure=resolved.trade_structure,
            pricing_type=resolved.pricing_type,
            option_type=resolved.option_type_value,
            option_style=resolved.option_style_value,
            option_strike_price=resolved.option_strike_price_value,
            option_expiration_date=resolved.option_expiration_date_value,
        )
    )

    counterparty_credit_policy = validate_amend_trade_counterparty_credit(
        db,
        trade_id=trade.trade_id,
        counterparty_code=resolved.counterparty,
        trade_currency_code=resolved.trade_currency_code,
        price=resolved.price,
        volume=resolved.volume,
        status=trade.status,
    )

    return ValidatedAmendTradeWrite(
        instrument_type=resolved.instrument_type,
        trade_nature=resolved.trade_nature,
        trade_structure=resolved.trade_structure,
        trade_side=resolved.trade_side,
        legs_payload=resolved.legs_payload,
        should_sync_legs=resolved.should_sync_legs,
        book=resolved.book,
        external_trade_id=resolved.external_trade_id,
        source_system=resolved.source_system,
        execution_timestamp=resolved.execution_timestamp,
        trade_date=resolved.trade_date,
        effective_start_date=resolved.effective_start_date,
        effective_end_date=resolved.effective_end_date,
        quality_spec=resolved.quality_spec,
        unit_of_measure=resolved.unit_of_measure,
        trade_currency_code=resolved.trade_currency_code,
        location_code=resolved.location_code,
        delivery_start=resolved.delivery_start,
        delivery_end=resolved.delivery_end,
        price_unit_code=resolved.price_unit_code,
        commodity_class=resolved.commodity_class,
        commodity=resolved.commodity,
        pricing_type=resolved.pricing_type,
        price_index_code=resolved.price_index_code,
        price=resolved.price,
        volume=resolved.volume,
        counterparty=resolved.counterparty,
        portfolio=resolved.portfolio,
        pricing_status=workflow_statuses.pricing_status,
        confirmation_status=workflow_statuses.confirmation_status,
        nomination_status=workflow_statuses.nomination_status,
        allocation_status=workflow_statuses.allocation_status,
        actualization_status=workflow_statuses.actualization_status,
        invoice_status=workflow_statuses.invoice_status,
        payment_status=workflow_statuses.payment_status,
        settlement_status=workflow_statuses.settlement_status,
        trader_user=resolved.trader_user,
        status=status_value,
        option_type=option_type,
        option_style=option_style,
        option_strike_price=option_strike_price,
        option_expiration_date=option_expiration_date,
        counterparty_credit_policy=counterparty_credit_policy,
    )
