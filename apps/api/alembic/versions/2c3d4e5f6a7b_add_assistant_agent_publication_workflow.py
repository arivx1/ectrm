"""add assistant agent publication workflow

Revision ID: 2c3d4e5f6a7b
Revises: 1b2c3d4e5f6a
Create Date: 2026-04-14 19:05:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c3d4e5f6a7b"
down_revision: Union[str, Sequence[str], None] = "1b2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assistant_agents", sa.Column("latest_revision_id", sa.Integer(), nullable=True))
    op.add_column("assistant_agents", sa.Column("published_revision_id", sa.Integer(), nullable=True))
    op.add_column("assistant_agents", sa.Column("published_snapshot", sa.JSON(), nullable=True))
    op.add_column("assistant_agents", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("assistant_agents", sa.Column("published_by", sa.String(length=128), nullable=True))

    op.create_table(
        "assistant_agent_revisions",
        sa.Column("revision_id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("change_summary", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(length=128), nullable=True),
        sa.Column("restored_from_revision_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["assistant_agents.agent_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("revision_id"),
    )
    op.create_index("ix_assistant_agent_revisions_agent_id", "assistant_agent_revisions", ["agent_id"])
    op.create_index("ix_assistant_agent_revisions_published_at", "assistant_agent_revisions", ["published_at"])
    op.alter_column("assistant_agent_revisions", "change_summary", server_default=None)

    op.create_table(
        "assistant_agent_eval_runs",
        sa.Column("run_id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("passed_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["assistant_agents.agent_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revision_id"], ["assistant_agent_revisions.revision_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("run_id"),
    )
    op.create_index("ix_assistant_agent_eval_runs_agent_id", "assistant_agent_eval_runs", ["agent_id"])
    op.create_index("ix_assistant_agent_eval_runs_created_at", "assistant_agent_eval_runs", ["created_at"])
    op.alter_column("assistant_agent_eval_runs", "results", server_default=None)

    bind = op.get_bind()
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("name", sa.String(length=160)),
        sa.column("description", sa.String(length=500)),
        sa.column("status", sa.String(length=24)),
        sa.column("scope", sa.String(length=24)),
        sa.column("provider", sa.String(length=32)),
        sa.column("model", sa.String(length=160)),
        sa.column("allowed_workspaces", sa.JSON()),
        sa.column("capabilities", sa.JSON()),
        sa.column("allowed_tools", sa.JSON()),
        sa.column("allowed_action_types", sa.JSON()),
        sa.column("system_prompt", sa.Text()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("updated_by", sa.String(length=128)),
        sa.column("version", sa.Integer()),
        sa.column("latest_revision_id", sa.Integer()),
        sa.column("published_revision_id", sa.Integer()),
        sa.column("published_snapshot", sa.JSON()),
        sa.column("published_at", sa.DateTime(timezone=True)),
        sa.column("published_by", sa.String(length=128)),
    )
    assistant_agent_revisions = sa.table(
        "assistant_agent_revisions",
        sa.column("revision_id", sa.Integer()),
        sa.column("agent_id", sa.String(length=64)),
        sa.column("version", sa.Integer()),
        sa.column("payload", sa.JSON()),
        sa.column("change_summary", sa.JSON()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("created_by", sa.String(length=128)),
        sa.column("published_at", sa.DateTime(timezone=True)),
        sa.column("published_by", sa.String(length=128)),
        sa.column("restored_from_revision_id", sa.Integer()),
    )

    rows = bind.execute(
        sa.select(
            assistant_agents.c.agent_id,
            assistant_agents.c.name,
            assistant_agents.c.description,
            assistant_agents.c.status,
            assistant_agents.c.scope,
            assistant_agents.c.provider,
            assistant_agents.c.model,
            assistant_agents.c.allowed_workspaces,
            assistant_agents.c.capabilities,
            assistant_agents.c.allowed_tools,
            assistant_agents.c.allowed_action_types,
            assistant_agents.c.system_prompt,
            assistant_agents.c.updated_at,
            assistant_agents.c.updated_by,
            assistant_agents.c.version,
        )
    ).mappings()

    for row in rows:
        payload = {
            "name": row["name"],
            "description": row["description"],
            "status": row["status"],
            "scope": row["scope"],
            "provider": row["provider"],
            "model": row["model"],
            "allowed_workspaces": list(row["allowed_workspaces"] or []),
            "capabilities": list(row["capabilities"] or []),
            "allowed_tools": list(row["allowed_tools"] or []),
            "allowed_action_types": list(row["allowed_action_types"] or []),
            "system_prompt": row["system_prompt"],
        }
        is_published = str(row["status"] or "").strip().upper() != "DRAFT"
        insert_result = bind.execute(
            assistant_agent_revisions.insert().values(
                agent_id=row["agent_id"],
                version=row["version"],
                payload=payload,
                change_summary=["Initial assistant agent snapshot."],
                created_at=row["updated_at"],
                created_by=row["updated_by"],
                published_at=row["updated_at"] if is_published else None,
                published_by=row["updated_by"] if is_published else None,
                restored_from_revision_id=None,
            )
        )
        revision_id = insert_result.inserted_primary_key[0]
        bind.execute(
            assistant_agents.update()
            .where(assistant_agents.c.agent_id == row["agent_id"])
            .values(
                latest_revision_id=revision_id,
                published_revision_id=revision_id if is_published else None,
                published_snapshot=payload if is_published else None,
                published_at=row["updated_at"] if is_published else None,
                published_by=row["updated_by"] if is_published else None,
            )
        )


def downgrade() -> None:
    op.drop_index("ix_assistant_agent_eval_runs_created_at", table_name="assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_eval_runs_agent_id", table_name="assistant_agent_eval_runs")
    op.drop_table("assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_revisions_published_at", table_name="assistant_agent_revisions")
    op.drop_index("ix_assistant_agent_revisions_agent_id", table_name="assistant_agent_revisions")
    op.drop_table("assistant_agent_revisions")
    op.drop_column("assistant_agents", "published_by")
    op.drop_column("assistant_agents", "published_at")
    op.drop_column("assistant_agents", "published_snapshot")
    op.drop_column("assistant_agents", "published_revision_id")
    op.drop_column("assistant_agents", "latest_revision_id")
