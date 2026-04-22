"""create assistant agent profile requests

Revision ID: p3e4f5a6b7c8
Revises: o2d3e4f5a6b7
Create Date: 2026-04-22 14:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "p3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "o2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_agent_profile_requests",
        sa.Column("request_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("requested_agent_id", sa.String(length=64), nullable=True),
        sa.Column("business_problem", sa.Text(), nullable=False),
        sa.Column("proposed_mission", sa.Text(), nullable=False),
        sa.Column("human_owner_role", sa.String(length=128), nullable=False),
        sa.Column("requested_workspaces", sa.JSON(), nullable=False),
        sa.Column("work_objects", sa.JSON(), nullable=False),
        sa.Column("requested_inputs_tools", sa.JSON(), nullable=False),
        sa.Column("expected_outputs", sa.JSON(), nullable=False),
        sa.Column("requested_authority_ceiling", sa.String(length=32), nullable=False),
        sa.Column("stop_conditions", sa.JSON(), nullable=False),
        sa.Column("success_metrics", sa.JSON(), nullable=False),
        sa.Column("proposed_eval_cases", sa.JSON(), nullable=False),
        sa.Column("approval_notes", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("linked_agent_id", sa.String(length=64), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=128), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_by", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_status",
        "assistant_agent_profile_requests",
        ["status"],
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_requested_agent_id",
        "assistant_agent_profile_requests",
        ["requested_agent_id"],
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_linked_agent_id",
        "assistant_agent_profile_requests",
        ["linked_agent_id"],
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_requested_at",
        "assistant_agent_profile_requests",
        ["requested_at"],
    )
    op.create_index(
        "ix_assistant_agent_profile_requests_updated_at",
        "assistant_agent_profile_requests",
        ["updated_at"],
    )

    op.add_column("assistant_agents", sa.Column("profile_request_id", sa.Integer(), nullable=True))
    op.create_index("ix_assistant_agents_profile_request_id", "assistant_agents", ["profile_request_id"])


def downgrade() -> None:
    op.drop_index("ix_assistant_agents_profile_request_id", table_name="assistant_agents")
    op.drop_column("assistant_agents", "profile_request_id")

    op.drop_index("ix_assistant_agent_profile_requests_updated_at", table_name="assistant_agent_profile_requests")
    op.drop_index("ix_assistant_agent_profile_requests_requested_at", table_name="assistant_agent_profile_requests")
    op.drop_index("ix_assistant_agent_profile_requests_linked_agent_id", table_name="assistant_agent_profile_requests")
    op.drop_index(
        "ix_assistant_agent_profile_requests_requested_agent_id",
        table_name="assistant_agent_profile_requests",
    )
    op.drop_index("ix_assistant_agent_profile_requests_status", table_name="assistant_agent_profile_requests")
    op.drop_table("assistant_agent_profile_requests")
