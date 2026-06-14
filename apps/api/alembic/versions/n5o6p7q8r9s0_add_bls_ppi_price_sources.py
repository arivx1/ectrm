"""add BLS PPI commodity index price sources

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-05-25 13:00:00.000000
"""

from __future__ import annotations

import json
from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "n5o6p7q8r9s0"
down_revision: Union[str, Sequence[str], None] = "m4n5o6p7q8r9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENCY_ROWS = [
    {
        "code": "XXX",
        "name": "No Currency",
        "symbol": None,
        "description": "Dimensionless index quote currency placeholder.",
    },
]

UNIT_ROWS = [
    {
        "code": "INDEX",
        "name": "Index Point",
        "commodity_class": None,
        "dimension": "INDEX",
        "base_unit_code": None,
        "conversion_factor": None,
        "precision": 4,
        "description": "Dimensionless index level quote unit.",
    },
]

COMMODITY_ROWS = [
    {
        "code": "ALL_COMMODITIES",
        "name": "All Commodities Index",
        "commodity_class": "INDEX",
        "allowed_transport_modes": [],
        "description": "Composite producer-price all-commodities index reference.",
    },
    {
        "code": "FARM_PRODUCTS",
        "name": "Farm Products",
        "commodity_class": "AGRICULTURE",
        "allowed_transport_modes": ["TRUCK", "RAIL", "BARGE", "VESSEL", "STORAGE"],
        "description": "Farm products family reference used by producer price indexes.",
    },
    {
        "code": "BEEF",
        "name": "Beef",
        "commodity_class": "LIVESTOCK",
        "allowed_transport_modes": ["TRUCK", "RAIL", "STORAGE"],
        "description": "Beef exposure used for livestock and food market references.",
    },
    {
        "code": "PORK",
        "name": "Pork",
        "commodity_class": "LIVESTOCK",
        "allowed_transport_modes": ["TRUCK", "RAIL", "STORAGE"],
        "description": "Pork exposure used for livestock and food market references.",
    },
    {
        "code": "DAIRY",
        "name": "Dairy",
        "commodity_class": "AGRICULTURE",
        "allowed_transport_modes": ["TRUCK", "RAIL", "STORAGE"],
        "description": "Dairy exposure used for milk and dairy product references.",
    },
]

PRICE_INDEX_ROWS = [
    {
        "code": "ALL_COMMODITIES_BLS_PPI_M",
        "name": "BLS PPI All Commodities Monthly",
        "commodity_code": "ALL_COMMODITIES",
        "description": "BLS Producer Price Index by commodity: all commodities, not seasonally adjusted monthly index.",
        "series_id": "WPU00000000",
    },
    {
        "code": "FARM_PRODUCTS_BLS_PPI_M",
        "name": "BLS PPI Farm Products Monthly",
        "commodity_code": "FARM_PRODUCTS",
        "description": "BLS Producer Price Index by commodity: farm products, not seasonally adjusted monthly index.",
        "series_id": "WPU01",
    },
    {
        "code": "CORN_BLS_PPI_M",
        "name": "BLS PPI Corn Monthly",
        "commodity_code": "CORN",
        "description": "BLS Producer Price Index by commodity: farm products, corn, not seasonally adjusted monthly index.",
        "series_id": "WPU012202",
    },
    {
        "code": "SLAUGHTER_CATTLE_BLS_PPI_M",
        "name": "BLS PPI Slaughter Cattle Monthly",
        "commodity_code": "BEEF",
        "description": "BLS Producer Price Index by commodity: farm products, slaughter cattle, not seasonally adjusted monthly index.",
        "series_id": "WPU0131",
    },
    {
        "code": "SLAUGHTER_HOGS_BLS_PPI_M",
        "name": "BLS PPI Slaughter Hogs Monthly",
        "commodity_code": "PORK",
        "description": "BLS Producer Price Index by commodity: farm products, slaughter hogs, not seasonally adjusted monthly index.",
        "series_id": "WPU0132",
    },
    {
        "code": "RAW_MILK_BLS_PPI_M",
        "name": "BLS PPI Raw Milk Monthly",
        "commodity_code": "DAIRY",
        "description": "BLS Producer Price Index by commodity: farm products, raw milk, not seasonally adjusted monthly index.",
        "series_id": "WPU0161",
    },
    {
        "code": "GASOLINE_BLS_PPI_M",
        "name": "BLS PPI Gasoline Monthly",
        "commodity_code": "GASOLINE",
        "description": "BLS Producer Price Index by commodity: fuels and related products and power, gasoline, not seasonally adjusted monthly index.",
        "series_id": "WPU0571",
    },
    {
        "code": "DIESEL_BLS_PPI_M",
        "name": "BLS PPI No. 2 Diesel Fuel Monthly",
        "commodity_code": "DIESEL",
        "description": "BLS Producer Price Index by commodity: fuels and related products and power, No. 2 diesel fuel, not seasonally adjusted monthly index.",
        "series_id": "WPU057303",
    },
    {
        "code": "STEEL_MILL_PRODUCTS_BLS_PPI_M",
        "name": "BLS PPI Steel Mill Products Monthly",
        "commodity_code": "STEEL",
        "description": "BLS Producer Price Index by commodity: metals and metal products, steel mill products, not seasonally adjusted monthly index.",
        "series_id": "WPU1017",
    },
    {
        "code": "ALUMINUM_MILL_SHAPES_BLS_PPI_M",
        "name": "BLS PPI Aluminum Mill Shapes Monthly",
        "commodity_code": "ALUMINUM",
        "description": "BLS Producer Price Index by commodity: metals and metal products, aluminum mill shapes, not seasonally adjusted monthly index.",
        "series_id": "WPU102501",
    },
]


def upgrade() -> None:
    bind = op.get_bind()

    currency_stmt = sa.text(
        """
        INSERT INTO reference_currencies (
            code,
            name,
            symbol,
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
            :symbol,
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
            symbol = EXCLUDED.symbol,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_currencies.version + 1
        """
    )
    for row in CURRENCY_ROWS:
        bind.execute(currency_stmt, row)

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

    commodity_stmt = sa.text(
        """
        INSERT INTO reference_commodities (
            code,
            commodity_class,
            allowed_transport_modes,
            name,
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
            :commodity_class,
            CAST(:allowed_transport_modes AS JSON),
            :name,
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
        SET commodity_class = EXCLUDED.commodity_class,
            allowed_transport_modes = EXCLUDED.allowed_transport_modes,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_commodities.version + 1
        """
    )
    for row in COMMODITY_ROWS:
        bind.execute(
            commodity_stmt,
            {**row, "allowed_transport_modes": json.dumps(row["allowed_transport_modes"])},
        )

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
            'XXX',
            'INDEX',
            'BLS_PPI',
            'INDEX',
            'BLS_PPI',
            'US',
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
            location_code = EXCLUDED.location_code,
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
            'BLS_PPI',
            'BLS_PUBLIC_API_V2',
            :series_id,
            'monthly',
            'INDEX',
            'XXX',
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
            WHERE provider = 'BLS_PPI'
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
