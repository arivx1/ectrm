"""create assistant agent evals

Revision ID: 1b2c3d4e5f6a
Revises: 0a9c8e7d6b5f
Create Date: 2026-04-14 13:45:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "1b2c3d4e5f6a"
down_revision: Union[str, Sequence[str], None] = "0a9c8e7d6b5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_agent_evals",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("workspace", sa.String(length=32), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("use_live_tools", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("expected_substrings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("expected_tool_names", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("expected_action_types", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["assistant_agents.agent_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_agent_evals_agent_id", "assistant_agent_evals", ["agent_id"])
    op.create_index("ix_assistant_agent_evals_updated_at", "assistant_agent_evals", ["updated_at"])
    op.alter_column("assistant_agent_evals", "use_live_tools", server_default=None)
    op.alter_column("assistant_agent_evals", "expected_substrings", server_default=None)
    op.alter_column("assistant_agent_evals", "expected_tool_names", server_default=None)
    op.alter_column("assistant_agent_evals", "expected_action_types", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_assistant_agent_evals_updated_at", table_name="assistant_agent_evals")
    op.drop_index("ix_assistant_agent_evals_agent_id", table_name="assistant_agent_evals")
    op.drop_table("assistant_agent_evals")
