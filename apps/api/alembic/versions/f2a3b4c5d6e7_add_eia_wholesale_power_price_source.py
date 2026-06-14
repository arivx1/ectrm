"""add eia wholesale power price source

Revision ID: f2a3b4c5d6e7
Revises: e9f0a1b2c3d4
Create Date: 2026-05-20 09:15:00.000000
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET name = :name,
                provider = :provider,
                description = :description,
                updated_at = :updated_at,
                updated_by = :updated_by,
                version = version + 1
            WHERE code = :code
            """
        ),
        {
            "code": "PJM_WEST_ONPEAK_DA",
            "name": "PJM West ICE Peak Daily",
            "provider": "EIA_WHOLESALE_POWER",
            "description": "Delayed public EIA/ICE weighted-average PJM Western Hub peak power reference.",
            "updated_at": now,
            "updated_by": "migration:f2a3b4c5d6e7",
        },
    )

    exists = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM reference_price_index_sources
            WHERE provider = :provider AND series_id = :series_id
            LIMIT 1
            """
        ),
        {
            "provider": "EIA_WHOLESALE_POWER",
            "series_id": "PJM WH Real Time Peak",
        },
    ).first()
    if exists is not None:
        return

    bind.execute(
        sa.text(
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
                :price_index_code,
                :provider,
                :dataset_code,
                :series_id,
                :frequency,
                :source_unit,
                :source_currency_code,
                :transform_rule,
                :is_active,
                :created_at,
                :created_by,
                :updated_at,
                :updated_by,
                :version
            )
            """
        ),
        {
            "price_index_code": "PJM_WEST_ONPEAK_DA",
            "provider": "EIA_WHOLESALE_POWER",
            "dataset_code": "ICE_WHOLESALE_ELECTRICITY",
            "series_id": "PJM WH Real Time Peak",
            "frequency": "daily",
            "source_unit": "MWH",
            "source_currency_code": "USD",
            "transform_rule": "field:wtd_avg_price",
            "is_active": True,
            "created_at": now,
            "created_by": "migration:f2a3b4c5d6e7",
            "updated_at": now,
            "updated_by": "migration:f2a3b4c5d6e7",
            "version": 1,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    bind.execute(
        sa.text(
            """
            DELETE FROM reference_price_index_sources
            WHERE provider = :provider AND series_id = :series_id
            """
        ),
        {
            "provider": "EIA_WHOLESALE_POWER",
            "series_id": "PJM WH Real Time Peak",
        },
    )
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET name = :name,
                provider = :provider,
                description = :description,
                updated_at = :updated_at,
                updated_by = :updated_by,
                version = version + 1
            WHERE code = :code
            """
        ),
        {
            "code": "PJM_WEST_ONPEAK_DA",
            "name": "PJM West On-Peak Day Ahead",
            "provider": "INTERNAL",
            "description": "Power hub day-ahead reference.",
            "updated_at": now,
            "updated_by": "migration:f2a3b4c5d6e7:down",
        },
    )
