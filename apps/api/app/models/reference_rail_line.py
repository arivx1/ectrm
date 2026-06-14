from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceRailLine(Base):
    __tablename__ = "reference_rail_lines"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    railroad_code: Mapped[str] = mapped_column(String(30), nullable=False)
    operator_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    default_timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
