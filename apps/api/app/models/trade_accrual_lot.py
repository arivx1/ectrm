from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeAccrualLot(Base):
    __tablename__ = "trade_accrual_lots"

    accrual_lot_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    leg_no: Mapped[Optional[int]] = mapped_column(nullable=True)
    book: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    portfolio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    counterparty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    commodity_class: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    commodity: Mapped[str] = mapped_column(String(50), nullable=False)
    trade_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    accrual_currency_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    quantity_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    planned_quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    actualized_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    billed_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    accrued_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    billed_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    collected_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    disputed_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ESTIMATED", index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(nullable=False, default=1)
