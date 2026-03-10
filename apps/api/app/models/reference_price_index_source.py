from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferencePriceIndexSource(Base):
    __tablename__ = "reference_price_index_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    price_index_code: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    dataset_code: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    series_id: Mapped[str] = mapped_column(String(200), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    source_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    source_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    transform_rule: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
