"""create reference currency, unit, and location tables

Revision ID: a7c9e1f4b2d3
Revises: 9f3c2d7a4b11, f1a2b3c4d5e6
"""

from alembic import op
import sqlalchemy as sa

revision = "a7c9e1f4b2d3"
down_revision = ("9f3c2d7a4b11", "f1a2b3c4d5e6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reference_currencies",
        sa.Column("code", sa.String(length=20), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_currencies_name", "reference_currencies", ["name"])
    op.create_index("ix_reference_currencies_is_active", "reference_currencies", ["is_active"])

    op.create_table(
        "reference_units",
        sa.Column("code", sa.String(length=20), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("commodity_class", sa.String(length=50), nullable=True),
        sa.Column("dimension", sa.String(length=30), nullable=False),
        sa.Column("base_unit_code", sa.String(length=20), nullable=True),
        sa.Column("conversion_factor", sa.Numeric(18, 8), nullable=True),
        sa.Column("precision", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_units_name", "reference_units", ["name"])
    op.create_index("ix_reference_units_is_active", "reference_units", ["is_active"])
    op.create_index("ix_reference_units_dimension", "reference_units", ["dimension"])

    op.create_table(
        "reference_locations",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("location_type", sa.String(length=50), nullable=False),
        sa.Column("market", sa.String(length=80), nullable=True),
        sa.Column("country_code", sa.String(length=10), nullable=True),
        sa.Column("region", sa.String(length=80), nullable=True),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_locations_name", "reference_locations", ["name"])
    op.create_index("ix_reference_locations_is_active", "reference_locations", ["is_active"])
    op.create_index("ix_reference_locations_market", "reference_locations", ["market"])


def downgrade() -> None:
    op.drop_index("ix_reference_locations_market", table_name="reference_locations")
    op.drop_index("ix_reference_locations_is_active", table_name="reference_locations")
    op.drop_index("ix_reference_locations_name", table_name="reference_locations")
    op.drop_table("reference_locations")

    op.drop_index("ix_reference_units_dimension", table_name="reference_units")
    op.drop_index("ix_reference_units_is_active", table_name="reference_units")
    op.drop_index("ix_reference_units_name", table_name="reference_units")
    op.drop_table("reference_units")

    op.drop_index("ix_reference_currencies_is_active", table_name="reference_currencies")
    op.drop_index("ix_reference_currencies_name", table_name="reference_currencies")
    op.drop_table("reference_currencies")
