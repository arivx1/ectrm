from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    weather_location_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("weather_locations.code"),
        nullable=False,
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    station_id: Mapped[str] = mapped_column(String(20), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    text_description: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    temperature_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dewpoint_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    relative_humidity_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_direction_degrees: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    barometric_pressure_pa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    visibility_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("external_data_runs.id"), nullable=False)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
