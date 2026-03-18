"""create roadmap document revisions table

Revision ID: 6a7b8c9d0e1f
Revises: 3d4c5b6a7e8f
"""

from alembic import op
import sqlalchemy as sa

revision = "6a7b8c9d0e1f"
down_revision = "3d4c5b6a7e8f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_document_revisions",
        sa.Column("revision_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("document_key", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("change_summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("restored_from_revision_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_roadmap_document_revisions_document_key",
        "roadmap_document_revisions",
        ["document_key"],
    )
    op.create_index(
        "ix_roadmap_document_revisions_version",
        "roadmap_document_revisions",
        ["version"],
    )


def downgrade() -> None:
    op.drop_index("ix_roadmap_document_revisions_version", table_name="roadmap_document_revisions")
    op.drop_index(
        "ix_roadmap_document_revisions_document_key",
        table_name="roadmap_document_revisions",
    )
    op.drop_table("roadmap_document_revisions")
