from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReportPreset(Base):
    __tablename__ = "report_presets"
    __table_args__ = (
        UniqueConstraint(
            "preset_key",
            "scope_owner_key",
            "name_key",
            name="uq_report_presets_key_owner_name",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    preset_key: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    scope_owner_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False)
    filters_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
