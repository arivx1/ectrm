"""preload reference locations and counterparties

Revision ID: f2b3c4d5e6f7
Revises: f0a1b2c3d4e5
"""

from __future__ import annotations

from alembic import op

revision = "f2b3c4d5e6f7"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


LOCATION_ROWS = [
    {
        "code": "PADD2",
        "parent_location_code": None,
        "name": "PADD 2",
        "location_kind": "REGION",
        "location_type": "PADD",
        "market": "PHYSICAL",
        "city": "Des Moines",
        "subdivision_code": "US-IA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 41.5868,
        "longitude": -93.625,
        "region": "Midwest",
        "timezone": "America/Chicago",
        "description": "Midwest liquids region.",
    },
    {
        "code": "USGC",
        "parent_location_code": None,
        "name": "US Gulf Coast",
        "location_kind": "REGION",
        "location_type": "REGION",
        "market": "PHYSICAL",
        "city": "New Orleans",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9511,
        "longitude": -90.0715,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Refined products and crude physical region.",
    },
    {
        "code": "ARA",
        "parent_location_code": None,
        "name": "Amsterdam-Rotterdam-Antwerp",
        "location_kind": "REGION",
        "location_type": "REGION",
        "market": "PHYSICAL",
        "city": "Rotterdam",
        "subdivision_code": "NL-ZH",
        "country_code": "NL",
        "continent_code": "EU",
        "latitude": 51.9244,
        "longitude": 4.4777,
        "region": "Northwest Europe",
        "timezone": "Europe/Amsterdam",
        "description": "Northwest Europe products and storage benchmark region.",
    },
    {
        "code": "CUSHING",
        "parent_location_code": "PADD2",
        "name": "Cushing Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NYMEX",
        "city": "Cushing",
        "subdivision_code": "US-OK",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 35.9853,
        "longitude": -96.7528,
        "region": "Midcontinent",
        "timezone": "America/Chicago",
        "description": "WTI delivery hub.",
    },
    {
        "code": "MIDLAND",
        "parent_location_code": None,
        "name": "Midland",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PHYSICAL",
        "city": "Midland",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 31.9974,
        "longitude": -102.0779,
        "region": "Permian",
        "timezone": "America/Chicago",
        "description": "Permian crude gathering and Midland cash market location.",
    },
    {
        "code": "HOUSTON_SHIP_CHANNEL",
        "parent_location_code": "USGC",
        "name": "Houston Ship Channel",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "market": "PHYSICAL",
        "city": "Houston",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.7285,
        "longitude": -95.265,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Key Gulf Coast terminal and refined products transfer location.",
    },
    {
        "code": "NYH",
        "parent_location_code": None,
        "name": "New York Harbor",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "market": "PHYSICAL",
        "city": "New York",
        "subdivision_code": "US-NY",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.684,
        "longitude": -74.0062,
        "region": "Atlantic Coast",
        "timezone": "America/New_York",
        "description": "Atlantic Coast refined products pricing and storage hub.",
    },
    {
        "code": "HENRY_HUB",
        "parent_location_code": "USGC",
        "name": "Henry Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NYMEX",
        "city": "Erath",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9589,
        "longitude": -92.0332,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Natural gas benchmark hub.",
    },
    {
        "code": "WAHA",
        "parent_location_code": None,
        "name": "Waha Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PHYSICAL",
        "city": "Waha",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 31.9493,
        "longitude": -103.6652,
        "region": "Permian",
        "timezone": "America/Chicago",
        "description": "Permian natural gas hub used in basis and physical gas markets.",
    },
    {
        "code": "AECO",
        "parent_location_code": None,
        "name": "AECO",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NGX",
        "city": "Calgary",
        "subdivision_code": "CA-AB",
        "country_code": "CA",
        "continent_code": "NA",
        "latitude": 51.0447,
        "longitude": -114.0719,
        "region": "Alberta",
        "timezone": "America/Edmonton",
        "description": "Western Canadian gas hub.",
    },
    {
        "code": "DAWN",
        "parent_location_code": None,
        "name": "Dawn Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NGX",
        "city": "Dawn-Euphemia",
        "subdivision_code": "CA-ON",
        "country_code": "CA",
        "continent_code": "NA",
        "latitude": 42.7245,
        "longitude": -81.9055,
        "region": "Ontario",
        "timezone": "America/Toronto",
        "description": "Eastern Canadian and Great Lakes gas trading hub.",
    },
    {
        "code": "PJM_WEST",
        "parent_location_code": None,
        "name": "PJM West",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PJM",
        "city": "Pittsburgh",
        "subdivision_code": "US-PA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.4406,
        "longitude": -79.9959,
        "region": "Mid-Atlantic",
        "timezone": "America/New_York",
        "description": "Power hub for PJM West.",
    },
    {
        "code": "ERCOT_NORTH",
        "parent_location_code": None,
        "name": "ERCOT North",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "ERCOT",
        "city": "Dallas",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 32.7767,
        "longitude": -96.797,
        "region": "Texas",
        "timezone": "America/Chicago",
        "description": "North Texas power hub for ERCOT basis and shaping activity.",
    },
    {
        "code": "SP15",
        "parent_location_code": None,
        "name": "SP-15",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "CAISO",
        "city": "Los Angeles",
        "subdivision_code": "US-CA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "region": "California",
        "timezone": "America/Los_Angeles",
        "description": "Southern California power hub used in CAISO trading.",
    },
]

