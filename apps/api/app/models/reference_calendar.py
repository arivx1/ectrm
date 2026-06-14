from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCalendar(Base):
    __tablename__ = "reference_calendars"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    calendar_type: Mapped[str] = mapped_column(String(50), nullable=False)
    market: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
