from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.nexus_contact import NexusContact
from apps.api.app.schemas.integration import (
    NexusAttioContactImport,
    NexusContactCreate,
    NexusContactOut,
)


class NexusContactServiceError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def list_nexus_contacts(db: Session) -> list[NexusContactOut]:
    records = db.execute(
        select(NexusContact).order_by(
            NexusContact.client_name.asc(),
            NexusContact.name.asc(),
            NexusContact.created_at.asc(),
        )
    ).scalars().all()
    return [_to_out(record) for record in records]


def create_manual_nexus_contact(
    db: Session,
    *,
    payload: NexusContactCreate,
    actor_id: str,
) -> NexusContactOut:
    now = datetime.now(timezone.utc)
    record = NexusContact(
        contact_id=f"nexus-contact-{uuid4().hex}",
        client_name=payload.client_name,
        name=payload.name,
        title=payload.title,
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=payload.role,
        time_at_role=payload.time_at_role,
        previous_role=payload.previous_role,
        university=payload.university,
        university_2=payload.university_2,
        location=payload.location,
        email=payload.email,
        phone=payload.phone,
        web_url=payload.web_url,
        source="manual",
        external_provider=None,
        external_record_id=None,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_out(record)


def upsert_attio_nexus_contacts(
    db: Session,
    *,
    client_name: str,
    contacts: list[NexusAttioContactImport],
    actor_id: str,
) -> list[NexusContactOut]:
    if not contacts:
        return []

    now = datetime.now(timezone.utc)
    imported_records: list[NexusContact] = []
    for contact in contacts:
        record = db.execute(
            select(NexusContact).where(
                NexusContact.external_provider == "attio",
                NexusContact.external_record_id == contact.record_id,
            )
        ).scalars().first()

        if record is None:
            record = NexusContact(
                contact_id=stable_attio_contact_id(client_name, contact.record_id),
                client_name=client_name,
                name=contact.name,
                title=contact.title,
                first_name=None,
                last_name=None,
                role=contact.title,
                time_at_role=None,
                previous_role=None,
                university=None,
                university_2=None,
                location=None,
                email=contact.email,
                phone=contact.phone,
                web_url=contact.web_url,
                source="attio",
                external_provider="attio",
                external_record_id=contact.record_id,
                created_at=now,
                created_by=actor_id,
                updated_at=now,
                updated_by=actor_id,
                version=1,
            )
            db.add(record)
        else:
            _update_attio_contact(record, client_name=client_name, contact=contact, actor_id=actor_id, now=now)
        imported_records.append(record)

    db.commit()
    for record in imported_records:
        db.refresh(record)
    return [_to_out(record) for record in imported_records]


def delete_nexus_contact(db: Session, *, contact_id: str) -> None:
    record = db.get(NexusContact, contact_id)
    if record is None:
        raise NexusContactServiceError(404, "Nexus contact was not found.")

    db.delete(record)
    db.commit()


def stable_attio_contact_id(client_name: str, record_id: str) -> str:
    return f"nexus-attio-contact-{_contact_key_part(client_name, 32)}-{_contact_key_part(record_id, 36)}"


def _contact_key_part(value: str, max_length: int) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not normalized:
        return "contact"
    return normalized[:max_length].strip("-") or "contact"


def _update_attio_contact(
    record: NexusContact,
    *,
    client_name: str,
    contact: NexusAttioContactImport,
    actor_id: str,
    now: datetime,
) -> None:
    next_values = {
        "client_name": client_name,
        "name": contact.name,
        "title": contact.title,
        "role": contact.title,
        "email": contact.email,
        "phone": contact.phone,
        "web_url": contact.web_url,
        "source": "attio",
        "external_provider": "attio",
        "external_record_id": contact.record_id,
    }
    changed = any(getattr(record, field_name) != value for field_name, value in next_values.items())
    if not changed:
        return

    for field_name, value in next_values.items():
        setattr(record, field_name, value)
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1


def _to_out(record: NexusContact) -> NexusContactOut:
    return NexusContactOut(
        contact_id=record.contact_id,
        client_name=record.client_name,
        name=record.name,
        title=record.title,
        first_name=record.first_name,
        last_name=record.last_name,
        role=record.role,
        time_at_role=record.time_at_role,
        previous_role=record.previous_role,
        university=record.university,
        university_2=record.university_2,
        location=record.location,
        email=record.email,
        phone=record.phone,
        web_url=record.web_url,
        source=record.source,  # type: ignore[arg-type]
        external_provider=record.external_provider,
        external_record_id=record.external_record_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        version=record.version,
    )
