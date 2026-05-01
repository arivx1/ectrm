"""repair assistant agent publication schema

Revision ID: 04d3f5a6b7c9
Revises: z3a4b5c6d7e8
Create Date: 2026-04-29 13:15:00.000000
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "04d3f5a6b7c9"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LIST_PAYLOAD_KEYS = {
    "allowed_workspaces",
    "capabilities",
    "allowed_tools",
    "allowed_action_types",
}
REQUIRED_PAYLOAD_KEYS = {
    "name",
    "description",
    "status",
    "scope",
    "profile_kind",
    "system_prompt",
}
PUBLICATION_COLUMNS: tuple[sa.Column[Any], ...] = (
    sa.Column("latest_revision_id", sa.Integer(), nullable=True),
    sa.Column("published_revision_id", sa.Integer(), nullable=True),
    sa.Column("published_snapshot", sa.JSON(), nullable=True),
    sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("published_by", sa.String(length=128), nullable=True),
)
REVISION_COLUMNS: tuple[sa.Column[Any], ...] = (
    sa.Column("revision_id", sa.Integer(), nullable=False, autoincrement=True),
    sa.Column("agent_id", sa.String(length=64), nullable=False),
    sa.Column("version", sa.Integer(), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=False),
    sa.Column("change_summary", sa.JSON(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("created_by", sa.String(length=128), nullable=False),
    sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("published_by", sa.String(length=128), nullable=True),
    sa.Column("restored_from_revision_id", sa.Integer(), nullable=True),
)


def _table_columns(bind: sa.engine.Connection, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _table_indexes(bind: sa.engine.Connection, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_publication_columns(bind: sa.engine.Connection) -> None:
    existing_columns = _table_columns(bind, "assistant_agents")
    for column in PUBLICATION_COLUMNS:
        if column.name not in existing_columns:
            op.add_column("assistant_agents", column.copy())
            existing_columns.add(column.name)


def _ensure_revision_table(bind: sa.engine.Connection) -> None:
    existing_columns = _table_columns(bind, "assistant_agent_revisions")
    if not existing_columns:
        op.create_table(
            "assistant_agent_revisions",
            *REVISION_COLUMNS,
            sa.ForeignKeyConstraint(["agent_id"], ["assistant_agents.agent_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("revision_id"),
        )
    else:
        for column in REVISION_COLUMNS:
            if column.name not in existing_columns and column.name != "revision_id":
                op.add_column("assistant_agent_revisions", column.copy())
                existing_columns.add(column.name)

    existing_indexes = _table_indexes(bind, "assistant_agent_revisions")
    if "ix_assistant_agent_revisions_agent_id" not in existing_indexes:
        op.create_index("ix_assistant_agent_revisions_agent_id", "assistant_agent_revisions", ["agent_id"])
    if "ix_assistant_agent_revisions_published_at" not in existing_indexes:
        op.create_index("ix_assistant_agent_revisions_published_at", "assistant_agent_revisions", ["published_at"])


def _build_agent_tables() -> tuple[sa.Table, sa.Table]:
    assistant_agents = sa.table(
        "assistant_agents",
        sa.column("agent_id", sa.String(length=64)),
        sa.column("name", sa.String(length=160)),
        sa.column("description", sa.String(length=500)),
        sa.column("status", sa.String(length=24)),
        sa.column("scope", sa.String(length=24)),
        sa.column("provider", sa.String(length=32)),
        sa.column("model", sa.String(length=160)),
        sa.column("role_key", sa.String(length=80)),
        sa.column("profile_kind", sa.String(length=32)),
        sa.column("specialization_summary", sa.String(length=500)),
        sa.column("human_owner_role", sa.String(length=128)),
        sa.column("authority_ceiling", sa.String(length=32)),
        sa.column("activation_notes", sa.Text()),
        sa.column("profile_request_id", sa.Integer()),
        sa.column("allowed_workspaces", sa.JSON()),
        sa.column("capabilities", sa.JSON()),
        sa.column("allowed_tools", sa.JSON()),
        sa.column("allowed_action_types", sa.JSON()),
        sa.column("daily_token_allocation", sa.Integer()),
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
    return assistant_agents, assistant_agent_revisions


def _build_agent_payload(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "name": row["name"],
        "description": row["description"],
        "status": row["status"],
        "scope": row["scope"],
        "provider": row["provider"],
        "model": row["model"],
        "role_key": row["role_key"],
        "profile_kind": row["profile_kind"] or "CUSTOM",
        "specialization_summary": row["specialization_summary"],
        "human_owner_role": row["human_owner_role"],
        "authority_ceiling": row["authority_ceiling"],
        "activation_notes": row["activation_notes"],
        "profile_request_id": row["profile_request_id"],
        "allowed_workspaces": list(row["allowed_workspaces"] or []),
        "capabilities": list(row["capabilities"] or []),
        "allowed_tools": list(row["allowed_tools"] or []),
        "allowed_action_types": list(row["allowed_action_types"] or []),
        "daily_token_allocation": row["daily_token_allocation"],
        "system_prompt": row["system_prompt"],
    }


def _merge_payload(snapshot: dict[str, Any], stored_payload: Any) -> dict[str, Any]:
    merged = dict(snapshot)
    if not isinstance(stored_payload, dict):
        return merged
    for key, value in stored_payload.items():
        if key not in merged:
            continue
        if key in LIST_PAYLOAD_KEYS:
            merged[key] = list(value or [])
            continue
        if key in REQUIRED_PAYLOAD_KEYS and value is None:
            continue
        merged[key] = value
    if not merged.get("profile_kind"):
        merged["profile_kind"] = "CUSTOM"
    return merged


def _backfill_publication_state(bind: sa.engine.Connection) -> None:
    assistant_agents, assistant_agent_revisions = _build_agent_tables()
    agent_rows = bind.execute(sa.select(assistant_agents)).mappings().all()

    for agent_row in agent_rows:
        snapshot = _build_agent_payload(agent_row)
        revision_rows = bind.execute(
            sa.select(assistant_agent_revisions)
            .where(assistant_agent_revisions.c.agent_id == agent_row["agent_id"])
            .order_by(
                assistant_agent_revisions.c.version.asc(),
                assistant_agent_revisions.c.revision_id.asc(),
            )
        ).mappings().all()

        if not revision_rows:
            should_publish = str(agent_row["status"] or "").strip().upper() != "DRAFT"
            latest_revision_id = int(
                bind.execute(
                    assistant_agent_revisions.insert()
                    .returning(assistant_agent_revisions.c.revision_id)
                    .values(
                        agent_id=agent_row["agent_id"],
                        version=max(int(agent_row["version"] or 1), 1),
                        payload=snapshot,
                        change_summary=["Initial assistant agent snapshot."],
                        created_at=agent_row["updated_at"],
                        created_by=agent_row["updated_by"] or "migration",
                        published_at=agent_row["updated_at"] if should_publish else None,
                        published_by=(agent_row["updated_by"] or "migration") if should_publish else None,
                        restored_from_revision_id=None,
                    )
                ).scalar_one()
            )
            published_revision_id = latest_revision_id if should_publish else None
            published_snapshot = snapshot if should_publish else agent_row["published_snapshot"]
            published_at = agent_row["updated_at"] if should_publish else agent_row["published_at"]
            published_by = (agent_row["updated_by"] or "migration") if should_publish else agent_row["published_by"]
        else:
            latest_revision = revision_rows[-1]
            latest_revision_id = int(latest_revision["revision_id"])
            published_revision = next(
                (row for row in reversed(revision_rows) if row["published_at"] is not None),
                None,
            )
            should_publish = (
                published_revision is not None
                or agent_row["published_revision_id"] is not None
                or agent_row["published_snapshot"] is not None
                or str(agent_row["status"] or "").strip().upper() != "DRAFT"
            )

            for revision_row in revision_rows:
                merged_payload = _merge_payload(snapshot, revision_row["payload"])
                if merged_payload != revision_row["payload"]:
                    bind.execute(
                        assistant_agent_revisions.update()
                        .where(assistant_agent_revisions.c.revision_id == revision_row["revision_id"])
                        .values(payload=merged_payload)
                    )

            if published_revision is None and should_publish:
                published_timestamp = agent_row["updated_at"] or latest_revision["created_at"]
                published_actor = agent_row["updated_by"] or latest_revision["created_by"] or "migration"
                bind.execute(
                    assistant_agent_revisions.update()
                    .where(assistant_agent_revisions.c.revision_id == latest_revision_id)
                    .values(
                        published_at=published_timestamp,
                        published_by=published_actor,
                    )
                )
                published_revision = {
                    **latest_revision,
                    "published_at": published_timestamp,
                    "published_by": published_actor,
                    "payload": _merge_payload(snapshot, latest_revision["payload"]),
                }

            published_revision_id = int(published_revision["revision_id"]) if published_revision is not None else agent_row["published_revision_id"]
            base_published_payload = (
                published_revision["payload"]
                if published_revision is not None
                else agent_row["published_snapshot"]
            )
            published_snapshot = (
                _merge_payload(snapshot, base_published_payload)
                if base_published_payload is not None
                else None
            )
            published_at = (
                published_revision["published_at"]
                if published_revision is not None
                else agent_row["published_at"]
            )
            published_by = (
                published_revision["published_by"]
                if published_revision is not None
                else agent_row["published_by"]
            )

        expected_latest_revision_id = latest_revision_id
        expected_published_revision_id = published_revision_id
        expected_published_snapshot = published_snapshot
        expected_published_at = published_at
        expected_published_by = published_by

        if (
            agent_row["latest_revision_id"] != expected_latest_revision_id
            or agent_row["published_revision_id"] != expected_published_revision_id
            or agent_row["published_snapshot"] != expected_published_snapshot
            or agent_row["published_at"] != expected_published_at
            or agent_row["published_by"] != expected_published_by
        ):
            bind.execute(
                assistant_agents.update()
                .where(assistant_agents.c.agent_id == agent_row["agent_id"])
                .values(
                    latest_revision_id=expected_latest_revision_id,
                    published_revision_id=expected_published_revision_id,
                    published_snapshot=expected_published_snapshot,
                    published_at=expected_published_at,
                    published_by=expected_published_by,
                )
            )


def upgrade() -> None:
    bind = op.get_bind()
    _ensure_publication_columns(bind)
    _ensure_revision_table(bind)
    _backfill_publication_state(bind)


def downgrade() -> None:
    # Forward-only corrective migration to repair assistant publication metadata
    # without disturbing environments that already advanced to the healthy schema.
    return None
