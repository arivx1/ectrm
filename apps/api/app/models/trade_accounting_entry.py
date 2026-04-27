from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeAccountingEntry(Base):
    __tablename__ = "trade_accounting_entries"

    accounting_entry_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    accrual_lot_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("trade_accrual_lots.accrual_lot_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    accrual_entry_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("trade_accrual_entries.entry_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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
    journal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    entry_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="POSTED", index=True)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reversal_of_entry_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("trade_accounting_entries.accounting_entry_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(nullable=False, default=1)
