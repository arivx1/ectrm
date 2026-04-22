"""seed reference price index baseline rows

Revision ID: e2b7c4d9f1a6
Revises: a1c4e8d9f2b3, c8f1d2e3a4b5
"""

from alembic import op

revision = "e2b7c4d9f1a6"
down_revision = ("a1c4e8d9f2b3", "c8f1d2e3a4b5")
branch_labels = None
depends_on = None


PRICE_INDEX_ROWS = [
    (
        "HENRY_HUB_GAS_D",
        "Henry Hub Spot Daily",
        "NATURAL_GAS",
        "USD",
        "MMBTU",
        "EIA",
        "NYMEX",
        "HENRY_HUB",
        None,
        "Daily Henry Hub natural gas spot reference aligned to the seeded hub location.",
    ),
    (
        "WTI_CUSHING_PHYS_D",
        "WTI Cushing Physical Daily",
        "WTI",
        "USD",
        "BBL",
        "EIA",
        "PHYSICAL",
        "CUSHING",
        None,
        "Physical WTI daily reference with an explicit seeded location code.",
    ),
    (
        "USGC_DIESEL_SPOT_D",
        "US Gulf Coast Diesel Spot Daily",
        "DIESEL",
        "USD",
        "GAL",
        "EIA",
        "PHYSICAL",
        "USGC",
        None,
        "Daily diesel spot reference for the seeded US Gulf Coast location.",
    ),
]


def upgrade() -> None:
    for (
        code,
        name,
        commodity_code,
        currency_code,
        unit_code,
        provider,
        market,
        location_code,
        calendar_code,
        description,
    ) in PRICE_INDEX_ROWS:
        escaped_name = name.replace("'", "''")
        escaped_description = description.replace("'", "''")
        escaped_market = market.replace("'", "''") if market else None
        escaped_location_code = location_code.replace("'", "''") if location_code else None
        escaped_calendar_code = calendar_code.replace("'", "''") if calendar_code else None
        market_sql = f"'{escaped_market}'" if escaped_market is not None else "NULL"
        location_sql = f"'{escaped_location_code}'" if escaped_location_code is not None else "NULL"
        calendar_sql = f"'{escaped_calendar_code}'" if escaped_calendar_code is not None else "NULL"
        op.execute(
            f"""
            INSERT INTO reference_price_indices (
                code,
                name,
                commodity_code,
                currency_code,
                unit_code,
                provider,
                market,
                location_code,
                calendar_code,
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
                '{commodity_code}',
                '{currency_code}',
                '{unit_code}',
                '{provider}',
                {market_sql},
                {location_sql},
                {calendar_sql},
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
    price_index_codes = ", ".join(f"'{code}'" for code, *_ in PRICE_INDEX_ROWS)
    op.execute(
        f"""
        DELETE FROM reference_price_indices
        WHERE created_by = 'system'
          AND code IN ({price_index_codes})
        """
    )
