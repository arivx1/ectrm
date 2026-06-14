from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceRailRoute(Base):
    __tablename__ = "reference_rail_routes"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    rail_line_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("reference_rail_lines.code"),
        nullable=False,
    )
    origin_location_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("reference_locations.code"),
        nullable=True,
    )
    destination_location_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("reference_locations.code"),
        nullable=True,
    )
    service_calendar_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        ForeignKey("reference_calendars.code"),
        nullable=True,
    )
    route_direction: Mapped[str] = mapped_column(String(20), nullable=False, default="BIDIRECTIONAL")
    schedule_timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    placement_cutoff_time_local: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    release_cutoff_time_local: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    placement_free_time_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    release_free_time_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
