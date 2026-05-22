"""add quote type to price indices

Revision ID: e9f0a1b2c3d4
Revises: c8d9e0f1a2b3
Create Date: 2026-05-19 22:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reference_price_indices",
        sa.Column("quote_type", sa.String(length=20), nullable=False, server_default="SPOT"),
    )
    op.alter_column("reference_price_indices", "quote_type", server_default=None)


def downgrade() -> None:
    op.drop_column("reference_price_indices", "quote_type")
