"""add confirmation comparison waiver fields

Revision ID: 9c8b7a6d5e4f
Revises: d3e4f5a6b7c8, d7e8f9a0b1c2
Create Date: 2026-04-08 09:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c8b7a6d5e4f"
down_revision: Union[str, Sequence[str], None] = ("d3e4f5a6b7c8", "d7e8f9a0b1c2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trade_confirmations", sa.Column("comparison_waiver_note", sa.Text(), nullable=True))
    op.add_column("trade_confirmations", sa.Column("comparison_waived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("trade_confirmations", sa.Column("comparison_waived_by", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("trade_confirmations", "comparison_waived_by")
    op.drop_column("trade_confirmations", "comparison_waived_at")
    op.drop_column("trade_confirmations", "comparison_waiver_note")
