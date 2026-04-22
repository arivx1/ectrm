from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.deps.db import get_db
from apps.api.app.models.roadmap_document import RoadmapDocument
from apps.api.app.models.roadmap_document_revision import RoadmapDocumentRevision
from apps.api.app.schemas.roadmap import (
    RoadmapAdminDocumentOut,
    RoadmapDocumentOut,
    RoadmapDocumentRestore,
    RoadmapDocumentUpdate,
    RoadmapHorizonOut,
    RoadmapItemOut,
    RoadmapLinkOut,
    RoadmapRevisionOut,
    RoadmapMilestoneOut,
    RoadmapPhaseOut,
)

router = APIRouter(prefix="/roadmap", tags=["roadmap"])
admin_router = APIRouter(prefix="/admin/roadmap", tags=["roadmap-admin"])
DEFAULT_DOCUMENT_KEY = "default"
RECENT_REVISION_LIMIT = 10


DEFAULT_ROADMAP_DOCUMENT = RoadmapDocumentOut(
    source_path="docs/engineering/trading-source-roadmap.md",
    horizons=[
        RoadmapHorizonOut(
            key="now",
            label="Now",
            detail="Lock in controlled trade capture, the operating book of record, and the governance surfaces operators use every day.",
        ),
        RoadmapHorizonOut(
            key="next",
            label="Next",
            detail="Finish the pricing and external-data baselines that make the platform useful for daily marks, risk, and commodity workflows.",
        ),
        RoadmapHorizonOut(
            key="later",
            label="Later",
            detail="Expand into strategy-specific or multi-asset datasets only after the control plane is routine and observable.",
        ),
    ],
    phases=[
        RoadmapPhaseOut(
            id="phase-1",
            title="Phase 1: Must Have",
            priority="P0",
            summary="Operational credibility first: reference data, trade lifecycle controls, books and records, and guardrails.",
            items=[
                RoadmapItemOut(
                    id="reference-foundation",
                    title="Reference and validation foundation",
                    summary="Books, commodities, units, currencies, locations, counterparties, and price indices are already modeled and exposed in the app.",
                    status="shipped",
                    horizon="now",
                    owner="Reference Data",
                    target="March 2026",
                    source_ids=[
                        "refdata_books",
                        "refdata_commodities",
                        "refdata_units",
                        "refdata_currencies",
                        "refdata_counterparties",
                        "refdata_locations",
                        "refdata_price_indices",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Reference Data", view="reference"),
                        RoadmapLinkOut(label="Open Trades", view="trades"),
                    ],
                ),
                RoadmapItemOut(
                    id="trade-lifecycle",
                    title="Trade capture and lifecycle surfaces",
                    summary="Operators can capture, amend, cancel, and inspect trade flows with linked event history in-product.",
                    status="shipped",
                    horizon="now",
                    owner="Trading Platform",
                    target="March 2026",
                    source_ids=["refdata_counterparties", "compliance_lists"],
                    links=[
                        RoadmapLinkOut(label="Open Trades", view="trades"),
                        RoadmapLinkOut(label="Open Events", view="events"),
                    ],
                ),
                RoadmapItemOut(
                    id="books-records",
                    title="Operational books and records loop",
                    summary="Positions and event history exist, but reconciliation breaks and settlement-grade control loops still need to be closed end to end.",
                    status="in_progress",
                    horizon="now",
                    owner="Operations",
                    target="Q2 2026",
                    source_ids=[
                        "ops_positions_balances",
                        "ops_clearing_settlement",
                        "reconciliation_breaks",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Positions", view="positions"),
                        RoadmapLinkOut(label="Open Events", view="events"),
                    ],
                ),
                RoadmapItemOut(
                    id="pricing-risk-baseline",
                    title="Pricing and risk explainability baseline",
                    summary="Index-linked pricing, positions, and explainability are in place, but daily mark, PnL, and risk-output reconciliation is still being assembled.",
                    status="in_progress",
                    horizon="next",
                    owner="Risk and Pricing",
                    target="Q2 2026",
                    source_ids=[
                        "reference_pricing",
                        "risk_outputs",
                        "pnl_attribution",
                        "marketdata_price_indices_obs",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Positions", view="positions"),
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                    ],
                ),
                RoadmapItemOut(
                    id="admin-guardrails",
                    title="Runtime guardrails and auditability",
                    summary="Protected admin surfaces, authentication, and explainability exist today; policy limits and broader audit telemetry still need to be tightened.",
                    status="in_progress",
                    horizon="now",
                    owner="Platform Controls",
                    target="Q2 2026",
                    source_ids=["config_limits", "audit_telemetry"],
                    links=[
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                        RoadmapLinkOut(label="Open Settings", view="settings"),
                    ],
                ),
            ],
        ),
        RoadmapPhaseOut(
            id="phase-2",
            title="Phase 2: Should Have",
            priority="P1",
            summary="Strengthen pricing quality, treasury readiness, and commodity decision support once the operational spine is stable.",
            items=[
                RoadmapItemOut(
                    id="cross-currency-curves",
                    title="Cross-currency curves and treasury marks",
                    summary="Curves and funding-aware marks are still missing from the product and need to land before the platform can support broader treasury-quality valuation.",
                    status="planned",
                    horizon="next",
                    owner="Market Data",
                    target="Q2 2026",
                    source_ids=["fx_spot_curves", "rates_curves"],
                    links=[
                        RoadmapLinkOut(label="Open Positions", view="positions"),
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                    ],
                ),
                RoadmapItemOut(
                    id="weather-iso",
                    title="Weather and ISO operating fundamentals",
                    summary="Weather ingestion is underway and the commodity operating model is opening up, but the full weather, ISO, and pipeline stack is not complete yet.",
                    status="in_progress",
                    horizon="next",
                    owner="External Data",
                    target="Q3 2026",
                    source_ids=[
                        "weather_forecast_obs",
                        "power_iso_load",
                        "gas_pipeline_storage",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                    ],
                ),
                RoadmapItemOut(
                    id="eia-inventory",
                    title="EIA and inventory fundamentals",
                    summary="EIA syncing and external-data plumbing are present in the repo, but inventory and research-grade fundamentals are still being rounded out.",
                    status="in_progress",
                    horizon="next",
                    owner="Research Data",
                    target="Q3 2026",
                    source_ids=["eia_energy_data", "commodity_inventory"],
                    links=[
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                    ],
                ),
                RoadmapItemOut(
                    id="governance-loop",
                    title="Source register governance loop",
                    summary="The checked-in trading-source register and admin sync surface are live, giving us a working starting point for ownership and review cadence.",
                    status="shipped",
                    horizon="now",
                    owner="Data Governance",
                    target="March 2026",
                    source_ids=["trading-source-register.csv governance loop"],
                    links=[
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                    ],
                ),
            ],
        ),
        RoadmapPhaseOut(
            id="phase-3",
            title="Phase 3: Optional / Edge",
            priority="P2",
            summary="Desk-specific or broader multi-asset expansion, only after the operating baseline is boring and dependable.",
            items=[
                RoadmapItemOut(
                    id="ais-freight",
                    title="AIS and freight intelligence",
                    summary="Useful for global crude, LNG, and freight context, but not required for the platform to be credible in its current operating scope.",
                    status="planned",
                    horizon="later",
                    owner="Research Data",
                    target="Q4 2026",
                    source_ids=["shipping_ais"],
                    links=[
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                        RoadmapLinkOut(label="Open Events", view="events"),
                    ],
                ),
                RoadmapItemOut(
                    id="multiasset-expansion",
                    title="Multi-asset market data expansion",
                    summary="Broader real-time and historical feeds only make sense once the current commodity operating model is complete and sponsored by the desk.",
                    status="planned",
                    horizon="later",
                    owner="Market Data",
                    target="Q4 2026",
                    source_ids=[
                        "mktdata_multiasset_rt",
                        "mktdata_multiasset_hist",
                        "news_realtime",
                        "macro_calendar",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                        RoadmapLinkOut(label="Open Admin", view="admin"),
                    ],
                ),
                RoadmapItemOut(
                    id="alternative-signals",
                    title="Alternative and strategic signal pack",
                    summary="Alternative datasets should stay explicitly optional until governance and core operator flows no longer need attention.",
                    status="planned",
                    horizon="later",
                    owner="Desk Research",
                    target="Q1 2027",
                    source_ids=[
                        "social_sentiment",
                        "search_trends",
                        "satellite_geospatial",
                        "political_geopolitical",
                        "blockchain_onchain",
                        "esg_controversy",
                    ],
                    links=[
                        RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                        RoadmapLinkOut(label="Open Events", view="events"),
                    ],
                ),
            ],
        ),
    ],
    milestones=[
        RoadmapMilestoneOut(
            id="m1",
            title="M1: Controlled trade capture",
            summary="Trade entry and validation should feel boring, repeatable, and fully explainable for operators.",
            owner="Trading Platform",
            target="Q2 2026",
            item_ids=[
                "reference-foundation",
                "trade-lifecycle",
                "books-records",
                "admin-guardrails",
            ],
            exit_criteria=[
                "Trades validate against books, commodities, units, currencies, counterparties, locations, and the current control model.",
                "Operators can trace trade lifecycle changes through positions and event history without leaving the app.",
            ],
            links=[
                RoadmapLinkOut(label="Open Trades", view="trades"),
                RoadmapLinkOut(label="Open Reference Data", view="reference"),
                RoadmapLinkOut(label="Open Admin", view="admin"),
            ],
        ),
        RoadmapMilestoneOut(
            id="m2",
            title="M2: Marking and risk baseline",
            summary="The platform should produce marks and explain exposure in a way that operations and risk can reconcile every day.",
            owner="Risk and Pricing",
            target="Q2 2026",
            item_ids=["books-records", "pricing-risk-baseline", "cross-currency-curves"],
            exit_criteria=[
                "Price indices, observations, positions, PnL attribution, and risk outputs reconcile on a predictable cadence.",
                "Users can move from the mark to the underlying position and explainability context without cross-referencing external tools.",
            ],
            links=[
                RoadmapLinkOut(label="Open Positions", view="positions"),
                RoadmapLinkOut(label="Open Admin", view="admin"),
            ],
        ),
        RoadmapMilestoneOut(
            id="m3",
            title="M3: Commodity operating model",
            summary="Weather, ISO, pipeline, EIA, and inventory data should be available in a way that supports day-to-day commodity workflows.",
            owner="External Data",
            target="Q3 2026",
            item_ids=["weather-iso", "eia-inventory", "governance-loop"],
            exit_criteria=[
                "Core commodity fundamentals are ingested, visible, and attributable to named owners.",
                "Data-source review and fallback expectations are visible enough to prevent silent drift.",
            ],
            links=[
                RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                RoadmapLinkOut(label="Open Admin", view="admin"),
            ],
        ),
        RoadmapMilestoneOut(
            id="m4",
            title="M4: Strategy expansion",
            summary="Optional datasets only land after the current control plane is dependable and explicitly sponsored by the desk.",
            owner="Platform Strategy",
            target="Q4 2026",
            item_ids=["ais-freight", "multiasset-expansion", "alternative-signals"],
            exit_criteria=[
                "Each new dataset has an explicit business sponsor, operating owner, and fallback expectation.",
                "Optional feeds do not degrade the control, pricing, or operator workflows already in place.",
            ],
            links=[
                RoadmapLinkOut(label="Open Dashboard", view="dashboard"),
                RoadmapLinkOut(label="Open Events", view="events"),
            ],
        ),
    ],
)


