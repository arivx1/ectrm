from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class WeatherForecastPeriod(Base):
    __tablename__ = "weather_forecast_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    weather_location_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("weather_locations.code"),
        nullable=False,
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_daytime: Mapped[bool] = mapped_column(Boolean, nullable=False)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature_unit: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    wind_speed: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    wind_direction: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    short_forecast: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    detailed_forecast: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    probability_of_precipitation_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    relative_humidity_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dewpoint_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("external_data_runs.id"), nullable=False)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
