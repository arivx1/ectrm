from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantPromptNavigationOutcome(Base):
    __tablename__ = "assistant_prompt_navigation_outcomes"
    __table_args__ = (
        Index("ix_assistant_prompt_navigation_outcomes_run_id", "run_id"),
        Index("ix_assistant_prompt_navigation_outcomes_user_id", "user_id"),
        Index("ix_assistant_prompt_navigation_outcomes_target_view", "target_view"),
        UniqueConstraint(
            "run_id",
            "user_id",
            "outcome",
            "intent_key",
            name="uq_assistant_prompt_navigation_outcomes_run_user_outcome_intent",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    conversation_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_role: Mapped[str] = mapped_column(String(64), nullable=False)
    surface: Mapped[str] = mapped_column(String(32), nullable=False)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    intent_key: Mapped[str] = mapped_column(String(255), nullable=False)
    target_view: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    target_label: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    target_rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    focus_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    focus_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    focus_label: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
