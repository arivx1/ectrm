"""add password hash and user sessions

Revision ID: c4d5e6f7a8b9
Revises: e5f6a7b8c9d0
"""

from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7a8b9"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("password_hash", sa.String(length=255), nullable=True))

    op.create_table(
        "user_sessions",
        sa.Column("session_id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.user_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_token_hash", "user_sessions", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_sessions_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_column("user_accounts", "password_hash")
