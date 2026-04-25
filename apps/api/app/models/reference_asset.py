from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceAsset(Base):
    __tablename__ = "reference_assets"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_class: Mapped[str] = mapped_column(String(40), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(60), nullable=False)
    asset_reality: Mapped[str] = mapped_column(String(20), nullable=False, default="REAL")
    commodity_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    capacity_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capacity_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    operating_status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPERATING")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
