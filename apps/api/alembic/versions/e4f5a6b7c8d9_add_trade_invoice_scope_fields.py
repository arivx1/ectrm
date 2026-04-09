"""add trade invoice scope fields

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-04-08 10:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("trade_invoices") as batch_op:
        batch_op.drop_constraint("uq_trade_invoices_trade_id", type_="unique")
        batch_op.add_column(sa.Column("delivery_id", sa.String(length=96), nullable=True))
        batch_op.add_column(sa.Column("leg_no", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("billed_quantity", sa.Numeric(precision=18, scale=6), nullable=True))
        batch_op.add_column(sa.Column("quantity_unit_code", sa.String(length=20), nullable=True))
        batch_op.create_unique_constraint(
            "uq_trade_invoices_trade_invoice_number",
            ["trade_id", "invoice_number"],
        )

    op.create_index("ix_trade_invoices_delivery_id", "trade_invoices", ["delivery_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trade_invoices_delivery_id", table_name="trade_invoices")

    with op.batch_alter_table("trade_invoices") as batch_op:
        batch_op.drop_constraint("uq_trade_invoices_trade_invoice_number", type_="unique")
        batch_op.drop_column("quantity_unit_code")
        batch_op.drop_column("billed_quantity")
        batch_op.drop_column("leg_no")
        batch_op.drop_column("delivery_id")
        batch_op.create_unique_constraint("uq_trade_invoices_trade_id", ["trade_id"])