COUNTERPARTY_ROWS = [
    ("BP", "BP", "BP", "BP Energy Company", "MAJOR", "US", "Integrated major energy counterparty."),
    ("SHELL", "Shell", "Shell", "Shell Energy North America", "MAJOR", "US", "Integrated major energy counterparty."),
    ("CHEVRON", "Chevron", "Chevron", "Chevron U.S.A. Inc.", "MAJOR", "US", "Integrated upstream and downstream major energy counterparty."),
    ("EXXON", "ExxonMobil", "ExxonMobil", "ExxonMobil Oil Corporation", "MAJOR", "US", "Large integrated oil and products counterparty."),
    ("TOTAL", "TotalEnergies", "TotalEnergies", "TotalEnergies Gas & Power North America, Inc.", "MAJOR", "US", "Integrated international major active across LNG, gas, and power."),
    ("VITOL", "Vitol", "Vitol", "Vitol Inc.", "TRADER", "US", "Independent trading counterparty."),
    ("TRAFIGURA", "Trafigura", "Trafigura", "Trafigura Trading LLC", "TRADER", "US", "Global physical trader active in crude, products, and metals supply chains."),
    ("MERCURIA", "Mercuria", "Mercuria", "Mercuria Energy America, LLC", "TRADER", "US", "Independent trader with significant gas, power, and liquids market activity."),
    ("GUNVOR", "Gunvor", "Gunvor", "Gunvor USA LLC", "TRADER", "US", "Global trader with crude, products, and logistics exposure."),
    ("TENASKA", "Tenaska", "Tenaska", "Tenaska Marketing Ventures", "MARKETER", "US", "Power and gas marketing counterparty."),
    ("KOCH", "Koch", "Koch", "Koch Energy Services, LLC", "MARKETER", "US", "Large North American gas, power, and liquids marketer."),
    ("CONSTELLATION", "Constellation", "Constellation", "Constellation Energy Generation, LLC", "UTILITY", "US", "Major power marketer and utility-linked counterparty."),
    ("NEXTERA", "NextEra Energy", "NextEra", "NextEra Energy Marketing, LLC", "UTILITY", "US", "Power and gas counterparty with renewable and conventional generation exposure."),
    ("ENTERPRISE", "Enterprise Products", "Enterprise", "Enterprise Products Operating LLC", "MIDSTREAM", "US", "Midstream counterparty with storage, NGL, and terminal footprint."),
    ("PLAINS", "Plains All American", "Plains", "Plains Marketing, L.P.", "MIDSTREAM", "US", "Crude gathering, pipeline, and marketing counterparty."),
    ("VALERO", "Valero", "Valero", "Valero Marketing and Supply Company", "REFINER", "US", "Refining and products marketing counterparty."),
]

