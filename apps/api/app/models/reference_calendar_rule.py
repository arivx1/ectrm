from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCalendarRule(Base):
    __tablename__ = "reference_calendar_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    calendar_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("reference_calendars.code"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False)
    closure_type: Mapped[str] = mapped_column(String(32), nullable=False, default="FULL_CLOSED")
    month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    occurrence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    offset_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    observance_shift: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    is_provisional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
