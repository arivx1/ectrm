from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentActionDecision(Base):
    __tablename__ = "document_action_decisions"

    decision_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    execution_status: Mapped[str] = mapped_column(String(24), nullable=False)
    decision_comment: Mapped[str] = mapped_column(Text, nullable=False)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    operation_type: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    governance_status: Mapped[str] = mapped_column(String(48), nullable=False)
    target_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    owner_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    action_plan_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    governance_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    result_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    document_event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    trade_event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    decided_by: Mapped[str] = mapped_column(String(128), nullable=False)
