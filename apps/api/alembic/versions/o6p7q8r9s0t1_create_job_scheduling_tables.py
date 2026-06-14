"""create job scheduling tables

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-05-29 10:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "o6p7q8r9s0t1"
down_revision: Union[str, Sequence[str], None] = "n5o6p7q8r9s0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("trigger_type", sa.String(length=16), nullable=False),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence_frequency", sa.String(length=16), nullable=True),
        sa.Column("recurrence_interval", sa.Integer(), nullable=True),
        sa.Column("recurrence_by_weekday", sa.JSON(), nullable=True),
        sa.Column("recurrence_count", sa.Integer(), nullable=True),
        sa.Column("recurrence_until_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_source", sa.String(length=80), nullable=True),
        sa.Column("event_type", sa.String(length=120), nullable=True),
        sa.Column("event_filter", sa.JSON(), nullable=True),
        sa.Column("execution_mode", sa.String(length=20), nullable=False),
        sa.Column("deterministic_task_key", sa.String(length=120), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("allowed_action_types", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("max_authority", sa.String(length=32), nullable=False),
        sa.Column("execution_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_user_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_job_schedules_status", "job_schedules", ["status"])
    op.create_index("ix_job_schedules_trigger_type", "job_schedules", ["trigger_type"])
    op.create_index("ix_job_schedules_starts_at", "job_schedules", ["starts_at"])
    op.create_index("ix_job_schedules_event_source", "job_schedules", ["event_source"])
    op.create_index("ix_job_schedules_event_type", "job_schedules", ["event_type"])
    op.create_index("ix_job_schedules_agent_id", "job_schedules", ["agent_id"])
    op.create_index("ix_job_schedules_next_run_at", "job_schedules", ["next_run_at"])

    op.create_table(
        "job_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("trigger_type", sa.String(length=16), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_source", sa.String(length=80), nullable=True),
        sa.Column("event_type", sa.String(length=120), nullable=True),
        sa.Column("trigger_ref", sa.String(length=240), nullable=True),
        sa.Column("event_payload", sa.JSON(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=260), nullable=False),
        sa.Column("execution_mode", sa.String(length=20), nullable=False),
        sa.Column("deterministic_task_key", sa.String(length=120), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("allowed_action_types", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("max_authority", sa.String(length=32), nullable=False),
        sa.Column("execution_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("schedule_version", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_request_ids", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["schedule_id"], ["job_schedules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_job_runs_idempotency_key"),
    )
    op.create_index("ix_job_runs_schedule_id", "job_runs", ["schedule_id"])
    op.create_index("ix_job_runs_status", "job_runs", ["status"])
    op.create_index("ix_job_runs_trigger_type", "job_runs", ["trigger_type"])
    op.create_index("ix_job_runs_scheduled_for", "job_runs", ["scheduled_for"])
    op.create_index("ix_job_runs_event_source", "job_runs", ["event_source"])
    op.create_index("ix_job_runs_event_type", "job_runs", ["event_type"])
    op.create_index("ix_job_runs_agent_id", "job_runs", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_job_runs_agent_id", table_name="job_runs")
    op.drop_index("ix_job_runs_event_type", table_name="job_runs")
    op.drop_index("ix_job_runs_event_source", table_name="job_runs")
    op.drop_index("ix_job_runs_scheduled_for", table_name="job_runs")
    op.drop_index("ix_job_runs_trigger_type", table_name="job_runs")
    op.drop_index("ix_job_runs_status", table_name="job_runs")
    op.drop_index("ix_job_runs_schedule_id", table_name="job_runs")
    op.drop_table("job_runs")
    op.drop_index("ix_job_schedules_next_run_at", table_name="job_schedules")
    op.drop_index("ix_job_schedules_agent_id", table_name="job_schedules")
    op.drop_index("ix_job_schedules_event_type", table_name="job_schedules")
    op.drop_index("ix_job_schedules_event_source", table_name="job_schedules")
    op.drop_index("ix_job_schedules_starts_at", table_name="job_schedules")
    op.drop_index("ix_job_schedules_trigger_type", table_name="job_schedules")
    op.drop_index("ix_job_schedules_status", table_name="job_schedules")
    op.drop_table("job_schedules")
