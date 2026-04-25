"""create assistant prompt navigation outcomes

Revision ID: t7i8j9k0l1m2
Revises: s6h7i8j9k0l1
Create Date: 2026-04-23 22:35:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "t7i8j9k0l1m2"
down_revision: Union[str, Sequence[str], None] = "s6h7i8j9k0l1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_prompt_navigation_outcomes",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_role", sa.String(length=64), nullable=False),
        sa.Column("surface", sa.String(length=32), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("intent_key", sa.String(length=255), nullable=False),
        sa.Column("target_view", sa.String(length=32), nullable=True),
        sa.Column("target_label", sa.String(length=160), nullable=True),
        sa.Column("target_rationale", sa.Text(), nullable=True),
        sa.Column("focus_type", sa.String(length=32), nullable=True),
        sa.Column("focus_id", sa.String(length=128), nullable=True),
        sa.Column("focus_label", sa.String(length=160), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_prompt_navigation_outcomes_run_id",
        "assistant_prompt_navigation_outcomes",
        ["run_id"],
    )
    op.create_index(
        "ix_assistant_prompt_navigation_outcomes_user_id",
        "assistant_prompt_navigation_outcomes",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_prompt_navigation_outcomes_target_view",
        "assistant_prompt_navigation_outcomes",
        ["target_view"],
    )
    op.create_unique_constraint(
        "uq_assistant_prompt_navigation_outcomes_run_user_outcome_intent",
        "assistant_prompt_navigation_outcomes",
        ["run_id", "user_id", "outcome", "intent_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_assistant_prompt_navigation_outcomes_run_user_outcome_intent",
        "assistant_prompt_navigation_outcomes",
        type_="unique",
    )
    op.drop_index(
        "ix_assistant_prompt_navigation_outcomes_target_view",
        table_name="assistant_prompt_navigation_outcomes",
    )
    op.drop_index(
        "ix_assistant_prompt_navigation_outcomes_user_id",
        table_name="assistant_prompt_navigation_outcomes",
    )
    op.drop_index(
        "ix_assistant_prompt_navigation_outcomes_run_id",
        table_name="assistant_prompt_navigation_outcomes",
    )
    op.drop_table("assistant_prompt_navigation_outcomes")
