from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentFacetValue(Base):
    __tablename__ = "document_facet_values"

    facet_value_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("document_ingestion_pages.page_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    facet_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    value_label_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    review_status: Mapped[str] = mapped_column(String(24), nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
