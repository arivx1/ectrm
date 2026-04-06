from __future__ import annotations

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.risk.services.option_exposures import rebuild_option_exposures_projection


def main() -> None:
    db = SessionLocal()

    try:
        print("Clearing option exposures projection...")
        option_exposures_rebuilt = rebuild_option_exposures_projection(db)
        db.commit()
        print(f"Writing {option_exposures_rebuilt} option exposures...")
        print("Option exposures rebuild complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
