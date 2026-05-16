from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryTruckDetail(Base):
    __tablename__ = "delivery_truck_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    target_run_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    dispatcher_owner: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    tracking_provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tracking_policy: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    default_carrier_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    default_carrier_name_source: Mapped[str] = mapped_column(String(32), nullable=False)
    default_external_carrier_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    default_external_carrier_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    equipment_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    equipment_type_source: Mapped[str] = mapped_column(String(32), nullable=False)
    origin_geofence_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    origin_geofence_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    destination_geofence_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    destination_geofence_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
