from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradePriceTerm(Base):
    __tablename__ = "trade_price_terms"

    trade_price_term_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    trade_id: Mapped[str] = mapped_column(String(64), nullable=False)
    term_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pricing_type: Mapped[str] = mapped_column(String(20), nullable=False)
    fixed_price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    price_index_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
