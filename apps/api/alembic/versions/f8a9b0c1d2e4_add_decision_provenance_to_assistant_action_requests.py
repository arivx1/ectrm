"""add decision provenance to assistant action requests

Revision ID: f8a9b0c1d2e4
Revises: e7f8a9b0c1d3
Create Date: 2026-04-14 22:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e4"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_action_requests",
        sa.Column("decision_provenance_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_assistant_action_requests_decision_provenance_id",
        "assistant_action_requests",
        "mutation_provenance_records",
        ["decision_provenance_id"],
        ["id"],
    )
    op.create_index(
        "ix_assistant_action_requests_decision_provenance_id",
        "assistant_action_requests",
        ["decision_provenance_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_action_requests_decision_provenance_id",
        table_name="assistant_action_requests",
    )
    op.drop_constraint(
        "fk_assistant_action_requests_decision_provenance_id",
        "assistant_action_requests",
        type_="foreignkey",
    )
    op.drop_column("assistant_action_requests", "decision_provenance_id")
