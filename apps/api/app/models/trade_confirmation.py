from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeConfirmation(Base):
    __tablename__ = "trade_confirmations"
    __table_args__ = (
        UniqueConstraint("source_document_id", name="uq_trade_confirmations_source_document_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_document_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confirmation_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="SENT")
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_issued_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last_issue_method: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_issue_recipient: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_issue_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dispute_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comparison_waiver_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comparison_waived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    comparison_waived_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
