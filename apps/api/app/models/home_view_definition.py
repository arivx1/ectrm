from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class HomeViewDefinition(Base):
    __tablename__ = "home_view_definitions"
    __table_args__ = (
        UniqueConstraint(
            "scope",
            "scope_owner_key",
            "name_key",
            name="uq_home_view_definitions_scope_owner_name",
        ),
        UniqueConstraint("definition_key", name="uq_home_view_definitions_definition_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    definition_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    scope_owner_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    base_template_key: Mapped[str] = mapped_column(String(64), nullable=False)
    base_template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    persona_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    layout_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    filters_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
