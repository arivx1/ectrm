"""create mutation provenance records

Revision ID: e7f8a9b0c1d3
Revises: e6f7a8b9c0d2
Create Date: 2026-04-14 21:55:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d3"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mutation_provenance_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("operation_key", sa.String(length=120), nullable=False),
        sa.Column("source_surface", sa.String(length=160), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=True),
        sa.Column("actor_role", sa.String(length=64), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("correlation_id", sa.String(length=36), nullable=True),
        sa.Column("request_method", sa.String(length=16), nullable=True),
        sa.Column("request_path", sa.String(length=255), nullable=True),
        sa.Column("outcome", sa.String(length=24), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("affected_records", sa.JSON(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_mutation_provenance_records_completed_at",
        "mutation_provenance_records",
        ["completed_at"],
        unique=False,
    )
    op.create_index(
        "ix_mutation_provenance_records_operation_key",
        "mutation_provenance_records",
        ["operation_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mutation_provenance_records_operation_key", table_name="mutation_provenance_records")
    op.drop_index("ix_mutation_provenance_records_completed_at", table_name="mutation_provenance_records")
    op.drop_table("mutation_provenance_records")
