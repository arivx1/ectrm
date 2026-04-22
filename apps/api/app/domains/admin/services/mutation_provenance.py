from __future__ import annotations

from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from apps.api.app.core.request_context import get_request_identity
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord


def record_mutation_provenance(
    db: Session,
    *,
    operation_key: str,
    source_surface: str,
    affected_records: list[dict[str, object]] | None = None,
    details: dict[str, object] | None = None,
    outcome: str = "SUCCEEDED",
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> MutationProvenanceRecord:
    completed = _coerce_utc(completed_at) or datetime.now(timezone.utc)
    started = _coerce_utc(started_at) or completed
    identity = get_request_identity()
    record = MutationProvenanceRecord(
        operation_key=operation_key,
        source_surface=source_surface,
        actor_id=identity.actor_id,
        actor_role=identity.role,
        session_id=identity.session_id,
        correlation_id=identity.correlation_id,
        request_method=identity.request_method,
        request_path=identity.request_path,
        outcome=outcome,
        started_at=started,
        completed_at=completed,
        duration_ms=max(0, int((completed - started).total_seconds() * 1000)),
        affected_records=jsonable_encoder(affected_records or []),
        details=jsonable_encoder(details or {}),
    )
    db.add(record)
    db.flush()
    return record


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
