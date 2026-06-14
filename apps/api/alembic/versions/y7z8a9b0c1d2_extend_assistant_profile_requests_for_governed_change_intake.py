"""extend assistant profile requests for governed change intake

Revision ID: y7z8a9b0c1d2
Revises: v9k0l1m2n3o4
Create Date: 2026-05-16 19:05:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "y7z8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "v9k0l1m2n3o4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column(
            "request_kind",
            sa.String(length=32),
            nullable=False,
            server_default="NEW_SPECIALIZATION",
        ),
    )
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column("target_agent_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column("change_summary", sa.Text(), nullable=True),
    )
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column("requested_action_types", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "assistant_agent_profile_requests",
        sa.Column("requested_skills", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_target_agent_id",
        "assistant_agent_profile_requests",
        ["target_agent_id"],
    )
    op.alter_column("assistant_agent_profile_requests", "request_kind", server_default=None)
    op.alter_column("assistant_agent_profile_requests", "requested_action_types", server_default=None)
    op.alter_column("assistant_agent_profile_requests", "requested_skills", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_agent_profile_requests_target_agent_id",
        table_name="assistant_agent_profile_requests",
    )
    op.drop_column("assistant_agent_profile_requests", "requested_skills")
    op.drop_column("assistant_agent_profile_requests", "requested_action_types")
    op.drop_column("assistant_agent_profile_requests", "change_summary")
    op.drop_column("assistant_agent_profile_requests", "target_agent_id")
    op.drop_column("assistant_agent_profile_requests", "request_kind")
