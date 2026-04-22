"""seed eia fundamental series"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "a6b7c8d9e0f1"
down_revision = "f0a1b2c3d4e5"
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
    op.bulk_insert(
        definitions,
        [
            {
                "code": "EIA_CRUDE_PROD_US_M",
                "provider": "EIA_FUNDAMENTALS",
                "dataset_code": "PET",
                "series_id": "PET.MCRFPUS2.M",
                "name": "U.S. Crude Oil Field Production",
                "category": "fundamentals",
                "frequency": "monthly",
                "unit_code": "KBBL_D",
                "source_url": "https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbblpd_m.htm",
                "description": "Monthly U.S. crude oil field production in thousand barrels per day.",
                "query_params": None,
                "transform_rule": "field:value",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "EIA_PET_SUPPLIED_US_W",
                "provider": "EIA_FUNDAMENTALS",
                "dataset_code": "PET",
                "series_id": "PET.WRPUPUS2.W",
                "name": "U.S. Total Petroleum Products Supplied",
                "category": "fundamentals",
                "frequency": "weekly",
                "unit_code": "KBBL_D",
                "source_url": "https://www.eia.gov/dnav/pet/pet_cons_wpsup_k_w.htm",
                "description": "Weekly U.S. total petroleum products supplied in thousand barrels per day.",
                "query_params": None,
                "transform_rule": "field:value",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "EIA_NG_STORAGE_LOWER48_W",
                "provider": "EIA_FUNDAMENTALS",
                "dataset_code": "NG",
                "series_id": "NG.NW2_EPG0_SWO_R48_BCF.W",
                "name": "Lower 48 Working Gas in Storage",
                "category": "fundamentals",
                "frequency": "weekly",
                "unit_code": "BCF",
                "source_url": "https://www.eia.gov/dnav/ng/ng_stor_wkly_s1_w.htm",
                "description": "Weekly working natural gas in underground storage across the Lower 48 states.",
                "query_params": None,
                "transform_rule": "field:value",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "EIA_NG_DRY_PROD_US_M",
                "provider": "EIA_FUNDAMENTALS",
                "dataset_code": "NG",
                "series_id": "NG.N9070US2.M",
                "name": "U.S. Dry Natural Gas Production",
                "category": "fundamentals",
                "frequency": "monthly",
                "unit_code": "MMCF",
                "source_url": "https://www.eia.gov/dnav/ng/ng_prod_sum_dc_NUS_mmcf_m.htm",
                "description": "Monthly U.S. dry natural gas production in million cubic feet.",
                "query_params": None,
                "transform_rule": "field:value",
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
                'EIA_CRUDE_PROD_US_M',
                'EIA_PET_SUPPLIED_US_W',
                'EIA_NG_STORAGE_LOWER48_W',
                'EIA_NG_DRY_PROD_US_M'
            )
            """
        )
    )
