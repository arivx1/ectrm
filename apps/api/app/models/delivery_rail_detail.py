from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryRailDetail(Base):
    __tablename__ = "delivery_rail_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    rail_route_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rail_route_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    origin_station_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    origin_station_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    destination_station_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    destination_station_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    waybill_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    waybill_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    release_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    release_number_source: Mapped[str] = mapped_column(String(32), nullable=False)
    unit_train_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    unit_train_id_source: Mapped[str] = mapped_column(String(32), nullable=False)
    railcar_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    railcar_count_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
