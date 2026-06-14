"""add USDA NASS QuickStats price sources

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
Create Date: 2026-05-25 12:15:00.000000
"""

from __future__ import annotations

import json
from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "l4m5n6o7p8q9"
down_revision: Union[str, Sequence[str], None] = "k3l4m5n6o7p8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UNIT_ROWS = [
    {
        "code": "BU",
        "name": "Bushel",
        "commodity_class": "AGRICULTURE",
        "dimension": "VOLUME",
        "base_unit_code": None,
        "conversion_factor": None,
        "precision": 4,
        "description": "Bushel unit used by U.S. grain and oilseed farm-price references.",
    },
]

PRICE_INDEX_ROWS = [
    {
        "code": "CORN_US_NASS_M",
        "name": "U.S. Corn Price Received Monthly",
        "commodity_code": "CORN",
        "unit_code": "BU",
        "description": "USDA NASS QuickStats national monthly corn price received by producers in USD per bushel.",
        "series_id": "CORN_US_PRICE_RECEIVED_M",
        "short_desc": "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU",
        "commodity_desc": "CORN",
    },
    {
        "code": "SOYBEANS_US_NASS_M",
        "name": "U.S. Soybeans Price Received Monthly",
        "commodity_code": "SOYBEANS",
        "unit_code": "BU",
        "description": "USDA NASS QuickStats national monthly soybean price received by producers in USD per bushel.",
        "series_id": "SOYBEANS_US_PRICE_RECEIVED_M",
        "short_desc": "SOYBEANS - PRICE RECEIVED, MEASURED IN $ / BU",
        "commodity_desc": "SOYBEANS",
    },
    {
        "code": "WHEAT_US_NASS_M",
        "name": "U.S. Wheat Price Received Monthly",
        "commodity_code": "WHEAT",
        "unit_code": "BU",
        "description": "USDA NASS QuickStats national monthly wheat price received by producers in USD per bushel.",
        "series_id": "WHEAT_US_PRICE_RECEIVED_M",
        "short_desc": "WHEAT - PRICE RECEIVED, MEASURED IN $ / BU",
        "commodity_desc": "WHEAT",
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
            'USD',
            :unit_code,
            'USDA_NASS',
            'SPOT',
            'NASS_QUICKSTATS',
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
            'USDA_NASS',
            'QUICKSTATS_API',
            :series_id,
            'monthly',
            :unit_code,
            'USD',
            :transform_rule,
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
        bind.execute(
            source_stmt,
            {
                **row,
                "transform_rule": json.dumps(
                    {
                        "query_params": {
                            "source_desc": "SURVEY",
                            "sector_desc": "CROPS",
                            "group_desc": "FIELD CROPS",
                            "commodity_desc": row["commodity_desc"],
                            "statisticcat_desc": "PRICE RECEIVED",
                            "short_desc": row["short_desc"],
                            "domain_desc": "TOTAL",
                            "agg_level_desc": "NATIONAL",
                            "freq_desc": "MONTHLY",
                        }
                    },
                    sort_keys=True,
                ),
            },
        )


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
            WHERE provider = 'USDA_NASS'
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
