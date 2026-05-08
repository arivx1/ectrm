"""add service clock to reference rail routes

Revision ID: s1t2u3v4w5x6
Revises: r7l8m9n0p1q2
Create Date: 2026-05-08 11:35:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str], None] = "r7l8m9n0p1q2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reference_rail_routes",
        sa.Column("service_calendar_code", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "reference_rail_routes",
        sa.Column("placement_cutoff_time_local", sa.String(length=5), nullable=True),
    )
    op.add_column(
        "reference_rail_routes",
        sa.Column("release_cutoff_time_local", sa.String(length=5), nullable=True),
    )
    op.add_column(
        "reference_rail_routes",
        sa.Column("placement_free_time_hours", sa.Integer(), nullable=True),
    )
    op.add_column(
        "reference_rail_routes",
        sa.Column("release_free_time_hours", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_reference_rail_routes_service_calendar_code",
        "reference_rail_routes",
        ["service_calendar_code"],
    )
    op.create_foreign_key(
        "fk_reference_rail_routes_service_calendar_code_reference_calendars",
        "reference_rail_routes",
        "reference_calendars",
        ["service_calendar_code"],
        ["code"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_reference_rail_routes_service_calendar_code_reference_calendars",
        "reference_rail_routes",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_reference_rail_routes_service_calendar_code",
        table_name="reference_rail_routes",
    )
    op.drop_column("reference_rail_routes", "release_free_time_hours")
    op.drop_column("reference_rail_routes", "placement_free_time_hours")
    op.drop_column("reference_rail_routes", "release_cutoff_time_local")
    op.drop_column("reference_rail_routes", "placement_cutoff_time_local")
    op.drop_column("reference_rail_routes", "service_calendar_code")
