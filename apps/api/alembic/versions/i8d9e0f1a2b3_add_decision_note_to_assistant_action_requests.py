"""add decision note to assistant action requests

Revision ID: i8d9e0f1a2b3
Revises: f8a9b0c1d2e4
Create Date: 2026-04-14 22:58:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_action_requests",
        sa.Column("decision_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assistant_action_requests", "decision_note")
