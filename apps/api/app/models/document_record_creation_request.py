from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentRecordCreationRequest(Base):
    __tablename__ = "document_record_creation_requests"

    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    document_kind: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_record_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_record_label: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    required_owner_record_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    matched_keys: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    missing_evidence: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    captured_fields: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    request_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linkage_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    action_plan_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    resolved_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resolved_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
