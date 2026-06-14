from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import synchronize_trade_accruals
from apps.api.app.domains.risk.services.option_exposures import sync_option_exposures_for_trade_change
from apps.api.app.domains.trading.services.trade_position_projection import sync_positions_for_trade_change
from apps.api.app.models.event import Event


def workflow_actor_id(event: Event) -> str:
    return event.actor_id or "system.event"


def sync_trade_event_side_effects(
    db: Session,
    *,
    event: Event,
    recorded_at: datetime,
    before_snapshot: dict[str, object] | None,
    after_snapshot: dict[str, object] | None,
) -> None:
    sync_positions_for_trade_change(db, before_snapshot, after_snapshot, recorded_at)
    sync_option_exposures_for_trade_change(
        db,
        before_snapshot,
        after_snapshot,
        recorded_at,
    )
    synchronize_trade_accruals(
        db,
        trade_id=event.aggregate_id,
        actor_id=workflow_actor_id(event),
        now=recorded_at,
    )
