"""create document logical documents

Revision ID: i1j2k3l4m5n6
Revises: hvi1a2b3c4d5
Create Date: 2026-05-24 10:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "i1j2k3l4m5n6"
down_revision: Union[str, Sequence[str], None] = "hvi1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_logical_documents",
        sa.Column("logical_document_id", sa.String(length=64), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("logical_document_key", sa.String(length=24), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("document_kind", sa.String(length=64), nullable=False),
        sa.Column("document_subtype", sa.String(length=128), nullable=True),
        sa.Column("classification_status", sa.String(length=24), nullable=False),
        sa.Column("classification_confidence", sa.Float(), nullable=True),
        sa.Column("review_status", sa.String(length=24), nullable=False, server_default="UNREVIEWED"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=128), nullable=True),
        sa.Column("provenance", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("logical_document_id"),
        sa.UniqueConstraint("document_id", "logical_document_key", name="uq_document_logical_document_key"),
        sa.UniqueConstraint("document_id", "sequence_number", name="uq_document_logical_document_sequence"),
    )
    op.create_index("ix_document_logical_documents_document_id", "document_logical_documents", ["document_id"])
    op.create_index(
        "ix_document_logical_documents_document_range",
        "document_logical_documents",
        ["document_id", "page_start", "page_end"],
    )
    op.create_index(
        "ix_document_logical_documents_document_kind",
        "document_logical_documents",
        ["document_kind"],
    )
    op.create_index(
        "ix_document_logical_documents_review_status",
        "document_logical_documents",
        ["review_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_logical_documents_review_status", table_name="document_logical_documents")
    op.drop_index("ix_document_logical_documents_document_kind", table_name="document_logical_documents")
    op.drop_index("ix_document_logical_documents_document_range", table_name="document_logical_documents")
    op.drop_index("ix_document_logical_documents_document_id", table_name="document_logical_documents")
    op.drop_table("document_logical_documents")
