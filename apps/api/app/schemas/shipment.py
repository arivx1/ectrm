from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ShipmentOut(BaseModel):
    shipment_id: str
    trade_id: str
    external_trade_id: Optional[str]
    status: str
    direction: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    volume: Optional[float]
    unit_of_measure: Optional[str]
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
