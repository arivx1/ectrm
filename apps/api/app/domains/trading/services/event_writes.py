from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.event_write_contracts import AppendDomainEventCommand
from apps.api.app.domains.trading.services.event_write_records import (
    build_event_record,
    record_event_write_provenance,
    resolve_event_timestamps,
)
from apps.api.app.domains.trading.services.trade_event_projection_policy import (
    should_apply_trade_projection,
)
from apps.api.app.models.event import Event

__all__ = ["AppendDomainEventCommand", "append_domain_event"]


def append_domain_event(
    db: Session,
    command: AppendDomainEventCommand,
    *,
    commit: bool = False,
    refresh: bool = False,
) -> Event:
    effective_recorded_at, effective_occurred_at = resolve_event_timestamps(command)
    event = build_event_record(
        command,
        recorded_at=effective_recorded_at,
        occurred_at=effective_occurred_at,
    )

    try:
        db.add(event)
        db.flush()

        if should_apply_trade_projection(event):
            from apps.api.app.domains.trading.services.trade_event_application import (
                TradeEventApplicationContext,
                apply_trade_event,
            )

            apply_trade_event(
                TradeEventApplicationContext(
                    db=db,
                    event=event,
                    recorded_at=effective_recorded_at,
                )
            )

        record_event_write_provenance(
            db,
            event=event,
            command=command,
            recorded_at=effective_recorded_at,
        )

        if commit:
            db.commit()

        if refresh:
            db.refresh(event)
    except Exception:
        if commit:
            db.rollback()
        raise

    return event
