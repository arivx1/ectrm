from __future__ import annotations

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger


def main() -> None:
    db = SessionLocal()

    try:
        print("Rebuilding trade accrual ledger...")
        lots_synchronized = rebuild_trade_accruals_ledger(db)
        db.commit()
        print(f"Synchronized {lots_synchronized} accrual lots.")
        print("Trade accrual ledger rebuild complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
