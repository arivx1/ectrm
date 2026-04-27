"""create assistant agent eval runs

Revision ID: r4f5a6b7c8d9
Revises: p3e4f5a6b7c8
Create Date: 2026-04-22 16:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "p3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_TABLE_NAME = "assistant_agent_eval_runs_legacy"
LEGACY_INDEX_RENAMES: tuple[tuple[str, str], ...] = (
    ("assistant_agent_eval_runs_pkey", "assistant_agent_eval_runs_legacy_pkey"),
    ("ix_assistant_agent_eval_runs_agent_id", "ix_assistant_agent_eval_runs_legacy_agent_id"),
    ("ix_assistant_agent_eval_runs_created_at", "ix_assistant_agent_eval_runs_legacy_created_at"),
)
LEGACY_COLUMNS = {"revision_id", "passed_count", "failed_count", "results", "created_at", "created_by"}
CURRENT_COLUMNS = {
    "id",
    "eval_id",
    "agent_id",
    "run_id",
    "status",
    "failure_reasons",
    "observed_tool_names",
    "observed_action_types",
    "response_message",
    "started_at",
    "completed_at",
    "run_by",
}


def _table_columns(bind: sa.engine.Connection, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _archive_legacy_eval_runs(bind: sa.engine.Connection) -> None:
    table_columns = _table_columns(bind, "assistant_agent_eval_runs")
    if not table_columns:
        return
    if CURRENT_COLUMNS.issubset(table_columns):
        return
    if not LEGACY_COLUMNS.issubset(table_columns):
        raise RuntimeError(
            "assistant_agent_eval_runs exists with an unexpected schema; "
            "manual migration is required before applying r4f5a6b7c8d9."
        )

    if _table_columns(bind, LEGACY_TABLE_NAME):
        raise RuntimeError(
            "assistant_agent_eval_runs_legacy already exists; "
            "manual review is required before applying r4f5a6b7c8d9."
        )

    op.rename_table("assistant_agent_eval_runs", LEGACY_TABLE_NAME)
    for old_name, new_name in LEGACY_INDEX_RENAMES:
        op.execute(sa.text(f"ALTER INDEX IF EXISTS {old_name} RENAME TO {new_name}"))


def upgrade() -> None:
    bind = op.get_bind()
    _archive_legacy_eval_runs(bind)

    if CURRENT_COLUMNS.issubset(_table_columns(bind, "assistant_agent_eval_runs")):
        return

    op.create_table(
        "assistant_agent_eval_runs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("eval_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("failure_reasons", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("observed_tool_names", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("observed_action_types", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("response_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_by", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["assistant_agents.agent_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["eval_id"], ["assistant_agent_evals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["assistant_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_agent_eval_runs_agent_id", "assistant_agent_eval_runs", ["agent_id"])
    op.create_index("ix_assistant_agent_eval_runs_completed_at", "assistant_agent_eval_runs", ["completed_at"])
    op.create_index("ix_assistant_agent_eval_runs_eval_id", "assistant_agent_eval_runs", ["eval_id"])
    op.create_index("ix_assistant_agent_eval_runs_run_id", "assistant_agent_eval_runs", ["run_id"])
    op.create_index("ix_assistant_agent_eval_runs_status", "assistant_agent_eval_runs", ["status"])
    op.alter_column("assistant_agent_eval_runs", "failure_reasons", server_default=None)
    op.alter_column("assistant_agent_eval_runs", "observed_tool_names", server_default=None)
    op.alter_column("assistant_agent_eval_runs", "observed_action_types", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_assistant_agent_eval_runs_status", table_name="assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_eval_runs_run_id", table_name="assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_eval_runs_eval_id", table_name="assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_eval_runs_completed_at", table_name="assistant_agent_eval_runs")
    op.drop_index("ix_assistant_agent_eval_runs_agent_id", table_name="assistant_agent_eval_runs")
    op.drop_table("assistant_agent_eval_runs")
