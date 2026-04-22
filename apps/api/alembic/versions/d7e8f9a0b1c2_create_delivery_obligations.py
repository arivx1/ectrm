"""create delivery obligations

Revision ID: d7e8f9a0b1c2
Revises: c2d3e4f5a6b7, c5d6e7f8a9b0
Create Date: 2026-04-07 14:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = ("c2d3e4f5a6b7", "c5d6e7f8a9b0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_obligations",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("trade_leg_id", sa.String(length=36), nullable=True),
        sa.Column("leg_no", sa.Integer(), nullable=True),
        sa.Column("external_trade_id", sa.String(length=128), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("mode_family", sa.String(length=32), nullable=False),
        sa.Column("transport_mode", sa.String(length=32), nullable=False),
        sa.Column("transport_mode_source", sa.String(length=32), nullable=False),
        sa.Column("delivery_profile", sa.String(length=32), nullable=False),
        sa.Column("book", sa.String(length=50), nullable=False),
        sa.Column("portfolio", sa.String(length=50), nullable=True),
        sa.Column("counterparty", sa.String(length=50), nullable=True),
        sa.Column("commodity_class", sa.String(length=50), nullable=False),
        sa.Column("commodity", sa.String(length=50), nullable=False),
        sa.Column("volume", sa.Numeric(18, 6), nullable=True),
        sa.Column("unit_of_measure", sa.String(length=20), nullable=True),
        sa.Column("trade_currency_code", sa.String(length=20), nullable=True),
        sa.Column("price_unit_code", sa.String(length=20), nullable=True),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("delivery_start", sa.Date(), nullable=True),
        sa.Column("delivery_end", sa.Date(), nullable=True),
        sa.Column("booked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_trade_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.trade_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_leg_id"], ["trade_legs.trade_leg_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
        sa.UniqueConstraint("trade_leg_id", name="uq_delivery_obligations_trade_leg_id"),
    )
    op.create_index("ix_delivery_obligations_trade_id", "delivery_obligations", ["trade_id"], unique=False)
    op.create_index("ix_delivery_obligations_trade_leg_id", "delivery_obligations", ["trade_leg_id"], unique=False)
    op.create_index("ix_delivery_obligations_mode_family", "delivery_obligations", ["mode_family"], unique=False)
    op.create_index(
        "ix_delivery_obligations_delivery_window",
        "delivery_obligations",
        ["delivery_start", "delivery_end"],
        unique=False,
    )

    op.create_table(
        "delivery_logistics_details",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("origin_location_code", sa.String(length=50), nullable=True),
        sa.Column("destination_location_code", sa.String(length=50), nullable=True),
        sa.Column("incoterm_code", sa.String(length=20), nullable=True),
        sa.Column("carrier_name", sa.String(length=120), nullable=True),
        sa.Column("carrier_reference", sa.String(length=120), nullable=True),
        sa.Column("asset_reference", sa.String(length=120), nullable=True),
        sa.Column("equipment_type", sa.String(length=60), nullable=True),
        sa.Column("load_reference", sa.String(length=120), nullable=True),
        sa.Column("discharge_reference", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_index(
        "ix_delivery_logistics_details_destination_location_code",
        "delivery_logistics_details",
        ["destination_location_code"],
        unique=False,
    )

    op.create_table(
        "delivery_pipeline_details",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("pipeline_system", sa.String(length=120), nullable=True),
        sa.Column("pipeline_path", sa.String(length=120), nullable=True),
        sa.Column("receipt_location_code", sa.String(length=50), nullable=True),
        sa.Column("delivery_location_code", sa.String(length=50), nullable=True),
        sa.Column("contract_number", sa.String(length=120), nullable=True),
        sa.Column("cycle_code", sa.String(length=40), nullable=True),
        sa.Column("nomination_reference", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_index(
        "ix_delivery_pipeline_details_pipeline_system",
        "delivery_pipeline_details",
        ["pipeline_system"],
        unique=False,
    )

    op.create_table(
        "delivery_power_details",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("market_operator", sa.String(length=60), nullable=True),
        sa.Column("pricing_node_code", sa.String(length=60), nullable=True),
        sa.Column("delivery_node_code", sa.String(length=60), nullable=True),
        sa.Column("profile_code", sa.String(length=60), nullable=True),
        sa.Column("schedule_reference", sa.String(length=120), nullable=True),
        sa.Column("interval_minutes", sa.Integer(), nullable=True),
        sa.Column("timezone_name", sa.String(length=60), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_index(
        "ix_delivery_power_details_market_operator",
        "delivery_power_details",
        ["market_operator"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_power_details_market_operator", table_name="delivery_power_details")
    op.drop_table("delivery_power_details")
    op.drop_index("ix_delivery_pipeline_details_pipeline_system", table_name="delivery_pipeline_details")
    op.drop_table("delivery_pipeline_details")
    op.drop_index(
        "ix_delivery_logistics_details_destination_location_code",
        table_name="delivery_logistics_details",
    )
    op.drop_table("delivery_logistics_details")
    op.drop_index("ix_delivery_obligations_delivery_window", table_name="delivery_obligations")
    op.drop_index("ix_delivery_obligations_mode_family", table_name="delivery_obligations")
    op.drop_index("ix_delivery_obligations_trade_leg_id", table_name="delivery_obligations")
    op.drop_index("ix_delivery_obligations_trade_id", table_name="delivery_obligations")
    op.drop_table("delivery_obligations")
