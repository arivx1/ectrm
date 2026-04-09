from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeInvoice(Base):
    __tablename__ = "trade_invoices"
    __table_args__ = (
        UniqueConstraint("trade_id", "invoice_number", name="uq_trade_invoices_trade_invoice_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    leg_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    invoice_currency_code: Mapped[str] = mapped_column(String(20), nullable=False)
    billed_quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    quantity_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    invoice_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ISSUED")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dispute_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
