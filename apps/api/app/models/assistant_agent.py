from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantAgent(Base):
    __tablename__ = "assistant_agents"

    agent_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    scope: Mapped[str] = mapped_column(String(24), nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    allowed_workspaces: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    allowed_tools: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
