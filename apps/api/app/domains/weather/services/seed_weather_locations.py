from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.weather_location import WeatherLocation


STARTER_WEATHER_LOCATION_ROWS = [
    {
        "code": "BOS_LOAD",
        "name": "Boston Load Center",
        "reference_location_code": None,
        "latitude": 42.3601,
        "longitude": -71.0589,
        "timezone": "America/New_York",
        "description": "Starter NWS weather point for Boston-area power demand monitoring.",
    },
    {
        "code": "NYC_LOAD",
        "name": "New York City Load Center",
        "reference_location_code": None,
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York",
        "description": "Starter NWS weather point for NYC load sensitivity and gas demand.",
    },
    {
        "code": "PJM_WEST",
        "name": "PJM West Weather Point",
        "reference_location_code": "PJM_WEST",
        "latitude": 40.4406,
        "longitude": -79.9959,
        "timezone": "America/New_York",
        "description": "Starter NWS weather point aligned to PJM West hub exposure.",
    },
    {
        "code": "ERCOT_HOUSTON",
        "name": "ERCOT Houston Load Center",
        "reference_location_code": None,
        "latitude": 29.7604,
        "longitude": -95.3698,
        "timezone": "America/Chicago",
        "description": "Starter NWS weather point for Houston-area ERCOT load and storm risk.",
    },
    {
        "code": "HENRY_HUB",
        "name": "Henry Hub Weather Point",
        "reference_location_code": "HENRY_HUB",
        "latitude": 29.9537,
        "longitude": -92.1243,
        "timezone": "America/Chicago",
        "description": "Starter NWS weather point for Henry Hub gas demand and storm monitoring.",
    },
    {
        "code": "CHICAGO_LOAD",
        "name": "Chicago Load Center",
        "reference_location_code": None,
        "latitude": 41.8781,
        "longitude": -87.6298,
        "timezone": "America/Chicago",
        "description": "Starter NWS weather point for Midwest power and gas demand monitoring.",
    },
]


@dataclass
class WeatherLocationSeedSummary:
    total_rows: int
    created_count: int
    updated_count: int
    skipped_count: int
    missing_reference_codes: list[str]


def seed_starter_weather_locations(
    db: Session,
    *,
    requested_by: Optional[str],
    replace_existing: bool = True,
) -> WeatherLocationSeedSummary:
    actor_id = resolve_audit_actor_id(requested_by, required=False) or "system"
    now = datetime.now(timezone.utc)
    created_count = 0
    updated_count = 0
    skipped_count = 0
    missing_reference_codes: set[str] = set()

    for row in STARTER_WEATHER_LOCATION_ROWS:
        reference_location_code = _resolve_reference_location_code(
            db,
            code=row["reference_location_code"],
            missing_reference_codes=missing_reference_codes,
        )
        record = db.get(WeatherLocation, row["code"])

        if record is None:
            db.add(
                WeatherLocation(
                    code=row["code"],
                    name=row["name"],
                    reference_location_code=reference_location_code,
                    latitude=row["latitude"],
                    longitude=row["longitude"],
                    timezone=row["timezone"],
                    source_provider="NWS",
                    cwa=None,
                    grid_id=None,
                    grid_x=None,
                    grid_y=None,
                    station_id=None,
                    description=row["description"],
                    is_active=True,
                    created_at=now,
                    created_by=actor_id,
                    updated_at=now,
                    updated_by=actor_id,
                    version=1,
                )
            )
            created_count += 1
            continue

        if not replace_existing:
            skipped_count += 1
            continue

        changed = False
        for field_name, value in (
            ("name", row["name"]),
            ("reference_location_code", reference_location_code),
            ("latitude", row["latitude"]),
            ("longitude", row["longitude"]),
            ("timezone", row["timezone"]),
            ("source_provider", "NWS"),
            ("description", row["description"]),
        ):
            if getattr(record, field_name) != value:
                setattr(record, field_name, value)
                changed = True

        if not record.is_active:
            record.is_active = True
            changed = True

        if changed:
            record.updated_at = now
            record.updated_by = actor_id
            record.version += 1
            updated_count += 1

    db.commit()
    return WeatherLocationSeedSummary(
        total_rows=len(STARTER_WEATHER_LOCATION_ROWS),
        created_count=created_count,
        updated_count=updated_count,
        skipped_count=skipped_count,
        missing_reference_codes=sorted(missing_reference_codes),
    )


def _resolve_reference_location_code(
    db: Session,
    *,
    code: Optional[str],
    missing_reference_codes: set[str],
) -> Optional[str]:
    if code is None:
        return None
    if db.get(ReferenceLocation, code) is not None:
        return code
    missing_reference_codes.add(code)
    return None
