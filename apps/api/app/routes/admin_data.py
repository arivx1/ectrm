from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.deps.db import get_db
from apps.api.app.domains.admin.services.projection_monitoring import (
    load_admin_trade_projection_monitoring,
    run_trade_projection_monitoring_cycle,
    save_trade_projection_monitoring_document,
)
from apps.api.app.domains.admin.services.seed_assistant_agents import seed_assistant_agents
from apps.api.app.domains.admin.services.seed_reference_data import seed_reference_master_data
from apps.api.app.domains.admin.services.seed_transactions import (
    list_transaction_scenarios,
    seed_transaction_data,
)
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    list_trade_projection_integrity_issues,
    list_trade_projection_invariant_issues,
    rebuild_trade_operational_projection,
)
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.schemas.admin_seed import (
    AssistantAgentSeedRequest,
    AssistantAgentSeedResult,
    MutationProvenanceOut,
    ReferenceSeedRequest,
    ReferenceSeedResult,
    TransactionScenarioOut,
    TransactionSeedRequest,
    TransactionSeedResult,
    TradeProjectionInvariantIssueOut,
    TradeProjectionIssuePage,
    TradeProjectionRepairRequest,
    TradeProjectionRepairResult,
    TradeProjectionRepairSummaryOut,
    TradeProjectionStructuralIssueOut,
)
from apps.api.app.schemas.projection_monitoring import (
    TradeProjectionMonitoringAdminOut,
    TradeProjectionMonitoringRunRequest,
    TradeProjectionMonitoringRunResult,
    TradeProjectionMonitoringUpdate,
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
        total_profiles=summary.total_profiles,
        total_templates=summary.total_profiles,
        created_count=summary.created_count,
        updated_count=summary.updated_count,
        agent_ids=summary.agent_ids,
    )


@admin_router.get("/mutation-provenance", response_model=list[MutationProvenanceOut])
def list_admin_mutation_provenance(
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[MutationProvenanceOut]:
    normalized_limit = max(1, min(limit, 500))
    rows = db.execute(
        select(MutationProvenanceRecord)
        .order_by(MutationProvenanceRecord.completed_at.desc(), MutationProvenanceRecord.id.desc())
        .limit(normalized_limit)
    ).scalars().all()
    return [
        MutationProvenanceOut(
            id=row.id,
            operation_key=row.operation_key,
            source_surface=row.source_surface,
            actor_id=row.actor_id,
            actor_role=row.actor_role,
            session_id=row.session_id,
            correlation_id=row.correlation_id,
            request_method=row.request_method,
            request_path=row.request_path,
            outcome=row.outcome,
            started_at=row.started_at,
            completed_at=row.completed_at,
            duration_ms=row.duration_ms,
            affected_records=list(row.affected_records or []),
            details=dict(row.details or {}),
        )
        for row in rows
    ]


@admin_router.get("/trade-projection-integrity", response_model=TradeProjectionIssuePage)
def list_admin_trade_projection_issues(
    trade_ids: list[str] | None = None,
    db: Session = Depends(get_db),
) -> TradeProjectionIssuePage:
    structural_issues = list_trade_projection_integrity_issues(db, trade_ids=trade_ids)
    invariant_issues = list_trade_projection_invariant_issues(db, trade_ids=trade_ids)
    return TradeProjectionIssuePage(
        structural_issue_count=len(structural_issues),
        invariant_issue_count=len(invariant_issues),
        structural_issues=[
            TradeProjectionStructuralIssueOut(
                trade_id=issue.trade_id,
                last_event_id=issue.last_event_id,
                issue_type=issue.issue_type,
                matching_trade_event_count=issue.matching_trade_event_count,
                dependent_counts=issue.dependent_counts,
                last_event_aggregate_type=issue.last_event_aggregate_type,
                last_event_aggregate_id=issue.last_event_aggregate_id,
            )
            for issue in structural_issues
        ],
        invariant_issues=[
            TradeProjectionInvariantIssueOut(
                trade_id=issue.trade_id,
                issue_type=issue.issue_type,
                expected_value=issue.expected_value,
                actual_value=issue.actual_value,
                details=issue.details,
            )
            for issue in invariant_issues
        ],
    )


@admin_router.post("/trade-projection-integrity/repair", response_model=TradeProjectionRepairResult)
def repair_admin_trade_projections(
    payload: TradeProjectionRepairRequest,
    db: Session = Depends(get_db),
) -> TradeProjectionRepairResult:
    actor_id = resolve_audit_actor_id(payload.requested_by)
    summaries = [
        rebuild_trade_operational_projection(
            db,
            trade_id=trade_id,
            actor_id=actor_id,
        )
        for trade_id in payload.trade_ids
    ]
    return TradeProjectionRepairResult(
        requested_by=actor_id,
        repaired_trade_count=len(summaries),
        summaries=[
            TradeProjectionRepairSummaryOut(
                trade_id=summary.trade_id,
                before_issue_count=summary.before_issue_count,
                after_issue_count=summary.after_issue_count,
                resolved_issue_types=list(summary.resolved_issue_types),
                confirmation_record_present=summary.confirmation_record_present,
                option_settlement_workflow_present=summary.option_settlement_workflow_present,
            )
            for summary in summaries
        ],
    )


@admin_router.get("/projection-monitoring", response_model=TradeProjectionMonitoringAdminOut)
def get_projection_monitoring_status(
    db: Session = Depends(get_db),
) -> TradeProjectionMonitoringAdminOut:
    return load_admin_trade_projection_monitoring(db)


@admin_router.put("/projection-monitoring", response_model=TradeProjectionMonitoringAdminOut)
def update_projection_monitoring_status(
    payload: TradeProjectionMonitoringUpdate,
    db: Session = Depends(get_db),
) -> TradeProjectionMonitoringAdminOut:
    actor_id = resolve_audit_actor_id(payload.updated_by)
    return save_trade_projection_monitoring_document(
        db,
        payload.document,
        updated_by=actor_id,
    )


@admin_router.post("/projection-monitoring/run", response_model=TradeProjectionMonitoringRunResult)
def run_projection_monitoring(
    payload: TradeProjectionMonitoringRunRequest,
    db: Session = Depends(get_db),
) -> TradeProjectionMonitoringRunResult:
    actor_id = resolve_audit_actor_id(payload.requested_by)
    return run_trade_projection_monitoring_cycle(
        db,
        requested_by=actor_id,
        force=payload.force,
    )
