from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class Trade(Base):
    __tablename__ = "trades"

    trade_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    external_trade_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    source_system: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    execution_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    trade_nature: Mapped[str] = mapped_column(String(20), nullable=False, default="PHYSICAL")
    trade_structure: Mapped[str] = mapped_column(String(20), nullable=False, default="SINGLE")
    trade_side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    book: Mapped[str] = mapped_column(String(50), nullable=False)
    portfolio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    counterparty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    commodity_class: Mapped[str] = mapped_column(String(50), nullable=False)
    commodity: Mapped[str] = mapped_column(String(50), nullable=False)
    pricing_type: Mapped[str] = mapped_column(String(20), nullable=False, default="FIXED")
    pricing_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    price_index_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    volume: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    settlement_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    trader_user: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    last_event_id: Mapped[str] = mapped_column(String(36), nullable=False)
