from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceSpatialFeature(Base):
    __tablename__ = "reference_spatial_features"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    feature_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    geometry_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    entity_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    label_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    label_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    geometry_geojson: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
