"""add rail route binding to delivery rail details

Revision ID: r8s9t0u1v2w3
Revises: r1a2i3l4d5e6
Create Date: 2026-05-08 10:10:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "r1a2i3l4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_rail_details",
        sa.Column("rail_route_code", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "delivery_rail_details",
        sa.Column(
            "rail_route_code_source",
            sa.String(length=32),
            nullable=False,
            server_default="SYSTEM_GENERATED",
        ),
    )
    op.create_index(
        "ix_delivery_rail_details_rail_route_code",
        "delivery_rail_details",
        ["rail_route_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_rail_details_rail_route_code",
        table_name="delivery_rail_details",
    )
    op.drop_column("delivery_rail_details", "rail_route_code_source")
    op.drop_column("delivery_rail_details", "rail_route_code")
