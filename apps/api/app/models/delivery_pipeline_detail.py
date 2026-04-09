from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryPipelineDetail(Base):
    __tablename__ = "delivery_pipeline_details"

    delivery_id: Mapped[str] = mapped_column(
        String(96),
        ForeignKey("delivery_obligations.delivery_id", ondelete="CASCADE"),
        primary_key=True,
    )
    pipeline_system: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    pipeline_system_source: Mapped[str] = mapped_column(String(32), nullable=False)
    pipeline_path: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    pipeline_path_source: Mapped[str] = mapped_column(String(32), nullable=False)
    receipt_location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    receipt_location_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_location_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    contract_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    contract_number_source: Mapped[str] = mapped_column(String(32), nullable=False)
    cycle_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    cycle_code_source: Mapped[str] = mapped_column(String(32), nullable=False)
    nomination_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    nomination_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
