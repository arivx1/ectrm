from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping


@dataclass(frozen=True)
class AppendDomainEventCommand:
    aggregate_type: str
    aggregate_id: str
    event_type: str
    payload: Mapping[str, Any] | None = None
    occurred_at: datetime | None = None
    actor_id: str | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    schema_version: int = 1
    event_id: str | None = None
    recorded_at: datetime | None = None
    operation_key: str | None = None
    source_surface: str = "events"
    provenance_details: Mapping[str, Any] | None = None
