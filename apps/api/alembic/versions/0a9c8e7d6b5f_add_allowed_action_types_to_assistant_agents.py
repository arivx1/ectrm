"""add allowed action types to assistant agents

Revision ID: 0a9c8e7d6b5f
Revises: f1e2d3c4b5a6
Create Date: 2026-04-14 10:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "0a9c8e7d6b5f"
down_revision: Union[str, Sequence[str], None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL_ASSISTANT_ACTION_TYPES = [
    "cancel_trade",
    "issue_trade_confirmation",
    "record_trade_confirmation_response",
    "update_trade_workflow_item",
    "issue_trade_invoice",
    "create_trade_payment",
    "reprocess_document_ingestion",
]


def upgrade() -> None:
    op.add_column(
        "assistant_agents",
        sa.Column("allowed_action_types", sa.JSON(), nullable=False, server_default="[]"),
    )

    bind = op.get_bind()
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("capabilities", sa.JSON()),
        sa.column("allowed_action_types", sa.JSON()),
    )
    rows = bind.execute(
        sa.select(
            assistant_agents.c.agent_id,
            assistant_agents.c.capabilities,
        )
    ).mappings()
    for row in rows:
        capabilities = row["capabilities"] or []
        allowed_action_types = (
            list(ALL_ASSISTANT_ACTION_TYPES)
            if any(str(capability).upper() == "ACTION" for capability in capabilities)
            else []
        )
        bind.execute(
            assistant_agents.update()
            .where(assistant_agents.c.agent_id == row["agent_id"])
            .values(allowed_action_types=allowed_action_types)
        )

    op.alter_column("assistant_agents", "allowed_action_types", server_default=None)


def downgrade() -> None:
    op.drop_column("assistant_agents", "allowed_action_types")
