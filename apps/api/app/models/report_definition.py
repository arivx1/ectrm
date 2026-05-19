from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReportDefinition(Base):
    __tablename__ = "report_definitions"
    __table_args__ = (
        UniqueConstraint(
            "report_key",
            "scope_owner_key",
            name="uq_report_definitions_key_owner",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    scope_owner_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    lifecycle_status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    definition_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    validation_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    referenced_dataset_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    definition_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    retired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
