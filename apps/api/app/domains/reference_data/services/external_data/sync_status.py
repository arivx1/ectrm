from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def build_external_data_sync_status(
    db: Session,
    *,
    now: Optional[datetime] = None,
) -> dict:
    current_time = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    provider_rows: list[dict] = []
    healthy_count = 0
    stale_count = 0
    failed_count = 0
    running_count = 0
    unknown_count = 0

    for definition in _provider_definitions():
        latest_run = _latest_run_for_provider(db, provider=definition["provider"])
        latest_success = _latest_success_for_provider(db, provider=definition["provider"])
        latest_observation_at = _latest_observation_at(
            db,
            provider=definition["provider"],
            observation_kind=definition["observation_kind"],
        )
        active_series_count = _active_series_count(
            db,
            provider=definition["provider"],
            series_kind=definition["series_kind"],
        )
        observation_age_hours = (
            round(max((current_time - latest_observation_at).total_seconds() / 3600.0, 0.0), 1)
            if latest_observation_at is not None
            else None
        )
        health_status = _provider_health_status(
            latest_run=latest_run,
            latest_success=latest_success,
            latest_observation_at=latest_observation_at,
            active_series_count=active_series_count,
            now=current_time,
            success_sla_hours=definition["success_sla_hours"],
        )
        due_for_sync = _provider_due_for_sync(
            latest_run=latest_run,
            latest_success=latest_success,
            active_series_count=active_series_count,
            now=current_time,
            scheduler_interval_minutes=definition["scheduler_interval_minutes"],
        )
        if health_status == "healthy":
            healthy_count += 1
        elif health_status == "stale":
            stale_count += 1
        elif health_status == "failed":
            failed_count += 1
        elif health_status == "running":
            running_count += 1
        else:
            unknown_count += 1

        provider_rows.append(
            {
                "provider": definition["provider"],
                "label": definition["label"],
                "category": definition["category"],
                "health_status": health_status,
                "latest_run_status": latest_run.status if latest_run is not None else "NO_RUNS",
                "success_sla_hours": definition["success_sla_hours"],
                "scheduler_interval_minutes": definition["scheduler_interval_minutes"],
                "ingestion_method": definition["ingestion_method"],
                "ingestion_mode": definition["ingestion_mode"],
                "source_system": definition["source_system"],
                "source_endpoint": definition["source_endpoint"],
                "sync_job_name": definition["sync_job_name"],
                "default_lookback_days": definition["default_lookback_days"],
                "active_series_count": active_series_count,
                "due_for_sync": due_for_sync,
                "last_run_at": _run_reference_time(latest_run),
                "last_success_at": _run_reference_time(latest_success),
                "latest_observation_at": latest_observation_at,
                "observation_age_hours": observation_age_hours,
                "error_summary": latest_run.error_summary if latest_run is not None else None,
                "latest_run": latest_run,
                "latest_success": latest_success,
            }
        )

    return {
        "generated_at": current_time,
        "health_status": _overall_health_status(provider_rows),
        "provider_count": len(provider_rows),
        "healthy_provider_count": healthy_count,
        "stale_provider_count": stale_count,
        "failed_provider_count": failed_count,
        "running_provider_count": running_count,
        "unknown_provider_count": unknown_count,
        "providers": provider_rows,
    }


