from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeLeg(Base):
    __tablename__ = "trade_legs"

    trade_leg_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    trade_id: Mapped[str] = mapped_column(String(64), nullable=False)
    leg_no: Mapped[int] = mapped_column(Integer, nullable=False)
    side: Mapped[str] = mapped_column(String(20), nullable=False)
    commodity_class: Mapped[str] = mapped_column(String(50), nullable=False)
    commodity_code: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
