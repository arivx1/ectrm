from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class TradeOut(BaseModel):
    trade_id: str
    external_trade_id: Optional[str]
    source_system: Optional[str]
    created_at: datetime
    updated_at: datetime
    execution_timestamp: Optional[datetime]
    trade_date: Optional[date]
    effective_start_date: Optional[date]
    effective_end_date: Optional[date]
    quality_spec: Optional[str]
    unit_of_measure: Optional[str]
    trade_currency_code: Optional[str]
    location_code: Optional[str]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    price_unit_code: Optional[str]
    trade_nature: str
    trade_structure: str
    trade_side: Optional[str]
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    pricing_type: str
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    price_index_code: Optional[str]
    price: Optional[float]
    volume: Optional[float]
    invoice_status: str
    payment_status: str
    settlement_status: str
    trader_user: Optional[str]
    status: str
    last_event_id: str
