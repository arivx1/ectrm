"""create codex task requests

Revision ID: n1c2d3e4f5a6
Revises: m1b2c3d4e5f6
Create Date: 2026-04-22 09:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "n1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "m1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "codex_task_requests",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("run_mode", sa.String(length=40), nullable=False, server_default="SINGLE_TASK"),
        sa.Column("max_iterations", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("continuation_prompt", sa.Text(), nullable=True),
        sa.Column("stop_conditions", sa.JSON(), nullable=True),
        sa.Column("target_ref", sa.String(length=160), nullable=False),
        sa.Column("repository", sa.String(length=240), nullable=True),
        sa.Column("workflow_id", sa.String(length=240), nullable=True),
        sa.Column("dispatch_url", sa.Text(), nullable=True),
        sa.Column("callback_url", sa.Text(), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=True),
        sa.Column("workflow_run_id", sa.String(length=120), nullable=True),
        sa.Column("workflow_run_url", sa.Text(), nullable=True),
        sa.Column("branch_name", sa.String(length=240), nullable=True),
        sa.Column("pull_request_url", sa.Text(), nullable=True),
        sa.Column("artifact_url", sa.Text(), nullable=True),
        sa.Column("iteration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("iteration_summaries", sa.JSON(), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("stop_reason", sa.Text(), nullable=True),
        sa.Column("provider_response", sa.JSON(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("requester_role", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_codex_task_requests_created_at", "codex_task_requests", ["created_at"])
    op.create_index("ix_codex_task_requests_requested_by", "codex_task_requests", ["requested_by"])
    op.create_index("ix_codex_task_requests_run_mode", "codex_task_requests", ["run_mode"])
    op.create_index("ix_codex_task_requests_status", "codex_task_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_codex_task_requests_status", table_name="codex_task_requests")
    op.drop_index("ix_codex_task_requests_run_mode", table_name="codex_task_requests")
    op.drop_index("ix_codex_task_requests_requested_by", table_name="codex_task_requests")
    op.drop_index("ix_codex_task_requests_created_at", table_name="codex_task_requests")
    op.drop_table("codex_task_requests")
