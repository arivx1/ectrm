from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


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
