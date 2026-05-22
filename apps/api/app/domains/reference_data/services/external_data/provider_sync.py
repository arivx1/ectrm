from __future__ import annotations

import logging
from collections.abc import Iterable

from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.external_data_run import ExternalDataRun

from . import (
    sync_caiso_series,
    sync_cftc_series,
    sync_eia_fundamental_series,
    sync_eia_series,
    sync_eia_wholesale_power_series,
    sync_ercot_series,
    sync_fred_series,
    sync_kalshi_series,
    sync_miso_series,
    sync_nyiso_series,
)
from .sync_status import build_external_data_sync_status


logger = logging.getLogger(__name__)

DEFAULT_MARKET_DATA_SYNC_PROVIDERS = (
    "EIA",
    "EIA_FUNDAMENTALS",
    "FRED",
    "EIA_WHOLESALE_POWER",
    "CFTC",
    "CAISO",
    "ERCOT",
    "MISO",
    "NYISO",
    "KALSHI",
)


def normalize_market_data_provider(provider: str) -> str:
    return provider.strip().replace("-", "_").upper()


def configured_login_sync_providers() -> tuple[str, ...]:
    raw_value = settings.MARKET_DATA_LOGIN_SYNC_PROVIDERS.strip()
    if not raw_value:
        return DEFAULT_MARKET_DATA_SYNC_PROVIDERS
    return tuple(
        normalize_market_data_provider(provider)
        for provider in raw_value.split(",")
        if provider.strip()
    )


def sync_external_data_provider(
    db: Session,
    *,
    provider: str,
    requested_by: str,
) -> ExternalDataRun:
    normalized_provider = normalize_market_data_provider(provider)
    if normalized_provider == "EIA":
        return sync_eia_series(
            db,
            lookback_days=settings.EIA_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if normalized_provider == "EIA_FUNDAMENTALS":
        return sync_eia_fundamental_series(
            db,
            lookback_days=settings.EIA_FUNDAMENTALS_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if normalized_provider == "FRED":
        return sync_fred_series(
            db,
            lookback_days=settings.FRED_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if normalized_provider == "EIA_WHOLESALE_POWER":
        return sync_eia_wholesale_power_series(
            db,
            lookback_days=settings.EIA_WHOLESALE_POWER_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if normalized_provider == "CFTC":
        return sync_cftc_series(
            db,
            lookback_days=settings.CFTC_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if normalized_provider == "CAISO":
        return sync_caiso_series(db, requested_by=requested_by)
    if normalized_provider == "ERCOT":
        return sync_ercot_series(db, requested_by=requested_by)
    if normalized_provider == "MISO":
        return sync_miso_series(db, requested_by=requested_by)
    if normalized_provider == "NYISO":
        return sync_nyiso_series(db, requested_by=requested_by)
    if normalized_provider == "KALSHI":
        return sync_kalshi_series(
            db,
            lookback_days=settings.KALSHI_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    raise ValueError(f"Unsupported provider {provider}")


def sync_due_external_data_providers(
    db: Session,
    *,
    requested_by: str,
    providers: Iterable[str] = DEFAULT_MARKET_DATA_SYNC_PROVIDERS,
) -> list[ExternalDataRun]:
    status = build_external_data_sync_status(db)
    status_by_provider = {row["provider"]: row for row in status["providers"]}
    runs: list[ExternalDataRun] = []

    for provider in providers:
        normalized_provider = normalize_market_data_provider(provider)
        if not status_by_provider.get(normalized_provider, {}).get("due_for_sync", True):
            continue
        runs.append(
            sync_external_data_provider(
                db,
                provider=normalized_provider,
                requested_by=requested_by,
            )
        )

    return runs


def run_login_triggered_market_data_syncs(*, requested_by: str, session_factory=SessionLocal) -> list[int]:
    if not settings.MARKET_DATA_LOGIN_SYNC_ENABLED:
        return []

    db = session_factory()
    try:
        runs = sync_due_external_data_providers(
            db,
            requested_by=requested_by,
            providers=configured_login_sync_providers(),
        )
        return [run.id for run in runs]
    except Exception:
        logger.exception("Login-triggered market data sync failed")
        return []
    finally:
        db.close()
