from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.admin.services.seed_reference_data import seed_reference_master_data
from apps.api.app.domains.admin.services.seed_transactions import (
    list_transaction_scenarios,
    seed_transaction_data,
)
from apps.api.app.schemas.admin_seed import (
    ReferenceSeedRequest,
    ReferenceSeedResult,
    TransactionScenarioOut,
    TransactionSeedRequest,
    TransactionSeedResult,
)

admin_router = APIRouter(prefix="/admin/data", tags=["admin-data"])


@admin_router.get("/transaction-scenarios", response_model=list[TransactionScenarioOut])
def list_admin_transaction_scenarios() -> list[TransactionScenarioOut]:
    return [
        TransactionScenarioOut(
            code=scenario.code,
            name=scenario.name,
            description=scenario.description,
            trade_count=len(scenario.trade_rows),
            event_count=len(scenario.event_rows),
        )
        for scenario in list_transaction_scenarios()
    ]


@admin_router.post("/transactions/seed", response_model=TransactionSeedResult)
def seed_admin_transactions(
    payload: TransactionSeedRequest,
    db: Session = Depends(get_db),
) -> TransactionSeedResult:
    summary = seed_transaction_data(
        db,
        action=payload.action,
        scenario_codes=payload.scenario_codes,
        requested_by=payload.requested_by,
    )
    return TransactionSeedResult(
        action=summary.action,
        requested_by=payload.requested_by,
        scenario_codes=summary.scenario_codes,
        books_seeded=summary.books_seeded,
        events_seeded=summary.events_seeded,
        trades_seeded=summary.trades_seeded,
        trade_legs_seeded=summary.trade_legs_seeded,
        price_terms_seeded=summary.price_terms_seeded,
        positions_rebuilt=summary.positions_rebuilt,
    )


@admin_router.post("/reference/seed", response_model=ReferenceSeedResult)
def seed_admin_reference_data(
    payload: ReferenceSeedRequest,
    db: Session = Depends(get_db),
) -> ReferenceSeedResult:
    summary = seed_reference_master_data(
        db,
        requested_by=payload.requested_by,
        replace_existing=payload.replace_existing,
    )
    return ReferenceSeedResult(
        requested_by=payload.requested_by,
        replace_existing=summary.replace_existing,
        entity_counts=summary.entity_counts,
        total_records=summary.total_records,
    )
