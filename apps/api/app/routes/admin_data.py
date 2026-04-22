from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.deps.db import get_db
from apps.api.app.domains.admin.services.seed_assistant_agents import seed_assistant_agents
from apps.api.app.domains.admin.services.seed_reference_data import seed_reference_master_data
from apps.api.app.domains.admin.services.seed_transactions import (
    list_transaction_scenarios,
    seed_transaction_data,
)
from apps.api.app.schemas.admin_seed import (
    AssistantAgentSeedRequest,
    AssistantAgentSeedResult,
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
    actor_id = resolve_audit_actor_id(payload.requested_by)
    summary = seed_transaction_data(
        db,
        action=payload.action,
        scenario_codes=payload.scenario_codes,
        requested_by=actor_id,
    )
    return TransactionSeedResult(
        action=summary.action,
        requested_by=actor_id,
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
    actor_id = resolve_audit_actor_id(payload.requested_by)
    summary = seed_reference_master_data(
        db,
        requested_by=actor_id,
        replace_existing=payload.replace_existing,
    )
    return ReferenceSeedResult(
        requested_by=actor_id,
        replace_existing=summary.replace_existing,
        entity_counts=summary.entity_counts,
        total_records=summary.total_records,
    )


@admin_router.post("/assistant-agents/seed", response_model=AssistantAgentSeedResult)
def seed_admin_assistant_agents(
    payload: AssistantAgentSeedRequest,
    db: Session = Depends(get_db),
) -> AssistantAgentSeedResult:
    actor_id = resolve_audit_actor_id(payload.requested_by)
    summary = seed_assistant_agents(db, requested_by=actor_id)
    return AssistantAgentSeedResult(
        requested_by=actor_id,
        total_templates=summary.total_templates,
        created_count=summary.created_count,
        updated_count=summary.updated_count,
        agent_ids=summary.agent_ids,
    )
