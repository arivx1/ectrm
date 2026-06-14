"""add world bank pink sheet price sources

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
Create Date: 2026-05-25 11:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "k3l4m5n6o7p8"
down_revision: Union[str, Sequence[str], None] = "j2k3l4m5n6o7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UNIT_ROWS = [
    {
        "code": "MT",
        "name": "Metric Ton",
        "commodity_class": "GENERAL",
        "dimension": "WEIGHT",
        "base_unit_code": None,
        "conversion_factor": None,
        "precision": 3,
        "description": "Metric ton unit used by commodity benchmark prices.",
    },
    {
        "code": "KG",
        "name": "Kilogram",
        "commodity_class": "GENERAL",
        "dimension": "WEIGHT",
        "base_unit_code": "MT",
        "conversion_factor": 0.001,
        "precision": 6,
        "description": "Kilogram unit used by soft commodity benchmark prices.",
    },
    {
        "code": "TROY_OZ",
        "name": "Troy Ounce",
        "commodity_class": "PRECIOUS_METALS",
        "dimension": "WEIGHT",
        "base_unit_code": None,
        "conversion_factor": None,
        "precision": 4,
        "description": "Troy ounce unit used by precious metals benchmark prices.",
    },
]

PRICE_INDEX_ROWS = [
    {
        "code": "BRENT_WORLD_BANK_M",
        "name": "Brent World Bank Monthly",
        "commodity_code": "BRENT",
        "currency_code": "USD",
        "unit_code": "BBL",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Brent crude price in nominal USD per barrel.",
        "series_id": "CRUDE_BRENT",
    },
    {
        "code": "WTI_WORLD_BANK_M",
        "name": "WTI World Bank Monthly",
        "commodity_code": "WTI",
        "currency_code": "USD",
        "unit_code": "BBL",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly WTI crude price in nominal USD per barrel.",
        "series_id": "CRUDE_WTI",
    },
    {
        "code": "NGAS_US_WORLD_BANK_M",
        "name": "US Natural Gas World Bank Monthly",
        "commodity_code": "NATURAL_GAS",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly U.S. natural gas price in nominal USD per MMBtu.",
        "series_id": "NGAS_US",
    },
    {
        "code": "NGAS_EUR_WORLD_BANK_M",
        "name": "Europe Natural Gas World Bank Monthly",
        "commodity_code": "NATURAL_GAS",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Europe natural gas price in nominal USD per MMBtu.",
        "series_id": "NGAS_EUR",
    },
    {
        "code": "LNG_JAPAN_WORLD_BANK_M",
        "name": "Japan LNG World Bank Monthly",
        "commodity_code": "LNG",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Japan LNG import price in nominal USD per MMBtu.",
        "series_id": "NGAS_JP",
    },
    {
        "code": "COAL_AUS_WORLD_BANK_M",
        "name": "Australia Coal World Bank Monthly",
        "commodity_code": "COAL",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Australian coal price in nominal USD per metric ton.",
        "series_id": "COAL_AUS",
    },
    {
        "code": "CORN_WORLD_BANK_M",
        "name": "Maize World Bank Monthly",
        "commodity_code": "CORN",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly maize price in nominal USD per metric ton.",
        "series_id": "MAIZE",
    },
    {
        "code": "WHEAT_HRW_WORLD_BANK_M",
        "name": "US HRW Wheat World Bank Monthly",
        "commodity_code": "WHEAT",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly U.S. hard red winter wheat price in nominal USD per metric ton.",
        "series_id": "WHEAT_US_HRW",
    },
    {
        "code": "SOYBEANS_WORLD_BANK_M",
        "name": "Soybeans World Bank Monthly",
        "commodity_code": "SOYBEANS",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly soybean price in nominal USD per metric ton.",
        "series_id": "SOYBEANS",
    },
    {
        "code": "COPPER_WORLD_BANK_M",
        "name": "Copper World Bank Monthly",
        "commodity_code": "COPPER",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly copper price in nominal USD per metric ton.",
        "series_id": "COPPER",
    },
    {
        "code": "ALUMINUM_WORLD_BANK_M",
        "name": "Aluminum World Bank Monthly",
        "commodity_code": "ALUMINUM",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly aluminum price in nominal USD per metric ton.",
        "series_id": "ALUMINUM",
    },
    {
        "code": "NICKEL_WORLD_BANK_M",
        "name": "Nickel World Bank Monthly",
        "commodity_code": "NICKEL",
        "currency_code": "USD",
        "unit_code": "MT",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly nickel price in nominal USD per metric ton.",
        "series_id": "NICKEL",
    },
    {
        "code": "GOLD_WORLD_BANK_M",
        "name": "Gold World Bank Monthly",
        "commodity_code": "GOLD",
        "currency_code": "USD",
        "unit_code": "TROY_OZ",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly gold price in nominal USD per troy ounce.",
        "series_id": "GOLD",
    },
    {
        "code": "SILVER_WORLD_BANK_M",
        "name": "Silver World Bank Monthly",
        "commodity_code": "SILVER",
        "currency_code": "USD",
        "unit_code": "TROY_OZ",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly silver price in nominal USD per troy ounce.",
        "series_id": "SILVER",
    },
    {
        "code": "COFFEE_ARABICA_WORLD_BANK_M",
        "name": "Arabica Coffee World Bank Monthly",
        "commodity_code": "COFFEE",
        "currency_code": "USD",
        "unit_code": "KG",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Arabica coffee price in nominal USD per kilogram.",
        "series_id": "COFFEE_ARABIC",
    },
    {
        "code": "SUGAR_WORLD_BANK_M",
        "name": "World Sugar World Bank Monthly",
        "commodity_code": "SUGAR",
        "currency_code": "USD",
        "unit_code": "KG",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly world sugar price in nominal USD per kilogram.",
        "series_id": "SUGAR_WLD",
    },
    {
        "code": "COTTON_WORLD_BANK_M",
        "name": "Cotton A Index World Bank Monthly",
        "commodity_code": "COTTON",
        "currency_code": "USD",
        "unit_code": "KG",
        "market": "PINK_SHEET",
        "description": "World Bank Pink Sheet monthly Cotton A Index price in nominal USD per kilogram.",
        "series_id": "COTTON_A_INDX",
    },
]


def upgrade() -> None:
    bind = op.get_bind()

    unit_stmt = sa.text(
        """
        INSERT INTO reference_units (
            code,
            name,
            commodity_class,
            dimension,
            base_unit_code,
            conversion_factor,
            precision,
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
            :code,
            :name,
            :commodity_class,
            :dimension,
            :base_unit_code,
            :conversion_factor,
            :precision,
            :description,
            TRUE,
            NULL,
            NULL,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            commodity_class = EXCLUDED.commodity_class,
            dimension = EXCLUDED.dimension,
            base_unit_code = EXCLUDED.base_unit_code,
            conversion_factor = EXCLUDED.conversion_factor,
            precision = EXCLUDED.precision,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_units.version + 1
        """
    )
    for row in UNIT_ROWS:
        bind.execute(unit_stmt, row)

    price_index_stmt = sa.text(
        """
        INSERT INTO reference_price_indices (
            code,
            name,
            commodity_code,
            currency_code,
            unit_code,
            provider,
            quote_type,
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
            :code,
            :name,
            :commodity_code,
            :currency_code,
            :unit_code,
            'WORLD_BANK',
            'SPOT',
            :market,
            NULL,
            NULL,
            :description,
            TRUE,
            NULL,
            NULL,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            commodity_code = EXCLUDED.commodity_code,
            currency_code = EXCLUDED.currency_code,
            unit_code = EXCLUDED.unit_code,
            provider = EXCLUDED.provider,
            quote_type = EXCLUDED.quote_type,
            market = EXCLUDED.market,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_price_indices.version + 1
        """
    )
    source_stmt = sa.text(
        """
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
            :code,
            'WORLD_BANK',
            'PINK_SHEET_MONTHLY',
            :series_id,
            'monthly',
            :unit_code,
            :currency_code,
            NULL,
            TRUE,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (provider, series_id) DO UPDATE
        SET price_index_code = EXCLUDED.price_index_code,
            dataset_code = EXCLUDED.dataset_code,
            frequency = EXCLUDED.frequency,
            source_unit = EXCLUDED.source_unit,
            source_currency_code = EXCLUDED.source_currency_code,
            transform_rule = EXCLUDED.transform_rule,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_price_index_sources.version + 1
        """
    )
    for row in PRICE_INDEX_ROWS:
        bind.execute(price_index_stmt, row)
        bind.execute(source_stmt, row)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_index_sources
            SET is_active = FALSE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE provider = 'WORLD_BANK'
              AND series_id = ANY(:series_ids)
            """
        ),
        {"series_ids": [row["series_id"] for row in PRICE_INDEX_ROWS]},
    )
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET is_active = FALSE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE code = ANY(:codes)
            """
        ),
        {"codes": [row["code"] for row in PRICE_INDEX_ROWS]},
    )
