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
from apps.api.app.domains.reference_data.services.external_data import sync_cftc_series, sync_fred_series


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync generic external time-series datasets into local storage.")
    parser.add_argument("--provider", dest="provider", choices=("fred", "cftc"), required=True)
    parser.add_argument("--series-code", dest="series_code")
    parser.add_argument("--lookback-days", dest="lookback_days", type=int)
    parser.add_argument("--requested-by", dest="requested_by")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.provider == "fred":
            run = sync_fred_series(
                db,
                series_code=args.series_code,
                lookback_days=args.lookback_days,
                requested_by=args.requested_by,
            )
        else:
            run = sync_cftc_series(
                db,
                series_code=args.series_code,
                lookback_days=args.lookback_days,
                requested_by=args.requested_by,
            )
    finally:
        db.close()

    print(
        f"{run.provider} sync run {run.id} finished with status={run.status} "
        f"series_count={run.series_count} observation_count={run.observation_count}"
    )
    if run.error_summary:
        print(run.error_summary)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
