"""create trade secondary cost items

Revision ID: b13c0d1e2f3a
Revises: q1r2s3t4u5v6
Create Date: 2026-06-07 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b13c0d1e2f3a"
down_revision: Union[str, Sequence[str], None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("trade_secondary_cost_items"):
        return

    op.create_table(
        "trade_secondary_cost_items",
        sa.Column("cost_item_id", sa.String(length=64), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=True),
        sa.Column("leg_no", sa.Integer(), nullable=True),
        sa.Column("cost_type", sa.String(length=40), nullable=False),
        sa.Column("cost_owner", sa.String(length=64), nullable=False),
        sa.Column("charge_side", sa.String(length=20), nullable=False),
        sa.Column("quantity_basis", sa.String(length=20), nullable=False, server_default="FIXED"),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=True),
        sa.Column("quantity_unit_code", sa.String(length=20), nullable=True),
        sa.Column("rate", sa.Numeric(18, 6), nullable=True),
        sa.Column("amount", sa.Numeric(18, 6), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ESTIMATED"),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("evidence_reference", sa.String(length=160), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("accrued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invoiced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("relieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by", sa.String(length=128), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["trade_invoices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("cost_item_id"),
    )
    op.create_index("ix_trade_secondary_cost_items_trade_id", "trade_secondary_cost_items", ["trade_id"])
    op.create_index("ix_trade_secondary_cost_items_delivery_id", "trade_secondary_cost_items", ["delivery_id"])
    op.create_index("ix_trade_secondary_cost_items_cost_type", "trade_secondary_cost_items", ["cost_type"])
    op.create_index("ix_trade_secondary_cost_items_cost_owner", "trade_secondary_cost_items", ["cost_owner"])
    op.create_index("ix_trade_secondary_cost_items_charge_side", "trade_secondary_cost_items", ["charge_side"])
    op.create_index("ix_trade_secondary_cost_items_currency_code", "trade_secondary_cost_items", ["currency_code"])
    op.create_index("ix_trade_secondary_cost_items_status", "trade_secondary_cost_items", ["status"])
    op.create_index("ix_trade_secondary_cost_items_invoice_id", "trade_secondary_cost_items", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_trade_secondary_cost_items_invoice_id", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_status", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_currency_code", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_charge_side", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_cost_owner", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_cost_type", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_delivery_id", table_name="trade_secondary_cost_items")
    op.drop_index("ix_trade_secondary_cost_items_trade_id", table_name="trade_secondary_cost_items")
    op.drop_table("trade_secondary_cost_items")
