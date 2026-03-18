"""add session presence tracking

Revision ID: 8a1b2c3d4e5f
Revises: 4f6e7d8c9b10, 6a7b8c9d0e1f
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

revision = "8a1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = ("4f6e7d8c9b10", "6a7b8c9d0e1f")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_user_sessions_last_seen_at", "user_sessions", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_last_seen_at", table_name="user_sessions")
    op.drop_column("user_sessions", "last_seen_at")
