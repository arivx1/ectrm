from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class OptionExposure(Base):
    __tablename__ = "option_exposures"

    trade_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    book: Mapped[str] = mapped_column(String(50), nullable=False)
    portfolio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    counterparty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    commodity_class: Mapped[str] = mapped_column(String(50), nullable=False)
    commodity: Mapped[str] = mapped_column(String(50), nullable=False)
    trade_side: Mapped[str] = mapped_column(String(20), nullable=False)
    option_type: Mapped[str] = mapped_column(String(10), nullable=False)
    option_style: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    option_strike_price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    option_expiration_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contract_volume: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    premium_price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    premium_cashflow: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    underlying_equivalent_volume: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    trade_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    price_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
