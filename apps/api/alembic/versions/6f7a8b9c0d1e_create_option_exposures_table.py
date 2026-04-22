"""create option exposures table

Revision ID: 6f7a8b9c0d1e
Revises: 3c4d5e6f7a8b, 4d5e6f7a8b9c
Create Date: 2026-04-06 08:25:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f7a8b9c0d1e"
down_revision: Union[str, Sequence[str], None] = ("3c4d5e6f7a8b", "4d5e6f7a8b9c")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "option_exposures",
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("book", sa.String(length=50), nullable=False),
        sa.Column("portfolio", sa.String(length=50), nullable=True),
        sa.Column("counterparty", sa.String(length=50), nullable=True),
        sa.Column("commodity_class", sa.String(length=50), nullable=False),
        sa.Column("commodity", sa.String(length=50), nullable=False),
        sa.Column("trade_side", sa.String(length=20), nullable=False),
        sa.Column("option_type", sa.String(length=10), nullable=False),
        sa.Column("option_style", sa.String(length=20), nullable=True),
        sa.Column("option_strike_price", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("option_expiration_date", sa.Date(), nullable=True),
        sa.Column("contract_volume", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("premium_price", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("premium_cashflow", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("underlying_equivalent_volume", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("trade_currency_code", sa.String(length=20), nullable=True),
        sa.Column("price_unit_code", sa.String(length=20), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("trade_id"),
    )
    op.create_index(
        "ix_option_exposures_option_expiration_date",
        "option_exposures",
        ["option_expiration_date"],
        unique=False,
    )
    op.create_index("ix_option_exposures_book", "option_exposures", ["book"], unique=False)
    op.create_index("ix_option_exposures_commodity", "option_exposures", ["commodity"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_option_exposures_commodity", table_name="option_exposures")
    op.drop_index("ix_option_exposures_book", table_name="option_exposures")
    op.drop_index("ix_option_exposures_option_expiration_date", table_name="option_exposures")
    op.drop_table("option_exposures")
