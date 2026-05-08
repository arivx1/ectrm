from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class GmailInboxImportReceipt(Base):
    __tablename__ = "gmail_inbox_import_receipts"
    __table_args__ = (
        UniqueConstraint(
            "gmail_message_id",
            "gmail_part_token",
            name="uq_gmail_inbox_import_receipts_message_part",
        ),
    )

    receipt_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gmail_message_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_part_token: Mapped[str] = mapped_column(String(255), nullable=False)
    gmail_attachment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_sender: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    document_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