NEW_LOCATION_CODES = [
    "PADD2",
    "MIDLAND",
    "HOUSTON_SHIP_CHANNEL",
    "NYH",
    "ARA",
    "WAHA",
    "AECO",
    "DAWN",
    "PJM_WEST",
    "ERCOT_NORTH",
    "SP15",
]
LEGACY_LOCATION_ROWS = [
    {
        "code": "CUSHING",
        "parent_location_code": None,
        "name": "Cushing Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NYMEX",
        "city": "Cushing",
        "subdivision_code": "US-OK",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 35.9853,
        "longitude": -96.7528,
        "region": "Midcontinent",
        "timezone": "America/Chicago",
        "description": "WTI delivery hub and benchmark pricing location",
    },
    {
        "code": "HENRY_HUB",
        "parent_location_code": None,
        "name": "Henry Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NYMEX",
        "city": "Erath",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9589,
        "longitude": -92.0332,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Natural gas benchmark hub",
    },
    {
        "code": "USGC",
        "parent_location_code": None,
        "name": "US Gulf Coast",
        "location_kind": "REGION",
        "location_type": "REGION",
        "market": "PHYSICAL",
        "city": "New Orleans",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9511,
        "longitude": -90.0715,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Physical refined products and crude pricing region",
    },
]
COUNTERPARTY_CODES = [row[0] for row in COUNTERPARTY_ROWS]


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
    for row in LOCATION_ROWS:
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

    for (
        code,
        name,
        short_name,
        legal_entity_name,
        counterparty_type,
        country_code,
        description,
    ) in COUNTERPARTY_ROWS:
        op.execute(
            f"""
            INSERT INTO reference_counterparties (
                code,
                name,
                short_name,
                legal_entity_name,
                counterparty_type,
                country_code,
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
                {_sql_literal(code)},
                {_sql_literal(name)},
                {_sql_literal(short_name)},
                {_sql_literal(legal_entity_name)},
                {_sql_literal(counterparty_type)},
                {_sql_literal(country_code)},
                {_sql_literal(description)},
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
                name = EXCLUDED.name,
                short_name = EXCLUDED.short_name,
                legal_entity_name = EXCLUDED.legal_entity_name,
                counterparty_type = EXCLUDED.counterparty_type,
                country_code = EXCLUDED.country_code,
                description = EXCLUDED.description,
                is_active = TRUE,
                effective_from = NULL,
                effective_to = NULL,
                updated_at = NOW(),
                updated_by = 'system',
                version = reference_counterparties.version + 1
            """
        )


def downgrade() -> None:
    for row in LEGACY_LOCATION_ROWS:
        op.execute(
            f"""
            UPDATE reference_locations
            SET
                parent_location_code = {_sql_literal(row["parent_location_code"])},
                name = {_sql_literal(row["name"])},
                location_kind = {_sql_literal(row["location_kind"])},
                location_type = {_sql_literal(row["location_type"])},
                market = {_sql_literal(row["market"])},
                city = {_sql_literal(row["city"])},
                subdivision_code = {_sql_literal(row["subdivision_code"])},
                country_code = {_sql_literal(row["country_code"])},
                continent_code = {_sql_literal(row["continent_code"])},
                latitude = {_sql_literal(row["latitude"])},
                longitude = {_sql_literal(row["longitude"])},
                region = {_sql_literal(row["region"])},
                timezone = {_sql_literal(row["timezone"])},
                description = {_sql_literal(row["description"])},
                is_active = TRUE,
                effective_from = NULL,
                effective_to = NULL,
                updated_at = NOW(),
                updated_by = 'system',
                version = reference_locations.version + 1
            WHERE code = {_sql_literal(row["code"])}
            """
        )

    location_codes_sql = ", ".join(_sql_literal(code) for code in NEW_LOCATION_CODES)
    op.execute(
        f"""
        DELETE FROM reference_locations
        WHERE created_by = 'system'
          AND code IN ({location_codes_sql})
        """
    )

    counterparty_codes_sql = ", ".join(_sql_literal(code) for code in COUNTERPARTY_CODES)
    op.execute(
        f"""
        DELETE FROM reference_counterparties
        WHERE created_by = 'system'
          AND code IN ({counterparty_codes_sql})
        """
    )
