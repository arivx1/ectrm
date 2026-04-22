from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class RoadmapDocumentRevision(Base):
    __tablename__ = "roadmap_document_revisions"

    revision_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    change_summary: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    restored_from_revision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
