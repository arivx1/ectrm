from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_book_field_resolution import (
    resolve_book_trade_fields,
)
from apps.api.app.domains.trading.services.trade_credit_write_validation import (
    validate_book_trade_counterparty_credit,
)
from apps.api.app.domains.trading.services.trade_write_contracts import ValidatedBookTradeWrite
from apps.api.app.domains.trading.services.trade_defaults import (
    default_trade_workflow_statuses,
)
from apps.api.app.domains.trading.services.trade_option_validation import validate_option_fields
from apps.api.app.domains.trading.services.trade_pretrade_review_validation import (
    ensure_booking_pretrade_review_alignment,
    parse_booking_pretrade_review_id,
)
from apps.api.app.domains.trading.services.trade_write_rules import (
    validate_originating_option_trade_reference,
    validate_trade_date_ranges,
    validate_trade_measurements,
)
from apps.api.app.domains.trading.services.trade_workflow_status_validation import (
    normalize_book_trade_workflow_statuses,
)
from apps.api.app.domains.trading.services.trade_status_write_validation import (
    validate_book_trade_status,
)


def validate_book_trade_write(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
    occurred_at: datetime | None,
    actor_id: str,
    checked_at: datetime | None = None,
) -> ValidatedBookTradeWrite:
    pretrade_review_id = parse_booking_pretrade_review_id(
        payload_data.get("pretrade_review_id")
    )

    resolved = resolve_book_trade_fields(
        db,
        payload_data=payload_data,
        occurred_at=occurred_at,
        checked_at=checked_at,
    )
    workflow_defaults = default_trade_workflow_statuses(resolved.trade_nature)
    workflow_statuses = normalize_book_trade_workflow_statuses(
        payload_data,
        workflow_defaults=workflow_defaults,
    )
    option_type, option_style, option_strike_price, option_expiration_date = (
        validate_option_fields(
            instrument_type=resolved.instrument_type,
            trade_nature=resolved.trade_nature,
            trade_structure=resolved.trade_structure,
            pricing_type=resolved.pricing_type,
            option_type=payload_data.get("option_type"),
            option_style=payload_data.get("option_style"),
            option_strike_price=payload_data.get("option_strike_price"),
            option_expiration_date=payload_data.get("option_expiration_date"),
        )
    )
    originating_option_trade_id = validate_originating_option_trade_reference(
        db,
        trade_id=trade_id,
        instrument_type=resolved.instrument_type,
        originating_option_trade_id=payload_data.get("originating_option_trade_id"),
    )
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
    counterparty_credit_policy = validate_book_trade_counterparty_credit(
        db,
        trade_id=trade_id,
        counterparty_code=resolved.counterparty,
        trade_currency_code=resolved.trade_currency_code,
        price=resolved.price,
        volume=resolved.volume,
    )

    requested_trade_status = validate_book_trade_status(payload_data.get("status"))
    ensure_booking_pretrade_review_alignment(
        db,
        pretrade_review_id=pretrade_review_id,
        actor_id=actor_id,
        checked_at=checked_at or occurred_at or datetime.utcnow(),
    )

    return ValidatedBookTradeWrite(
        pretrade_review_id=pretrade_review_id,
        instrument_type=resolved.instrument_type,
        trade_nature=resolved.trade_nature,
        trade_structure=resolved.trade_structure,
        trade_side=resolved.trade_side,
        legs_payload=resolved.legs_payload,
        book=resolved.book,
        commodity_class=resolved.commodity_class,
        commodity=resolved.commodity,
        price=resolved.price,
        volume=resolved.volume,
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
        counterparty=resolved.counterparty,
        portfolio=resolved.portfolio,
        pricing_status=workflow_statuses.pricing_status,
        confirmation_status=workflow_statuses.confirmation_status,
        nomination_status=workflow_statuses.nomination_status,
        allocation_status=workflow_statuses.allocation_status,
        actualization_status=workflow_statuses.actualization_status,
        settlement_status=workflow_statuses.settlement_status,
        invoice_status=workflow_statuses.invoice_status,
        payment_status=workflow_statuses.payment_status,
        trader_user=resolved.trader_user,
        pricing_type=resolved.pricing_type,
        price_index_code=resolved.price_index_code,
        option_type=option_type,
        option_style=option_style,
        option_strike_price=option_strike_price,
        option_expiration_date=option_expiration_date,
        originating_option_trade_id=originating_option_trade_id,
        requested_trade_status=requested_trade_status,
        counterparty_credit_policy=counterparty_credit_policy,
    )
