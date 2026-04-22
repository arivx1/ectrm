from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services import build_database_overview
from apps.api.app.domains.operations.services.operational_resource_registry import (
    OPERATIONAL_RESOURCE_DESCRIPTORS,
)
from apps.api.app.domains.operations.services import build_workspace_bootstrap_summary
from apps.api.app.domains.operations.services.settlement_invoices import trade_has_invoice_record
from apps.api.app.domains.operations.services.settlement_payments import trade_has_payment_records
from apps.api.app.domains.operations.services.trade_confirmations import trade_has_confirmation_record
from apps.api.app.domains.operations.services.workflow_items import book_trade_workflow_item_underlying
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.operations.services.workflow_items import list_trade_workflow_items
from apps.api.app.domains.operations.services.workflow_items import update_trade_workflow_item
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.operations import DependencyHealthOut
from apps.api.app.schemas.operations import OperationalResourceDescriptorOut
from apps.api.app.schemas.operations import OperationalResourceEmptyStateOut
from apps.api.app.schemas.operations import OperationalResourcePrimaryActionOut
from apps.api.app.schemas.operations import OperationalResourceSurfaceActionOut
from apps.api.app.schemas.operations import OperationalResourceSummaryStatOut
from apps.api.app.schemas.operations import OperationalResourceSurfaceOut
from apps.api.app.schemas.operations import SystemOverviewOut
from apps.api.app.schemas.operations import TradeWorkflowItemCreate
from apps.api.app.schemas.operations import TradeWorkflowItemOut
from apps.api.app.schemas.operations import TradeWorkflowItemUpdate
from apps.api.app.schemas.operations import WorkspaceBootstrapSummaryOut
from .framework import AUTHENTICATED_WORK_ITEM_MUTATION_SPEC
from .framework import execute_operational_mutation
from .framework import execute_operational_patch_mutation
from .framework import execute_operational_query_spec
from .framework import OperationalQuerySpec

router = APIRouter(prefix="/operations", tags=["operations"])

