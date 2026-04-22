from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class LayoutDefinition(Base):
    __tablename__ = "layout_definitions"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_layout_definitions_user_workspace"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("user_accounts.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    tile_order: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    hidden_tiles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    tile_spans: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    tile_sections: Mapped[dict[str, list[str]]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
