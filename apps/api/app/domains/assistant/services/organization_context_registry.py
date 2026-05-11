from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_organization_context import (
    AssistantOrganizationContextDefinition,
)


PUBLISHED_ORGANIZATION_CONTEXT_STATUS = "PUBLISHED"


@dataclass(frozen=True)
class AssistantOrganizationContextPromptSection:
    section_key: str
    content: str
    owner_reference: str


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
