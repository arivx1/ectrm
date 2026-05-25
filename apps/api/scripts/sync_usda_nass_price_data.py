from __future__ import annotations

import argparse
import os
import sys


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(API_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from apps.api.app.config import settings
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.external_data.usda_nass_sync import sync_usda_nass_series


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync USDA NASS QuickStats price-received data.")
    parser.add_argument("--price-index-code", dest="price_index_code")
    parser.add_argument(
        "--lookback-days",
        dest="lookback_days",
        type=int,
        default=settings.USDA_NASS_SYNC_DEFAULT_LOOKBACK_DAYS,
    )
    parser.add_argument("--requested-by", dest="requested_by", default="manual")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        run = sync_usda_nass_series(
            db,
            price_index_code=args.price_index_code,
            lookback_days=args.lookback_days,
            requested_by=args.requested_by,
        )
        print(
            f"USDA NASS sync completed external_run_id={run.id} status={run.status} "
            f"series_count={run.series_count} observation_count={run.observation_count}"
        )
        if run.error_summary:
            print(run.error_summary)
        return 0 if run.status == "SUCCEEDED" else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
