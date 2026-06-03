"""create document logical document page memberships

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-05-29 15:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, Sequence[str], None] = "p0q1r2s3t4u5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("document_logical_document_pages"):
        op.create_table(
            "document_logical_document_pages",
            sa.Column("membership_id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("logical_document_id", sa.String(length=64), nullable=False),
            sa.Column("document_id", sa.String(length=36), nullable=False),
            sa.Column("page_id", sa.Integer(), nullable=False),
            sa.Column("page_number", sa.Integer(), nullable=False),
            sa.Column("sequence_number", sa.Integer(), nullable=False),
            sa.Column("span_type", sa.String(length=32), nullable=False, server_default="FULL_PAGE"),
            sa.Column("region_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("provenance", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_by", sa.String(length=128), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_by", sa.String(length=128), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.ForeignKeyConstraint(
                ["logical_document_id"],
                ["document_logical_documents.logical_document_id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["page_id"], ["document_ingestion_pages.page_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("membership_id"),
            sa.UniqueConstraint(
                "logical_document_id",
                "page_id",
                name="uq_document_logical_document_page",
            ),
            sa.UniqueConstraint(
                "logical_document_id",
                "sequence_number",
                name="uq_document_logical_document_page_sequence",
            ),
        )

    indexes = {index["name"] for index in inspector.get_indexes("document_logical_document_pages")}
    if "ix_document_logical_document_pages_logical_document_id" not in indexes:
        op.create_index(
            "ix_document_logical_document_pages_logical_document_id",
            "document_logical_document_pages",
            ["logical_document_id"],
        )
    if "ix_document_logical_document_pages_document_id" not in indexes:
        op.create_index(
            "ix_document_logical_document_pages_document_id",
            "document_logical_document_pages",
            ["document_id"],
        )
    if "ix_document_logical_document_pages_page_id" not in indexes:
        op.create_index(
            "ix_document_logical_document_pages_page_id",
            "document_logical_document_pages",
            ["page_id"],
        )
    if "ix_document_logical_document_pages_document_page" not in indexes:
        op.create_index(
            "ix_document_logical_document_pages_document_page",
            "document_logical_document_pages",
            ["document_id", "page_number"],
        )

    op.execute(
        """
        INSERT INTO document_logical_document_pages (
            logical_document_id,
            document_id,
            page_id,
            page_number,
            sequence_number,
            span_type,
            region_payload,
            provenance,
            created_at,
            created_by,
            updated_at,
            updated_by,
            version
        )
        SELECT
            logical_document.logical_document_id,
            logical_document.document_id,
            page.page_id,
            page.page_number,
            page.page_number - logical_document.page_start + 1,
            'FULL_PAGE',
            '{}',
            '{}',
            logical_document.created_at,
            logical_document.created_by,
            logical_document.updated_at,
            logical_document.updated_by,
            1
        FROM document_logical_documents logical_document
        JOIN document_ingestion_pages page
            ON page.document_id = logical_document.document_id
           AND page.page_number BETWEEN logical_document.page_start AND logical_document.page_end
        WHERE NOT EXISTS (
            SELECT 1
            FROM document_logical_document_pages existing
            WHERE existing.logical_document_id = logical_document.logical_document_id
              AND existing.page_id = page.page_id
        )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_document_logical_document_pages_document_page", table_name="document_logical_document_pages")
    op.drop_index("ix_document_logical_document_pages_page_id", table_name="document_logical_document_pages")
    op.drop_index("ix_document_logical_document_pages_document_id", table_name="document_logical_document_pages")
    op.drop_index(
        "ix_document_logical_document_pages_logical_document_id",
        table_name="document_logical_document_pages",
    )
    op.drop_table("document_logical_document_pages")
