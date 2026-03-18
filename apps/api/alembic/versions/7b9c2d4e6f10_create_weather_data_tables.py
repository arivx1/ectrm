"""create weather data tables

Revision ID: 7b9c2d4e6f10
Revises: d9e8f7a6b5c4
"""

from alembic import op
import sqlalchemy as sa

revision = "7b9c2d4e6f10"
down_revision = "d9e8f7a6b5c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_locations",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("reference_location_code", sa.String(length=50), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column("source_provider", sa.String(length=50), nullable=False, server_default="NWS"),
        sa.Column("cwa", sa.String(length=20), nullable=True),
        sa.Column("grid_id", sa.String(length=20), nullable=True),
        sa.Column("grid_x", sa.Integer(), nullable=True),
        sa.Column("grid_y", sa.Integer(), nullable=True),
        sa.Column("station_id", sa.String(length=20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["reference_location_code"], ["reference_locations.code"]),
    )
    op.create_index("ix_weather_locations_reference_location_code", "weather_locations", ["reference_location_code"])
    op.create_index("ix_weather_locations_is_active", "weather_locations", ["is_active"])
    op.create_index("ix_weather_locations_station_id", "weather_locations", ["station_id"])

    op.create_table(
        "weather_forecast_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("weather_location_code", sa.String(length=50), nullable=False),
        sa.Column("source_provider", sa.String(length=50), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_daytime", sa.Boolean(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("temperature_unit", sa.String(length=10), nullable=True),
        sa.Column("wind_speed", sa.String(length=30), nullable=True),
        sa.Column("wind_direction", sa.String(length=10), nullable=True),
        sa.Column("short_forecast", sa.String(length=200), nullable=True),
        sa.Column("detailed_forecast", sa.Text(), nullable=True),
        sa.Column("probability_of_precipitation_pct", sa.Float(), nullable=True),
        sa.Column("relative_humidity_pct", sa.Float(), nullable=True),
        sa.Column("dewpoint_celsius", sa.Float(), nullable=True),
        sa.Column("icon_url", sa.String(length=400), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["external_data_runs.id"]),
        sa.ForeignKeyConstraint(["weather_location_code"], ["weather_locations.code"]),
        sa.UniqueConstraint(
            "weather_location_code",
            "source_provider",
            "start_at",
            name="uq_weather_forecast_periods_location_provider_start_at",
        ),
    )
    op.create_index(
        "ix_weather_forecast_periods_weather_location_code",
        "weather_forecast_periods",
        ["weather_location_code"],
    )
    op.create_index("ix_weather_forecast_periods_start_at", "weather_forecast_periods", ["start_at"])
    op.create_index("ix_weather_forecast_periods_run_id", "weather_forecast_periods", ["run_id"])

    op.create_table(
        "weather_observations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("weather_location_code", sa.String(length=50), nullable=False),
        sa.Column("source_provider", sa.String(length=50), nullable=False),
        sa.Column("station_id", sa.String(length=20), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("text_description", sa.String(length=120), nullable=True),
        sa.Column("icon_url", sa.String(length=400), nullable=True),
        sa.Column("temperature_celsius", sa.Float(), nullable=True),
        sa.Column("dewpoint_celsius", sa.Float(), nullable=True),
        sa.Column("relative_humidity_pct", sa.Float(), nullable=True),
        sa.Column("wind_speed_kmh", sa.Float(), nullable=True),
        sa.Column("wind_direction_degrees", sa.Float(), nullable=True),
        sa.Column("barometric_pressure_pa", sa.Float(), nullable=True),
        sa.Column("visibility_meters", sa.Float(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["external_data_runs.id"]),
        sa.ForeignKeyConstraint(["weather_location_code"], ["weather_locations.code"]),
        sa.UniqueConstraint(
            "weather_location_code",
            "source_provider",
            "station_id",
            "observed_at",
            name="uq_weather_observations_location_provider_station_observed_at",
        ),
    )
    op.create_index(
        "ix_weather_observations_weather_location_code",
        "weather_observations",
        ["weather_location_code"],
    )
    op.create_index("ix_weather_observations_observed_at", "weather_observations", ["observed_at"])
    op.create_index("ix_weather_observations_run_id", "weather_observations", ["run_id"])

    op.alter_column("weather_locations", "source_provider", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_weather_observations_run_id", table_name="weather_observations")
    op.drop_index("ix_weather_observations_observed_at", table_name="weather_observations")
    op.drop_index(
        "ix_weather_observations_weather_location_code",
        table_name="weather_observations",
    )
    op.drop_table("weather_observations")

    op.drop_index("ix_weather_forecast_periods_run_id", table_name="weather_forecast_periods")
    op.drop_index("ix_weather_forecast_periods_start_at", table_name="weather_forecast_periods")
    op.drop_index(
        "ix_weather_forecast_periods_weather_location_code",
        table_name="weather_forecast_periods",
    )
    op.drop_table("weather_forecast_periods")

    op.drop_index("ix_weather_locations_station_id", table_name="weather_locations")
    op.drop_index("ix_weather_locations_is_active", table_name="weather_locations")
    op.drop_index(
        "ix_weather_locations_reference_location_code",
        table_name="weather_locations",
    )
    op.drop_table("weather_locations")
