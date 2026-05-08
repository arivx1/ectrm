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
    role_key: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    profile_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="CUSTOM")
    specialization_summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    human_owner_role: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    authority_ceiling: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    activation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    orchestration_pattern: Mapped[str] = mapped_column(String(32), nullable=False, default="SINGLE")
    parent_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    managed_agent_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    delegation_guidance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    profile_request_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    allowed_workspaces: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_tools: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allowed_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    daily_token_allocation: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    latest_revision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    published_revision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    published_snapshot: Mapped[Optional[dict[str, object]]] = mapped_column(JSON, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
