from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.asset_catalog_import import (
    import_reference_asset_catalog,
)
from apps.api.app.domains.reference_data.services.asset_reference_normalization import (
    normalize_reference_asset_links,
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
    parser.add_argument(
        "--normalize-references",
        action="store_true",
        help="Normalize imported asset commodity and location links to curated reference codes after import.",
    )
    args = parser.parse_args()

    with SessionLocal() as session:
        summary = import_reference_asset_catalog(
            session,
            source_path=args.file,
            requested_by=args.requested_by,
            replace_existing=not args.preserve_existing,
        )
        normalization_summary = (
            normalize_reference_asset_links(
                session,
                requested_by=args.requested_by,
            )
            if args.normalize_references
            else None
        )
    payload = {"import": asdict(summary)}
    if normalization_summary is not None:
        payload["reference_normalization"] = asdict(normalization_summary)
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
