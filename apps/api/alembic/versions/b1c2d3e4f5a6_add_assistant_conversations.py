"""add assistant conversations

Revision ID: b1c2d3e4f5a6
Revises: a9b8c7d6e5f4
Create Date: 2026-03-27 10:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_role", sa.String(length=64), nullable=False),
        sa.Column("workspace", sa.String(length=32), nullable=True),
        sa.Column("agent_id", sa.String(length=64), nullable=True),
        sa.Column("agent_name", sa.String(length=160), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("use_live_tools", sa.Boolean(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latest_run_id", sa.Integer(), nullable=True),
        sa.Column("latest_user_message", sa.Text(), nullable=True),
        sa.Column("latest_assistant_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_conversations_updated_at",
        "assistant_conversations",
        ["updated_at"],
    )
    op.create_index(
        "ix_assistant_conversations_user_id",
        "assistant_conversations",
        ["user_id"],
    )

    op.add_column(
        "assistant_runs",
        sa.Column("conversation_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_assistant_runs_conversation_id",
        "assistant_runs",
        ["conversation_id"],
    )

    bind = op.get_bind()
    assistant_runs = sa.table(
        "assistant_runs",
        sa.column("id", sa.Integer()),
        sa.column("user_id", sa.String(length=128)),
        sa.column("session_id", sa.String(length=128)),
        sa.column("user_role", sa.String(length=64)),
        sa.column("workspace", sa.String(length=32)),
        sa.column("agent_id", sa.String(length=64)),
        sa.column("agent_name", sa.String(length=160)),
        sa.column("provider", sa.String(length=32)),
        sa.column("model", sa.String(length=160)),
        sa.column("use_live_tools", sa.Boolean()),
        sa.column("latest_user_message", sa.Text()),
        sa.column("assistant_message", sa.Text()),
        sa.column("error_detail", sa.Text()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("completed_at", sa.DateTime(timezone=True)),
        sa.column("conversation_id", sa.Integer()),
    )
    assistant_conversations = sa.table(
        "assistant_conversations",
        sa.column("id", sa.Integer()),
        sa.column("user_id", sa.String(length=128)),
        sa.column("session_id", sa.String(length=128)),
        sa.column("user_role", sa.String(length=64)),
        sa.column("workspace", sa.String(length=32)),
        sa.column("agent_id", sa.String(length=64)),
        sa.column("agent_name", sa.String(length=160)),
        sa.column("provider", sa.String(length=32)),
        sa.column("model", sa.String(length=160)),
        sa.column("use_live_tools", sa.Boolean()),
        sa.column("title", sa.String(length=160)),
        sa.column("run_count", sa.Integer()),
        sa.column("latest_run_id", sa.Integer()),
        sa.column("latest_user_message", sa.Text()),
        sa.column("latest_assistant_message", sa.Text()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    run_rows = bind.execute(sa.select(assistant_runs)).mappings()
    for row in run_rows:
        title = _normalize_title(
            row["latest_user_message"] or row["assistant_message"] or row["error_detail"] or "Imported conversation"
        )
        inserted = bind.execute(
            assistant_conversations.insert().values(
                user_id=row["user_id"],
                session_id=row["session_id"],
                user_role=row["user_role"],
                workspace=row["workspace"],
                agent_id=row["agent_id"],
                agent_name=row["agent_name"],
                provider=row["provider"],
                model=row["model"],
                use_live_tools=row["use_live_tools"],
                title=title,
                run_count=1,
                latest_run_id=row["id"],
                latest_user_message=row["latest_user_message"],
                latest_assistant_message=row["assistant_message"] or row["error_detail"],
                created_at=row["created_at"],
                updated_at=row["completed_at"],
            )
        )
        conversation_id = inserted.inserted_primary_key[0]
        bind.execute(
            assistant_runs.update()
            .where(assistant_runs.c.id == row["id"])
            .values(conversation_id=conversation_id)
        )

    op.alter_column("assistant_conversations", "run_count", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_assistant_runs_conversation_id", table_name="assistant_runs")
    op.drop_column("assistant_runs", "conversation_id")

    op.drop_index("ix_assistant_conversations_user_id", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_updated_at", table_name="assistant_conversations")
    op.drop_table("assistant_conversations")


def _normalize_title(value: str) -> str:
    collapsed = " ".join(str(value).split()).strip() or "Imported conversation"
    if len(collapsed) <= 160:
        return collapsed
    return f"{collapsed[:157].rstrip()}..."
