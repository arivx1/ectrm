"""create assistant organization context definitions

Revision ID: c1d2e3f4a5b6
Revises: z3a4b5c6d7e8
Create Date: 2026-05-10 21:25:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_organization_context_definitions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("definition_key", sa.String(length=80), nullable=False),
        sa.Column("section_key", sa.String(length=80), nullable=False),
        sa.Column("content_kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("scope", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(length=128), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_by", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "definition_key",
            "version",
            name="uq_assistant_organization_context_definition_version",
        ),
    )
    op.create_index(
        "ix_assistant_organization_context_definitions_content_kind",
        "assistant_organization_context_definitions",
        ["content_kind"],
    )
    op.create_index(
        "ix_assistant_organization_context_definitions_definition_key",
        "assistant_organization_context_definitions",
        ["definition_key"],
    )
    op.create_index(
        "ix_assistant_organization_context_definitions_published_at",
        "assistant_organization_context_definitions",
        ["published_at"],
    )
    op.create_index(
        "ix_assistant_organization_context_definitions_section_key",
        "assistant_organization_context_definitions",
        ["section_key"],
    )
    op.create_index(
        "ix_assistant_organization_context_definitions_status",
        "assistant_organization_context_definitions",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_organization_context_definitions_status",
        table_name="assistant_organization_context_definitions",
    )
    op.drop_index(
        "ix_assistant_organization_context_definitions_section_key",
        table_name="assistant_organization_context_definitions",
    )
    op.drop_index(
        "ix_assistant_organization_context_definitions_published_at",
        table_name="assistant_organization_context_definitions",
    )
    op.drop_index(
        "ix_assistant_organization_context_definitions_definition_key",
        table_name="assistant_organization_context_definitions",
    )
    op.drop_index(
        "ix_assistant_organization_context_definitions_content_kind",
        table_name="assistant_organization_context_definitions",
    )
    op.drop_table("assistant_organization_context_definitions")