@router.get("", response_model=RoadmapDocumentOut)
def get_roadmap_document(db: Session = Depends(get_db)) -> RoadmapDocumentOut:
    return _load_roadmap_document(db)


@admin_router.get("", response_model=RoadmapAdminDocumentOut)
def get_admin_roadmap_document(db: Session = Depends(get_db)) -> RoadmapAdminDocumentOut:
    return _load_admin_roadmap_document(db)


@admin_router.put("", response_model=RoadmapAdminDocumentOut)
def update_admin_roadmap_document(
    payload: RoadmapDocumentUpdate,
    db: Session = Depends(get_db),
) -> RoadmapAdminDocumentOut:
    actor_id = resolve_audit_actor_id(payload.updated_by)
    return _save_roadmap_document(db, payload.document, updated_by=actor_id)


@admin_router.post("/revisions/{revision_id}/restore", response_model=RoadmapAdminDocumentOut)
def restore_admin_roadmap_document(
    revision_id: int,
    payload: RoadmapDocumentRestore,
    db: Session = Depends(get_db),
) -> RoadmapAdminDocumentOut:
    actor_id = resolve_audit_actor_id(payload.updated_by)
    revision = db.get(RoadmapDocumentRevision, revision_id)
    if revision is None or revision.document_key != DEFAULT_DOCUMENT_KEY:
        raise HTTPException(status_code=404, detail="Roadmap revision not found")
    document = RoadmapDocumentOut.model_validate(revision.payload)
    return _save_roadmap_document(
        db,
        document,
        updated_by=actor_id,
        restored_from_revision_id=revision.revision_id,
    )


