"""add assistant runs and allowed tools

Revision ID: e3f4a5b6c7d8
Revises: d1e2f3a4b5c6
Create Date: 2026-03-19 10:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL_ASSISTANT_TOOL_NAMES = [
    "get_trade_by_id",
    "list_trades",
    "list_trade_events",
    "list_positions",
    "search_reference_data",
]


def upgrade() -> None:
    op.add_column(
        "assistant_agents",
        sa.Column("allowed_tools", sa.JSON(), nullable=False, server_default="[]"),
    )

    op.create_table(
        "assistant_runs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_role", sa.String(length=64), nullable=False),
        sa.Column("workspace", sa.String(length=32), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("agent_name", sa.String(length=160), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("use_live_tools", sa.Boolean(), nullable=False),
        sa.Column("request_messages", sa.JSON(), nullable=False),
        sa.Column("application_context", sa.Text(), nullable=True),
        sa.Column("prompt_sections", sa.JSON(), nullable=False),
        sa.Column("rendered_system_prompt", sa.Text(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("tool_calls", sa.JSON(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("latest_user_message", sa.Text(), nullable=True),
        sa.Column("assistant_message", sa.Text(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_runs_created_at", "assistant_runs", ["created_at"])
    op.create_index("ix_assistant_runs_user_id", "assistant_runs", ["user_id"])

    bind = op.get_bind()
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("capabilities", sa.JSON()),
        sa.column("allowed_tools", sa.JSON()),
    )
    rows = bind.execute(
        sa.select(
            assistant_agents.c.agent_id,
            assistant_agents.c.capabilities,
        )
    ).mappings()
    for row in rows:
        capabilities = row["capabilities"] or []
        allowed_tools = (
            list(ALL_ASSISTANT_TOOL_NAMES)
            if any(str(capability).upper() == "READ" for capability in capabilities)
            else []
        )
        bind.execute(
            assistant_agents.update()
            .where(assistant_agents.c.agent_id == row["agent_id"])
            .values(allowed_tools=allowed_tools)
        )

    op.alter_column("assistant_agents", "allowed_tools", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_assistant_runs_user_id", table_name="assistant_runs")
    op.drop_index("ix_assistant_runs_created_at", table_name="assistant_runs")
    op.drop_table("assistant_runs")
    op.drop_column("assistant_agents", "allowed_tools")