def _provider_definitions() -> tuple[dict[str, object], ...]:
    return (
        {
            "provider": "EIA",
            "label": "EIA Price Sync",
            "category": "price",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.EIA_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.EIA_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "EIA API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "U.S. Energy Information Administration",
            "source_endpoint": settings.EIA_BASE_URL,
            "sync_job_name": "sync_eia_price_data",
            "default_lookback_days": settings.EIA_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "EIA_FUNDAMENTALS",
            "label": "EIA Fundamentals Sync",
            "category": "fundamentals",
            "observation_kind": "series",
            "series_kind": "series",
            "success_sla_hours": settings.EIA_FUNDAMENTALS_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.EIA_FUNDAMENTALS_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "EIA API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "U.S. Energy Information Administration",
            "source_endpoint": settings.EIA_BASE_URL,
            "sync_job_name": "sync_eia_fundamental_series",
            "default_lookback_days": settings.EIA_FUNDAMENTALS_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "FRED",
            "label": "FRED Market Sync",
            "category": "market",
            "observation_kind": "mixed",
            "series_kind": "mixed",
            "success_sla_hours": settings.FRED_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.FRED_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "FRED API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "Federal Reserve Economic Data",
            "source_endpoint": settings.FRED_BASE_URL,
            "sync_job_name": "sync_fred_series",
            "default_lookback_days": settings.FRED_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "ALPHA_VANTAGE",
            "label": "Alpha Vantage Demo Quote Sync",
            "category": "market",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.ALPHA_VANTAGE_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.ALPHA_VANTAGE_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "Alpha Vantage API pull",
            "ingestion_mode": "Admin manual sync or opt-in scheduler due check",
            "source_system": "Alpha Vantage",
            "source_endpoint": settings.ALPHA_VANTAGE_BASE_URL,
            "sync_job_name": "sync_alpha_vantage_prices",
            "default_lookback_days": None,
        },
        {
            "provider": "BLS_PPI",
            "label": "BLS PPI Commodity Index Sync",
            "category": "price",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.BLS_PPI_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.BLS_PPI_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "BLS public API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "U.S. Bureau of Labor Statistics",
            "source_endpoint": settings.BLS_BASE_URL,
            "sync_job_name": "sync_bls_ppi_prices",
            "default_lookback_days": settings.BLS_PPI_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "WORLD_BANK",
            "label": "World Bank Pink Sheet Sync",
            "category": "price",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.WORLD_BANK_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.WORLD_BANK_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "World Bank Pink Sheet workbook download",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "World Bank Commodity Markets",
            "source_endpoint": settings.WORLD_BANK_PINK_SHEET_MONTHLY_URL,
            "sync_job_name": "sync_world_bank_pink_sheet",
            "default_lookback_days": settings.WORLD_BANK_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "USDA_NASS",
            "label": "USDA NASS QuickStats Price Sync",
            "category": "price",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.USDA_NASS_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.USDA_NASS_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "USDA QuickStats API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "USDA National Agricultural Statistics Service",
            "source_endpoint": settings.USDA_NASS_BASE_URL,
            "sync_job_name": "sync_usda_nass_prices",
            "default_lookback_days": settings.USDA_NASS_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "EIA_WHOLESALE_POWER",
            "label": "EIA Wholesale Power Sync",
            "category": "power",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.EIA_WHOLESALE_POWER_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.EIA_WHOLESALE_POWER_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "EIA wholesale power workbook download",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "U.S. Energy Information Administration",
            "source_endpoint": settings.EIA_WHOLESALE_POWER_BASE_URL,
            "sync_job_name": "sync_eia_wholesale_power_prices",
            "default_lookback_days": settings.EIA_WHOLESALE_POWER_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "CFTC",
            "label": "CFTC Positioning Sync",
            "category": "positioning",
            "observation_kind": "series",
            "series_kind": "series",
            "success_sla_hours": settings.CFTC_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.CFTC_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "CFTC public reporting API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "Commodity Futures Trading Commission",
            "source_endpoint": settings.CFTC_BASE_URL,
            "sync_job_name": "sync_cftc_series",
            "default_lookback_days": settings.CFTC_SYNC_DEFAULT_LOOKBACK_DAYS,
        },
        {
            "provider": "CAISO",
            "label": "CAISO Power Sync",
            "category": "power",
            "observation_kind": "mixed",
            "series_kind": "mixed",
            "success_sla_hours": settings.CAISO_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.CAISO_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "CAISO OASIS API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "California ISO",
            "source_endpoint": settings.CAISO_BASE_URL,
            "sync_job_name": "sync_caiso_power_series",
            "default_lookback_days": None,
        },
        {
            "provider": "ERCOT",
            "label": "ERCOT Power Sync",
            "category": "power",
            "observation_kind": "mixed",
            "series_kind": "mixed",
            "success_sla_hours": settings.ERCOT_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.ERCOT_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "ERCOT public HTML pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "Electric Reliability Council of Texas",
            "source_endpoint": settings.ERCOT_BASE_URL,
            "sync_job_name": "sync_ercot_power_series",
            "default_lookback_days": None,
        },
        {
            "provider": "MISO",
            "label": "MISO Power Sync",
            "category": "power",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.MISO_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.MISO_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "MISO public API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "Midcontinent ISO",
            "source_endpoint": settings.MISO_BASE_URL,
            "sync_job_name": "sync_miso_power_prices",
            "default_lookback_days": None,
        },
        {
            "provider": "NYISO",
            "label": "NYISO Power Sync",
            "category": "power",
            "observation_kind": "price",
            "series_kind": "price",
            "success_sla_hours": settings.NYISO_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.NYISO_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "NYISO public CSV pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "New York ISO",
            "source_endpoint": settings.NYISO_BASE_URL,
            "sync_job_name": "sync_nyiso_power_prices",
            "default_lookback_days": None,
        },
        {
            "provider": "KALSHI",
            "label": "Kalshi Macro Sync",
            "category": "macro",
            "observation_kind": "series",
            "series_kind": "series",
            "success_sla_hours": settings.KALSHI_SYNC_SUCCESS_SLA_HOURS,
            "scheduler_interval_minutes": settings.KALSHI_SYNC_INTERVAL_MINUTES,
            "ingestion_method": "Kalshi trading API pull",
            "ingestion_mode": "Admin manual sync or login-triggered due check",
            "source_system": "Kalshi",
            "source_endpoint": settings.KALSHI_BASE_URL,
            "sync_job_name": "sync_kalshi_series",
            "default_lookback_days": settings.KALSHI_DEFAULT_LOOKBACK_DAYS,
        },
    )


