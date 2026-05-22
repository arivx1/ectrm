from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryTrackingSignal(Base):
    __tablename__ = "delivery_tracking_signals"

    signal_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_id: Mapped[Optional[str]] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    movement_id: Mapped[Optional[str]] = mapped_column(
        String(96),
        ForeignKey("delivery_truck_movements.movement_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stop_id: Mapped[Optional[str]] = mapped_column(
        String(96),
        ForeignKey("delivery_truck_stops.stop_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    source_event_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    signal_type: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(12, 8), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(12, 8), nullable=True)
    speed_knots: Mapped[Optional[float]] = mapped_column(Numeric(7, 3), nullable=True)
    course_degrees: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    heading_degrees: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    draught_meters: Mapped[Optional[float]] = mapped_column(Numeric(7, 3), nullable=True)
    location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    eta_at_destination: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    external_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    normalized_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    match_confidence: Mapped[Optional[float]] = mapped_column(Numeric(6, 4), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    processing_status: Mapped[str] = mapped_column(String(32), nullable=False)
    processing_error: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
