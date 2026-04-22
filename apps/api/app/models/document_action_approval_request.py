from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DocumentActionApprovalRequest(Base):
    __tablename__ = "document_action_approval_requests"

    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_ingestions.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    operation_type: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    governance_status: Mapped[str] = mapped_column(String(48), nullable=False)
    target_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    owner_record_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_record_id: Mapped[Optional[str]] = mapped_column(String(96), nullable=True)
    request_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decision_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_plan_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    governance_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    result_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    execution_decision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
