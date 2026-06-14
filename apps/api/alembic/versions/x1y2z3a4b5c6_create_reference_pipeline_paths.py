"""create reference pipeline paths

Revision ID: x1y2z3a4b5c6
Revises: w0x1y2z3a4b
Create Date: 2026-05-07 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "x1y2z3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "w0x1y2z3a4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reference_pipeline_details",
        sa.Column("pipeline_code", sa.String(length=100), nullable=False),
        sa.Column("commodity_family", sa.String(length=32), nullable=False),
        sa.Column("jurisdiction_type", sa.String(length=32), nullable=False),
        sa.Column("topology_model", sa.String(length=32), nullable=False),
        sa.Column("market_hub_location_code", sa.String(length=50), nullable=True),
        sa.Column("in_service_year", sa.Integer(), nullable=True),
        sa.Column("cross_border", sa.Boolean(), nullable=False),
        sa.Column("is_bidirectional", sa.Boolean(), nullable=False),
        sa.Column("tariff_url", sa.Text(), nullable=True),
        sa.Column("ebb_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["market_hub_location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["pipeline_code"], ["reference_assets.code"]),
        sa.PrimaryKeyConstraint("pipeline_code"),
    )
    op.create_index(
        "ix_reference_pipeline_details_market_hub_location_code",
        "reference_pipeline_details",
        ["market_hub_location_code"],
    )
    op.create_table(
        "reference_pipeline_points",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("pipeline_code", sa.String(length=100), nullable=False),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("point_role", sa.String(length=32), nullable=False),
        sa.Column("operator_point_code", sa.String(length=120), nullable=True),
        sa.Column("operator_zone", sa.String(length=60), nullable=True),
        sa.Column("connected_pipeline_code", sa.String(length=100), nullable=True),
        sa.Column("is_tradable", sa.Boolean(), nullable=False),
        sa.Column("is_pricing_point", sa.Boolean(), nullable=False),
        sa.Column("is_scheduling_point", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["connected_pipeline_code"], ["reference_assets.code"]),
        sa.ForeignKeyConstraint(["location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["pipeline_code"], ["reference_assets.code"]),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(
        "ix_reference_pipeline_points_pipeline_code",
        "reference_pipeline_points",
        ["pipeline_code"],
    )
    op.create_index(
        "ix_reference_pipeline_points_location_code",
        "reference_pipeline_points",
        ["location_code"],
    )
    op.create_index(
        "ix_reference_pipeline_points_connected_pipeline_code",
        "reference_pipeline_points",
        ["connected_pipeline_code"],
    )
    op.create_table(
        "reference_pipeline_paths",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("pipeline_code", sa.String(length=100), nullable=False),
        sa.Column("receipt_location_code", sa.String(length=50), nullable=True),
        sa.Column("delivery_location_code", sa.String(length=50), nullable=True),
        sa.Column("receipt_point_code", sa.String(length=100), nullable=True),
        sa.Column("delivery_point_code", sa.String(length=100), nullable=True),
        sa.Column("path_direction", sa.String(length=20), nullable=False),
        sa.Column("cycle_timezone", sa.String(length=60), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["delivery_location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["delivery_point_code"], ["reference_pipeline_points.code"]),
        sa.ForeignKeyConstraint(["pipeline_code"], ["reference_assets.code"]),
        sa.ForeignKeyConstraint(["receipt_location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["receipt_point_code"], ["reference_pipeline_points.code"]),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(
        "ix_reference_pipeline_paths_pipeline_code",
        "reference_pipeline_paths",
        ["pipeline_code"],
    )
    op.create_index(
        "ix_reference_pipeline_paths_receipt_location_code",
        "reference_pipeline_paths",
        ["receipt_location_code"],
    )
    op.create_index(
        "ix_reference_pipeline_paths_delivery_location_code",
        "reference_pipeline_paths",
        ["delivery_location_code"],
    )
    op.create_index(
        "ix_reference_pipeline_paths_receipt_point_code",
        "reference_pipeline_paths",
        ["receipt_point_code"],
    )
    op.create_index(
        "ix_reference_pipeline_paths_delivery_point_code",
        "reference_pipeline_paths",
        ["delivery_point_code"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reference_pipeline_paths_delivery_point_code",
        table_name="reference_pipeline_paths",
    )
    op.drop_index(
        "ix_reference_pipeline_paths_receipt_point_code",
        table_name="reference_pipeline_paths",
    )
    op.drop_index(
        "ix_reference_pipeline_paths_delivery_location_code",
        table_name="reference_pipeline_paths",
    )
    op.drop_index(
        "ix_reference_pipeline_paths_receipt_location_code",
        table_name="reference_pipeline_paths",
    )
    op.drop_index(
        "ix_reference_pipeline_paths_pipeline_code",
        table_name="reference_pipeline_paths",
    )
    op.drop_table("reference_pipeline_paths")
    op.drop_index(
        "ix_reference_pipeline_points_connected_pipeline_code",
        table_name="reference_pipeline_points",
    )
    op.drop_index(
        "ix_reference_pipeline_points_location_code",
        table_name="reference_pipeline_points",
    )
    op.drop_index(
        "ix_reference_pipeline_points_pipeline_code",
        table_name="reference_pipeline_points",
    )
    op.drop_table("reference_pipeline_points")
    op.drop_index(
        "ix_reference_pipeline_details_market_hub_location_code",
        table_name="reference_pipeline_details",
    )
    op.drop_table("reference_pipeline_details")
