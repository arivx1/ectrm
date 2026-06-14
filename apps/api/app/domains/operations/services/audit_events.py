from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

from sqlalchemy.orm import Session

from apps.api.app.core.request_context import get_request_identity
from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.models.event import Event


@dataclass(frozen=True)
class TradeAuditMutationContext:
    source_surface: str
    correlation_id: str | None = None
    provenance_details: Mapping[str, Any] | None = None


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def append_trade_audit_event(
    db: Session,
    *,
    trade_id: str,
    actor_id: str,
    event_type: str,
    payload: Mapping[str, Any],
    occurred_at: datetime | None = None,
    causation_id: str | None = None,
    operation_key: str | None = None,
    mutation_context: TradeAuditMutationContext | None = None,
) -> Event:
    recorded_at = _coerce_utc(occurred_at) or datetime.now(timezone.utc)
    identity = get_request_identity()
    provenance_details = (
        dict(mutation_context.provenance_details)
        if mutation_context is not None and mutation_context.provenance_details
        else None
    )
    return append_domain_event(
        db,
        AppendDomainEventCommand(
            aggregate_type="trade",
            aggregate_id=trade_id,
            event_type=event_type,
            occurred_at=recorded_at,
            recorded_at=recorded_at,
            actor_id=actor_id,
            correlation_id=(
                mutation_context.correlation_id
                if mutation_context is not None and mutation_context.correlation_id is not None
                else identity.correlation_id
            ),
            causation_id=causation_id,
            schema_version=1,
            payload=payload,
            operation_key=operation_key,
            source_surface=(
                mutation_context.source_surface if mutation_context is not None else "events"
            ),
            provenance_details=provenance_details,
        ),
    )
