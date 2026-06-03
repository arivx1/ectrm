from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentLogicalDocumentPage(Base):
    __tablename__ = "document_logical_document_pages"
    __table_args__ = (
        UniqueConstraint(
            "logical_document_id",
            "page_id",
            name="uq_document_logical_document_page",
        ),
        UniqueConstraint(
            "logical_document_id",
            "sequence_number",
            name="uq_document_logical_document_page_sequence",
        ),
    )

    membership_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    logical_document_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("document_logical_documents.logical_document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("document_ingestion_pages.page_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    span_type: Mapped[str] = mapped_column(String(32), nullable=False, default="FULL_PAGE")
    region_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    provenance: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
