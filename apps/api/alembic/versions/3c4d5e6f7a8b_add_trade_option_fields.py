"""add trade option fields

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2026-04-05 16:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3c4d5e6f7a8b"
down_revision: Union[str, Sequence[str], None] = "2b3c4d5e6f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("instrument_type", sa.String(length=20), nullable=False, server_default="LINEAR"),
    )
    op.add_column("trades", sa.Column("option_type", sa.String(length=10), nullable=True))
    op.add_column("trades", sa.Column("option_style", sa.String(length=20), nullable=True))
    op.add_column("trades", sa.Column("option_strike_price", sa.Numeric(18, 6), nullable=True))
    op.add_column("trades", sa.Column("option_expiration_date", sa.Date(), nullable=True))
    op.alter_column("trades", "instrument_type", server_default=None)


def downgrade() -> None:
    op.drop_column("trades", "option_expiration_date")
    op.drop_column("trades", "option_strike_price")
    op.drop_column("trades", "option_style")
    op.drop_column("trades", "option_type")
    op.drop_column("trades", "instrument_type")
