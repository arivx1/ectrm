"""create external series tables"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "b4c5d6e7f8a9"
down_revision = "9f3c2d7a4b11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_series_definitions",
        sa.Column("code", sa.String(length=80), primary_key=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("dataset_code", sa.String(length=120), nullable=True),
        sa.Column("series_id", sa.String(length=200), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("unit_code", sa.String(length=20), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("query_params", sa.JSON(), nullable=True),
        sa.Column("transform_rule", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index(
        "ix_external_series_definitions_provider",
        "external_series_definitions",
        ["provider"],
    )
    op.create_index(
        "ix_external_series_definitions_category",
        "external_series_definitions",
        ["category"],
    )
    op.create_index(
        "ix_external_series_definitions_is_active",
        "external_series_definitions",
        ["is_active"],
    )

    op.create_table(
        "external_series_observations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("series_code", sa.String(length=80), nullable=False),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(18, 6), nullable=False),
        sa.Column("unit_code", sa.String(length=20), nullable=False),
        sa.Column("source_provider", sa.String(length=50), nullable=False),
        sa.Column("source_series_id", sa.String(length=200), nullable=False),
        sa.Column("source_frequency", sa.String(length=20), nullable=False),
        sa.Column("source_published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_revision", sa.String(length=120), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["series_code"], ["external_series_definitions.code"]),
        sa.ForeignKeyConstraint(["run_id"], ["external_data_runs.id"]),
        sa.UniqueConstraint(
            "series_code",
            "observation_date",
            "source_provider",
            "source_series_id",
            name="uq_external_series_observations_series_date_provider_series",
        ),
    )
    op.create_index(
        "ix_external_series_observations_series_code",
        "external_series_observations",
        ["series_code"],
    )
    op.create_index(
        "ix_external_series_observations_observation_date",
        "external_series_observations",
        ["observation_date"],
    )
    op.create_index(
        "ix_external_series_observations_source_provider",
        "external_series_observations",
        ["source_provider"],
    )
    op.create_index(
        "ix_external_series_observations_run_id",
        "external_series_observations",
        ["run_id"],
    )

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
                "code": "FRED_DGS10",
                "provider": "FRED",
                "dataset_code": None,
                "series_id": "DGS10",
                "name": "10-Year Treasury Constant Maturity Rate",
                "category": "macro",
                "frequency": "daily",
                "unit_code": "PCT",
                "source_url": "https://fred.stlouisfed.org/series/DGS10",
                "description": "Public rates benchmark useful for funding and macro context.",
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
                "code": "FRED_DTWEXBGS",
                "provider": "FRED",
                "dataset_code": None,
                "series_id": "DTWEXBGS",
                "name": "Trade Weighted U.S. Dollar Index: Broad",
                "category": "macro",
                "frequency": "daily",
                "unit_code": "INDEX",
                "source_url": "https://fred.stlouisfed.org/series/DTWEXBGS",
                "description": "Broad dollar index for commodity macro context.",
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
                "code": "FRED_CPIAUCSL",
                "provider": "FRED",
                "dataset_code": None,
                "series_id": "CPIAUCSL",
                "name": "Consumer Price Index for All Urban Consumers",
                "category": "macro",
                "frequency": "monthly",
                "unit_code": "INDEX",
                "source_url": "https://fred.stlouisfed.org/series/CPIAUCSL",
                "description": "Inflation benchmark for macro regime context.",
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
                "code": "CFTC_WTI_MM_NET",
                "provider": "CFTC",
                "dataset_code": "72hh-3qpy",
                "series_id": "067651",
                "name": "WTI NYMEX Managed Money Net Position",
                "category": "positioning",
                "frequency": "weekly",
                "unit_code": "CONTRACTS",
                "source_url": "https://publicreporting.cftc.gov/",
                "description": "Managed money net positioning for WTI NYMEX crude oil.",
                "query_params": {"cftc_contract_market_code": "067651"},
                "transform_rule": "net:m_money_positions_long_all:m_money_positions_short_all",
                "is_active": True,
                "created_at": now,
                "created_by": "migration",
                "updated_at": now,
                "updated_by": "migration",
                "version": 1,
            },
            {
                "code": "CFTC_HH_MM_NET",
                "provider": "CFTC",
                "dataset_code": "72hh-3qpy",
                "series_id": "023651",
                "name": "Henry Hub NYMEX Managed Money Net Position",
                "category": "positioning",
                "frequency": "weekly",
                "unit_code": "CONTRACTS",
                "source_url": "https://publicreporting.cftc.gov/",
                "description": "Managed money net positioning for NYMEX Henry Hub natural gas.",
                "query_params": {"cftc_contract_market_code": "023651"},
                "transform_rule": "net:m_money_positions_long_all:m_money_positions_short_all",
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
    op.drop_index("ix_external_series_observations_run_id", table_name="external_series_observations")
    op.drop_index(
        "ix_external_series_observations_source_provider",
        table_name="external_series_observations",
    )
    op.drop_index(
        "ix_external_series_observations_observation_date",
        table_name="external_series_observations",
    )
    op.drop_index(
        "ix_external_series_observations_series_code",
        table_name="external_series_observations",
    )
    op.drop_table("external_series_observations")

    op.drop_index(
        "ix_external_series_definitions_is_active",
        table_name="external_series_definitions",
    )
    op.drop_index(
        "ix_external_series_definitions_category",
        table_name="external_series_definitions",
    )
    op.drop_index(
        "ix_external_series_definitions_provider",
        table_name="external_series_definitions",
    )
    op.drop_table("external_series_definitions")
