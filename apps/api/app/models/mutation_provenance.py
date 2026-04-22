from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class MutationProvenanceRecord(Base):
    __tablename__ = "mutation_provenance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operation_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    source_surface: Mapped[str] = mapped_column(String(160), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    request_method: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    request_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    outcome: Mapped[str] = mapped_column(String(24), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    affected_records: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    details: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
