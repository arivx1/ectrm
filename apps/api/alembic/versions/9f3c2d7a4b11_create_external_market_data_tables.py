"""create external market data tables"""

from alembic import op
import sqlalchemy as sa

revision = "9f3c2d7a4b11"
down_revision = "e6f7a1c2d9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reference_price_index_sources",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("price_index_code", sa.String(length=50), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("dataset_code", sa.String(length=120), nullable=True),
        sa.Column("series_id", sa.String(length=200), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("source_unit", sa.String(length=50), nullable=False),
        sa.Column("source_currency_code", sa.String(length=20), nullable=True),
        sa.Column("transform_rule", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["price_index_code"], ["reference_price_indices.code"]),
        sa.UniqueConstraint("provider", "series_id", name="uq_reference_price_index_sources_provider_series_id"),
        sa.UniqueConstraint("price_index_code", "provider", name="uq_reference_price_index_sources_price_index_code_provider"),
    )
    op.create_index(
        "ix_reference_price_index_sources_price_index_code",
        "reference_price_index_sources",
        ["price_index_code"],
    )
    op.create_index(
        "ix_reference_price_index_sources_provider",
        "reference_price_index_sources",
        ["provider"],
    )
    op.create_index(
        "ix_reference_price_index_sources_is_active",
        "reference_price_index_sources",
        ["is_active"],
    )

    op.create_table(
        "external_data_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("job_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by", sa.String(length=128), nullable=True),
        sa.Column("series_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("observation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_external_data_runs_provider", "external_data_runs", ["provider"])
    op.create_index("ix_external_data_runs_status", "external_data_runs", ["status"])
    op.create_index("ix_external_data_runs_started_at", "external_data_runs", ["started_at"])

    op.create_table(
        "price_index_observations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("price_index_code", sa.String(length=50), nullable=False),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(18, 6), nullable=False),
        sa.Column("unit_code", sa.String(length=20), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=True),
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
        sa.ForeignKeyConstraint(["price_index_code"], ["reference_price_indices.code"]),
        sa.ForeignKeyConstraint(["run_id"], ["external_data_runs.id"]),
        sa.UniqueConstraint(
            "price_index_code",
            "observation_date",
            "source_provider",
            "source_series_id",
            name="uq_price_index_observations_price_index_date_provider_series",
        ),
    )
    op.create_index(
        "ix_price_index_observations_price_index_code",
        "price_index_observations",
        ["price_index_code"],
    )
    op.create_index(
        "ix_price_index_observations_observation_date",
        "price_index_observations",
        ["observation_date"],
    )
    op.create_index(
        "ix_price_index_observations_source_provider",
        "price_index_observations",
        ["source_provider"],
    )
    op.create_index(
        "ix_price_index_observations_run_id",
        "price_index_observations",
        ["run_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_price_index_observations_run_id", table_name="price_index_observations")
    op.drop_index(
        "ix_price_index_observations_source_provider",
        table_name="price_index_observations",
    )
    op.drop_index(
        "ix_price_index_observations_observation_date",
        table_name="price_index_observations",
    )
    op.drop_index(
        "ix_price_index_observations_price_index_code",
        table_name="price_index_observations",
    )
    op.drop_table("price_index_observations")

    op.drop_index("ix_external_data_runs_started_at", table_name="external_data_runs")
    op.drop_index("ix_external_data_runs_status", table_name="external_data_runs")
    op.drop_index("ix_external_data_runs_provider", table_name="external_data_runs")
    op.drop_table("external_data_runs")

    op.drop_index(
        "ix_reference_price_index_sources_is_active",
        table_name="reference_price_index_sources",
    )
    op.drop_index(
        "ix_reference_price_index_sources_provider",
        table_name="reference_price_index_sources",
    )
    op.drop_index(
        "ix_reference_price_index_sources_price_index_code",
        table_name="reference_price_index_sources",
    )
    op.drop_table("reference_price_index_sources")
