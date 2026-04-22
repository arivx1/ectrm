"""add confirmation response tracking fields

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-04-09 10:25:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("trade_confirmations") as batch_op:
        batch_op.add_column(
            sa.Column("receipt_status", sa.String(length=40), nullable=False, server_default="NOT_ISSUED")
        )
        batch_op.add_column(sa.Column("received_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("received_by", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("response_method", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("response_reference", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("response_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("trade_confirmations") as batch_op:
        batch_op.drop_column("response_note")
        batch_op.drop_column("response_reference")
        batch_op.drop_column("response_method")
        batch_op.drop_column("received_by")
        batch_op.drop_column("received_at")
        batch_op.drop_column("receipt_status")
