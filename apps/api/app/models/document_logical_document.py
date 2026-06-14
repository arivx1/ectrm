from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentLogicalDocument(Base):
    __tablename__ = "document_logical_documents"
    __table_args__ = (
        UniqueConstraint("document_id", "logical_document_key", name="uq_document_logical_document_key"),
        UniqueConstraint("document_id", "sequence_number", name="uq_document_logical_document_sequence"),
    )

    logical_document_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    logical_document_key: Mapped[str] = mapped_column(String(24), nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    page_start: Mapped[int] = mapped_column(Integer, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    document_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    document_subtype: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    classification_status: Mapped[str] = mapped_column(String(24), nullable=False)
    classification_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    review_status: Mapped[str] = mapped_column(String(24), nullable=False, default="UNREVIEWED")
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    provenance: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
