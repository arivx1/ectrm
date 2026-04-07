from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentIngestionPage(Base):
    __tablename__ = "document_ingestion_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_number", name="uq_document_page_number"),)

    page_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    classification_status: Mapped[str] = mapped_column(String(24), nullable=False)
    extraction_status: Mapped[str] = mapped_column(String(24), nullable=False)
    document_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    document_subtype: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    classification_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    classification_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    header_fields: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    table_blocks: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processing_warnings: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    processing_errors: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    review_status: Mapped[str] = mapped_column(String(24), nullable=False, default="UNREVIEWED")
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
