from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantOrganizationContextDefinition(Base):
    __tablename__ = "assistant_organization_context_definitions"
    __table_args__ = (
        UniqueConstraint(
            "definition_key",
            "version",
            name="uq_assistant_organization_context_definition_version",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    definition_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    section_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    content_kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(String(24), nullable=False, default="GLOBAL")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    retired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
