from __future__ import annotations

from apps.api.app.domains.trading.services.trade_option_validation import (
    OPTION_LIFECYCLE_EVENT_TYPES,
)
from apps.api.app.models.event import Event


TRADE_PROJECTION_EVENT_TYPES = frozenset(
    {
        "TradeCreated",
        "TradeAmended",
        "TradeCancelled",
        *OPTION_LIFECYCLE_EVENT_TYPES,
    }
)


def should_apply_trade_projection(event: Event) -> bool:
    return event.aggregate_type == "trade" and event.event_type in TRADE_PROJECTION_EVENT_TYPES
