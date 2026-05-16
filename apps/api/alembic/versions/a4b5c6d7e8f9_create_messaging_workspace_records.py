"""create messaging workspace records

Revision ID: a4b5c6d7e8f9
Revises: z3a4b5c6d7e8
Create Date: 2026-05-16 17:40:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "messaging_workspace_conversations",
        sa.Column("conversation_id", sa.String(length=64), primary_key=True),
        sa.Column("section", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("connected_workspace", sa.String(length=64), nullable=False),
        sa.Column("assistant_workspace", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("composer_hint", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "messaging_workspace_messages",
        sa.Column("message_id", sa.String(length=64), primary_key=True),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_name", sa.String(length=160), nullable=False),
        sa.Column("author_title", sa.String(length=160), nullable=False),
        sa.Column("author_presence", sa.String(length=160), nullable=False),
        sa.Column("author_initials", sa.String(length=8), nullable=False),
        sa.Column("author_tone", sa.String(length=16), nullable=False),
        sa.Column("assistant_run_id", sa.Integer(), nullable=True),
        sa.Column("assistant_agent_id", sa.String(length=64), nullable=True),
        sa.Column("assistant_agent_name", sa.String(length=160), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=128), nullable=True),
        sa.Column("created_by_session_id", sa.String(length=128), nullable=True),
        sa.Column("created_by_role", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_messaging_workspace_messages_conversation_id",
        "messaging_workspace_messages",
        ["conversation_id"],
    )
    op.create_index(
        "ix_messaging_workspace_messages_created_at",
        "messaging_workspace_messages",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_messaging_workspace_messages_created_at", table_name="messaging_workspace_messages")
    op.drop_index("ix_messaging_workspace_messages_conversation_id", table_name="messaging_workspace_messages")
    op.drop_table("messaging_workspace_messages")
    op.drop_table("messaging_workspace_conversations")
