from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class Trade(Base):
    __tablename__ = "trades"

    trade_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    book: Mapped[str] = mapped_column(String(50), nullable=False)
    commodity: Mapped[str] = mapped_column(String(50), nullable=False)
    price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    volume: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    last_event_id: Mapped[str] = mapped_column(String(36), nullable=False)
