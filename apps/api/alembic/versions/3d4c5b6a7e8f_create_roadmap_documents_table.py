"""create roadmap documents table

Revision ID: 3d4c5b6a7e8f
Revises: 7b9c2d4e6f10
"""

from alembic import op
import sqlalchemy as sa

revision = "3d4c5b6a7e8f"
down_revision = "7b9c2d4e6f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_documents",
        sa.Column("document_key", sa.String(length=64), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_table("roadmap_documents")
