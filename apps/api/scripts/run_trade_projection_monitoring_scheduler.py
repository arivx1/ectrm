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

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.admin.services.projection_monitoring import (
    run_trade_projection_monitoring_cycle,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run recurring trade projection monitoring on the saved admin cadence."
    )
    parser.add_argument("--poll-seconds", dest="poll_seconds", type=int, default=60)
    parser.add_argument(
        "--requested-by",
        dest="requested_by",
        default="scheduler.projection_monitoring",
    )
    parser.add_argument("--max-cycles", dest="max_cycles", type=int)
    parser.add_argument("--force-initial-run", dest="force_initial_run", action="store_true")
    args = parser.parse_args()

    cycle_count = 0
    while True:
        cycle_count += 1
        db = SessionLocal()
        try:
            result = run_trade_projection_monitoring_cycle(
                db,
                requested_by=args.requested_by,
                force=args.force_initial_run and cycle_count == 1,
            )
        finally:
            db.close()

        print(
            f"Projection monitor cycle {cycle_count} "
            f"executed={'yes' if result.executed else 'no'} "
            f"status={result.cycle_status} "
            f"issues_before={result.issue_count_before} "
            f"issues_after={result.issue_count_after}"
        )
        print(result.summary)
        if result.auto_cleaned_trade_ids:
            print(f"Auto-cleaned trades: {', '.join(result.auto_cleaned_trade_ids)}")
        if result.emitted_alerts:
            for alert in result.emitted_alerts:
                print(
                    f"Alert emitted severity={alert.severity} channels={','.join(alert.channels)} "
                    f"reason={alert.reason}"
                )
        if result.emitted_deliveries:
            for delivery in result.emitted_deliveries:
                print(
                    f"Delivery recorded channel={delivery.channel} status={delivery.status} "
                    f"target={delivery.target}"
                )

        if args.max_cycles is not None and cycle_count >= args.max_cycles:
            return 0

        if result.next_evaluation_at is not None:
            print(f"Next evaluation target {result.next_evaluation_at.isoformat()}")

        next_poll_at = datetime.now(timezone.utc).replace(microsecond=0).timestamp() + args.poll_seconds
        print(f"Sleeping until {datetime.fromtimestamp(next_poll_at, tz=timezone.utc).isoformat()}")
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
