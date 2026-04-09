from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryLogisticsDetail(Base):
    __tablename__ = "delivery_logistics_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    origin_location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    origin_location_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    destination_location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    destination_location_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    incoterm_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    incoterm_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    carrier_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    carrier_name_source: Mapped[str] = mapped_column(String(32), nullable=False)
    carrier_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    carrier_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    asset_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    equipment_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    equipment_type_source: Mapped[str] = mapped_column(String(32), nullable=False)
    load_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    load_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    discharge_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    discharge_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
