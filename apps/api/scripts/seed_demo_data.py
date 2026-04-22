from __future__ import annotations

import argparse

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.admin.services.seed_reference_data import seed_reference_master_data
from apps.api.app.domains.admin.services.seed_transactions import seed_transaction_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed reference and scenario transaction data.")
    parser.add_argument("--target", choices=["reference", "transactions", "all"], default="all")
    parser.add_argument("--action", choices=["add", "replace", "delete"], default="replace")
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument("--scenario", action="append", dest="scenario_codes", default=[])
    parser.add_argument("--preserve-reference", action="store_true")
    args = parser.parse_args()

    with SessionLocal() as session:
        if args.target in {"reference", "all"} and args.action != "delete":
            reference_summary = seed_reference_master_data(
                session,
                requested_by=args.requested_by,
                replace_existing=not args.preserve_reference,
            )
            print(
                f"reference total={reference_summary.total_records} "
                f"replace_existing={reference_summary.replace_existing}"
            )

        if args.target in {"transactions", "all"}:
            transaction_summary = seed_transaction_data(
                session,
                action=args.action,
                scenario_codes=args.scenario_codes,
                requested_by=args.requested_by,
            )
            print(
                f"transactions action={transaction_summary.action} "
                f"scenarios={','.join(transaction_summary.scenario_codes) or 'none'} "
                f"trades={transaction_summary.trades_seeded} "
                f"positions={transaction_summary.positions_rebuilt}"
            )


if __name__ == "__main__":
    main()
