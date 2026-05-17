"""link profile requests to agent revisions

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-05-16 20:20:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "z8a9b0c1d2e3"
down_revision: Union[str, Sequence[str], None] = "y7z8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column("linked_revision_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_linked_revision_id",
        "assistant_agent_profile_requests",
        ["linked_revision_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_agent_profile_requests_linked_revision_id",
        table_name="assistant_agent_profile_requests",
    )
    op.drop_column("assistant_agent_profile_requests", "linked_revision_id")
