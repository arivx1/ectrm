"""create layout definitions table

Revision ID: c2d3e4f5a6b8
Revises: b1c2d3e4f5a6
Create Date: 2026-04-05 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b8"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "layout_definitions",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=32), nullable=False),
        sa.Column("tile_order", sa.JSON(), nullable=False),
        sa.Column("hidden_tiles", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "workspace_id", name="uq_layout_definitions_user_workspace"),
    )
    op.create_index("ix_layout_definitions_user_id", "layout_definitions", ["user_id"])
    op.create_index("ix_layout_definitions_workspace_id", "layout_definitions", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_layout_definitions_workspace_id", table_name="layout_definitions")
    op.drop_index("ix_layout_definitions_user_id", table_name="layout_definitions")
    op.drop_table("layout_definitions")
