"""create reference assets

Revision ID: u8j9k0l1m2n3
Revises: t7i8j9k0l1m2
Create Date: 2026-04-25 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "u8j9k0l1m2n3"
down_revision: Union[str, Sequence[str], None] = "t7i8j9k0l1m2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reference_assets",
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("asset_class", sa.String(length=40), nullable=False),
        sa.Column("asset_type", sa.String(length=60), nullable=False),
        sa.Column("commodity_code", sa.String(length=50), nullable=True),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("capacity_value", sa.Float(), nullable=True),
        sa.Column("capacity_unit_code", sa.String(length=20), nullable=True),
        sa.Column("operator_name", sa.String(length=120), nullable=True),
        sa.Column("operating_status", sa.String(length=32), nullable=False),
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
    op.create_index("ix_reference_assets_asset_class", "reference_assets", ["asset_class"])
    op.create_index("ix_reference_assets_commodity_code", "reference_assets", ["commodity_code"])
    op.create_index("ix_reference_assets_location_code", "reference_assets", ["location_code"])


def downgrade() -> None:
    op.drop_index("ix_reference_assets_location_code", table_name="reference_assets")
    op.drop_index("ix_reference_assets_commodity_code", table_name="reference_assets")
    op.drop_index("ix_reference_assets_asset_class", table_name="reference_assets")
    op.drop_table("reference_assets")
