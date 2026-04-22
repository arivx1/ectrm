"""create document ingestion tables

Revision ID: aa1b2c3d4e5f
Revises: 9c0d1e2f3a4b
Create Date: 2026-04-06 14:25:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "9c0d1e2f3a4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_ingestions",
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("classifier_version", sa.String(length=64), nullable=False),
        sa.Column("extractor_version", sa.String(length=64), nullable=False),
        sa.Column("analysis_summary", sa.JSON(), nullable=False),
        sa.Column("processing_errors", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("document_id"),
    )
    op.create_index("ix_document_ingestions_sha256", "document_ingestions", ["sha256"], unique=False)

    op.create_table(
        "document_ingestion_pages",
        sa.Column("page_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("classification_status", sa.String(length=24), nullable=False),
        sa.Column("extraction_status", sa.String(length=24), nullable=False),
        sa.Column("document_kind", sa.String(length=64), nullable=False),
        sa.Column("document_subtype", sa.String(length=128), nullable=True),
        sa.Column("classification_confidence", sa.Float(), nullable=True),
        sa.Column("classification_payload", sa.JSON(), nullable=False),
        sa.Column("header_fields", sa.JSON(), nullable=False),
        sa.Column("table_blocks", sa.JSON(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("processing_warnings", sa.JSON(), nullable=False),
        sa.Column("processing_errors", sa.JSON(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("page_id"),
        sa.UniqueConstraint("document_id", "page_number", name="uq_document_page_number"),
    )
    op.create_index("ix_document_ingestion_pages_document_id", "document_ingestion_pages", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_document_ingestion_pages_document_id", table_name="document_ingestion_pages")
    op.drop_table("document_ingestion_pages")
    op.drop_index("ix_document_ingestions_sha256", table_name="document_ingestions")
    op.drop_table("document_ingestions")
