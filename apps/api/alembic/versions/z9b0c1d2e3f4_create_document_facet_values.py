"""create document facet values

Revision ID: z9b0c1d2e3f4
Revises: y4z5a6b7c8d9, z8a9b0c1d2e3
Create Date: 2026-05-22 09:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "z9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = ("y4z5a6b7c8d9", "z8a9b0c1d2e3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_facet_values",
        sa.Column("facet_value_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("page_id", sa.Integer(), nullable=True),
        sa.Column("facet_key", sa.String(length=64), nullable=False),
        sa.Column("value_code", sa.String(length=100), nullable=False),
        sa.Column("value_label_snapshot", sa.String(length=160), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("review_status", sa.String(length=24), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["document_id"], ["document_ingestions.document_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["page_id"], ["document_ingestion_pages.page_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("facet_value_id"),
    )
    op.create_index("ix_document_facet_values_document_id", "document_facet_values", ["document_id"])
    op.create_index("ix_document_facet_values_page_id", "document_facet_values", ["page_id"])
    op.create_index("ix_document_facet_values_facet_key", "document_facet_values", ["facet_key"])
    op.create_index("ix_document_facet_values_value_code", "document_facet_values", ["value_code"])
    op.create_index(
        "ix_document_facet_values_document_page_facet",
        "document_facet_values",
        ["document_id", "page_id", "facet_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_facet_values_document_page_facet", table_name="document_facet_values")
    op.drop_index("ix_document_facet_values_value_code", table_name="document_facet_values")
    op.drop_index("ix_document_facet_values_facet_key", table_name="document_facet_values")
    op.drop_index("ix_document_facet_values_page_id", table_name="document_facet_values")
    op.drop_index("ix_document_facet_values_document_id", table_name="document_facet_values")
    op.drop_table("document_facet_values")
