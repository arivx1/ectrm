from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(API_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from apps.api.app.config import settings
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.external_data import (
    sync_caiso_series,
    sync_cftc_series,
    sync_eia_fundamental_series,
    sync_eia_series,
    sync_ercot_series,
    sync_fred_series,
    sync_kalshi_series,
)
from apps.api.app.domains.reference_data.services.external_data.sync_status import build_external_data_sync_status

DEFAULT_PROVIDERS = ("EIA", "EIA_FUNDAMENTALS", "FRED", "CFTC", "CAISO", "ERCOT", "KALSHI")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run recurring market-data syncs for configured providers.")
    parser.add_argument(
        "--provider",
        dest="providers",
        action="append",
        choices=("eia", "eia-fundamentals", "fred", "cftc", "caiso", "ercot", "kalshi"),
    )
    parser.add_argument("--poll-seconds", dest="poll_seconds", type=int, default=60)
    parser.add_argument("--requested-by", dest="requested_by", default="scheduler")
    parser.add_argument("--max-cycles", dest="max_cycles", type=int)
    args = parser.parse_args()

    providers = tuple(provider.strip().replace("-", "_").upper() for provider in (args.providers or DEFAULT_PROVIDERS))
    cycle_count = 0
    had_failure = False

    while True:
        cycle_count += 1
        db = SessionLocal()
        try:
            status = build_external_data_sync_status(db)
            status_by_provider = {row["provider"]: row for row in status["providers"]}
            due_providers = [
                provider
                for provider in providers
                if status_by_provider.get(provider, {}).get("due_for_sync", True)
            ]

            if due_providers:
                print(f"Scheduler cycle {cycle_count} running providers: {', '.join(due_providers)}")
            else:
                print(f"Scheduler cycle {cycle_count} found no providers due for sync")

            for provider in due_providers:
                run = _sync_provider(db=db, provider=provider, requested_by=args.requested_by)
                print(
                    f"{provider} scheduler run stored external_run_id={run.id} status={run.status} "
                    f"series_count={run.series_count} observation_count={run.observation_count}"
                )
                if run.error_summary:
                    print(run.error_summary)
                    had_failure = True
        finally:
            db.close()

        if args.max_cycles is not None and cycle_count >= args.max_cycles:
            return 1 if had_failure else 0

        next_poll_at = datetime.now(timezone.utc).replace(microsecond=0)
        next_poll_at = next_poll_at.timestamp() + args.poll_seconds
        print(f"Sleeping until {datetime.fromtimestamp(next_poll_at, tz=timezone.utc).isoformat()}")
        time.sleep(args.poll_seconds)


def _sync_provider(*, provider: str, requested_by: str, db):
    if provider == "EIA":
        return sync_eia_series(
            db,
            lookback_days=settings.EIA_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if provider == "EIA_FUNDAMENTALS":
        return sync_eia_fundamental_series(
            db,
            lookback_days=settings.EIA_FUNDAMENTALS_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if provider == "FRED":
        return sync_fred_series(
            db,
            lookback_days=settings.FRED_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if provider == "CFTC":
        return sync_cftc_series(
            db,
            lookback_days=settings.CFTC_SYNC_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    if provider == "CAISO":
        return sync_caiso_series(
            db,
            requested_by=requested_by,
        )
    if provider == "ERCOT":
        return sync_ercot_series(
            db,
            requested_by=requested_by,
        )
    if provider == "KALSHI":
        return sync_kalshi_series(
            db,
            lookback_days=settings.KALSHI_DEFAULT_LOOKBACK_DAYS,
            requested_by=requested_by,
        )
    raise ValueError(f"Unsupported provider {provider}")


if __name__ == "__main__":
    raise SystemExit(main())
