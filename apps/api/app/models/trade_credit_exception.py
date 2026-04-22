from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeCreditException(Base):
    __tablename__ = "trade_credit_exceptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workflow_item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("trade_workflow_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    approval_decision_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("trade_credit_approval_decisions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")
    limit_currency_code: Mapped[str] = mapped_column(String(20), nullable=False)
    approved_limit_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    approved_projected_exposure_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    approved_excess_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    approval_comment: Mapped[str] = mapped_column(Text, nullable=False)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    approved_by: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    released_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
