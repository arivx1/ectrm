"""create delivery rail details

Revision ID: r1a2i3l4d5e6
Revises: c6d7e8f9g0h1
Create Date: 2026-05-07 13:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r1a2i3l4d5e6"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9g0h1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_rail_details",
        sa.Column("delivery_id", sa.String(length=96), nullable=False),
        sa.Column("origin_station_code", sa.String(length=50), nullable=True),
        sa.Column("origin_station_code_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        sa.Column("destination_station_code", sa.String(length=50), nullable=True),
        sa.Column(
            "destination_station_code_source",
            sa.String(length=32),
            nullable=False,
            server_default="SYSTEM_GENERATED",
        ),
        sa.Column("waybill_reference", sa.String(length=120), nullable=True),
        sa.Column("waybill_reference_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        sa.Column("release_number", sa.String(length=120), nullable=True),
        sa.Column("release_number_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        sa.Column("unit_train_id", sa.String(length=120), nullable=True),
        sa.Column("unit_train_id_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        sa.Column("railcar_count", sa.Integer(), nullable=True),
        sa.Column("railcar_count_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["delivery_id"], ["delivery_obligations.delivery_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_index(
        "ix_delivery_rail_details_waybill_reference",
        "delivery_rail_details",
        ["waybill_reference"],
        unique=False,
    )
    op.create_index(
        "ix_delivery_rail_details_unit_train_id",
        "delivery_rail_details",
        ["unit_train_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_rail_details_unit_train_id", table_name="delivery_rail_details")
    op.drop_index("ix_delivery_rail_details_waybill_reference", table_name="delivery_rail_details")
    op.drop_table("delivery_rail_details")
