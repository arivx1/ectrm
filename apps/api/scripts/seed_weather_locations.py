from __future__ import annotations

import argparse

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.weather.services import seed_starter_weather_locations


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed starter weather locations.")
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument("--preserve-existing", action="store_true")
    args = parser.parse_args()

    with SessionLocal() as session:
        summary = seed_starter_weather_locations(
            session,
            requested_by=args.requested_by,
            replace_existing=not args.preserve_existing,
        )

    missing_reference_codes = ",".join(summary.missing_reference_codes) or "none"
    print(
        f"weather_locations total={summary.total_rows} "
        f"created={summary.created_count} "
        f"updated={summary.updated_count} "
        f"skipped={summary.skipped_count} "
        f"replace_existing={not args.preserve_existing} "
        f"missing_reference_codes={missing_reference_codes}"
    )


if __name__ == "__main__":
    main()
