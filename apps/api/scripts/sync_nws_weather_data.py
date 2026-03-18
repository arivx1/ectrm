from __future__ import annotations

import argparse
import os
import sys


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(API_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.weather.services.external_data import sync_nws_weather_locations


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync NWS weather forecasts and observations into local storage.")
    parser.add_argument("--location-code", dest="location_codes", action="append", default=[])
    parser.add_argument("--observation-limit", dest="observation_limit", type=int, default=24)
    parser.add_argument("--requested-by", dest="requested_by")
    args = parser.parse_args()

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
        f"NWS sync run {run.id} finished with status={run.status} "
        f"series_count={run.series_count} observation_count={run.observation_count}"
    )
    if run.error_summary:
        print(run.error_summary)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
