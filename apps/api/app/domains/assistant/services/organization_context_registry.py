from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_organization_context import (
    AssistantOrganizationContextDefinition,
)


GLOBAL_ORGANIZATION_CONTEXT_SCOPE = "GLOBAL"
DRAFT_ORGANIZATION_CONTEXT_STATUS = "DRAFT"
PUBLISHED_ORGANIZATION_CONTEXT_STATUS = "PUBLISHED"
RETIRED_ORGANIZATION_CONTEXT_STATUS = "RETIRED"


class OrganizationContextRegistryError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class AssistantOrganizationContextPromptSection:
    section_key: str
    content: str
    owner_reference: str


def list_organization_context_definitions(
    db: Session,
    *,
    section_key: str | None = None,
    status: str | None = None,
    definition_key: str | None = None,
) -> list[AssistantOrganizationContextDefinition]:
    statement = select(AssistantOrganizationContextDefinition)
    if section_key is not None:
        statement = statement.where(AssistantOrganizationContextDefinition.section_key == section_key)
    if status is not None:
        statement = statement.where(AssistantOrganizationContextDefinition.status == status)
    if definition_key is not None:
        statement = statement.where(AssistantOrganizationContextDefinition.definition_key == definition_key)
    statement = statement.order_by(
        AssistantOrganizationContextDefinition.section_key.asc(),
        AssistantOrganizationContextDefinition.definition_key.asc(),
        AssistantOrganizationContextDefinition.version.desc(),
        AssistantOrganizationContextDefinition.id.desc(),
    )
    return list(db.execute(statement).scalars().all())


def get_organization_context_definition(
    db: Session,
    *,
    definition_id: int,
) -> AssistantOrganizationContextDefinition | None:
    return db.get(AssistantOrganizationContextDefinition, definition_id)


def create_organization_context_definition(
    db: Session,
    *,
    definition_key: str,
    section_key: str,
    content_kind: str,
    title: str,
    summary: str | None,
    body: str,
    display_order: int,
    created_by: str,
) -> AssistantOrganizationContextDefinition:
    existing_records = _list_definition_family(db, definition_key=definition_key)
    if any(record.status == DRAFT_ORGANIZATION_CONTEXT_STATUS for record in existing_records):
        raise OrganizationContextRegistryError(
            status_code=409,
            detail="A draft organization context definition already exists for this definition_key",
        )
    _ensure_definition_family_alignment(
        existing_records=existing_records,
        definition_key=definition_key,
        section_key=section_key,
        content_kind=content_kind,
    )

    now = datetime.now(timezone.utc)
    record = AssistantOrganizationContextDefinition(
        definition_key=definition_key,
        section_key=section_key,
        content_kind=content_kind,
        title=title,
        summary=summary,
        body=body,
        scope=GLOBAL_ORGANIZATION_CONTEXT_SCOPE,
        status=DRAFT_ORGANIZATION_CONTEXT_STATUS,
        version=(max((int(existing.version) for existing in existing_records), default=0) + 1),
        display_order=display_order,
        created_at=now,
        created_by=created_by,
        updated_at=now,
        updated_by=created_by,
        published_at=None,
        published_by=None,
        retired_at=None,
        retired_by=None,
    )
    db.add(record)
    db.flush()
    return record


def update_organization_context_definition(
    db: Session,
    *,
    record: AssistantOrganizationContextDefinition,
    definition_key: str,
    section_key: str,
    content_kind: str,
    title: str,
    summary: str | None,
    body: str,
    display_order: int,
    updated_by: str,
) -> AssistantOrganizationContextDefinition:
    _ensure_definition_is_editable(record)
    if definition_key != record.definition_key:
        raise OrganizationContextRegistryError(
            status_code=400,
            detail="definition_key cannot change when updating an existing draft; create a new version instead",
        )

    existing_records = [
        existing
        for existing in _list_definition_family(db, definition_key=definition_key)
        if existing.id != record.id
    ]
    _ensure_definition_family_alignment(
        existing_records=existing_records,
        definition_key=definition_key,
        section_key=section_key,
        content_kind=content_kind,
    )

    record.section_key = section_key
    record.content_kind = content_kind
    record.title = title
    record.summary = summary
    record.body = body
    record.display_order = display_order
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = updated_by
    db.flush()
    return record


def publish_organization_context_definition(
    db: Session,
    *,
    record: AssistantOrganizationContextDefinition,
    actor_id: str,
) -> AssistantOrganizationContextDefinition:
    if record.status == RETIRED_ORGANIZATION_CONTEXT_STATUS:
        raise OrganizationContextRegistryError(
            status_code=409,
            detail="Retired organization context definitions cannot be republished; create a new version instead",
        )

    latest_version = _latest_definition_version(db, definition_key=record.definition_key)
    if latest_version is not None and int(record.version) != int(latest_version):
        raise OrganizationContextRegistryError(
            status_code=409,
            detail="Only the latest organization context definition version can be published",
        )
    if record.status == PUBLISHED_ORGANIZATION_CONTEXT_STATUS:
        return record

    now = datetime.now(timezone.utc)
    for existing in _list_definition_family(db, definition_key=record.definition_key):
        if existing.id == record.id or existing.status != PUBLISHED_ORGANIZATION_CONTEXT_STATUS:
            continue
        existing.status = RETIRED_ORGANIZATION_CONTEXT_STATUS
        existing.updated_at = now
        existing.updated_by = actor_id
        existing.retired_at = now
        existing.retired_by = actor_id

    record.status = PUBLISHED_ORGANIZATION_CONTEXT_STATUS
    record.updated_at = now
    record.updated_by = actor_id
    record.published_at = now
    record.published_by = actor_id
    record.retired_at = None
    record.retired_by = None
    db.flush()
    return record


