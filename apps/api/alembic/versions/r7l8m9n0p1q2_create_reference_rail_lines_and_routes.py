"""create reference rail lines and routes

Revision ID: r7l8m9n0p1q2
Revises: y2z3a4b5c6d7
Create Date: 2026-05-07 15:05:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r7l8m9n0p1q2"
down_revision: Union[str, Sequence[str], None] = "y2z3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reference_rail_lines",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("railroad_code", sa.String(length=30), nullable=False),
        sa.Column("operator_name", sa.String(length=120), nullable=True),
        sa.Column("default_timezone", sa.String(length=60), nullable=True),
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
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(
        "ix_reference_rail_lines_railroad_code",
        "reference_rail_lines",
        ["railroad_code"],
    )

    op.create_table(
        "reference_rail_routes",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("rail_line_code", sa.String(length=100), nullable=False),
        sa.Column("origin_location_code", sa.String(length=50), nullable=True),
        sa.Column("destination_location_code", sa.String(length=50), nullable=True),
        sa.Column("route_direction", sa.String(length=20), nullable=False),
        sa.Column("schedule_timezone", sa.String(length=60), nullable=True),
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
        sa.ForeignKeyConstraint(["destination_location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["origin_location_code"], ["reference_locations.code"]),
        sa.ForeignKeyConstraint(["rail_line_code"], ["reference_rail_lines.code"]),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(
        "ix_reference_rail_routes_rail_line_code",
        "reference_rail_routes",
        ["rail_line_code"],
    )
    op.create_index(
        "ix_reference_rail_routes_origin_location_code",
        "reference_rail_routes",
        ["origin_location_code"],
    )
    op.create_index(
        "ix_reference_rail_routes_destination_location_code",
        "reference_rail_routes",
        ["destination_location_code"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reference_rail_routes_destination_location_code",
        table_name="reference_rail_routes",
    )
    op.drop_index(
        "ix_reference_rail_routes_origin_location_code",
        table_name="reference_rail_routes",
    )
    op.drop_index(
        "ix_reference_rail_routes_rail_line_code",
        table_name="reference_rail_routes",
    )
    op.drop_table("reference_rail_routes")

    op.drop_index(
        "ix_reference_rail_lines_railroad_code",
        table_name="reference_rail_lines",
    )
    op.drop_table("reference_rail_lines")
