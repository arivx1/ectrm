from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeSecondaryCostItem(Base):
    __tablename__ = "trade_secondary_cost_items"

    cost_item_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_id: Mapped[Optional[str]] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    leg_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    cost_owner: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    charge_side: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    quantity_basis: Mapped[str] = mapped_column(String(20), nullable=False, default="FIXED")
    quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    quantity_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="ESTIMATED")
    invoice_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("trade_invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    evidence_reference: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    accrued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invoiced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    relieved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
