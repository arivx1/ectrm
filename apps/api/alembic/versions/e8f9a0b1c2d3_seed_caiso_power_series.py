"""seed caiso power series"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "e8f9a0b1c2d3"
down_revision = "d6e7f8a9b0c1"
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
                "code": "CAISO_NP15_RT5M",
                "provider": "CAISO",
                "dataset_code": None,
                "series_id": "NP15",
                "name": "CAISO NP15 Real-Time 5-Minute Hub LMP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": "https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                "description": "Latest current CAISO real-time 5-minute hub LMP snapshot for NP15.",
                "query_params": {"hub": "NP15"},
                "transform_rule": "field:lmp",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "CAISO_SP15_RT5M",
                "provider": "CAISO",
                "dataset_code": None,
                "series_id": "SP15",
                "name": "CAISO SP15 Real-Time 5-Minute Hub LMP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": "https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                "description": "Latest current CAISO real-time 5-minute hub LMP snapshot for SP15.",
                "query_params": {"hub": "SP15"},
                "transform_rule": "field:lmp",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "CAISO_ZP26_RT5M",
                "provider": "CAISO",
                "dataset_code": None,
                "series_id": "ZP26",
                "name": "CAISO ZP26 Real-Time 5-Minute Hub LMP",
                "category": "power",
                "frequency": "daily",
                "unit_code": "USD_MWH",
                "source_url": "https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                "description": "Latest current CAISO real-time 5-minute hub LMP snapshot for ZP26.",
                "query_params": {"hub": "ZP26"},
                "transform_rule": "field:lmp",
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
            WHERE code IN ('CAISO_NP15_RT5M', 'CAISO_SP15_RT5M', 'CAISO_ZP26_RT5M')
            """
        )
    )
