from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class CodexTaskRequest(Base):
    __tablename__ = "codex_task_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    run_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    max_iterations: Mapped[int] = mapped_column(Integer, nullable=False)
    continuation_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stop_conditions: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    target_ref: Mapped[str] = mapped_column(String(160), nullable=False)
    repository: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    workflow_id: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    dispatch_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    callback_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    workflow_run_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    workflow_run_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    branch_name: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    pull_request_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    artifact_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    iteration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    iteration_summaries: Mapped[Optional[list[dict[str, object]]]] = mapped_column(JSON, nullable=True)
    result_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stop_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_response: Mapped[Optional[dict[str, object]]] = mapped_column(JSON, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    requester_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
