from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class WeatherLocation(Base):
    __tablename__ = "weather_locations"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    reference_location_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("reference_locations.code"),
        nullable=True,
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="NWS")
    cwa: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    grid_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    grid_x: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    grid_y: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    station_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
