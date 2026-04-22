from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeCreditApprovalDecision(Base):
    __tablename__ = "trade_credit_approval_decisions"

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
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    decision_comment: Mapped[str] = mapped_column(Text, nullable=False)
    breach_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    decided_by: Mapped[str] = mapped_column(String(128), nullable=False)
