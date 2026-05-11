from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class UserDefinedEvent(Base):
    __tablename__ = "user_defined_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    place: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recurrence_frequency: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    recurrence_interval: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recurrence_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recurrence_until_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence_by_weekday: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
