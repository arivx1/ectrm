"""create assistant run feedback

Revision ID: m1b2c3d4e5f6
Revises: l1a2b3c4d5e6
Create Date: 2026-04-21 20:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "m1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "l1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_run_feedback",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_role", sa.String(length=64), nullable=False),
        sa.Column("rating", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_run_feedback_run_id",
        "assistant_run_feedback",
        ["run_id"],
    )
    op.create_index(
        "ix_assistant_run_feedback_user_id",
        "assistant_run_feedback",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_run_feedback_conversation_id",
        "assistant_run_feedback",
        ["conversation_id"],
    )
    op.create_unique_constraint(
        "uq_assistant_run_feedback_run_user",
        "assistant_run_feedback",
        ["run_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_assistant_run_feedback_run_user",
        "assistant_run_feedback",
        type_="unique",
    )
    op.drop_index("ix_assistant_run_feedback_conversation_id", table_name="assistant_run_feedback")
    op.drop_index("ix_assistant_run_feedback_user_id", table_name="assistant_run_feedback")
    op.drop_index("ix_assistant_run_feedback_run_id", table_name="assistant_run_feedback")
    op.drop_table("assistant_run_feedback")
