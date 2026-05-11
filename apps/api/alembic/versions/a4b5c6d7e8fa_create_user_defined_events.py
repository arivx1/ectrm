"""create user defined events

Revision ID: a4b5c6d7e8fa
Revises: z3a4b5c6d7e8
Create Date: 2026-05-10 20:20:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8fa"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_defined_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column("place", sa.String(length=160), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recurrence_frequency", sa.String(length=20), nullable=True),
        sa.Column("recurrence_interval", sa.Integer(), nullable=True),
        sa.Column("recurrence_count", sa.Integer(), nullable=True),
        sa.Column("recurrence_until_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence_by_weekday", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_defined_events_kind", "user_defined_events", ["kind"])
    op.create_index("ix_user_defined_events_is_active", "user_defined_events", ["is_active"])
    op.create_index("ix_user_defined_events_starts_at", "user_defined_events", ["starts_at"])
    op.create_index("ix_user_defined_events_place", "user_defined_events", ["place"])


def downgrade() -> None:
    op.drop_index("ix_user_defined_events_place", table_name="user_defined_events")
    op.drop_index("ix_user_defined_events_starts_at", table_name="user_defined_events")
    op.drop_index("ix_user_defined_events_is_active", table_name="user_defined_events")
    op.drop_index("ix_user_defined_events_kind", table_name="user_defined_events")
    op.drop_table("user_defined_events")
