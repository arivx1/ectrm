from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(API_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from apps.api.app.config import settings
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.weather.services.external_data import sync_nws_weather_locations


def main() -> int:
    parser = argparse.ArgumentParser(description="Run NWS weather sync on a fixed schedule.")
    parser.add_argument("--interval-minutes", dest="interval_minutes", type=int, default=settings.NWS_SYNC_INTERVAL_MINUTES)
    parser.add_argument(
        "--observation-limit",
        dest="observation_limit",
        type=int,
        default=settings.NWS_SYNC_OBSERVATION_LIMIT,
    )
    parser.add_argument("--requested-by", dest="requested_by", default="scheduler")
    parser.add_argument("--location-code", dest="location_codes", action="append", default=[])
    parser.add_argument("--max-runs", dest="max_runs", type=int)
    args = parser.parse_args()

    run_count = 0
    while True:
        run_count += 1
        db = SessionLocal()
        try:
            run = sync_nws_weather_locations(
                db,
                location_codes=args.location_codes or None,
                observation_limit=args.observation_limit,
                requested_by=args.requested_by,
            )
        finally:
            db.close()

        print(
            f"NWS scheduler run {run_count} stored external_run_id={run.id} "
            f"status={run.status} series_count={run.series_count} observation_count={run.observation_count}"
        )
        if run.error_summary:
            print(run.error_summary)

        if args.max_runs is not None and run_count >= args.max_runs:
            return 0 if run.status == "SUCCEEDED" else 1

        next_run_at = datetime.now(timezone.utc) + timedelta(minutes=args.interval_minutes)
        print(f"Sleeping until {next_run_at.isoformat()}")
        time.sleep(args.interval_minutes * 60)


if __name__ == "__main__":
    raise SystemExit(main())
