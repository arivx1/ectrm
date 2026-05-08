from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferencePipelinePoint(Base):
    __tablename__ = "reference_pipeline_points"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    pipeline_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("reference_assets.code"),
        nullable=False,
    )
    location_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("reference_locations.code"),
        nullable=True,
    )
    point_role: Mapped[str] = mapped_column(String(32), nullable=False)
    operator_point_code: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    operator_zone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    connected_pipeline_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        ForeignKey("reference_assets.code"),
        nullable=True,
    )
    is_tradable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_pricing_point: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_scheduling_point: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
