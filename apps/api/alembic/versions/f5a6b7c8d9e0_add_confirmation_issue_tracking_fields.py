"""add confirmation issue tracking fields

Revision ID: f5a6b7c8d9e0
Revises: c3d4e5f6a7b8, e4f5a6b7c8d9
Create Date: 2026-04-09 09:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = ("c3d4e5f6a7b8", "e4f5a6b7c8d9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("trade_confirmations") as batch_op:
        batch_op.add_column(
            sa.Column("issue_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("last_issued_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_issued_by", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("last_issue_method", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("last_issue_recipient", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("last_issue_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("trade_confirmations") as batch_op:
        batch_op.drop_column("last_issue_note")
        batch_op.drop_column("last_issue_recipient")
        batch_op.drop_column("last_issue_method")
        batch_op.drop_column("last_issued_by")
        batch_op.drop_column("last_issued_at")
        batch_op.drop_column("issue_count")
