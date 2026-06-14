from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class JobSchedule(Base):
    __tablename__ = "job_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE", index=True)
    trigger_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    recurrence_frequency: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    recurrence_interval: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recurrence_by_weekday: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    recurrence_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recurrence_until_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    event_source: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    event_filter: Mapped[Optional[dict[str, object]]] = mapped_column(JSON, nullable=True)
    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    deterministic_task_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    allowed_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    max_authority: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    execution_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_user_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class JobRun(Base):
    __tablename__ = "job_runs"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_job_runs_idempotency_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("job_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="QUEUED", index=True)
    trigger_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    event_source: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    trigger_ref: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    event_payload: Mapped[Optional[dict[str, object]]] = mapped_column(JSON, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(260), nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    deterministic_task_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    allowed_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    max_authority: Mapped[str] = mapped_column(String(32), nullable=False)
    execution_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    schedule_version: Mapped[int] = mapped_column(Integer, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    action_request_ids: Mapped[Optional[list[int]]] = mapped_column(JSON, nullable=True)
    result: Mapped[Optional[dict[str, object]]] = mapped_column(JSON, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
