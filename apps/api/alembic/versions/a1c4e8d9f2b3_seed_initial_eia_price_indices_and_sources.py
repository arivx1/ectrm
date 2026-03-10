"""seed initial eia price indices and sources"""

from alembic import op

revision = "a1c4e8d9f2b3"
down_revision = "a7c9e1f4b2d3"
branch_labels = None
depends_on = None


PRICE_INDEX_ROWS = [
    (
        "WTI_CUSHING_D",
        "WTI Cushing Spot Daily",
        "WTI",
        "USD",
        "BBL",
        "EIA",
        "CUSHING",
        None,
        "EIA daily West Texas Intermediate spot price at Cushing, Oklahoma",
    ),
    (
        "BRENT_SPOT_D",
        "Brent Spot Daily",
        "BRENT",
        "USD",
        "BBL",
        "EIA",
        "EUROPE",
        None,
        "EIA daily Brent spot price for Europe",
    ),
    (
        "GASOLINE_US_REG_W",
        "US Retail Gasoline Regular Weekly",
        "GASOLINE",
        "USD",
        "GAL",
        "EIA",
        "US",
        None,
        "EIA weekly U.S. regular retail gasoline price including taxes",
    ),
    (
        "DIESEL_US_RETAIL_W",
        "US Retail Diesel Weekly",
        "DIESEL",
        "USD",
        "GAL",
        "EIA",
        "US",
        None,
        "EIA weekly U.S. on-highway diesel retail price including taxes",
    ),
]

SOURCE_ROWS = [
    (
        "WTI_CUSHING_D",
        "EIA",
        "PET",
        "PET.RWTC.D",
        "daily",
        "BBL",
        "USD",
        None,
    ),
    (
        "BRENT_SPOT_D",
        "EIA",
        "PET",
        "PET.RBRTE.D",
        "daily",
        "BBL",
        "USD",
        None,
    ),
    (
        "GASOLINE_US_REG_W",
        "EIA",
        "PET",
        "PET.EMM_EPMRR_PTE_NUS_DPG.W",
        "weekly",
        "GAL",
        "USD",
        None,
    ),
    (
        "DIESEL_US_RETAIL_W",
        "EIA",
        "PET",
        "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W",
        "weekly",
        "GAL",
        "USD",
        None,
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
        calendar_code,
        description,
    ) in PRICE_INDEX_ROWS:
        escaped_name = name.replace("'", "''")
        escaped_description = description.replace("'", "''")
        escaped_market = market.replace("'", "''") if market else None
        escaped_calendar_code = calendar_code.replace("'", "''") if calendar_code else None
        market_sql = f"'{escaped_market}'" if escaped_market is not None else "NULL"
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
                NULL,
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

    for (
        price_index_code,
        provider,
        dataset_code,
        series_id,
        frequency,
        source_unit,
        source_currency_code,
        transform_rule,
    ) in SOURCE_ROWS:
        escaped_dataset_code = dataset_code.replace("'", "''") if dataset_code else None
        escaped_source_currency_code = (
            source_currency_code.replace("'", "''") if source_currency_code else None
        )
        escaped_transform_rule = transform_rule.replace("'", "''") if transform_rule else None
        dataset_sql = f"'{escaped_dataset_code}'" if escaped_dataset_code is not None else "NULL"
        currency_sql = (
            f"'{escaped_source_currency_code}'" if escaped_source_currency_code is not None else "NULL"
        )
        transform_sql = f"'{escaped_transform_rule}'" if escaped_transform_rule is not None else "NULL"
        op.execute(
            f"""
            INSERT INTO reference_price_index_sources (
                price_index_code,
                provider,
                dataset_code,
                series_id,
                frequency,
                source_unit,
                source_currency_code,
                transform_rule,
                is_active,
                created_at,
                created_by,
                updated_at,
                updated_by,
                version
            )
            VALUES (
                '{price_index_code}',
                '{provider}',
                {dataset_sql},
                '{series_id}',
                '{frequency}',
                '{source_unit}',
                {currency_sql},
                {transform_sql},
                TRUE,
                NOW(),
                'system',
                NOW(),
                'system',
                1
            )
            ON CONFLICT (provider, series_id) DO NOTHING
            """
        )


def downgrade() -> None:
    series_ids = ", ".join(f"'{series_id}'" for _, _, _, series_id, _, _, _, _ in SOURCE_ROWS)
    price_index_codes = ", ".join(f"'{code}'" for code, *_ in PRICE_INDEX_ROWS)

    op.execute(
        f"""
        DELETE FROM reference_price_index_sources
        WHERE created_by = 'system'
          AND provider = 'EIA'
          AND series_id IN ({series_ids})
        """
    )
    op.execute(
        f"""
        DELETE FROM reference_price_indices
        WHERE created_by = 'system'
          AND provider = 'EIA'
          AND code IN ({price_index_codes})
        """
    )
