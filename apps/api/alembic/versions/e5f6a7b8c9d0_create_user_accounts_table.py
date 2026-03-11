"""create user accounts table

Revision ID: e5f6a7b8c9d0
Revises: c1d2e3f4a5b6, f4a8d1c2b3e7
"""

from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = ("c1d2e3f4a5b6", "f4a8d1c2b3e7")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_accounts",
        sa.Column("user_id", sa.String(length=64), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("email", name="uq_user_accounts_email"),
    )
    op.create_index("ix_user_accounts_display_name", "user_accounts", ["display_name"])
    op.create_index("ix_user_accounts_is_active", "user_accounts", ["is_active"])
    op.create_index("ix_user_accounts_role", "user_accounts", ["role"])


def downgrade() -> None:
    op.drop_index("ix_user_accounts_role", table_name="user_accounts")
    op.drop_index("ix_user_accounts_is_active", table_name="user_accounts")
    op.drop_index("ix_user_accounts_display_name", table_name="user_accounts")
    op.drop_table("user_accounts")
