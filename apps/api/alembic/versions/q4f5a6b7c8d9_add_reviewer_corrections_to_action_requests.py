"""add reviewer corrections to assistant action requests

Revision ID: q4f5a6b7c8d9
Revises: p3e4f5a6b7c8
Create Date: 2026-04-22 15:45:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "q4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "p3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_action_requests",
        sa.Column("review_outcome", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "assistant_action_requests",
        sa.Column("correction_summary", sa.Text(), nullable=True),
    )
    op.add_column(
        "assistant_action_requests",
        sa.Column("correction_fields", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_assistant_action_requests_review_outcome",
        "assistant_action_requests",
        ["review_outcome"],
    )


def downgrade() -> None:
    op.drop_index("ix_assistant_action_requests_review_outcome", table_name="assistant_action_requests")
    op.drop_column("assistant_action_requests", "correction_fields")
    op.drop_column("assistant_action_requests", "correction_summary")
    op.drop_column("assistant_action_requests", "review_outcome")