def get_default_roadmap_document() -> RoadmapDocumentOut:
    return DEFAULT_ROADMAP_DOCUMENT.model_copy(deep=True)


def _load_roadmap_document(db: Session) -> RoadmapDocumentOut:
    record = db.get(RoadmapDocument, DEFAULT_DOCUMENT_KEY)
    if record is None:
        return get_default_roadmap_document()
    return RoadmapDocumentOut.model_validate(record.payload)


def _load_admin_roadmap_document(db: Session) -> RoadmapAdminDocumentOut:
    record = db.get(RoadmapDocument, DEFAULT_DOCUMENT_KEY)
    if record is None:
        return RoadmapAdminDocumentOut(
            document=get_default_roadmap_document(),
            updated_at=None,
            updated_by=None,
            version=0,
            is_default=True,
            recent_revisions=_load_recent_revisions(db),
        )
    return _to_admin_out(record, db)


def _save_roadmap_document(
    db: Session,
    document: RoadmapDocumentOut,
    *,
    updated_by: str,
    restored_from_revision_id: Optional[int] = None,
) -> RoadmapAdminDocumentOut:
    now = datetime.now(timezone.utc)
    previous_document = _load_roadmap_document(db)
    record = db.get(RoadmapDocument, DEFAULT_DOCUMENT_KEY)
    next_version = 1 if record is None else record.version + 1
    change_summary = _build_change_summary(previous_document, document)
    if restored_from_revision_id is not None:
        change_summary = [f"Restored from revision {restored_from_revision_id}.", *change_summary]

    if record is None:
        record = RoadmapDocument(
            document_key=DEFAULT_DOCUMENT_KEY,
            payload=document.model_dump(),
            updated_at=now,
            updated_by=updated_by,
            version=next_version,
        )
        db.add(record)
    else:
        record.payload = document.model_dump()
        record.updated_at = now
        record.updated_by = updated_by
        record.version = next_version

    db.add(
        RoadmapDocumentRevision(
            document_key=DEFAULT_DOCUMENT_KEY,
            version=next_version,
            payload=document.model_dump(),
            change_summary=change_summary,
            created_at=now,
            created_by=updated_by,
            restored_from_revision_id=restored_from_revision_id,
        )
    )

    db.commit()
    db.refresh(record)
    return _to_admin_out(record, db)


