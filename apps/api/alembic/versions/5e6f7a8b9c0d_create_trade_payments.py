"""create trade payments

Revision ID: 5e6f7a8b9c0d
Revises: 4d5e6f7a8b9c
Create Date: 2026-04-06 10:05:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5e6f7a8b9c0d"
down_revision: Union[str, Sequence[str], None] = "4d5e6f7a8b9c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_payments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("payment_reference", sa.String(length=64), nullable=False),
        sa.Column("payment_currency_code", sa.String(length=20), nullable=False),
        sa.Column("payment_amount", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["invoice_id"], ["trade_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trade_payments_invoice_id", "trade_payments", ["invoice_id"], unique=False)
    op.create_index("ix_trade_payments_trade_id", "trade_payments", ["trade_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trade_payments_trade_id", table_name="trade_payments")
    op.drop_index("ix_trade_payments_invoice_id", table_name="trade_payments")
    op.drop_table("trade_payments")
