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
from apps.api.app.domains.reference_data.services.external_data import sync_world_bank_series


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync mapped World Bank Pink Sheet price series into local storage.")
    parser.add_argument("--price-index-code", dest="price_index_code")
    parser.add_argument("--lookback-days", dest="lookback_days", type=int)
    parser.add_argument("--requested-by", dest="requested_by")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        run = sync_world_bank_series(
            db,
            price_index_code=args.price_index_code,
            lookback_days=args.lookback_days,
            requested_by=args.requested_by,
        )
    finally:
        db.close()

    print(
        f"World Bank Pink Sheet sync run {run.id} finished with status={run.status} "
        f"series_count={run.series_count} observation_count={run.observation_count}"
    )
    if run.error_summary:
        print(run.error_summary)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
