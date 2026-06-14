"""create reference spatial features

Revision ID: b5c6d7e8f9g0
Revises: a4b5c6d7e8f9
Create Date: 2026-04-28 10:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5c6d7e8f9g0"
down_revision: Union[str, Sequence[str], None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reference_spatial_features",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("feature_kind", sa.String(length=32), nullable=False),
        sa.Column("geometry_type", sa.String(length=16), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=True),
        sa.Column("entity_code", sa.String(length=100), nullable=True),
        sa.Column("label_latitude", sa.Float(), nullable=True),
        sa.Column("label_longitude", sa.Float(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("geometry_geojson", sa.JSON(), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(
        "ix_reference_spatial_features_feature_kind",
        "reference_spatial_features",
        ["feature_kind"],
    )
    op.create_index(
        "ix_reference_spatial_features_geometry_type",
        "reference_spatial_features",
        ["geometry_type"],
    )
    op.create_index(
        "ix_reference_spatial_features_entity_type_entity_code",
        "reference_spatial_features",
        ["entity_type", "entity_code"],
    )
    op.create_index(
        "ix_reference_spatial_features_is_primary",
        "reference_spatial_features",
        ["is_primary"],
    )
    op.alter_column("reference_spatial_features", "is_primary", server_default=None)
    op.alter_column("reference_spatial_features", "is_active", server_default=None)
    op.alter_column("reference_spatial_features", "version", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_reference_spatial_features_is_primary",
        table_name="reference_spatial_features",
    )
    op.drop_index(
        "ix_reference_spatial_features_entity_type_entity_code",
        table_name="reference_spatial_features",
    )
    op.drop_index(
        "ix_reference_spatial_features_geometry_type",
        table_name="reference_spatial_features",
    )
    op.drop_index(
        "ix_reference_spatial_features_feature_kind",
        table_name="reference_spatial_features",
    )
    op.drop_table("reference_spatial_features")
