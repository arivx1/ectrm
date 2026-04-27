"""create trade accounting entries and manual accrual reversals

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-04-27 13:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "z3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "y2z3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trade_accrual_entries",
        sa.Column(
            "reversal_of_entry_id",
            sa.String(length=64),
            sa.ForeignKey("trade_accrual_entries.entry_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_trade_accrual_entries_reversal_of_entry_id",
        "trade_accrual_entries",
        ["reversal_of_entry_id"],
    )

    op.create_table(
        "trade_accounting_entries",
        sa.Column("accounting_entry_id", sa.String(length=64), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("accrual_lot_id", sa.String(length=64), nullable=True),
        sa.Column("accrual_entry_id", sa.String(length=64), nullable=True),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("journal_code", sa.String(length=40), nullable=True),
        sa.Column("entry_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reversal_of_entry_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["accrual_entry_id"], ["trade_accrual_entries.entry_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["accrual_lot_id"], ["trade_accrual_lots.accrual_lot_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["trade_invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["payment_id"], ["trade_payments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["reversal_of_entry_id"],
            ["trade_accounting_entries.accounting_entry_id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("accounting_entry_id"),
    )
    op.create_index("ix_trade_accounting_entries_trade_id", "trade_accounting_entries", ["trade_id"])
    op.create_index(
        "ix_trade_accounting_entries_accrual_lot_id",
        "trade_accounting_entries",
        ["accrual_lot_id"],
    )
    op.create_index(
        "ix_trade_accounting_entries_accrual_entry_id",
        "trade_accounting_entries",
        ["accrual_entry_id"],
    )
    op.create_index("ix_trade_accounting_entries_invoice_id", "trade_accounting_entries", ["invoice_id"])
    op.create_index("ix_trade_accounting_entries_payment_id", "trade_accounting_entries", ["payment_id"])
    op.create_index("ix_trade_accounting_entries_journal_code", "trade_accounting_entries", ["journal_code"])
    op.create_index("ix_trade_accounting_entries_entry_type", "trade_accounting_entries", ["entry_type"])
    op.create_index("ix_trade_accounting_entries_status", "trade_accounting_entries", ["status"])
    op.create_index(
        "ix_trade_accounting_entries_effective_date",
        "trade_accounting_entries",
        ["effective_date"],
    )
    op.create_index(
        "ix_trade_accounting_entries_currency_code",
        "trade_accounting_entries",
        ["currency_code"],
    )
    op.create_index(
        "ix_trade_accounting_entries_reversal_of_entry_id",
        "trade_accounting_entries",
        ["reversal_of_entry_id"],
    )

    op.create_table(
        "trade_accounting_entry_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("accounting_entry_id", sa.String(length=64), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(length=10), nullable=False),
        sa.Column("account_code", sa.String(length=80), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=False),
        sa.Column("reference_code", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["accounting_entry_id"],
            ["trade_accounting_entries.accounting_entry_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_trade_accounting_entry_lines_accounting_entry_id",
        "trade_accounting_entry_lines",
        ["accounting_entry_id"],
    )
    op.create_index("ix_trade_accounting_entry_lines_side", "trade_accounting_entry_lines", ["side"])
    op.create_index(
        "ix_trade_accounting_entry_lines_account_code",
        "trade_accounting_entry_lines",
        ["account_code"],
    )
    op.create_index(
        "ix_trade_accounting_entry_lines_currency_code",
        "trade_accounting_entry_lines",
        ["currency_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_trade_accounting_entry_lines_currency_code", table_name="trade_accounting_entry_lines")
    op.drop_index("ix_trade_accounting_entry_lines_account_code", table_name="trade_accounting_entry_lines")
    op.drop_index("ix_trade_accounting_entry_lines_side", table_name="trade_accounting_entry_lines")
    op.drop_index(
        "ix_trade_accounting_entry_lines_accounting_entry_id",
        table_name="trade_accounting_entry_lines",
    )
    op.drop_table("trade_accounting_entry_lines")

    op.drop_index(
        "ix_trade_accounting_entries_reversal_of_entry_id",
        table_name="trade_accounting_entries",
    )
    op.drop_index("ix_trade_accounting_entries_currency_code", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_effective_date", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_status", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_entry_type", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_journal_code", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_payment_id", table_name="trade_accounting_entries")
    op.drop_index("ix_trade_accounting_entries_invoice_id", table_name="trade_accounting_entries")
    op.drop_index(
        "ix_trade_accounting_entries_accrual_entry_id",
        table_name="trade_accounting_entries",
    )
    op.drop_index(
        "ix_trade_accounting_entries_accrual_lot_id",
        table_name="trade_accounting_entries",
    )
    op.drop_index("ix_trade_accounting_entries_trade_id", table_name="trade_accounting_entries")
    op.drop_table("trade_accounting_entries")

    op.drop_index(
        "ix_trade_accrual_entries_reversal_of_entry_id",
        table_name="trade_accrual_entries",
    )
    op.drop_column("trade_accrual_entries", "reversal_of_entry_id")
