from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.asset_catalog_import import (
    import_reference_asset_catalog,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import reference assets from a JSON catalog.")
    parser.add_argument("--file", required=True, help="Path to a JSON file containing an assets array.")
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument(
        "--preserve-existing",
        action="store_true",
        help="Skip rows whose asset codes already exist instead of replacing them.",
    )
    args = parser.parse_args()

    with SessionLocal() as session:
        summary = import_reference_asset_catalog(
            session,
            source_path=args.file,
            requested_by=args.requested_by,
            replace_existing=not args.preserve_existing,
        )
    print(json.dumps(asdict(summary), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
