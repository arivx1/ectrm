from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TradeOut(BaseModel):
    trade_id: str
    external_trade_id: Optional[str]
    source_system: Optional[str]
    created_at: datetime
    updated_at: datetime
    execution_timestamp: Optional[datetime]
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
    price_index_code: Optional[str]
    price: Optional[float]
    volume: Optional[float]
    settlement_status: str
    trader_user: Optional[str]
    status: str
    last_event_id: str
