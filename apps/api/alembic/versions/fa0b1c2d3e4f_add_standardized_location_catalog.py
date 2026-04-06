"""add standardized location catalog

Revision ID: fa0b1c2d3e4f
Revises: c9d8e7f6a5b4
"""

from __future__ import annotations

import pycountry
from alembic import op

revision = "fa0b1c2d3e4f"
down_revision = "c9d8e7f6a5b4"
branch_labels = None
depends_on = None

STANDARDIZED_LOCATION_ROW_COUNT = 500

STANDARD_CONTINENTS = (
    ("AF", "Africa"),
    ("AN", "Antarctica"),
    ("AS", "Asia"),
    ("EU", "Europe"),
    ("NA", "North America"),
    ("OC", "Oceania"),
    ("SA", "South America"),
)

STANDARDIZED_LOCATION_COUNTRY_CODES = (
    "US",
    "CA",
    "MX",
    "BR",
    "AR",
    "DE",
    "FR",
    "IT",
    "NL",
    "TR",
    "SA",
    "AE",
    "CN",
    "IN",
    "KR",
    "AU",
    "ZA",
    "NG",
)

COUNTRY_TO_CONTINENT_CODE = {
    "AE": "AS",
    "AR": "SA",
    "AU": "OC",
    "BR": "SA",
    "CA": "NA",
    "CN": "AS",
    "DE": "EU",
    "FR": "EU",
    "IN": "AS",
    "IT": "EU",
    "KR": "AS",
    "MX": "NA",
    "NG": "AF",
    "NL": "EU",
    "SA": "AS",
    "TR": "AS",
    "US": "NA",
    "ZA": "AF",
}


def _continent_location_code(continent_code):
    return f"CONTINENT_{continent_code}"


def _country_location_code(country_code):
    return f"COUNTRY_{country_code}"


def _subdivision_location_code(subdivision_code):
    return f"SUBDIVISION_{subdivision_code.replace('-', '_')}"


def _subdivision_location_type(raw_type):
    normalized_type = raw_type.strip().lower()
    if "state" in normalized_type or "territory" in normalized_type:
        return "STATE"
    if any(
        token in normalized_type
        for token in (
            "province",
            "prefecture",
            "emirate",
            "governorate",
        )
    ):
        return "PROVINCE"
    return "REGION"


def _require_country(country_code):
    country = pycountry.countries.get(alpha_2=country_code)
    if country is None:
        raise RuntimeError(f"Unsupported ISO country code '{country_code}' in standardized location migration")
    return country


def _top_level_subdivisions(country_code):
    return sorted(
        (
            subdivision
            for subdivision in pycountry.subdivisions
            if subdivision.country_code == country_code and getattr(subdivision, "parent_code", None) is None
        ),
        key=lambda subdivision: subdivision.code,
    )


def _build_standardized_location_rows():
    rows = []

    for continent_code, continent_name in STANDARD_CONTINENTS:
        rows.append(
            {
                "code": _continent_location_code(continent_code),
                "name": continent_name,
                "location_kind": "REGION",
                "location_type": "CONTINENT",
                "parent_location_code": None,
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": None,
                "continent_code": continent_code,
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"Standard continent region for {continent_name}.",
            }
        )

    for country_code in STANDARDIZED_LOCATION_COUNTRY_CODES:
        country = _require_country(country_code)
        continent_code = COUNTRY_TO_CONTINENT_CODE[country_code]
        country_location_code = _country_location_code(country_code)

        rows.append(
            {
                "code": country_location_code,
                "name": country.name,
                "location_kind": "REGION",
                "location_type": "COUNTRY",
                "parent_location_code": _continent_location_code(continent_code),
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": country_code,
                "continent_code": continent_code,
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"ISO 3166-1 country region for {country.name}.",
            }
        )

        for subdivision in _top_level_subdivisions(country_code):
            rows.append(
                {
                    "code": _subdivision_location_code(subdivision.code),
                    "name": subdivision.name,
                    "location_kind": "REGION",
                    "location_type": _subdivision_location_type(subdivision.type),
                    "parent_location_code": country_location_code,
                    "market": None,
                    "city": None,
                    "subdivision_code": subdivision.code,
                    "country_code": country_code,
                    "continent_code": continent_code,
                    "latitude": None,
                    "longitude": None,
                    "region": None,
                    "timezone": None,
                    "description": f"ISO 3166-2 {subdivision.type.lower()} region in {country.name}.",
                }
            )

    if len(rows) != STANDARDIZED_LOCATION_ROW_COUNT:
        raise RuntimeError(
            "Standardized location migration count drifted unexpectedly: "
            f"expected {STANDARDIZED_LOCATION_ROW_COUNT}, got {len(rows)}"
        )

    return rows


STANDARDIZED_LOCATION_ROWS = _build_standardized_location_rows()


def _sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def upgrade() -> None:
    for row in STANDARDIZED_LOCATION_ROWS:
        op.execute(
            f"""
            INSERT INTO reference_locations (
                code,
                parent_location_code,
                name,
                location_kind,
                location_type,
                market,
                city,
                subdivision_code,
                country_code,
                continent_code,
                latitude,
                longitude,
                region,
                timezone,
                description,
                is_active,
                effective_from,
                effective_to,
                created_at,
                created_by,
                updated_at,
                updated_by,
                version
            )
            VALUES (
                {_sql_literal(row["code"])},
                {_sql_literal(row["parent_location_code"])},
                {_sql_literal(row["name"])},
                {_sql_literal(row["location_kind"])},
                {_sql_literal(row["location_type"])},
                {_sql_literal(row["market"])},
                {_sql_literal(row["city"])},
                {_sql_literal(row["subdivision_code"])},
                {_sql_literal(row["country_code"])},
                {_sql_literal(row["continent_code"])},
                {_sql_literal(row["latitude"])},
                {_sql_literal(row["longitude"])},
                {_sql_literal(row["region"])},
                {_sql_literal(row["timezone"])},
                {_sql_literal(row["description"])},
                TRUE,
                NULL,
                NULL,
                NOW(),
                'system',
                NOW(),
                'system',
                1
            )
            ON CONFLICT (code) DO UPDATE
            SET
                parent_location_code = EXCLUDED.parent_location_code,
                name = EXCLUDED.name,
                location_kind = EXCLUDED.location_kind,
                location_type = EXCLUDED.location_type,
                market = EXCLUDED.market,
                city = EXCLUDED.city,
                subdivision_code = EXCLUDED.subdivision_code,
                country_code = EXCLUDED.country_code,
                continent_code = EXCLUDED.continent_code,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                region = EXCLUDED.region,
                timezone = EXCLUDED.timezone,
                description = EXCLUDED.description,
                is_active = TRUE,
                effective_from = NULL,
                effective_to = NULL,
                updated_at = NOW(),
                updated_by = 'system',
                version = reference_locations.version + 1
            """
        )


def downgrade() -> None:
    for row in reversed(STANDARDIZED_LOCATION_ROWS):
        op.execute(
            f"""
            DELETE FROM reference_locations
            WHERE code = {_sql_literal(row["code"])}
            """
        )
