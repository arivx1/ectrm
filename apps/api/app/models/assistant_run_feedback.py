from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantRunFeedback(Base):
    __tablename__ = "assistant_run_feedback"
    __table_args__ = (
        Index("ix_assistant_run_feedback_run_id", "run_id"),
        Index("ix_assistant_run_feedback_user_id", "user_id"),
        Index("ix_assistant_run_feedback_conversation_id", "conversation_id"),
        UniqueConstraint("run_id", "user_id", name="uq_assistant_run_feedback_run_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, nullable=False)
    conversation_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_role: Mapped[str] = mapped_column(String(64), nullable=False)
    rating: Mapped[str] = mapped_column(String(32), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
