"""create trade workflow items

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-04-05 15:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2b3c4d5e6f7a"
down_revision: Union[str, Sequence[str], None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_workflow_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("workflow_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("owner", sa.String(length=128), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trade_id", "workflow_type", name="uq_trade_workflow_items_trade_type"),
    )
    op.create_index(
        "ix_trade_workflow_items_trade_id",
        "trade_workflow_items",
        ["trade_id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_workflow_items_workflow_type",
        "trade_workflow_items",
        ["workflow_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trade_workflow_items_workflow_type", table_name="trade_workflow_items")
    op.drop_index("ix_trade_workflow_items_trade_id", table_name="trade_workflow_items")
    op.drop_table("trade_workflow_items")
