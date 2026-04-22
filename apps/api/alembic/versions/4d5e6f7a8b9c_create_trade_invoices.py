"""create trade invoices

Revision ID: 4d5e6f7a8b9c
Revises: 2b3c4d5e6f7a
Create Date: 2026-04-05 17:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4d5e6f7a8b9c"
down_revision: Union[str, Sequence[str], None] = "2b3c4d5e6f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("invoice_number", sa.String(length=64), nullable=False),
        sa.Column("invoice_currency_code", sa.String(length=20), nullable=False),
        sa.Column("invoice_amount", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dispute_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trade_id", name="uq_trade_invoices_trade_id"),
    )
    op.create_index("ix_trade_invoices_trade_id", "trade_invoices", ["trade_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trade_invoices_trade_id", table_name="trade_invoices")
    op.drop_table("trade_invoices")
