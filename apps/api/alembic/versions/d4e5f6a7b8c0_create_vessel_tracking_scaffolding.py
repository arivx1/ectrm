"""create vessel tracking scaffolding

Revision ID: d4e5f6a7b8c0
Revises: c8d9e0f1a2b3
Create Date: 2026-05-19 18:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c0"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("delivery_vessel_details"):
        op.create_table(
            "delivery_vessel_details",
            sa.Column("delivery_id", sa.String(length=96), nullable=False),
            sa.Column("vessel_name", sa.String(length=120), nullable=True),
            sa.Column("imo_number", sa.String(length=20), nullable=True),
            sa.Column("mmsi_number", sa.String(length=20), nullable=True),
            sa.Column("call_sign", sa.String(length=32), nullable=True),
            sa.Column("voyage_number", sa.String(length=64), nullable=True),
            sa.Column("tracking_provider", sa.String(length=64), nullable=True),
            sa.Column("tracking_policy", sa.String(length=64), nullable=True),
            sa.Column("last_signal_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_position_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_latitude", sa.Numeric(precision=12, scale=8), nullable=True),
            sa.Column("last_longitude", sa.Numeric(precision=12, scale=8), nullable=True),
            sa.Column("last_speed_knots", sa.Numeric(precision=7, scale=3), nullable=True),
            sa.Column("last_course_degrees", sa.Numeric(precision=6, scale=2), nullable=True),
            sa.Column("last_heading_degrees", sa.Numeric(precision=6, scale=2), nullable=True),
            sa.Column("last_navigational_status", sa.String(length=64), nullable=True),
            sa.Column("current_destination", sa.String(length=120), nullable=True),
            sa.Column("current_eta_at_destination", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_by", sa.String(length=128), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_by", sa.String(length=128), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("delivery_id"),
        )

    vessel_indexes = {index["name"] for index in inspector.get_indexes("delivery_vessel_details")}
    if "ix_delivery_vessel_details_imo_number" not in vessel_indexes:
        op.create_index("ix_delivery_vessel_details_imo_number", "delivery_vessel_details", ["imo_number"])
    if "ix_delivery_vessel_details_mmsi_number" not in vessel_indexes:
        op.create_index("ix_delivery_vessel_details_mmsi_number", "delivery_vessel_details", ["mmsi_number"])

    signal_columns = {column["name"] for column in inspector.get_columns("delivery_tracking_signals")}
    if "speed_knots" not in signal_columns:
        op.add_column(
            "delivery_tracking_signals",
            sa.Column("speed_knots", sa.Numeric(precision=7, scale=3), nullable=True),
        )
    if "course_degrees" not in signal_columns:
        op.add_column(
            "delivery_tracking_signals",
            sa.Column("course_degrees", sa.Numeric(precision=6, scale=2), nullable=True),
        )
    if "heading_degrees" not in signal_columns:
        op.add_column(
            "delivery_tracking_signals",
            sa.Column("heading_degrees", sa.Numeric(precision=6, scale=2), nullable=True),
        )
    if "draught_meters" not in signal_columns:
        op.add_column(
            "delivery_tracking_signals",
            sa.Column("draught_meters", sa.Numeric(precision=7, scale=3), nullable=True),
        )
    if "destination" not in signal_columns:
        op.add_column("delivery_tracking_signals", sa.Column("destination", sa.String(length=120), nullable=True))
    if "eta_at_destination" not in signal_columns:
        op.add_column(
            "delivery_tracking_signals",
            sa.Column("eta_at_destination", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("delivery_tracking_signals", "eta_at_destination")
    op.drop_column("delivery_tracking_signals", "destination")
    op.drop_column("delivery_tracking_signals", "draught_meters")
    op.drop_column("delivery_tracking_signals", "heading_degrees")
    op.drop_column("delivery_tracking_signals", "course_degrees")
    op.drop_column("delivery_tracking_signals", "speed_knots")

    op.drop_index("ix_delivery_vessel_details_mmsi_number", table_name="delivery_vessel_details")
    op.drop_index("ix_delivery_vessel_details_imo_number", table_name="delivery_vessel_details")
    op.drop_table("delivery_vessel_details")
