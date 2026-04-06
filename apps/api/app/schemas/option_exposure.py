from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class OptionExposureOut(BaseModel):
    trade_id: str
    book: str
    portfolio: str | None
    counterparty: str | None
    commodity_class: str
    commodity: str
    trade_side: str
    option_type: str
    option_style: str | None
    option_strike_price: float | None
    option_expiration_date: date | None
    contract_volume: float
    premium_price: float | None
    premium_cashflow: float | None
    underlying_equivalent_volume: float
    trade_currency_code: str | None
    price_unit_code: str | None
    updated_at: datetime
