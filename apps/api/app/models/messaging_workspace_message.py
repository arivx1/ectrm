from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class MessagingWorkspaceMessage(Base):
    __tablename__ = "messaging_workspace_messages"

    message_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author_name: Mapped[str] = mapped_column(String(160), nullable=False)
    author_title: Mapped[str] = mapped_column(String(160), nullable=False)
    author_presence: Mapped[str] = mapped_column(String(160), nullable=False)
    author_initials: Mapped[str] = mapped_column(String(8), nullable=False)
    author_tone: Mapped[str] = mapped_column(String(16), nullable=False)
    assistant_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assistant_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    assistant_agent_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_by_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_by_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
