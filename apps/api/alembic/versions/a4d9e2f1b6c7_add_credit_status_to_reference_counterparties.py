"""add credit status to reference counterparties

Revision ID: a4d9e2f1b6c7
Revises: fd3e4f5a6b7c
"""

from alembic import op
import sqlalchemy as sa

revision = "a4d9e2f1b6c7"
down_revision = "fd3e4f5a6b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reference_counterparties",
        sa.Column("credit_status", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reference_counterparties", "credit_status")
