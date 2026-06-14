"""create messaging workspace records

Revision ID: m9n0p1q2r3s4
Revises: d7e8f9g0h1i2
Create Date: 2026-05-20 08:55:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "m9n0p1q2r3s4"
down_revision: Union[str, Sequence[str], None] = "d7e8f9g0h1i2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("messaging_workspace_conversations"):
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

    if not inspector.has_table("messaging_workspace_messages"):
        op.create_table(
            "messaging_workspace_messages",
            sa.Column("message_id", sa.String(length=64), primary_key=True),
            sa.Column("conversation_id", sa.String(length=64), nullable=False),
            sa.Column("item_kind", sa.String(length=16), nullable=False),
            sa.Column("source", sa.String(length=16), nullable=False),
            sa.Column("parent_message_id", sa.String(length=64), nullable=True),
            sa.Column("thread_root_message_id", sa.String(length=64), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("system_label", sa.String(length=160), nullable=True),
            sa.Column("system_detail", sa.Text(), nullable=True),
            sa.Column("author_name", sa.String(length=160), nullable=True),
            sa.Column("author_title", sa.String(length=160), nullable=True),
            sa.Column("author_presence", sa.String(length=160), nullable=True),
            sa.Column("author_initials", sa.String(length=8), nullable=True),
            sa.Column("author_tone", sa.String(length=16), nullable=True),
            sa.Column("reactions", sa.JSON(), nullable=True),
            sa.Column("attachment_payload", sa.JSON(), nullable=True),
            sa.Column("assistant_run_id", sa.Integer(), nullable=True),
            sa.Column("assistant_agent_id", sa.String(length=64), nullable=True),
            sa.Column("assistant_agent_name", sa.String(length=160), nullable=True),
            sa.Column("created_by_user_id", sa.String(length=128), nullable=True),
            sa.Column("created_by_session_id", sa.String(length=128), nullable=True),
            sa.Column("created_by_role", sa.String(length=64), nullable=True),
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("edited_by_user_id", sa.String(length=128), nullable=True),
            sa.Column("edited_by_session_id", sa.String(length=128), nullable=True),
            sa.Column("edited_by_role", sa.String(length=64), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_by_user_id", sa.String(length=128), nullable=True),
            sa.Column("deleted_by_session_id", sa.String(length=128), nullable=True),
            sa.Column("deleted_by_role", sa.String(length=64), nullable=True),
            sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("pinned_by_user_id", sa.String(length=128), nullable=True),
            sa.Column("pinned_by_session_id", sa.String(length=128), nullable=True),
            sa.Column("pinned_by_role", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    inspector = sa.inspect(bind)
    _ensure_index(
        inspector,
        "messaging_workspace_messages",
        "ix_messaging_workspace_messages_conversation_id",
        ["conversation_id"],
    )
    _ensure_index(
        inspector,
        "messaging_workspace_messages",
        "ix_messaging_workspace_messages_thread_root_message_id",
        ["thread_root_message_id"],
    )
    _ensure_index(
        inspector,
        "messaging_workspace_messages",
        "ix_messaging_workspace_messages_created_at",
        ["created_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("messaging_workspace_messages"):
        existing_indexes = {index["name"] for index in inspector.get_indexes("messaging_workspace_messages")}
        if "ix_messaging_workspace_messages_created_at" in existing_indexes:
            op.drop_index("ix_messaging_workspace_messages_created_at", table_name="messaging_workspace_messages")
        if "ix_messaging_workspace_messages_thread_root_message_id" in existing_indexes:
            op.drop_index(
                "ix_messaging_workspace_messages_thread_root_message_id",
                table_name="messaging_workspace_messages",
            )
        if "ix_messaging_workspace_messages_conversation_id" in existing_indexes:
            op.drop_index("ix_messaging_workspace_messages_conversation_id", table_name="messaging_workspace_messages")
        op.drop_table("messaging_workspace_messages")

    if inspector.has_table("messaging_workspace_conversations"):
        op.drop_table("messaging_workspace_conversations")


def _ensure_index(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
    columns: list[str],
) -> None:
    existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name not in existing_indexes:
        op.create_index(index_name, table_name, columns)
