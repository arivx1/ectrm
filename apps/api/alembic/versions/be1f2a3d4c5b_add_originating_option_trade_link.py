"""add originating option trade link

Revision ID: be1f2a3d4c5b
Revises: ab1c2d3e4f5a
Create Date: 2026-04-07 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "be1f2a3d4c5b"
down_revision = "ab1c2d3e4f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("originating_option_trade_id", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_trades_originating_option_trade_id",
        "trades",
        ["originating_option_trade_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trades_originating_option_trade_id", table_name="trades")
    op.drop_column("trades", "originating_option_trade_id")
