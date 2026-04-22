from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantRun(Base):
    __tablename__ = "assistant_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_role: Mapped[str] = mapped_column(String(64), nullable=False)
    workspace: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    agent_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    use_live_tools: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    request_messages: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    application_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_sections: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    rendered_system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    warnings: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    tool_calls: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_user_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assistant_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
