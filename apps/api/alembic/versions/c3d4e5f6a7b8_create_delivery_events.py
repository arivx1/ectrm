"""create delivery events

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-08 16:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("leg_no", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("execution_status", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("reference_code", sa.String(length=128), nullable=True),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_delivery_events_delivery_id"), "delivery_events", ["delivery_id"], unique=False)
    op.create_index(op.f("ix_delivery_events_trade_id"), "delivery_events", ["trade_id"], unique=False)
    op.create_index(op.f("ix_delivery_events_occurred_at"), "delivery_events", ["occurred_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_delivery_events_occurred_at"), table_name="delivery_events")
    op.drop_index(op.f("ix_delivery_events_trade_id"), table_name="delivery_events")
    op.drop_index(op.f("ix_delivery_events_delivery_id"), table_name="delivery_events")
    op.drop_table("delivery_events")
