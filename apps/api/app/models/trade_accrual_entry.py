from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeAccrualEntry(Base):
    __tablename__ = "trade_accrual_entries"

    entry_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    accrual_lot_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trade_accrual_lots.accrual_lot_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    invoice_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("trade_invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payment_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("trade_payments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    quantity_delta: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    amount_delta: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    reference_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    price_index_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fx_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 8), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reversal_of_entry_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("trade_accrual_entries.entry_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