def retire_organization_context_definition(
    db: Session,
    *,
    record: AssistantOrganizationContextDefinition,
    actor_id: str,
) -> AssistantOrganizationContextDefinition:
    if record.status == RETIRED_ORGANIZATION_CONTEXT_STATUS:
        return record

    now = datetime.now(timezone.utc)
    record.status = RETIRED_ORGANIZATION_CONTEXT_STATUS
    record.updated_at = now
    record.updated_by = actor_id
    record.retired_at = now
    record.retired_by = actor_id
    db.flush()
    return record


def list_published_organization_context_prompt_sections(
    db: Session,
) -> dict[str, AssistantOrganizationContextPromptSection]:
    """Return the latest published definition for each organization-context key.

    The new registry is additive. Until the migration lands everywhere, or when
    no published definitions exist yet, callers should safely fall back to the
    existing env-backed organization prompt sections.
    """

    try:
        records = (
            db.execute(
                select(AssistantOrganizationContextDefinition).where(
                    AssistantOrganizationContextDefinition.status
                    == PUBLISHED_ORGANIZATION_CONTEXT_STATUS
                )
            )
            .scalars()
            .all()
        )
    except SQLAlchemyError:
        db.rollback()
        return {}

    latest_records: dict[tuple[str, str], AssistantOrganizationContextDefinition] = {}
    for record in sorted(
        records,
        key=lambda item: (
            item.section_key,
            item.definition_key,
            -item.version,
            -(item.id or 0),
        ),
    ):
        latest_records.setdefault((record.section_key, record.definition_key), record)

    grouped_records: dict[str, list[AssistantOrganizationContextDefinition]] = defaultdict(list)
    for record in latest_records.values():
        grouped_records[record.section_key].append(record)

    sections: dict[str, AssistantOrganizationContextPromptSection] = {}
    for section_key, section_records in grouped_records.items():
        ordered_records = sorted(
            section_records,
            key=lambda item: (
                item.display_order,
                item.title.lower(),
                item.definition_key,
                item.version,
            ),
        )
        content = _render_grouped_section_content(ordered_records)
        if not content:
            continue
        owner_reference = ",".join(
            f"{record.definition_key}:v{record.version}" for record in ordered_records
        )
        sections[section_key] = AssistantOrganizationContextPromptSection(
            section_key=section_key,
            content=content,
            owner_reference=owner_reference,
        )
    return sections


def _list_definition_family(
    db: Session,
    *,
    definition_key: str,
) -> list[AssistantOrganizationContextDefinition]:
    return list(
        db.execute(
            select(AssistantOrganizationContextDefinition).where(
                AssistantOrganizationContextDefinition.definition_key == definition_key
            )
        )
        .scalars()
        .all()
    )


def _latest_definition_version(db: Session, *, definition_key: str) -> int | None:
    latest_version = db.execute(
        select(func.max(AssistantOrganizationContextDefinition.version)).where(
            AssistantOrganizationContextDefinition.definition_key == definition_key
        )
    ).scalar_one()
    return int(latest_version) if latest_version is not None else None


def _ensure_definition_is_editable(record: AssistantOrganizationContextDefinition) -> None:
    if record.status != DRAFT_ORGANIZATION_CONTEXT_STATUS:
        raise OrganizationContextRegistryError(
            status_code=409,
            detail="Only draft organization context definitions can be edited",
        )


def _ensure_definition_family_alignment(
    *,
    existing_records: list[AssistantOrganizationContextDefinition],
    definition_key: str,
    section_key: str,
    content_kind: str,
) -> None:
    if not existing_records:
        return

    existing_section_keys = {record.section_key for record in existing_records}
    existing_content_kinds = {record.content_kind for record in existing_records}
    if section_key not in existing_section_keys:
        raise OrganizationContextRegistryError(
            status_code=409,
            detail=(
                f"definition_key {definition_key} is already bound to section_key "
                f"{sorted(existing_section_keys)[0]}; create a new definition_key instead"
            ),
        )
    if content_kind not in existing_content_kinds:
        raise OrganizationContextRegistryError(
            status_code=409,
            detail=(
                f"definition_key {definition_key} is already bound to content_kind "
                f"{sorted(existing_content_kinds)[0]}; create a new definition_key instead"
            ),
        )


def _render_grouped_section_content(
    records: list[AssistantOrganizationContextDefinition],
) -> str:
    if not records:
        return ""
    if len(records) == 1:
        return records[0].body.strip()

    blocks: list[str] = []
    for record in records:
        body = record.body.strip()
        if not body:
            continue
        title = record.title.strip()
        blocks.append(f"{title}:\n{body}" if title else body)
    return "\n\n".join(blocks)
