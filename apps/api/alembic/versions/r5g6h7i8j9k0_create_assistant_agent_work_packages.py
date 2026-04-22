"""create assistant agent work packages

Revision ID: r5g6h7i8j9k0
Revises: q4f5a6b7c8d9, r4f5a6b7c8d9
Create Date: 2026-04-22 18:10:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r5g6h7i8j9k0"
down_revision: Union[str, Sequence[str], None] = ("q4f5a6b7c8d9", "r4f5a6b7c8d9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_agent_work_packages",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("work_package_id", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("package_type", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("source_agent_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_agent_names", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_recommendations", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_candidates", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("recommended_owner_role", sa.String(length=128), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("acceptance_checks", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("knowledge_base_titles", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_by", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("work_package_id"),
    )
    op.create_index(
        "ix_assistant_agent_work_packages_status",
        "assistant_agent_work_packages",
        ["status"],
    )
    op.create_index(
        "ix_assistant_agent_work_packages_updated_at",
        "assistant_agent_work_packages",
        ["updated_at"],
    )
    op.create_index(
        "ix_assistant_agent_work_packages_work_package_id",
        "assistant_agent_work_packages",
        ["work_package_id"],
    )
    op.alter_column("assistant_agent_work_packages", "source_agent_ids", server_default=None)
    op.alter_column("assistant_agent_work_packages", "source_agent_names", server_default=None)
    op.alter_column("assistant_agent_work_packages", "source_recommendations", server_default=None)
    op.alter_column("assistant_agent_work_packages", "source_candidates", server_default=None)
    op.alter_column("assistant_agent_work_packages", "acceptance_checks", server_default=None)
    op.alter_column("assistant_agent_work_packages", "knowledge_base_titles", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_agent_work_packages_work_package_id",
        table_name="assistant_agent_work_packages",
    )
    op.drop_index("ix_assistant_agent_work_packages_updated_at", table_name="assistant_agent_work_packages")
    op.drop_index("ix_assistant_agent_work_packages_status", table_name="assistant_agent_work_packages")
    op.drop_table("assistant_agent_work_packages")
