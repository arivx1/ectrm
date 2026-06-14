"""create gmail inbox import receipts

Revision ID: b8c9d0e1f2a3
Revises: a4b5c6d7e8f9
Create Date: 2026-05-07 13:10:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gmail_inbox_import_receipts",
        sa.Column("receipt_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("gmail_message_id", sa.String(length=255), nullable=False),
        sa.Column("gmail_thread_id", sa.String(length=255), nullable=True),
        sa.Column("gmail_part_token", sa.String(length=255), nullable=False),
        sa.Column("gmail_attachment_id", sa.String(length=255), nullable=True),
        sa.Column("gmail_subject", sa.String(length=255), nullable=True),
        sa.Column("gmail_sender", sa.String(length=255), nullable=True),
        sa.Column("gmail_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("receipt_id"),
        sa.UniqueConstraint(
            "gmail_message_id",
            "gmail_part_token",
            name="uq_gmail_inbox_import_receipts_message_part",
        ),
    )
    op.create_index(
        "ix_gmail_inbox_import_receipts_gmail_message_id",
        "gmail_inbox_import_receipts",
        ["gmail_message_id"],
    )
    op.create_index(
        "ix_gmail_inbox_import_receipts_document_id",
        "gmail_inbox_import_receipts",
        ["document_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_gmail_inbox_import_receipts_document_id",
        table_name="gmail_inbox_import_receipts",
    )
    op.drop_index(
        "ix_gmail_inbox_import_receipts_gmail_message_id",
        table_name="gmail_inbox_import_receipts",
    )
    op.drop_table("gmail_inbox_import_receipts")
