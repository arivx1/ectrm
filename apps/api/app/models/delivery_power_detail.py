from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryPowerDetail(Base):
    __tablename__ = "delivery_power_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    market_operator: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    market_operator_source: Mapped[str] = mapped_column(String(32), nullable=False)
    pricing_node_code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    pricing_node_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_node_code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    delivery_node_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    profile_code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    profile_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    schedule_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    schedule_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    interval_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    interval_minutes_source: Mapped[str] = mapped_column(String(32), nullable=False)
    timezone_name: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    timezone_name_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
