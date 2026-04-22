from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradePayment(Base):
    __tablename__ = "trade_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("trade_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_reference: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_currency_code: Mapped[str] = mapped_column(String(20), nullable=False)
    payment_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
