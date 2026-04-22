"""add delivery mode detail field sources

Revision ID: b2c3d4e5f6a7
Revises: af1b2c3d4e5f
Create Date: 2026-04-08 13:45:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "af1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    logistics_columns = [
        "origin_location_code_source",
        "destination_location_code_source",
        "incoterm_code_source",
        "carrier_name_source",
        "carrier_reference_source",
        "asset_reference_source",
        "equipment_type_source",
        "load_reference_source",
        "discharge_reference_source",
    ]
    for column_name in logistics_columns:
        op.add_column(
            "delivery_logistics_details",
            sa.Column(column_name, sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        )

    pipeline_columns = [
        "pipeline_system_source",
        "pipeline_path_source",
        "receipt_location_code_source",
        "delivery_location_code_source",
        "contract_number_source",
        "cycle_code_source",
        "nomination_reference_source",
    ]
    for column_name in pipeline_columns:
        op.add_column(
            "delivery_pipeline_details",
            sa.Column(column_name, sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        )

    power_columns = [
        "market_operator_source",
        "pricing_node_code_source",
        "delivery_node_code_source",
        "profile_code_source",
        "schedule_reference_source",
        "interval_minutes_source",
        "timezone_name_source",
    ]
    for column_name in power_columns:
        op.add_column(
            "delivery_power_details",
            sa.Column(column_name, sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        )

    op.execute(
        sa.text(
            "UPDATE delivery_logistics_details "
            "SET destination_location_code_source = 'TRADE_DERIVED' "
            "WHERE destination_location_code IS NOT NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE delivery_pipeline_details "
            "SET delivery_location_code_source = 'TRADE_DERIVED' "
            "WHERE delivery_location_code IS NOT NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE delivery_power_details "
            "SET pricing_node_code_source = 'TRADE_DERIVED' "
            "WHERE pricing_node_code IS NOT NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE delivery_power_details "
            "SET delivery_node_code_source = 'TRADE_DERIVED' "
            "WHERE delivery_node_code IS NOT NULL"
        )
    )


def downgrade() -> None:
    for column_name in [
        "timezone_name_source",
        "interval_minutes_source",
        "schedule_reference_source",
        "profile_code_source",
        "delivery_node_code_source",
        "pricing_node_code_source",
        "market_operator_source",
    ]:
        op.drop_column("delivery_power_details", column_name)

    for column_name in [
        "nomination_reference_source",
        "cycle_code_source",
        "contract_number_source",
        "delivery_location_code_source",
        "receipt_location_code_source",
        "pipeline_path_source",
        "pipeline_system_source",
    ]:
        op.drop_column("delivery_pipeline_details", column_name)

    for column_name in [
        "discharge_reference_source",
        "load_reference_source",
        "equipment_type_source",
        "asset_reference_source",
        "carrier_reference_source",
        "carrier_name_source",
        "incoterm_code_source",
        "destination_location_code_source",
        "origin_location_code_source",
    ]:
        op.drop_column("delivery_logistics_details", column_name)
