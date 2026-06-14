"""add user profile identity fields

Revision ID: j2k3l4m5n6o7
Revises: i1j2k3l4m5n6
Create Date: 2026-05-25 09:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "j2k3l4m5n6o7"
down_revision: Union[str, Sequence[str], None] = "i1j2k3l4m5n6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("user_accounts")}

    if "first_name" not in columns:
        op.add_column("user_accounts", sa.Column("first_name", sa.String(length=80), nullable=True))
    if "last_name" not in columns:
        op.add_column("user_accounts", sa.Column("last_name", sa.String(length=80), nullable=True))
    if "preferred_timezone" not in columns:
        op.add_column("user_accounts", sa.Column("preferred_timezone", sa.String(length=64), nullable=True))
    if "primary_location" not in columns:
        op.add_column("user_accounts", sa.Column("primary_location", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("user_accounts", "primary_location")
    op.drop_column("user_accounts", "preferred_timezone")
    op.drop_column("user_accounts", "last_name")
    op.drop_column("user_accounts", "first_name")
