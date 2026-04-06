from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCounterparty(Base):
    __tablename__ = "reference_counterparties"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    legal_entity_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    counterparty_type: Mapped[str] = mapped_column(String(50), nullable=False)
    country_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    lei_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    duns_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ticker_symbol: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    credit_status: Mapped[str] = mapped_column(String(50), nullable=False, default="APPROVED")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
