from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryTruckStop(Base):
    __tablename__ = "delivery_truck_stops"
    __table_args__ = (
        UniqueConstraint("movement_id", "stop_sequence", name="uq_delivery_truck_stops_movement_sequence"),
    )

    stop_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    movement_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_truck_movements.movement_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    stop_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    location_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    planned_arrival_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_arrival_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_departure_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_departure_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    appointment_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    appointment_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    planned_quantity: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    actual_quantity: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    actual_arrived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_departed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
