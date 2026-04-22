"""add document review workflow fields

Revision ID: ab1c2d3e4f5a
Revises: aa1b2c3d4e5f
Create Date: 2026-04-06 15:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ab1c2d3e4f5a"
down_revision: Union[str, Sequence[str], None] = "aa1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_ingestions",
        sa.Column("review_status", sa.String(length=24), nullable=False, server_default="UNREVIEWED"),
    )
    op.add_column("document_ingestions", sa.Column("review_notes", sa.Text(), nullable=True))
    op.add_column("document_ingestions", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("document_ingestions", sa.Column("reviewed_by", sa.String(length=128), nullable=True))

    op.add_column(
        "document_ingestion_pages",
        sa.Column("review_status", sa.String(length=24), nullable=False, server_default="UNREVIEWED"),
    )
    op.add_column("document_ingestion_pages", sa.Column("review_notes", sa.Text(), nullable=True))
    op.add_column("document_ingestion_pages", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("document_ingestion_pages", sa.Column("reviewed_by", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("document_ingestion_pages", "reviewed_by")
    op.drop_column("document_ingestion_pages", "reviewed_at")
    op.drop_column("document_ingestion_pages", "review_notes")
    op.drop_column("document_ingestion_pages", "review_status")

    op.drop_column("document_ingestions", "reviewed_by")
    op.drop_column("document_ingestions", "reviewed_at")
    op.drop_column("document_ingestions", "review_notes")
    op.drop_column("document_ingestions", "review_status")