def _latest_run_for_provider(db: Session, *, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(ExternalDataRun.provider == provider)
        .order_by(ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _latest_success_for_provider(db: Session, *, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(
            ExternalDataRun.provider == provider,
            ExternalDataRun.status == "SUCCEEDED",
        )
        .order_by(ExternalDataRun.finished_at.desc(), ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _active_series_count(db: Session, *, provider: str, series_kind: str) -> int:
    if series_kind == "price":
        return int(
            db.execute(
                select(func.count())
                .select_from(ReferencePriceIndexSource)
                .where(
                    ReferencePriceIndexSource.provider == provider,
                    ReferencePriceIndexSource.is_active.is_(True),
                )
            ).scalar_one()
        )
    if series_kind == "mixed":
        external_series_count = int(
            db.execute(
                select(func.count())
                .select_from(ExternalSeriesDefinition)
                .where(
                    ExternalSeriesDefinition.provider == provider,
                    ExternalSeriesDefinition.is_active.is_(True),
                )
            ).scalar_one()
        )
        price_series_count = int(
            db.execute(
                select(func.count())
                .select_from(ReferencePriceIndexSource)
                .where(
                    ReferencePriceIndexSource.provider == provider,
                    ReferencePriceIndexSource.is_active.is_(True),
                )
            ).scalar_one()
        )
        return external_series_count + price_series_count
    return int(
        db.execute(
            select(func.count())
            .select_from(ExternalSeriesDefinition)
            .where(
                ExternalSeriesDefinition.provider == provider,
                ExternalSeriesDefinition.is_active.is_(True),
            )
        ).scalar_one()
    )


def _latest_observation_at(db: Session, *, provider: str, observation_kind: str) -> Optional[datetime]:
    if observation_kind == "price":
        value = db.execute(
            select(func.max(PriceIndexObservation.downloaded_at)).where(
                PriceIndexObservation.source_provider == provider,
            )
        ).scalar_one()
    elif observation_kind == "mixed":
        latest_price = db.execute(
            select(func.max(PriceIndexObservation.downloaded_at)).where(
                PriceIndexObservation.source_provider == provider,
            )
        ).scalar_one()
        latest_series = db.execute(
            select(func.max(ExternalSeriesObservation.downloaded_at)).where(
                ExternalSeriesObservation.source_provider == provider,
            )
        ).scalar_one()
        value = max(
            (
                item
                for item in (_coerce_utc(latest_price), _coerce_utc(latest_series))
                if item is not None
            ),
            default=None,
        )
    else:
        value = db.execute(
            select(func.max(ExternalSeriesObservation.downloaded_at)).where(
                ExternalSeriesObservation.source_provider == provider,
            )
        ).scalar_one()
    return _coerce_utc(value)


def _provider_health_status(
    *,
    latest_run: Optional[ExternalDataRun],
    latest_success: Optional[ExternalDataRun],
    latest_observation_at: Optional[datetime],
    active_series_count: int,
    now: datetime,
    success_sla_hours: int,
) -> str:
    if active_series_count == 0:
        return "unknown"
    if latest_run is None:
        return "unknown"
    if latest_run.status == "RUNNING":
        return "running"
    if latest_run.status == "FAILED":
        return "failed"

    success_at = _run_reference_time(latest_success)
    if success_at is None or latest_observation_at is None:
        return "unknown"
    stale_threshold = now - timedelta(hours=success_sla_hours)
    if success_at < stale_threshold or latest_observation_at < stale_threshold:
        return "stale"
    return "healthy"


def _provider_due_for_sync(
    *,
    latest_run: Optional[ExternalDataRun],
    latest_success: Optional[ExternalDataRun],
    active_series_count: int,
    now: datetime,
    scheduler_interval_minutes: int,
) -> bool:
    if active_series_count == 0:
        return False
    if latest_run is not None and latest_run.status == "RUNNING":
        return False
    reference_at = _run_reference_time(latest_success) or _run_reference_time(latest_run)
    if reference_at is None:
        return True
    return reference_at < now - timedelta(minutes=scheduler_interval_minutes)


def _overall_health_status(providers: list[dict]) -> str:
    statuses = {str(row["health_status"]) for row in providers}
    if not statuses:
        return "unknown"
    if statuses == {"healthy"}:
        return "healthy"
    if "failed" in statuses:
        return "failed"
    if "running" in statuses:
        return "running"
    return "degraded"


def _run_reference_time(run: Optional[ExternalDataRun]) -> Optional[datetime]:
    if run is None:
        return None
    return _coerce_utc(run.finished_at if run.finished_at is not None else run.started_at)


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
