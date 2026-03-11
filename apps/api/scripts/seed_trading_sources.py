from __future__ import annotations

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.admin.services.trading_sources import seed_trading_sources_from_csv


def main() -> None:
    with SessionLocal() as session:
        summary = seed_trading_sources_from_csv(session, replace_existing=True)
    print(
        f"Seeded trading sources: total={summary.total_rows} "
        f"created={summary.created_count} updated={summary.updated_count}"
    )


if __name__ == "__main__":
    main()
