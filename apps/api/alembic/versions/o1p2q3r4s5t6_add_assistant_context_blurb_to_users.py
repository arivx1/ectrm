"""add assistant context blurb to user accounts

Revision ID: o1p2q3r4s5t6
Revises: n0p1q2r3s4t5
Create Date: 2026-05-23 09:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, Sequence[str], None] = "n0p1q2r3s4t5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("user_accounts")}

    if "assistant_context_blurb" not in columns:
        op.add_column("user_accounts", sa.Column("assistant_context_blurb", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_accounts", "assistant_context_blurb")
