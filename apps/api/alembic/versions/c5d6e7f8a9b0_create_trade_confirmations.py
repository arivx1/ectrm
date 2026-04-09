"""create trade confirmations

Revision ID: c5d6e7f8a9b0
Revises: be1f2a3d4c5b
Create Date: 2026-04-07 09:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "be1f2a3d4c5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_confirmations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("source_document_id", sa.String(length=36), nullable=True),
        sa.Column("confirmation_number", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispute_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["source_document_id"], ["document_ingestions.document_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_document_id", name="uq_trade_confirmations_source_document_id"),
    )
    op.create_index("ix_trade_confirmations_trade_id", "trade_confirmations", ["trade_id"], unique=False)
    op.create_index(
        "ix_trade_confirmations_source_document_id",
        "trade_confirmations",
        ["source_document_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trade_confirmations_source_document_id", table_name="trade_confirmations")
    op.drop_index("ix_trade_confirmations_trade_id", table_name="trade_confirmations")
    op.drop_table("trade_confirmations")
