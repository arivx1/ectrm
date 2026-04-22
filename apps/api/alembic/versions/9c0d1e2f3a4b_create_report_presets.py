"""create report presets

Revision ID: 9c0d1e2f3a4b
Revises: 8b9c0d1e2f3a
Create Date: 2026-04-06 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c0d1e2f3a4b"
down_revision: Union[str, Sequence[str], None] = "8b9c0d1e2f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_presets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("preset_key", sa.String(length=32), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("scope_owner_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("filters_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "preset_key",
            "scope_owner_key",
            "name_key",
            name="uq_report_presets_key_owner_name",
        ),
    )
    op.create_index("ix_report_presets_preset_key", "report_presets", ["preset_key"], unique=False)
    op.create_index("ix_report_presets_scope", "report_presets", ["scope"], unique=False)
    op.create_index("ix_report_presets_scope_owner_key", "report_presets", ["scope_owner_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_report_presets_scope_owner_key", table_name="report_presets")
    op.drop_index("ix_report_presets_scope", table_name="report_presets")
    op.drop_index("ix_report_presets_preset_key", table_name="report_presets")
    op.drop_table("report_presets")
