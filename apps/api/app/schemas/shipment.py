from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class DeliveryObligationOut(BaseModel):
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    external_trade_id: Optional[str]
    status: str
    direction: str
    mode_family: str
    transport_mode: str
    transport_mode_source: str
    delivery_profile: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    volume: Optional[float]
    unit_of_measure: Optional[str]
    trade_currency_code: Optional[str]
    price_unit_code: Optional[str]
    location_code: Optional[str]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    booked_at: datetime
    last_updated_at: datetime
    age_days: int
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    invoice_status: str
    payment_status: str
    settlement_status: str
    blocker_count: int
    blockers: list[str]


ShipmentOut = DeliveryObligationOut
