"""seed simulated reference assets

Revision ID: w0x1y2z3a4b
Revises: v9w0x1y2z3a4
Create Date: 2026-04-25 16:30:00.000000
"""

from __future__ import annotations

from alembic import op


revision = "w0x1y2z3a4b"
down_revision = "v9w0x1y2z3a4"
branch_labels = None
depends_on = None


ASSET_ROWS = [
    (
        "SIM_WAHA_GATHERING",
        "Simulated Waha Gathering System",
        "PIPELINE",
        "GATHERING",
        "SIMULATED",
        "NATURAL_GAS",
        "WAHA",
        850000.0,
        "MMBTU",
        "Scenario Midstream",
        "OPERATING",
        "Synthetic Permian gathering system used for gas balance and congestion scenarios.",
    ),
    (
        "SIM_ERCOT_CCGT",
        "Simulated ERCOT Combined Cycle Plant",
        "GENERATION",
        "THERMAL",
        "SIMULATED",
        "POWER",
        "ERCOT_NORTH",
        4200.0,
        "MWH",
        "Scenario Generation Co",
        "OPERATING",
        "Synthetic dispatchable generation asset for heat-rate and load-following scenarios.",
    ),
    (
        "SIM_USGC_REFINERY",
        "Simulated Gulf Coast Refinery",
        "REFINERY",
        "CONVERSION",
        "SIMULATED",
        "WTI",
        "USGC",
        275000.0,
        "BBL",
        "Scenario Refining Co",
        "OPERATING",
        "Synthetic conversion refinery for crude slate, yield, and crack-spread scenarios.",
    ),
    (
        "SIM_MIDLAND_FIELD",
        "Simulated Midland Oil Field",
        "UPSTREAM_PRODUCTION",
        "OIL_FIELD",
        "SIMULATED",
        "WTI",
        "MIDLAND",
        95000.0,
        "BBL",
        "Scenario Upstream",
        "OPERATING",
        "Synthetic upstream production asset for regional crude supply and takeaway scenarios.",
    ),
    (
        "SIM_HSC_LNG_EXPORT",
        "Simulated Houston LNG Export Train",
        "PROCESSING",
        "LNG_EXPORT",
        "SIMULATED",
        "LNG",
        "HOUSTON_SHIP_CHANNEL",
        1800000.0,
        "MMBTU",
        "Scenario LNG Services",
        "PLANNED",
        "Synthetic LNG export train for feedgas pull, shipping, and outage planning scenarios.",
    ),
    (
        "SIM_HENRY_CAVERN",
        "Simulated Henry Hub Storage Cavern",
        "STORAGE",
        "CAVERN",
        "SIMULATED",
        "NATURAL_GAS",
        "HENRY_HUB",
        4200000.0,
        "MMBTU",
        "Scenario Storage Partners",
        "OPERATING",
        "Synthetic gas storage asset for injection, withdrawal, and prompt-winter spread scenarios.",
    ),
    (
        "SIM_USGC_TERMINAL",
        "Simulated Gulf Marine Terminal",
        "TERMINAL",
        "MARINE",
        "SIMULATED",
        "DIESEL",
        "HOUSTON_SHIP_CHANNEL",
        1450000.0,
        "BBL",
        "Scenario Terminal Services",
        "OPERATING",
        "Synthetic marine terminal for inventory, blending, and export lift scenarios.",
    ),
    (
        "SIM_PJM_DATA_CENTER",
        "Simulated Mid-Atlantic Data Center Load",
        "CONSUMPTION",
        "DATACENTER",
        "SIMULATED",
        "POWER",
        "PJM_WEST",
        650.0,
        "MWH",
        "Scenario Compute Campus",
        "UNDER_CONSTRUCTION",
        "Synthetic large load asset for power demand growth and hedge requirement scenarios.",
    ),
]


def upgrade() -> None:
    for (
        code,
        name,
        asset_class,
        asset_type,
        asset_reality,
        commodity_code,
        location_code,
        capacity_value,
        capacity_unit_code,
        operator_name,
        operating_status,
        description,
    ) in ASSET_ROWS:
        escaped_name = name.replace("'", "''")
        escaped_operator_name = operator_name.replace("'", "''")
        escaped_description = description.replace("'", "''")
        op.execute(
            f"""
            INSERT INTO reference_assets (
                code,
                name,
                asset_class,
                asset_type,
                asset_reality,
                commodity_code,
                location_code,
                capacity_value,
                capacity_unit_code,
                operator_name,
                operating_status,
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
                '{code}',
                '{escaped_name}',
                '{asset_class}',
                '{asset_type}',
                '{asset_reality}',
                '{commodity_code}',
                '{location_code}',
                {capacity_value},
                '{capacity_unit_code}',
                '{escaped_operator_name}',
                '{operating_status}',
                '{escaped_description}',
                TRUE,
                NULL,
                NULL,
                NOW(),
                'system',
                NOW(),
                'system',
                1
            )
            ON CONFLICT (code) DO NOTHING
            """
        )


def downgrade() -> None:
    asset_codes = ", ".join(f"'{code}'" for code, *_ in ASSET_ROWS)
    op.execute(
        f"""
        DELETE FROM reference_assets
        WHERE created_by = 'system'
          AND code IN ({asset_codes})
        """
    )
