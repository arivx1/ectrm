"""add google subject to user accounts

Revision ID: d1e2f3a4b5c6
Revises: 8a1b2c3d4e5f
"""

from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "8a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("google_subject", sa.String(length=255), nullable=True))
    op.create_index("ix_user_accounts_google_subject", "user_accounts", ["google_subject"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_accounts_google_subject", table_name="user_accounts")
    op.drop_column("user_accounts", "google_subject")
