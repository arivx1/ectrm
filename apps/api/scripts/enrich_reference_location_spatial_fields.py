from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.location_spatial_enrichment import (
    enrich_reference_location_spatial_fields,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Hydrate reference location coordinates from deterministic geospatial catalogs."
    )
    parser.add_argument("--requested-by", default="codex")
    args = parser.parse_args()

    with SessionLocal() as session:
        summary = enrich_reference_location_spatial_fields(
            session,
            requested_by=args.requested_by,
        )
    print(json.dumps(asdict(summary), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
