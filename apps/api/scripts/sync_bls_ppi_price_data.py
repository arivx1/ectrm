from __future__ import annotations

import argparse

from apps.api.app.config import settings
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.external_data.bls_sync import sync_bls_ppi_series


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync BLS PPI commodity index observations.")
    parser.add_argument("--price-index-code", dest="price_index_code")
    parser.add_argument(
        "--lookback-days",
        dest="lookback_days",
        type=int,
        default=settings.BLS_PPI_SYNC_DEFAULT_LOOKBACK_DAYS,
    )
    parser.add_argument("--requested-by", dest="requested_by", default="cli")
    args = parser.parse_args()

    with SessionLocal() as session:
        run = sync_bls_ppi_series(
            session,
            price_index_code=args.price_index_code,
            lookback_days=args.lookback_days,
            requested_by=args.requested_by,
        )
        print(
            f"BLS PPI sync run_id={run.id} status={run.status} "
            f"series_count={run.series_count} observation_count={run.observation_count}"
        )
        if run.error_summary:
            print(run.error_summary)
        return 0 if run.status == "SUCCEEDED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
