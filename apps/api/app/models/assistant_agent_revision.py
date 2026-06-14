from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantAgentRevision(Base):
    __tablename__ = "assistant_agent_revisions"

    revision_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("assistant_agents.agent_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    change_summary: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    restored_from_revision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
