from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryVesselDetail(Base):
    __tablename__ = "delivery_vessel_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    vessel_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    imo_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    mmsi_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    call_sign: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    voyage_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tracking_provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tracking_policy: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_signal_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_position_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_latitude: Mapped[Optional[float]] = mapped_column(Numeric(12, 8), nullable=True)
    last_longitude: Mapped[Optional[float]] = mapped_column(Numeric(12, 8), nullable=True)
    last_speed_knots: Mapped[Optional[float]] = mapped_column(Numeric(7, 3), nullable=True)
    last_course_degrees: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    last_heading_degrees: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    last_navigational_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    current_destination: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    current_eta_at_destination: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
