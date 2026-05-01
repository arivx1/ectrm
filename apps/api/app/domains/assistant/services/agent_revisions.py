from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_revision import AssistantAgentRevision

REVISION_HISTORY_LIMIT = 8

_REVISION_FIELD_LABELS: dict[str, str] = {
    "name": "Name",
    "description": "Description",
    "status": "Status",
    "scope": "Scope",
    "provider": "Provider",
    "model": "Model",
    "role_key": "Role key",
    "profile_kind": "Profile kind",
    "specialization_summary": "Specialization summary",
    "human_owner_role": "Human owner role",
    "authority_ceiling": "Authority ceiling",
    "activation_notes": "Activation notes",
    "profile_request_id": "Profile request",
    "allowed_workspaces": "Allowed workspaces",
    "capabilities": "Capabilities",
    "allowed_tools": "Allowed tools",
    "allowed_action_types": "Allowed action types",
    "daily_token_allocation": "Daily token allocation",
    "system_prompt": "System prompt",
}
_REVISION_FIELD_ORDER: tuple[str, ...] = tuple(_REVISION_FIELD_LABELS.keys())


def serialize_agent_revision_payload(record: AssistantAgent) -> dict[str, Any]:
    return {
        "name": record.name,
        "description": record.description,
        "status": record.status,
        "scope": record.scope,
        "provider": record.provider,
        "model": record.model,
        "role_key": record.role_key,
        "profile_kind": record.profile_kind,
        "specialization_summary": record.specialization_summary,
        "human_owner_role": record.human_owner_role,
        "authority_ceiling": record.authority_ceiling,
        "activation_notes": record.activation_notes,
        "profile_request_id": record.profile_request_id,
        "allowed_workspaces": list(record.allowed_workspaces or []),
        "capabilities": list(record.capabilities or []),
        "allowed_tools": list(record.allowed_tools or []),
        "allowed_action_types": list(record.allowed_action_types or []),
        "daily_token_allocation": record.daily_token_allocation,
        "system_prompt": record.system_prompt,
    }


def normalize_agent_revision_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "name": str(payload.get("name") or ""),
        "description": str(payload.get("description") or ""),
        "status": payload.get("status") or "DRAFT",
        "scope": payload.get("scope") or "TEAM",
        "provider": payload.get("provider"),
        "model": payload.get("model"),
        "role_key": payload.get("role_key"),
        "profile_kind": payload.get("profile_kind") or "CUSTOM",
        "specialization_summary": payload.get("specialization_summary"),
        "human_owner_role": payload.get("human_owner_role"),
        "authority_ceiling": payload.get("authority_ceiling"),
        "activation_notes": payload.get("activation_notes"),
        "profile_request_id": payload.get("profile_request_id"),
        "allowed_workspaces": [str(value) for value in list(payload.get("allowed_workspaces") or [])],
        "capabilities": [str(value) for value in list(payload.get("capabilities") or [])],
        "allowed_tools": [str(value) for value in list(payload.get("allowed_tools") or [])],
        "allowed_action_types": [str(value) for value in list(payload.get("allowed_action_types") or [])],
        "daily_token_allocation": payload.get("daily_token_allocation"),
        "system_prompt": str(payload.get("system_prompt") or ""),
    }


def next_agent_revision_version(db: Session, *, record: AssistantAgent) -> int:
    latest_version = db.execute(
        select(func.max(AssistantAgentRevision.version)).where(AssistantAgentRevision.agent_id == record.agent_id)
    ).scalar_one_or_none()
    if latest_version is None:
        return max(int(record.version or 0), 0) + 1
    return int(latest_version) + 1


def create_agent_revision(
    db: Session,
    *,
    record: AssistantAgent,
    payload: Mapping[str, Any],
    change_summary: Sequence[str],
    created_by: str,
    version: int | None = None,
    published: bool = False,
    created_at: datetime | None = None,
    restored_from_revision_id: int | None = None,
) -> AssistantAgentRevision:
    snapshot = normalize_agent_revision_payload(payload)
    timestamp = created_at or datetime.now(timezone.utc)
    revision = AssistantAgentRevision(
        agent_id=record.agent_id,
        version=version or next_agent_revision_version(db, record=record),
        payload=snapshot,
        change_summary=list(change_summary),
        created_at=timestamp,
        created_by=created_by,
        published_at=timestamp if published else None,
        published_by=created_by if published else None,
        restored_from_revision_id=restored_from_revision_id,
    )
    db.add(revision)
    db.flush()

    record.latest_revision_id = revision.revision_id
    if published:
        record.published_revision_id = revision.revision_id
        record.published_snapshot = snapshot
        record.published_at = revision.published_at
        record.published_by = revision.published_by

    return revision


def list_agent_revisions(
    db: Session,
    *,
    agent_id: str,
    limit: int = REVISION_HISTORY_LIMIT,
) -> list[AssistantAgentRevision]:
    return (
        db.execute(
            select(AssistantAgentRevision)
            .where(AssistantAgentRevision.agent_id == agent_id)
            .order_by(AssistantAgentRevision.version.desc(), AssistantAgentRevision.revision_id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )


def get_agent_revision(db: Session, *, agent_id: str, revision_id: int) -> AssistantAgentRevision | None:
    revision = db.get(AssistantAgentRevision, revision_id)
    if revision is None or revision.agent_id != agent_id:
        return None
    return revision


def build_agent_revision_diff_summary(
    current_payload: Mapping[str, Any] | None,
    next_payload: Mapping[str, Any],
) -> list[dict[str, str]]:
    before = normalize_agent_revision_payload(current_payload or {})
    after = normalize_agent_revision_payload(next_payload)
    rows: list[dict[str, str]] = []
    for field_key in _REVISION_FIELD_ORDER:
        current_value = before.get(field_key)
        next_value = after.get(field_key)
        if current_value == next_value:
            continue
        rows.append(
            {
                "field_key": field_key,
                "label": _REVISION_FIELD_LABELS[field_key],
                "current_value": _format_revision_value(field_key, current_value),
                "next_value": _format_revision_value(field_key, next_value),
            }
        )
    return rows


def ensure_agent_publication_snapshot(record: AssistantAgent) -> None:
    if record.published_snapshot is not None:
        return
    if str(record.status or "").strip().upper() == "DRAFT":
        return
    record.published_snapshot = serialize_agent_revision_payload(record)
    record.published_at = record.updated_at
    record.published_by = record.updated_by


def has_unpublished_agent_revision(record: AssistantAgent) -> bool:
    latest_revision_id = record.latest_revision_id
    published_revision_id = record.published_revision_id
    return latest_revision_id is not None and latest_revision_id != published_revision_id


def _format_revision_value(field_key: str, value: Any) -> str:
    if field_key == "system_prompt":
        text = str(value or "").strip()
        return f"{len(text)} chars" if text else "Not set"
    if field_key == "daily_token_allocation":
        return "Default allocation" if value in {None, ""} else str(value)
    if field_key == "profile_request_id":
        return "None" if value in {None, ""} else f"#{value}"
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) if value else "None"
    if value is None:
        return "None"
    text = str(value).strip()
    if not text:
        return "None"
    return text if len(text) <= 160 else f"{text[:157]}..."
