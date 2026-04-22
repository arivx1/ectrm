"""add assistant agent profile metadata

Revision ID: o2d3e4f5a6b7
Revises: n1c2d3e4f5a6
Create Date: 2026-04-22 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "o2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "n1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURATED_PROFILE_BACKFILLS: tuple[dict[str, str], ...] = (
    {
        "agent_id": "trade-ops-copilot",
        "role_key": "trade-ops-copilot",
        "profile_kind": "CURATED",
        "specialization_summary": "Curated seed profile for the Trade Ops Copilot role archetype.",
        "human_owner_role": "Operations Lead",
        "authority_ceiling": "STAGE",
        "activation_notes": "Seeded by the platform role catalog.",
    },
    {
        "agent_id": "settlement-copilot",
        "role_key": "settlement-copilot",
        "profile_kind": "CURATED",
        "specialization_summary": "Curated seed profile for the Settlement Copilot role archetype.",
        "human_owner_role": "Settlement Lead",
        "authority_ceiling": "STAGE",
        "activation_notes": "Seeded by the platform role catalog.",
    },
    {
        "agent_id": "trade-governor",
        "role_key": "trade-governor",
        "profile_kind": "CURATED",
        "specialization_summary": "Curated seed profile for the Trade Governor role archetype.",
        "human_owner_role": "Trader, Desk Lead, or Admin",
        "authority_ceiling": "STAGE",
        "activation_notes": "Seeded by the platform role catalog.",
    },
)

ROLE_DERIVED_PROFILE_BACKFILLS: tuple[dict[str, str], ...] = (
    {
        "agent_id": "trade-explainer",
        "role_key": "trade-explainer",
        "profile_kind": "ROLE_DERIVED",
        "specialization_summary": "Role-derived profile for explaining selected trade state, recent events, and exposure.",
        "human_owner_role": "Trader",
        "authority_ceiling": "EXPLAIN",
        "activation_notes": "Derived from the platform role catalog template.",
    },
    {
        "agent_id": "ops-coordinator",
        "role_key": "ops-coordinator",
        "profile_kind": "ROLE_DERIVED",
        "specialization_summary": "Role-derived profile for summarizing operational blockers and next-step handoffs.",
        "human_owner_role": "Operations Lead",
        "authority_ceiling": "DRAFT",
        "activation_notes": "Derived from the platform role catalog template.",
    },
    {
        "agent_id": "settlement-analyst",
        "role_key": "settlement-analyst",
        "profile_kind": "ROLE_DERIVED",
        "specialization_summary": "Role-derived profile for interpreting invoices, payments, aging, and settlement posture.",
        "human_owner_role": "Settlement Lead",
        "authority_ceiling": "DRAFT",
        "activation_notes": "Derived from the platform role catalog template.",
    },
    {
        "agent_id": "document-triage",
        "role_key": "document-triage",
        "profile_kind": "ROLE_DERIVED",
        "specialization_summary": "Role-derived profile for reviewing document ingestion, linkage, and routing confidence.",
        "human_owner_role": "Operations Lead",
        "authority_ceiling": "DRAFT",
        "activation_notes": "Derived from the platform role catalog template.",
    },
    {
        "agent_id": "desk-briefing",
        "role_key": "desk-briefing",
        "profile_kind": "ROLE_DERIVED",
        "specialization_summary": "Role-derived profile for desk-ready briefings across exposure, workflow pressure, and market context.",
        "human_owner_role": "Desk Lead",
        "authority_ceiling": "DRAFT",
        "activation_notes": "Derived from the platform role catalog template.",
    },
)


def upgrade() -> None:
    op.add_column("assistant_agents", sa.Column("role_key", sa.String(length=80), nullable=True))
    op.add_column(
        "assistant_agents",
        sa.Column("profile_kind", sa.String(length=32), nullable=False, server_default="CUSTOM"),
    )
    op.add_column("assistant_agents", sa.Column("specialization_summary", sa.String(length=500), nullable=True))
    op.add_column("assistant_agents", sa.Column("human_owner_role", sa.String(length=128), nullable=True))
    op.add_column("assistant_agents", sa.Column("authority_ceiling", sa.String(length=32), nullable=True))
    op.add_column("assistant_agents", sa.Column("activation_notes", sa.Text(), nullable=True))
    op.create_index("ix_assistant_agents_role_key", "assistant_agents", ["role_key"])
    op.create_index("ix_assistant_agents_profile_kind", "assistant_agents", ["profile_kind"])

    op.add_column("assistant_runs", sa.Column("agent_role_key", sa.String(length=80), nullable=True))
    op.add_column("assistant_runs", sa.Column("agent_profile_kind", sa.String(length=32), nullable=True))
    op.create_index("ix_assistant_runs_agent_role_key", "assistant_runs", ["agent_role_key"])

    for profile in (*CURATED_PROFILE_BACKFILLS, *ROLE_DERIVED_PROFILE_BACKFILLS):
        op.execute(
            sa.text(
                """
                UPDATE assistant_agents
                SET role_key = :role_key,
                    profile_kind = :profile_kind,
                    specialization_summary = :specialization_summary,
                    human_owner_role = :human_owner_role,
                    authority_ceiling = :authority_ceiling,
                    activation_notes = :activation_notes
                WHERE agent_id = :agent_id
                """
            ).bindparams(**profile)
        )


def downgrade() -> None:
    op.drop_index("ix_assistant_runs_agent_role_key", table_name="assistant_runs")
    op.drop_column("assistant_runs", "agent_profile_kind")
    op.drop_column("assistant_runs", "agent_role_key")

    op.drop_index("ix_assistant_agents_profile_kind", table_name="assistant_agents")
    op.drop_index("ix_assistant_agents_role_key", table_name="assistant_agents")
    op.drop_column("assistant_agents", "activation_notes")
    op.drop_column("assistant_agents", "authority_ceiling")
    op.drop_column("assistant_agents", "human_owner_role")
    op.drop_column("assistant_agents", "specialization_summary")
    op.drop_column("assistant_agents", "profile_kind")
    op.drop_column("assistant_agents", "role_key")
