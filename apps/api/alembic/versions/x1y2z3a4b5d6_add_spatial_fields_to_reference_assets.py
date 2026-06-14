"""add spatial fields to reference assets

Revision ID: x1y2z3a4b5d6
Revises: w0x1y2z3a4b
Create Date: 2026-04-25 18:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "x1y2z3a4b5d6"
down_revision: Union[str, Sequence[str], None] = "w0x1y2z3a4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reference_assets", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("reference_assets", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("reference_assets", sa.Column("geometry_geojson", sa.JSON(), nullable=True))
    op.create_index(
        "ix_reference_assets_latitude_longitude",
        "reference_assets",
        ["latitude", "longitude"],
    )


def downgrade() -> None:
    op.drop_index("ix_reference_assets_latitude_longitude", table_name="reference_assets")
    op.drop_column("reference_assets", "geometry_geojson")
    op.drop_column("reference_assets", "longitude")
    op.drop_column("reference_assets", "latitude")
