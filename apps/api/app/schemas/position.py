from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class PositionOut(BaseModel):
    commodity: str
    net_volume: float
    updated_at: datetime
