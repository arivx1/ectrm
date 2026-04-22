from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantAgentWorkPackage(Base):
    __tablename__ = "assistant_agent_work_packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    work_package_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    package_type: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    source_agent_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_agent_names: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_recommendations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_candidates: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    recommended_owner_role: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    acceptance_checks: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    knowledge_base_titles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
