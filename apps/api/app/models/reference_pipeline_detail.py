from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferencePipelineDetail(Base):
    __tablename__ = "reference_pipeline_details"

    pipeline_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("reference_assets.code"),
        primary_key=True,
    )
    commodity_family: Mapped[str] = mapped_column(String(32), nullable=False)
    jurisdiction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    topology_model: Mapped[str] = mapped_column(String(32), nullable=False)
    market_hub_location_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("reference_locations.code"),
        nullable=True,
    )
    in_service_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cross_border: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_bidirectional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tariff_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ebb_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
