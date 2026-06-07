from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.trading.services.event_write_contracts import AppendDomainEventCommand
from apps.api.app.models.event import Event


def resolve_event_timestamps(command: AppendDomainEventCommand) -> tuple[datetime, datetime]:
    recorded_at = _coerce_utc(command.recorded_at) or datetime.now(timezone.utc)
    occurred_at = _coerce_utc(command.occurred_at) or recorded_at
    return recorded_at, occurred_at


def build_event_record(
    command: AppendDomainEventCommand,
    *,
    recorded_at: datetime,
    occurred_at: datetime,
) -> Event:
    return Event(
        event_id=command.event_id or str(uuid.uuid4()),
        aggregate_type=command.aggregate_type,
        aggregate_id=command.aggregate_id,
        event_type=command.event_type,
        occurred_at=occurred_at,
        recorded_at=recorded_at,
        actor_id=command.actor_id,
        correlation_id=command.correlation_id,
        causation_id=command.causation_id,
        schema_version=command.schema_version,
        payload=jsonable_encoder(dict(command.payload or {})),
    )


def record_event_write_provenance(
    db: Session,
    *,
    event: Event,
    command: AppendDomainEventCommand,
    recorded_at: datetime,
) -> None:
    record_mutation_provenance(
        db,
        operation_key=command.operation_key or f"event_write.{event.event_type}",
        source_surface=command.source_surface,
        affected_records=[
            {
                "record_type": "event",
                "record_id": event.event_id,
                "action": "created",
                "label": f"{event.aggregate_type}:{event.aggregate_id}",
            }
        ],
        details=_event_provenance_details(event, command),
        started_at=recorded_at,
        completed_at=recorded_at,
    )


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _event_provenance_details(
    event: Event,
    command: AppendDomainEventCommand,
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "event_id": event.event_id,
        "aggregate_type": event.aggregate_type,
        "aggregate_id": event.aggregate_id,
        "event_type": event.event_type,
        "schema_version": event.schema_version,
    }
    if command.provenance_details:
        details.update(dict(command.provenance_details))
    return details
