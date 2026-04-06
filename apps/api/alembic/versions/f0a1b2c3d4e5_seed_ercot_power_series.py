"""seed ercot power series"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "f0a1b2c3d4e5"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    definitions = sa.table(
        "external_series_definitions",
        sa.column("code", sa.String),
        sa.column("provider", sa.String),
        sa.column("dataset_code", sa.String),
        sa.column("series_id", sa.String),
        sa.column("name", sa.String),
        sa.column("category", sa.String),
        sa.column("frequency", sa.String),
        sa.column("unit_code", sa.String),
        sa.column("source_url", sa.String),
        sa.column("description", sa.Text),
        sa.column("query_params", sa.JSON),
        sa.column("transform_rule", sa.Text),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("created_by", sa.String),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("updated_by", sa.String),
        sa.column("version", sa.Integer),
    )

    now = datetime.now(timezone.utc)
    source_url = "https://www.ercot.com/content/cdr/html/real_time_spp.html"
    op.bulk_insert(
        definitions,
        [
            {
                "code": "ERCOT_HB_HOUSTON_RT15M",
                "provider": "ERCOT",
                "dataset_code": None,
                "series_id": "HB_HOUSTON",
                "name": "ERCOT Houston Real-Time Hub SPP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": source_url,
                "description": "Latest ERCOT real-time settlement point price for the Houston hub.",
                "query_params": {"hub": "HB_HOUSTON"},
                "transform_rule": "field:price",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "ERCOT_HB_NORTH_RT15M",
                "provider": "ERCOT",
                "dataset_code": None,
                "series_id": "HB_NORTH",
                "name": "ERCOT North Real-Time Hub SPP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": source_url,
                "description": "Latest ERCOT real-time settlement point price for the North hub.",
                "query_params": {"hub": "HB_NORTH"},
                "transform_rule": "field:price",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "ERCOT_HB_SOUTH_RT15M",
                "provider": "ERCOT",
                "dataset_code": None,
                "series_id": "HB_SOUTH",
                "name": "ERCOT South Real-Time Hub SPP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": source_url,
                "description": "Latest ERCOT real-time settlement point price for the South hub.",
                "query_params": {"hub": "HB_SOUTH"},
                "transform_rule": "field:price",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "ERCOT_HB_WEST_RT15M",
                "provider": "ERCOT",
                "dataset_code": None,
                "series_id": "HB_WEST",
                "name": "ERCOT West Real-Time Hub SPP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": source_url,
                "description": "Latest ERCOT real-time settlement point price for the West hub.",
                "query_params": {"hub": "HB_WEST"},
                "transform_rule": "field:price",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
        ],
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM external_series_definitions
            WHERE code IN (
                'ERCOT_HB_HOUSTON_RT15M',
                'ERCOT_HB_NORTH_RT15M',
                'ERCOT_HB_SOUTH_RT15M',
                'ERCOT_HB_WEST_RT15M'
            )
            """
        )
    )
