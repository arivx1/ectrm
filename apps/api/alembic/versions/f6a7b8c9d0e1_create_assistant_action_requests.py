"""create assistant action requests

Revision ID: f6a7b8c9d0e1
Revises: e3f4a5b6c7d8
Create Date: 2026-03-19 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_action_requests",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("workspace", sa.String(length=32), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("agent_name", sa.String(length=160), nullable=True),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("summary", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_action_requests_run_id",
        "assistant_action_requests",
        ["run_id"],
    )
    op.create_index(
        "ix_assistant_action_requests_user_id",
        "assistant_action_requests",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_assistant_action_requests_user_id", table_name="assistant_action_requests")
    op.drop_index("ix_assistant_action_requests_run_id", table_name="assistant_action_requests")
    op.drop_table("assistant_action_requests")
