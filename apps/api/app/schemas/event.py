from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    aggregate_type: str = Field(..., min_length=1, max_length=100)
    aggregate_id: str = Field(..., min_length=1, max_length=64)
    event_type: str = Field(..., min_length=1, max_length=200)
    occurred_at: datetime
    actor_id: Optional[str] = None
    causation_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    schema_version: int = 1


class EventOut(BaseModel):
    event_id: str
    aggregate_type: str
    aggregate_id: str
    event_type: str
    occurred_at: datetime
    recorded_at: datetime
    actor_id: Optional[str]
    correlation_id: Optional[str]
    causation_id: Optional[str]
    schema_version: int
    payload: Dict[str, Any]
