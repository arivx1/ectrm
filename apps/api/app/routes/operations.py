from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.trade import Trade
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.operations import DependencyHealthOut
from apps.api.app.schemas.operations import SystemOverviewOut

router = APIRouter(prefix="/operations", tags=["operations"])

PRESENCE_WINDOW_SECONDS = 120
DEPENDENCY_DEFINITIONS = (
    {"key": "eia", "label": "EIA Price Sync", "provider": "EIA", "success_sla_hours": 48},
    {"key": "nws", "label": "NWS Weather Sync", "provider": "NWS", "success_sla_hours": 6},
)


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
        select(func.count()).select_from(Trade).where(Trade.status != "CANCELLED")
    ).scalar_one()
    events_last_hour = db.execute(
        select(func.count()).select_from(Event).where(Event.recorded_at >= recent_window_start)
    ).scalar_one()
    last_event_recorded_at = db.execute(select(func.max(Event.recorded_at))).scalar_one()
    dependencies, healthy_dependency_count = _build_dependency_health(now, db)

    return SystemOverviewOut(
        generated_at=now,
        server_status="ok",
        database_status="ok",
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