def _to_admin_out(record: RoadmapDocument, db: Session) -> RoadmapAdminDocumentOut:
    return RoadmapAdminDocumentOut(
        document=RoadmapDocumentOut.model_validate(record.payload),
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        is_default=False,
        recent_revisions=_load_recent_revisions(db),
    )


def _load_recent_revisions(db: Session, *, limit: int = RECENT_REVISION_LIMIT) -> list[RoadmapRevisionOut]:
    rows = db.execute(
        select(RoadmapDocumentRevision)
        .where(RoadmapDocumentRevision.document_key == DEFAULT_DOCUMENT_KEY)
        .order_by(RoadmapDocumentRevision.version.desc(), RoadmapDocumentRevision.revision_id.desc())
        .limit(limit)
    ).scalars().all()
    return [_to_revision_out(row) for row in rows]


def _to_revision_out(record: RoadmapDocumentRevision) -> RoadmapRevisionOut:
    return RoadmapRevisionOut(
        revision_id=record.revision_id,
        version=record.version,
        created_at=record.created_at,
        created_by=record.created_by,
        change_summary=list(record.change_summary),
        restored_from_revision_id=record.restored_from_revision_id,
    )


def _build_change_summary(
    previous_document: RoadmapDocumentOut,
    next_document: RoadmapDocumentOut,
) -> list[str]:
    lines: list[str] = []
    previous_items = {
        item.id: item
        for phase in previous_document.phases
        for item in phase.items
    }
    previous_milestones = {milestone.id: milestone for milestone in previous_document.milestones}

    for phase in next_document.phases:
        for item in phase.items:
            previous_item = previous_items.get(item.id)
            if previous_item is None:
                lines.append(f"{item.title}: added to roadmap.")
                continue

            changes: list[str] = []
            if previous_item.status != item.status:
                changes.append(f"status {_format_status(previous_item.status)} -> {_format_status(item.status)}")
            if previous_item.horizon != item.horizon:
                changes.append(f"horizon {_format_horizon(previous_item.horizon)} -> {_format_horizon(item.horizon)}")
            if previous_item.owner != item.owner:
                changes.append(f"owner {previous_item.owner} -> {item.owner}")
            if previous_item.target != item.target:
                changes.append(f"target {previous_item.target} -> {item.target}")

            if changes:
                lines.append(f"{item.title}: {'; '.join(changes)}.")

    for milestone in next_document.milestones:
        previous_milestone = previous_milestones.get(milestone.id)
        if previous_milestone is None:
            lines.append(f"{milestone.title}: milestone added.")
            continue

        changes = []
        if previous_milestone.owner != milestone.owner:
            changes.append(f"owner {previous_milestone.owner} -> {milestone.owner}")
        if previous_milestone.target != milestone.target:
            changes.append(f"target {previous_milestone.target} -> {milestone.target}")
        if changes:
            lines.append(f"{milestone.title}: {'; '.join(changes)}.")

    if not lines:
        return ["No roadmap planning fields changed."]
    if len(lines) <= 6:
        return lines
    overflow = len(lines) - 5
    return [*lines[:5], f"{overflow} more roadmap update{'s' if overflow != 1 else ''}."]


def _format_status(value: str) -> str:
    return value.replace("_", " ")


def _format_horizon(value: str) -> str:
    return value.capitalize()
