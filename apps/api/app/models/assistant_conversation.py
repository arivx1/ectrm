from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantConversation(Base):
    __tablename__ = "assistant_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_role: Mapped[str] = mapped_column(String(64), nullable=False)
    workspace: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    agent_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    use_live_tools: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_user_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latest_assistant_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
