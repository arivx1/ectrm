"""create home view definitions table

Revision ID: hvi1a2b3c4d5
Revises: o1p2q3r4s5t6
Create Date: 2026-05-24 06:10:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "hvi1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "o1p2q3r4s5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "home_view_definitions",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("definition_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("scope_owner_key", sa.String(length=128), nullable=False),
        sa.Column("base_template_key", sa.String(length=64), nullable=False),
        sa.Column("base_template_version", sa.Integer(), nullable=False),
        sa.Column("persona_hint", sa.String(length=32), nullable=True),
        sa.Column("layout_json", sa.JSON(), nullable=False),
        sa.Column("filters_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("definition_key", name="uq_home_view_definitions_definition_key"),
        sa.UniqueConstraint(
            "scope",
            "scope_owner_key",
            "name_key",
            name="uq_home_view_definitions_scope_owner_name",
        ),
    )
    op.create_index(
        "ix_home_view_definitions_definition_key",
        "home_view_definitions",
        ["definition_key"],
    )
    op.create_index(
        "ix_home_view_definitions_scope",
        "home_view_definitions",
        ["scope"],
    )
    op.create_index(
        "ix_home_view_definitions_scope_owner_key",
        "home_view_definitions",
        ["scope_owner_key"],
    )
    op.create_index(
        "ix_home_view_definitions_status",
        "home_view_definitions",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_home_view_definitions_status", table_name="home_view_definitions")
    op.drop_index("ix_home_view_definitions_scope_owner_key", table_name="home_view_definitions")
    op.drop_index("ix_home_view_definitions_scope", table_name="home_view_definitions")
    op.drop_index("ix_home_view_definitions_definition_key", table_name="home_view_definitions")
    op.drop_table("home_view_definitions")
