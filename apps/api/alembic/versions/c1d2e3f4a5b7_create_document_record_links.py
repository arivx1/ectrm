"""create document record links

Revision ID: c1d2e3f4a5b7
Revises: b9c0d1e2f3a4
Create Date: 2026-04-14 11:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b7"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_record_links",
        sa.Column("link_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("record_type", sa.String(length=64), nullable=False),
        sa.Column("record_id", sa.String(length=96), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False, server_default="PRIMARY"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="ACTION_PLAN"),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("linked_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("link_id"),
        sa.UniqueConstraint("document_id", "record_type", "record_id", name="uq_document_record_links_target"),
    )
    op.create_index("ix_document_record_links_document_id", "document_record_links", ["document_id"], unique=False)
    op.create_index("ix_document_record_links_record_type", "document_record_links", ["record_type"], unique=False)
    op.alter_column("document_record_links", "role", server_default=None)
    op.alter_column("document_record_links", "source", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_document_record_links_record_type", table_name="document_record_links")
    op.drop_index("ix_document_record_links_document_id", table_name="document_record_links")
    op.drop_table("document_record_links")
