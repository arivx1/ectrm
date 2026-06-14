"""add settlement correction fields

Revision ID: a4b5c6d7e8f9
Revises: z3a4b5c6d7e8
Create Date: 2026-04-27 15:40:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a4b5c6d7e8f9"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trade_invoices", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("trade_invoices", sa.Column("voided_by", sa.String(length=128), nullable=True))
    op.add_column("trade_invoices", sa.Column("void_reason", sa.Text(), nullable=True))

    op.add_column("trade_payments", sa.Column("reversal_of_payment_id", sa.Integer(), nullable=True))
    op.add_column("trade_payments", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.create_index(
        "ix_trade_payments_reversal_of_payment_id",
        "trade_payments",
        ["reversal_of_payment_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_trade_payments_reversal_of_payment_id_trade_payments",
        "trade_payments",
        "trade_payments",
        ["reversal_of_payment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_trade_payments_reversal_of_payment_id_trade_payments",
        "trade_payments",
        type_="foreignkey",
    )
    op.drop_index("ix_trade_payments_reversal_of_payment_id", table_name="trade_payments")
    op.drop_column("trade_payments", "reversal_reason")
    op.drop_column("trade_payments", "reversal_of_payment_id")

    op.drop_column("trade_invoices", "void_reason")
    op.drop_column("trade_invoices", "voided_by")
    op.drop_column("trade_invoices", "voided_at")
