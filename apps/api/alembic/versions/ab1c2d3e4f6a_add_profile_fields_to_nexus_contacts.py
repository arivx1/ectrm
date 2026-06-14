"""add profile fields to nexus contacts

Revision ID: ab1c2d3e4f6a
Revises: aa1b2c3d4e6f
Create Date: 2026-06-08 09:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "ab1c2d3e4f6a"
down_revision: Union[str, Sequence[str], None] = "aa1b2c3d4e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEXUS_CONTACT_PROFILE_COLUMNS = (
    sa.Column("first_name", sa.String(length=128), nullable=True),
    sa.Column("last_name", sa.String(length=128), nullable=True),
    sa.Column("role", sa.String(length=256), nullable=True),
    sa.Column("time_at_role", sa.String(length=128), nullable=True),
    sa.Column("previous_role", sa.String(length=256), nullable=True),
    sa.Column("university", sa.String(length=256), nullable=True),
    sa.Column("university_2", sa.String(length=256), nullable=True),
    sa.Column("location", sa.String(length=256), nullable=True),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("nexus_contacts"):
        return

    columns = {column["name"] for column in inspector.get_columns("nexus_contacts")}
    for column in NEXUS_CONTACT_PROFILE_COLUMNS:
        if column.name not in columns:
            op.add_column("nexus_contacts", column.copy())


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("nexus_contacts"):
        return

    columns = {column["name"] for column in inspector.get_columns("nexus_contacts")}
    for column in reversed(NEXUS_CONTACT_PROFILE_COLUMNS):
        if column.name in columns:
            op.drop_column("nexus_contacts", column.name)
