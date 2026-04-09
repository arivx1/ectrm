"""add trade actualizations

Revision ID: c2d3e4f5a6b7
Revises: be1f2a3d4c5b
Create Date: 2026-04-07 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c2d3e4f5a6b7"
down_revision = "be1f2a3d4c5b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column(
            "actualization_status",
            sa.String(length=30),
            nullable=False,
            server_default="PENDING",
        ),
    )
    op.execute(
        """
        UPDATE trades
        SET actualization_status = CASE
            WHEN trade_nature = 'PHYSICAL' AND status = 'ACTIVE' THEN 'PENDING'
            ELSE 'NOT_REQUIRED'
        END
        """
    )

    op.create_table(
        "trade_actualizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("leg_no", sa.Integer(), nullable=True),
        sa.Column("actual_quantity", sa.Numeric(18, 6), nullable=False),
        sa.Column("actualized_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("delivery_id", name="uq_trade_actualizations_delivery_id"),
    )
    op.create_index(
        "ix_trade_actualizations_delivery_id",
        "trade_actualizations",
        ["delivery_id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_actualizations_trade_id",
        "trade_actualizations",
        ["trade_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trade_actualizations_trade_id", table_name="trade_actualizations")
    op.drop_index("ix_trade_actualizations_delivery_id", table_name="trade_actualizations")
    op.drop_table("trade_actualizations")
    op.drop_column("trades", "actualization_status")
