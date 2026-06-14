from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCalendarOverlay(Base):
    __tablename__ = "reference_calendar_overlays"
    __table_args__ = (
        UniqueConstraint(
            "calendar_code",
            "overlay_calendar_code",
            name="uq_reference_calendar_overlays_calendar_overlay",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    calendar_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("reference_calendars.code"),
        nullable=False,
    )
    overlay_calendar_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("reference_calendars.code"),
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
