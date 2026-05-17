from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class MessagingWorkspaceMessage(Base):
    __tablename__ = "messaging_workspace_messages"

    message_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    item_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="message")
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    system_label: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    system_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    author_title: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    author_presence: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    author_initials: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    author_tone: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    reactions: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    attachment_payload: Mapped[Optional[dict[str, str]]] = mapped_column(JSON, nullable=True)
    assistant_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assistant_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    assistant_agent_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_by_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_by_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
