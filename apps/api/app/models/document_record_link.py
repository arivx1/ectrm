from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentRecordLink(Base):
    __tablename__ = "document_record_links"
    __table_args__ = (
        UniqueConstraint("document_id", "record_type", "record_id", name="uq_document_record_links_target"),
    )

    link_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    record_id: Mapped[str] = mapped_column(String(96), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="PRIMARY")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTION_PLAN")
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    linked_by: Mapped[str] = mapped_column(String(128), nullable=False)
