from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Mapping

TradeCommandType = Literal["BookTrade", "AmendTradeTerms", "CancelTrade", "CorrectTrade"]
ALLOWED_GOVERNED_TRADE_WRITE_ROLES = frozenset({"TRADER", "DESK_LEAD", "OPS_ADMIN", "ADMIN"})

TRADE_COMMAND_EVENT_TYPES: dict[TradeCommandType, str] = {
    "BookTrade": "TradeCreated",
    "AmendTradeTerms": "TradeAmended",
    "CancelTrade": "TradeCancelled",
    "CorrectTrade": "TradeAmended",
}

TRADE_EVENT_COMMAND_TYPES: dict[str, TradeCommandType] = {
    "TradeCreated": "BookTrade",
    "TradeAmended": "AmendTradeTerms",
    "TradeCancelled": "CancelTrade",
}

CORRECTABLE_TRADE_EVENT_TYPES = frozenset(TRADE_EVENT_COMMAND_TYPES.keys())


class TradeCommandValidationError(ValueError):
    """Raised when a trade command envelope does not match the event adapter."""


@dataclass(frozen=True)
class TradeWriteCommand:
    command_id: str
    command_type: TradeCommandType
    trade_id: str
    payload: Mapping[str, Any] | None = None
    occurred_at: datetime | None = None
    recorded_at: datetime | None = None
    actor_id: str | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    schema_version: int = 1
    source_surface: str = "events"
    expected_last_event_id: str | None = None
