"""add assistant agent hierarchy fields

Revision ID: g1h2i3j4k5l6
Revises: d7e8f9g0h1i2
Create Date: 2026-05-08 09:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, Sequence[str], None] = "d7e8f9g0h1i2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_agents",
        sa.Column("orchestration_pattern", sa.String(length=32), nullable=False, server_default="SINGLE"),
    )
    op.add_column(
        "assistant_agents",
        sa.Column("parent_agent_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "assistant_agents",
        sa.Column("managed_agent_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "assistant_agents",
        sa.Column("delegation_guidance", sa.Text(), nullable=True),
    )
    op.create_index(
        op.f("ix_assistant_agents_parent_agent_id"),
        "assistant_agents",
        ["parent_agent_id"],
        unique=False,
    )
    op.alter_column("assistant_agents", "orchestration_pattern", server_default=None)
    op.alter_column("assistant_agents", "managed_agent_ids", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_assistant_agents_parent_agent_id"), table_name="assistant_agents")
    op.drop_column("assistant_agents", "delegation_guidance")
    op.drop_column("assistant_agents", "managed_agent_ids")
    op.drop_column("assistant_agents", "parent_agent_id")
    op.drop_column("assistant_agents", "orchestration_pattern")
