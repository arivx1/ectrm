"""create truck tracking scaffolding

Revision ID: b1c2d3e4f5g6
Revises: z3a4b5c6d7e8, y4z5a6b7c8d9
Create Date: 2026-05-16 13:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5g6"
down_revision: Union[str, Sequence[str], None] = ("z3a4b5c6d7e8", "y4z5a6b7c8d9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_truck_details",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("target_run_count", sa.Integer(), nullable=True),
        sa.Column("dispatcher_owner", sa.String(length=128), nullable=True),
        sa.Column("tracking_provider", sa.String(length=64), nullable=True),
        sa.Column("tracking_policy", sa.String(length=64), nullable=True),
        sa.Column("default_carrier_name", sa.String(length=120), nullable=True),
        sa.Column("default_carrier_name_source", sa.String(length=32), nullable=False),
        sa.Column("default_external_carrier_reference", sa.String(length=120), nullable=True),
        sa.Column("default_external_carrier_reference_source", sa.String(length=32), nullable=False),
        sa.Column("equipment_type", sa.String(length=60), nullable=True),
        sa.Column("equipment_type_source", sa.String(length=32), nullable=False),
        sa.Column("origin_geofence_code", sa.String(length=64), nullable=True),
        sa.Column("origin_geofence_code_source", sa.String(length=32), nullable=False),
        sa.Column("destination_geofence_code", sa.String(length=64), nullable=True),
        sa.Column("destination_geofence_code_source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
    )

    op.create_table(
        "delivery_truck_movements",
        sa.Column("movement_id", sa.String(length=96), nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("status_reason", sa.String(length=255), nullable=True),
        sa.Column("planned_quantity", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("planned_unit_of_measure", sa.String(length=20), nullable=True),
        sa.Column("carrier_name", sa.String(length=120), nullable=True),
        sa.Column("carrier_name_source", sa.String(length=32), nullable=False),
        sa.Column("external_carrier_reference", sa.String(length=120), nullable=True),
        sa.Column("external_carrier_reference_source", sa.String(length=32), nullable=False),
        sa.Column("dispatcher_owner", sa.String(length=128), nullable=True),
        sa.Column("dispatcher_owner_source", sa.String(length=32), nullable=False),
        sa.Column("driver_name", sa.String(length=120), nullable=True),
        sa.Column("driver_name_source", sa.String(length=32), nullable=False),
        sa.Column("driver_phone", sa.String(length=40), nullable=True),
        sa.Column("driver_phone_source", sa.String(length=32), nullable=False),
        sa.Column("tractor_reference", sa.String(length=120), nullable=True),
        sa.Column("tractor_reference_source", sa.String(length=32), nullable=False),
        sa.Column("trailer_reference", sa.String(length=120), nullable=True),
        sa.Column("trailer_reference_source", sa.String(length=32), nullable=False),
        sa.Column("external_load_reference", sa.String(length=120), nullable=True),
        sa.Column("external_load_reference_source", sa.String(length=32), nullable=False),
        sa.Column("bill_of_lading_number", sa.String(length=120), nullable=True),
        sa.Column("bill_of_lading_number_source", sa.String(length=32), nullable=False),
        sa.Column("truck_ticket_number", sa.String(length=120), nullable=True),
        sa.Column("truck_ticket_number_source", sa.String(length=32), nullable=False),
        sa.Column("current_stop_sequence", sa.Integer(), nullable=True),
        sa.Column("current_location_code", sa.String(length=50), nullable=True),
        sa.Column("last_signal_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_eta_at_destination", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hold_reason_code", sa.String(length=64), nullable=True),
        sa.Column("hold_reason_code_source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("movement_id"),
        sa.UniqueConstraint("delivery_id", "sequence_no", name="uq_delivery_truck_movements_delivery_sequence"),
    )
    op.create_index("ix_delivery_truck_movements_delivery_id", "delivery_truck_movements", ["delivery_id"])
    op.create_index(
        "ix_delivery_truck_movements_external_load_reference",
        "delivery_truck_movements",
        ["external_load_reference"],
    )

    op.create_table(
        "delivery_truck_stops",
        sa.Column("stop_id", sa.String(length=96), nullable=False),
        sa.Column("movement_id", sa.String(length=96), nullable=False),
        sa.Column("stop_sequence", sa.Integer(), nullable=False),
        sa.Column("stop_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("status_reason", sa.String(length=255), nullable=True),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("location_code_source", sa.String(length=32), nullable=False),
        sa.Column("planned_arrival_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_arrival_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_departure_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_departure_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("appointment_reference", sa.String(length=120), nullable=True),
        sa.Column("appointment_reference_source", sa.String(length=32), nullable=False),
        sa.Column("planned_quantity", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("actual_quantity", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("actual_arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_departed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["movement_id"], ["delivery_truck_movements.movement_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("stop_id"),
        sa.UniqueConstraint("movement_id", "stop_sequence", name="uq_delivery_truck_stops_movement_sequence"),
    )
    op.create_index("ix_delivery_truck_stops_location_code", "delivery_truck_stops", ["location_code"])
    op.create_index("ix_delivery_truck_stops_movement_id", "delivery_truck_stops", ["movement_id"])

    op.create_table(
        "delivery_tracking_signals",
        sa.Column("signal_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("delivery_id", sa.String(length=96), nullable=True),
        sa.Column("movement_id", sa.String(length=96), nullable=True),
        sa.Column("stop_id", sa.String(length=96), nullable=True),
        sa.Column("source_system", sa.String(length=64), nullable=False),
        sa.Column("source_event_id", sa.String(length=128), nullable=True),
        sa.Column("signal_type", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=12, scale=8), nullable=True),
        sa.Column("longitude", sa.Numeric(precision=12, scale=8), nullable=True),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("external_status", sa.String(length=64), nullable=True),
        sa.Column("normalized_status", sa.String(length=64), nullable=True),
        sa.Column("match_confidence", sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column("dedupe_key", sa.String(length=160), nullable=False),
        sa.Column("processing_status", sa.String(length=32), nullable=False),
        sa.Column("processing_error", sa.String(length=2000), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["movement_id"], ["delivery_truck_movements.movement_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stop_id"], ["delivery_truck_stops.stop_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("signal_id"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_delivery_tracking_signals_delivery_id", "delivery_tracking_signals", ["delivery_id"])
    op.create_index("ix_delivery_tracking_signals_movement_id", "delivery_tracking_signals", ["movement_id"])
    op.create_index("ix_delivery_tracking_signals_stop_id", "delivery_tracking_signals", ["stop_id"])
    op.create_index(
        "ix_delivery_tracking_signals_source_system_event_id",
        "delivery_tracking_signals",
        ["source_system", "source_event_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_tracking_signals_source_system_event_id",
        table_name="delivery_tracking_signals",
    )
    op.drop_index("ix_delivery_tracking_signals_stop_id", table_name="delivery_tracking_signals")
    op.drop_index("ix_delivery_tracking_signals_movement_id", table_name="delivery_tracking_signals")
    op.drop_index("ix_delivery_tracking_signals_delivery_id", table_name="delivery_tracking_signals")
    op.drop_table("delivery_tracking_signals")

    op.drop_index("ix_delivery_truck_stops_movement_id", table_name="delivery_truck_stops")
    op.drop_index("ix_delivery_truck_stops_location_code", table_name="delivery_truck_stops")
    op.drop_table("delivery_truck_stops")

    op.drop_index(
        "ix_delivery_truck_movements_external_load_reference",
        table_name="delivery_truck_movements",
    )
    op.drop_index("ix_delivery_truck_movements_delivery_id", table_name="delivery_truck_movements")
    op.drop_table("delivery_truck_movements")

    op.drop_table("delivery_truck_details")
