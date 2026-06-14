"""create report and workbook definitions

Revision ID: d9e0f1a2b3c4
Revises: z8a9b0c1d2e3
Create Date: 2026-05-19 16:55:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "z8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_definition_table(table_name: str, key_column: str, unique_name: str) -> None:
    op.create_table(
        table_name,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(key_column, sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("scope_owner_key", sa.String(length=128), nullable=False),
        sa.Column("lifecycle_status", sa.String(length=16), nullable=False),
        sa.Column("definition_json", sa.JSON(), nullable=False),
        sa.Column("validation_json", sa.JSON(), nullable=False),
        sa.Column("referenced_dataset_ids", sa.JSON(), nullable=False),
        sa.Column("definition_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(length=128), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_by", sa.String(length=128), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(key_column, "scope_owner_key", name=unique_name),
    )
    op.create_index(f"ix_{table_name}_{key_column}", table_name, [key_column])
    op.create_index(f"ix_{table_name}_scope", table_name, ["scope"])
    op.create_index(f"ix_{table_name}_scope_owner_key", table_name, ["scope_owner_key"])
    op.create_index(f"ix_{table_name}_lifecycle_status", table_name, ["lifecycle_status"])
    op.create_index(f"ix_{table_name}_created_by", table_name, ["created_by"])


def _drop_definition_table(table_name: str, key_column: str) -> None:
    op.drop_index(f"ix_{table_name}_created_by", table_name=table_name)
    op.drop_index(f"ix_{table_name}_lifecycle_status", table_name=table_name)
    op.drop_index(f"ix_{table_name}_scope_owner_key", table_name=table_name)
    op.drop_index(f"ix_{table_name}_scope", table_name=table_name)
    op.drop_index(f"ix_{table_name}_{key_column}", table_name=table_name)
    op.drop_table(table_name)


def upgrade() -> None:
    _create_definition_table(
        "report_definitions",
        "report_key",
        "uq_report_definitions_key_owner",
    )
    _create_definition_table(
        "workbook_definitions",
        "workbook_key",
        "uq_workbook_definitions_key_owner",
    )


def downgrade() -> None:
    _drop_definition_table("workbook_definitions", "workbook_key")
    _drop_definition_table("report_definitions", "report_key")
