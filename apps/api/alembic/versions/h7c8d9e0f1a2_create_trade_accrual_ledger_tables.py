"""create trade accrual ledger tables

Revision ID: h7c8d9e0f1a2
Revises: g6b7c8d9e0f1
Create Date: 2026-04-11 11:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "g6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_accrual_lots",
        sa.Column("accrual_lot_id", sa.String(length=64), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=True),
        sa.Column("leg_no", sa.Integer(), nullable=True),
        sa.Column("book", sa.String(length=50), nullable=False),
        sa.Column("portfolio", sa.String(length=50), nullable=True),
        sa.Column("counterparty", sa.String(length=50), nullable=True),
        sa.Column("commodity_class", sa.String(length=50), nullable=False),
        sa.Column("commodity", sa.String(length=50), nullable=False),
        sa.Column("trade_currency_code", sa.String(length=20), nullable=True),
        sa.Column("accrual_currency_code", sa.String(length=20), nullable=False),
        sa.Column("quantity_unit_code", sa.String(length=20), nullable=True),
        sa.Column("planned_quantity", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("actualized_quantity", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("billed_quantity", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("accrued_amount", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("billed_amount", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("collected_amount", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("disputed_amount", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ESTIMATED"),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("accrual_lot_id"),
    )
    op.create_index("ix_trade_accrual_lots_trade_id", "trade_accrual_lots", ["trade_id"], unique=False)
    op.create_index("ix_trade_accrual_lots_delivery_id", "trade_accrual_lots", ["delivery_id"], unique=False)
    op.create_index("ix_trade_accrual_lots_book", "trade_accrual_lots", ["book"], unique=False)
    op.create_index("ix_trade_accrual_lots_portfolio", "trade_accrual_lots", ["portfolio"], unique=False)
    op.create_index("ix_trade_accrual_lots_counterparty", "trade_accrual_lots", ["counterparty"], unique=False)
    op.create_index("ix_trade_accrual_lots_commodity_class", "trade_accrual_lots", ["commodity_class"], unique=False)
    op.create_index(
        "ix_trade_accrual_lots_accrual_currency_code",
        "trade_accrual_lots",
        ["accrual_currency_code"],
        unique=False,
    )
    op.create_index("ix_trade_accrual_lots_status", "trade_accrual_lots", ["status"], unique=False)

    op.create_table(
        "trade_accrual_entries",
        sa.Column("entry_id", sa.String(length=64), nullable=False),
        sa.Column("accrual_lot_id", sa.String(length=64), nullable=False),
        sa.Column("entry_type", sa.String(length=40), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=True),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("amount_delta", sa.Numeric(precision=18, scale=6), nullable=False, server_default="0"),
        sa.Column("reference_price", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("price_index_code", sa.String(length=50), nullable=True),
        sa.Column("fx_rate", sa.Numeric(precision=18, scale=8), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["accrual_lot_id"], ["trade_accrual_lots.accrual_lot_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["trade_invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["payment_id"], ["trade_payments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("entry_id"),
    )
    op.create_index("ix_trade_accrual_entries_accrual_lot_id", "trade_accrual_entries", ["accrual_lot_id"], unique=False)
    op.create_index("ix_trade_accrual_entries_entry_type", "trade_accrual_entries", ["entry_type"], unique=False)
    op.create_index("ix_trade_accrual_entries_trade_id", "trade_accrual_entries", ["trade_id"], unique=False)
    op.create_index("ix_trade_accrual_entries_delivery_id", "trade_accrual_entries", ["delivery_id"], unique=False)
    op.create_index("ix_trade_accrual_entries_invoice_id", "trade_accrual_entries", ["invoice_id"], unique=False)
    op.create_index("ix_trade_accrual_entries_payment_id", "trade_accrual_entries", ["payment_id"], unique=False)
    op.create_index("ix_trade_accrual_entries_effective_date", "trade_accrual_entries", ["effective_date"], unique=False)
    op.create_index("ix_trade_accrual_entries_currency_code", "trade_accrual_entries", ["currency_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trade_accrual_entries_currency_code", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_effective_date", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_payment_id", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_invoice_id", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_delivery_id", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_trade_id", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_entry_type", table_name="trade_accrual_entries")
    op.drop_index("ix_trade_accrual_entries_accrual_lot_id", table_name="trade_accrual_entries")
    op.drop_table("trade_accrual_entries")

    op.drop_index("ix_trade_accrual_lots_status", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_accrual_currency_code", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_commodity_class", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_counterparty", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_portfolio", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_book", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_delivery_id", table_name="trade_accrual_lots")
    op.drop_index("ix_trade_accrual_lots_trade_id", table_name="trade_accrual_lots")
    op.drop_table("trade_accrual_lots")