PRESENCE_WINDOW_SECONDS = 120
DEPENDENCY_DEFINITIONS = (
    {"key": "eia", "label": "EIA Price Sync", "provider": "EIA", "success_sla_hours": 48},
    {
        "key": "nws",
        "label": "NWS Weather Sync",
        "provider": "NWS",
        "success_sla_hours": settings.NWS_SYNC_SUCCESS_SLA_HOURS,
    },
)
WORK_ITEM_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_trade_workflow_items, commit=True)


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _latest_run_for_provider(db: Session, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(ExternalDataRun.provider == provider)
        .order_by(ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _latest_success_for_provider(db: Session, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(
            ExternalDataRun.provider == provider,
            ExternalDataRun.status == "SUCCEEDED",
        )
        .order_by(ExternalDataRun.finished_at.desc(), ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _run_reference_time(run: Optional[ExternalDataRun]) -> Optional[datetime]:
    if run is None:
        return None
    return _coerce_utc(run.finished_at if run.finished_at is not None else run.started_at)


def _dependency_health_status(
    latest_run: Optional[ExternalDataRun],
    latest_success: Optional[ExternalDataRun],
    *,
    now: datetime,
    success_sla_hours: int,
) -> str:
    if latest_run is None:
        return "unknown"
    if latest_run.status == "RUNNING":
        return "running"
    if latest_run.status == "FAILED":
        return "failed"

    success_at = _run_reference_time(latest_success)
    if success_at is None:
        return "unknown"
    if success_at < now - timedelta(hours=success_sla_hours):
        return "stale"
    return "healthy"


def _build_dependency_health(now: datetime, db: Session) -> tuple[list[DependencyHealthOut], int]:
    dependencies: list[DependencyHealthOut] = []
    healthy_dependency_count = 0

    for definition in DEPENDENCY_DEFINITIONS:
        latest_run = _latest_run_for_provider(db, definition["provider"])
        latest_success = _latest_success_for_provider(db, definition["provider"])
        health_status = _dependency_health_status(
            latest_run,
            latest_success,
            now=now,
            success_sla_hours=definition["success_sla_hours"],
        )
        if health_status == "healthy":
            healthy_dependency_count += 1

        dependencies.append(
            DependencyHealthOut(
                key=definition["key"],
                label=definition["label"],
                provider=definition["provider"],
                run_status=latest_run.status if latest_run is not None else "NO_RUNS",
                health_status=health_status,
                success_sla_hours=definition["success_sla_hours"],
                last_run_at=_run_reference_time(latest_run),
                last_success_at=_run_reference_time(latest_success),
                error_summary=latest_run.error_summary if latest_run is not None else None,
            )
        )

    return dependencies, healthy_dependency_count


def _assert_workflow_status_is_not_ledger_managed(
    db: Session,
    *,
    item_id: int,
    changes: dict[str, object | None],
) -> None:
    if "status" not in changes:
        return

    item = db.execute(select(TradeWorkflowItem).where(TradeWorkflowItem.id == item_id)).scalars().first()
    if item is None:
        return

    if item.workflow_type == "INVOICE" and trade_has_invoice_record(db, trade_id=item.trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invoice workflow status is ledger-managed. Update the invoice record from Settlement instead.",
        )
    if item.workflow_type == "CONFIRMATION" and trade_has_confirmation_record(db, trade_id=item.trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Confirmation workflow status is record-managed. Update the confirmation record instead.",
        )
    if item.workflow_type == "PAYMENT" and trade_has_payment_records(db, trade_id=item.trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payment workflow status is ledger-managed. Update the payment record from Settlement instead.",
        )


@router.get("/system-overview", response_model=SystemOverviewOut)
def get_system_overview(request: Request, db: Session = Depends(get_db)) -> SystemOverviewOut:
    now = datetime.now(timezone.utc)
    started_at = _coerce_utc(getattr(request.app.state, "started_at", None)) or now
    uptime_seconds = max(0, int((now - started_at).total_seconds()))
    recent_window_start = now - timedelta(hours=1)
    presence_window_start = now - timedelta(seconds=PRESENCE_WINDOW_SECONDS)

    active_session_filters = (
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
        UserAccount.is_active.is_(True),
        UserSession.last_seen_at.is_not(None),
        UserSession.last_seen_at >= presence_window_start,
    )

    active_session_count = db.execute(
        select(func.count())
        .select_from(UserSession)
        .join(UserAccount, UserAccount.user_id == UserSession.user_id)
        .where(*active_session_filters)
    ).scalar_one()

    active_user_count = db.execute(
        select(func.count(func.distinct(UserSession.user_id)))
        .select_from(UserSession)
        .join(UserAccount, UserAccount.user_id == UserSession.user_id)
        .where(*active_session_filters)
    ).scalar_one()

    registered_user_count = db.execute(select(func.count()).select_from(UserAccount)).scalar_one()
    active_account_count = db.execute(
        select(func.count()).select_from(UserAccount).where(UserAccount.is_active.is_(True))
    ).scalar_one()
    open_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(Trade.status == "ACTIVE")
    ).scalar_one()
    events_last_hour = db.execute(
        select(func.count()).select_from(Event).where(Event.recorded_at >= recent_window_start)
    ).scalar_one()
    last_event_recorded_at = db.execute(select(func.max(Event.recorded_at))).scalar_one()
    dependencies, healthy_dependency_count = _build_dependency_health(now, db)
    database = build_database_overview(db)

    return SystemOverviewOut(
        generated_at=now,
        server_status="ok",
        database_status="ok",
        database=database,
        uptime_seconds=uptime_seconds,
        presence_window_seconds=PRESENCE_WINDOW_SECONDS,
        active_session_count=active_session_count,
        active_user_count=active_user_count,
        registered_user_count=registered_user_count,
        active_account_count=active_account_count,
        open_trade_count=open_trade_count,
        events_last_hour=events_last_hour,
        last_event_recorded_at=_coerce_utc(last_event_recorded_at),
        dependency_count=len(dependencies),
        healthy_dependency_count=healthy_dependency_count,
        dependencies=dependencies,
    )


@router.get("/workspace-summary", response_model=WorkspaceBootstrapSummaryOut)
def get_workspace_bootstrap_summary(db: Session = Depends(get_db)) -> WorkspaceBootstrapSummaryOut:
    return WorkspaceBootstrapSummaryOut(
        generated_at=datetime.now(timezone.utc),
        **build_workspace_bootstrap_summary(db),
    )


@router.get("/resources", response_model=list[OperationalResourceDescriptorOut])
def get_operational_resource_descriptors() -> list[OperationalResourceDescriptorOut]:
    return [
        OperationalResourceDescriptorOut(
            resource_key=descriptor.resource_key,
            filters=list(descriptor.filters),
            sort_fields=list(descriptor.sort_fields),
            actions=list(descriptor.actions),
            surface=OperationalResourceSurfaceOut(
                title=descriptor.surface.title,
                description=descriptor.surface.description,
                board_section=descriptor.surface.board_section,
                actions=[
                    OperationalResourceSurfaceActionOut(
                        key=action.key,
                        label=action.label,
                        detail=action.detail,
                        permission_message=action.permission_message,
                        comment_required=action.comment_required,
                        comment_hint=action.comment_hint,
                    )
                    for action in descriptor.surface.actions
                ],
                primary_action=(
                    OperationalResourcePrimaryActionOut(
                        key=descriptor.surface.primary_action.key,
                        label=descriptor.surface.primary_action.label,
                        detail=descriptor.surface.primary_action.detail,
                    )
                    if descriptor.surface.primary_action is not None
                    else None
                ),
                empty_state=(
                    OperationalResourceEmptyStateOut(
                        title=descriptor.surface.empty_state.title,
                        detail=descriptor.surface.empty_state.detail,
                    )
                    if descriptor.surface.empty_state is not None
                    else None
                ),
                summary_stats=[
                    OperationalResourceSummaryStatOut(
                        key=stat.key,
                        label=stat.label,
                        detail=stat.detail,
                    )
                    for stat in descriptor.surface.summary_stats
                ],
            ),
        )
        for descriptor in OPERATIONAL_RESOURCE_DESCRIPTORS.values()
    ]


@router.get("/work-items", response_model=list[TradeWorkflowItemOut])
def get_work_items(
    queue: str | None = Query(default=None),
    include_closed: bool = Query(default=False),
    trade_id: str | None = Query(default=None),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[TradeWorkflowItemOut]:
    return execute_operational_query_spec(
        WORK_ITEM_LIST_QUERY_SPEC,
        db,
        queue=queue,
        include_closed=include_closed,
        trade_id=trade_id,
        limit=limit,
        offset=offset,
    )


@router.post("/work-items", response_model=TradeWorkflowItemOut, status_code=status.HTTP_201_CREATED)
def post_work_item(
    payload: TradeWorkflowItemCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeWorkflowItemOut:
    return execute_operational_mutation(
        AUTHENTICATED_WORK_ITEM_MUTATION_SPEC,
        request,
        db,
        lambda actor: create_trade_workflow_item(
            db,
            trade_id=payload.trade_id,
            workflow_type=payload.workflow_type,
            actor_id=actor.actor_id,
            actor_role=actor.actor_role,
            status=payload.status,
            owner=payload.owner,
            due_at=payload.due_at,
            notes=payload.notes,
        )
    )


@router.patch("/work-items/{item_id}", response_model=TradeWorkflowItemOut)
def patch_work_item(
    item_id: int,
    payload: TradeWorkflowItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeWorkflowItemOut:
    return execute_operational_patch_mutation(
        AUTHENTICATED_WORK_ITEM_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_trade_workflow_item(
            db,
            item_id=item_id,
            actor_id=actor.actor_id,
            actor_role=actor.actor_role,
            changes=changes,
        ),
        empty_detail="At least one workflow item field must be provided.",
        before_action=lambda current_db, changes, _actor: _assert_workflow_status_is_not_ledger_managed(
            current_db,
            item_id=item_id,
            changes=changes,
        )
    )


@router.post("/work-items/{item_id}/book-underlying", response_model=TradeWorkflowItemOut)
def post_work_item_book_underlying(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeWorkflowItemOut:
    reference_time = datetime.now(timezone.utc)
    return execute_operational_mutation(
        AUTHENTICATED_WORK_ITEM_MUTATION_SPEC,
        request,
        db,
        lambda actor: book_trade_workflow_item_underlying(
            db,
            item_id=item_id,
            actor_id=actor.actor_id,
            actor_role=actor.actor_role,
            now=reference_time,
        )
    )


__all__ = [
    "router",
    "get_system_overview",
    "get_workspace_bootstrap_summary",
    "get_work_items",
    "post_work_item",
    "patch_work_item",
    "post_work_item_book_underlying",
]
