from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryTruckMovement(Base):
    __tablename__ = "delivery_truck_movements"
    __table_args__ = (
        UniqueConstraint("delivery_id", "sequence_no", name="uq_delivery_truck_movements_delivery_sequence"),
    )

    movement_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    planned_quantity: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    planned_unit_of_measure: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    carrier_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    carrier_name_source: Mapped[str] = mapped_column(String(32), nullable=False)
    external_carrier_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    external_carrier_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    dispatcher_owner: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    dispatcher_owner_source: Mapped[str] = mapped_column(String(32), nullable=False)
    driver_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    driver_name_source: Mapped[str] = mapped_column(String(32), nullable=False)
    driver_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    driver_phone_source: Mapped[str] = mapped_column(String(32), nullable=False)
    tractor_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tractor_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    trailer_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    trailer_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    external_load_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    external_load_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    bill_of_lading_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bill_of_lading_number_source: Mapped[str] = mapped_column(String(32), nullable=False)
    truck_ticket_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    truck_ticket_number_source: Mapped[str] = mapped_column(String(32), nullable=False)
    current_stop_sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last_signal_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_eta_at_destination: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hold_reason_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    hold_reason_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
