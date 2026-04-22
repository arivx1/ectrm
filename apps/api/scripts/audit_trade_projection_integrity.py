from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    cleanup_auto_cleanable_trade_projection_issues,
    list_trade_projection_integrity_issues,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Audit trade projection rows whose event linkage is inconsistent. "
            "Use --clean to remove auto-cleanable rows whose last_event_id is missing and "
            "that have no trade events at all."
        )
    )
    parser.add_argument("--trade-id", action="append", dest="trade_ids", default=[])
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    with SessionLocal() as session:
        try:
            issues = list_trade_projection_integrity_issues(
                session,
                trade_ids=args.trade_ids or None,
            )

            if args.json:
                payload: dict[str, object] = {
                    "issue_count": len(issues),
                    "issues": [asdict(issue) for issue in issues],
                }
                if args.clean:
                    cleanup_summary = cleanup_auto_cleanable_trade_projection_issues(
                        session,
                        trade_ids=args.trade_ids or None,
                    )
                    session.commit()
                    payload["cleanup"] = asdict(cleanup_summary)
                print(json.dumps(payload, default=str, indent=2, sort_keys=True))
                return 0

            print(f"trade projection integrity issues: {len(issues)}")
            if not issues:
                print("No projection/event linkage issues found.")
            else:
                for issue in issues:
                    auto_cleanable_flag = "yes" if issue.is_auto_cleanable else "no"
                    print(
                        f"- {issue.trade_id}: {issue.issue_type} "
                        f"(last_event_id={issue.last_event_id}, "
                        f"trade_events={issue.matching_trade_event_count}, "
                        f"auto_cleanable={auto_cleanable_flag})"
                    )

            if not args.clean:
                return 0

            cleanup_summary = cleanup_auto_cleanable_trade_projection_issues(
                session,
                trade_ids=args.trade_ids or None,
            )
            session.commit()
            print(
                "cleanup deleted="
                f"{','.join(cleanup_summary.deleted_trade_ids) or 'none'} "
                f"skipped={','.join(cleanup_summary.skipped_trade_ids) or 'none'} "
                f"positions={cleanup_summary.positions_rebuilt} "
                f"option_exposures={cleanup_summary.option_exposures_rebuilt}"
            )
            return 0
        except Exception:
            session.rollback()
            raise


if __name__ == "__main__":
    raise SystemExit(main())
