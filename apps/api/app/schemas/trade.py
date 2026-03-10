from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TradeOut(BaseModel):
    trade_id: str
    created_at: datetime
    updated_at: datetime
    book: str
    commodity: str
    price: Optional[float]
    volume: Optional[float]
    status: str
    last_event_id: str
