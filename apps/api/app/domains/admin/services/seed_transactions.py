from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.transaction_scenarios import get_scenarios, list_scenarios
from apps.api.app.domains.risk.services.option_exposures import rebuild_option_exposures_projection
from apps.api.app.models.event import Event
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm


@dataclass
class TransactionSeedSummary:
    action: str
    scenario_codes: list[str]
    books_seeded: int
    events_seeded: int
    trades_seeded: int
    trade_legs_seeded: int
    price_terms_seeded: int
    positions_rebuilt: int


def list_transaction_scenarios():
    return list_scenarios()


def delete_existing_transaction_data(db: Session) -> None:
    db.query(TradePriceTerm).delete()
    db.query(TradeLeg).delete()
    db.query(OptionExposure).delete()
    db.query(Position).delete()
    db.query(Trade).delete()
    db.query(Event).filter(Event.aggregate_type == "trade").delete()
    db.commit()


def seed_transaction_data(
    db: Session,
    *,
    action: str,
    scenario_codes: list[str] | None = None,
    requested_by: str,
) -> TransactionSeedSummary:
    normalized_action = action.strip().lower()
    if normalized_action not in {"add", "replace", "delete"}:
        raise ValueError(f"Unsupported transaction seed action '{action}'")

    if normalized_action in {"replace", "delete"}:
        delete_existing_transaction_data(db)

    if normalized_action == "delete":
        return TransactionSeedSummary(
            action="delete",
            scenario_codes=[],
            books_seeded=0,
            events_seeded=0,
            trades_seeded=0,
            trade_legs_seeded=0,
            price_terms_seeded=0,
            positions_rebuilt=0,
        )

    scenarios = get_scenarios(scenario_codes)
    now = datetime.now(timezone.utc)

    book_rows = [row for scenario in scenarios for row in scenario.book_rows]
    event_rows = [row for scenario in scenarios for row in scenario.event_rows]
    trade_rows = [row for scenario in scenarios for row in scenario.trade_rows]
    trade_leg_rows = [row for scenario in scenarios for row in scenario.trade_leg_rows]
    trade_price_term_rows = [row for scenario in scenarios for row in scenario.trade_price_term_rows]

    for row in book_rows:
        record = db.get(ReferenceBook, row["code"])
        if record is None:
            db.add(
                ReferenceBook(
                    code=row["code"],
                    name=row["name"],
                    description=row["description"],
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by=requested_by,
                    updated_at=now,
                    updated_by=requested_by,
                    version=1,
                )
            )
            continue

        record.name = row["name"]
        record.description = row["description"]
        record.is_active = True
        record.updated_at = now
        record.updated_by = requested_by

    _upsert_rows(db, Event, "event_id", event_rows)
    _upsert_rows(db, Trade, "trade_id", trade_rows)
    _upsert_rows(db, TradeLeg, "trade_leg_id", trade_leg_rows)
    _upsert_rows(db, TradePriceTerm, "trade_price_term_id", trade_price_term_rows)
    db.flush()
    positions_rebuilt = _rebuild_positions(db)
    rebuild_option_exposures_projection(db)
    db.commit()

    return TransactionSeedSummary(
        action=normalized_action,
        scenario_codes=[scenario.code for scenario in scenarios],
        books_seeded=len(book_rows),
        events_seeded=len(event_rows),
        trades_seeded=len(trade_rows),
        trade_legs_seeded=len(trade_leg_rows),
        price_terms_seeded=len(trade_price_term_rows),
        positions_rebuilt=positions_rebuilt,
    )


def _upsert_rows(db: Session, model, pk_name: str, rows: list[dict]) -> None:
    for row in rows:
        record = db.get(model, row[pk_name])
        if record is None:
            db.add(model(**row))
            continue
        for key, value in row.items():
            setattr(record, key, value)


def _rebuild_positions(db: Session) -> int:
    db.query(Position).delete()
    aggregates: dict[str, dict[str, object]] = {}
    rows = db.execute(
        select(TradeLeg.commodity_code, TradeLeg.side, TradeLeg.quantity, TradeLeg.updated_at)
        .join(Trade, Trade.trade_id == TradeLeg.trade_id)
        .where(Trade.status == "ACTIVE")
    ).all()

    for commodity_code, side, quantity, updated_at in rows:
        current = aggregates.setdefault(
            commodity_code,
            {"net_volume": 0, "updated_at": updated_at},
        )
        sign = 1 if side == "BUY" else -1
        current["net_volume"] = current["net_volume"] + (quantity * sign)
        if updated_at > current["updated_at"]:
            current["updated_at"] = updated_at

    for commodity_code, payload in aggregates.items():
        db.add(
            Position(
                commodity=commodity_code,
                net_volume=payload["net_volume"],
                updated_at=payload["updated_at"],
            )
        )

    return len(aggregates)
