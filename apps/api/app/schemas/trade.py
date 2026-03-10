from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TradeOut(BaseModel):
    trade_id: str
    created_at: datetime
    updated_at: datetime
    trade_nature: str
    trade_structure: str
    trade_side: Optional[str]
    book: str
    commodity_class: str
    commodity: str
    pricing_type: str
    price_index_code: Optional[str]
    price: Optional[float]
    volume: Optional[float]
    status: str
    last_event_id: str
