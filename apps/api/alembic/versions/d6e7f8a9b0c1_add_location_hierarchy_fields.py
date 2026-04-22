"""add location hierarchy fields

Revision ID: d6e7f8a9b0c1
Revises: b4c5d6e7f8a9, d2c4b6a8e0f1
"""

from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = ("b4c5d6e7f8a9", "d2c4b6a8e0f1")
branch_labels = None
depends_on = None


LOCATION_BACKFILLS = [
    {
        "code": "CUSHING",
        "parent_location_code": "PADD2",
        "location_kind": "POINT",
        "city": "Cushing",
        "subdivision_code": "US-OK",
        "continent_code": "NA",
        "latitude": 35.9853,
        "longitude": -96.7528,
    },
    {
        "code": "MIDLAND",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Midland",
        "subdivision_code": "US-TX",
        "continent_code": "NA",
        "latitude": 31.9974,
        "longitude": -102.0779,
    },
    {
        "code": "HOUSTON_SHIP_CHANNEL",
        "parent_location_code": "USGC",
        "location_kind": "POINT",
        "city": "Houston",
        "subdivision_code": "US-TX",
        "continent_code": "NA",
        "latitude": 29.7285,
        "longitude": -95.265,
    },
    {
        "code": "USGC",
        "parent_location_code": None,
        "location_kind": "REGION",
        "city": "New Orleans",
        "subdivision_code": "US-LA",
        "continent_code": "NA",
        "latitude": 29.9511,
        "longitude": -90.0715,
    },
    {
        "code": "PADD2",
        "parent_location_code": None,
        "location_kind": "REGION",
        "city": "Des Moines",
        "subdivision_code": "US-IA",
        "continent_code": "NA",
        "latitude": 41.5868,
        "longitude": -93.625,
    },
    {
        "code": "NYH",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "New York",
        "subdivision_code": "US-NY",
        "continent_code": "NA",
        "latitude": 40.684,
        "longitude": -74.0062,
    },
    {
        "code": "ARA",
        "parent_location_code": None,
        "location_kind": "REGION",
        "city": "Rotterdam",
        "subdivision_code": "NL-ZH",
        "continent_code": "EU",
        "latitude": 51.9244,
        "longitude": 4.4777,
    },
    {
        "code": "HENRY_HUB",
        "parent_location_code": "USGC",
        "location_kind": "POINT",
        "city": "Erath",
        "subdivision_code": "US-LA",
        "continent_code": "NA",
        "latitude": 29.9589,
        "longitude": -92.0332,
    },
    {
        "code": "WAHA",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Waha",
        "subdivision_code": "US-TX",
        "continent_code": "NA",
        "latitude": 31.9493,
        "longitude": -103.6652,
    },
    {
        "code": "AECO",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Calgary",
        "subdivision_code": "CA-AB",
        "continent_code": "NA",
        "latitude": 51.0447,
        "longitude": -114.0719,
    },
    {
        "code": "DAWN",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Dawn-Euphemia",
        "subdivision_code": "CA-ON",
        "continent_code": "NA",
        "latitude": 42.7245,
        "longitude": -81.9055,
    },
    {
        "code": "PJM_WEST",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Pittsburgh",
        "subdivision_code": "US-PA",
        "continent_code": "NA",
        "latitude": 40.4406,
        "longitude": -79.9959,
    },
    {
        "code": "ERCOT_NORTH",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Dallas",
        "subdivision_code": "US-TX",
        "continent_code": "NA",
        "latitude": 32.7767,
        "longitude": -96.797,
    },
    {
        "code": "SP15",
        "parent_location_code": None,
        "location_kind": "POINT",
        "city": "Los Angeles",
        "subdivision_code": "US-CA",
        "continent_code": "NA",
        "latitude": 34.0522,
        "longitude": -118.2437,
    },
]


def upgrade() -> None:
    op.add_column(
        "reference_locations",
        sa.Column("parent_location_code", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "reference_locations",
        sa.Column("location_kind", sa.String(length=20), nullable=False, server_default="POINT"),
    )
    op.add_column(
        "reference_locations",
        sa.Column("city", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "reference_locations",
        sa.Column("subdivision_code", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "reference_locations",
        sa.Column("continent_code", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "reference_locations",
        sa.Column("latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "reference_locations",
        sa.Column("longitude", sa.Float(), nullable=True),
    )

    op.create_index(
        "ix_reference_locations_parent_location_code",
        "reference_locations",
        ["parent_location_code"],
    )
    op.create_foreign_key(
        "fk_reference_locations_parent_location_code",
        "reference_locations",
        "reference_locations",
        ["parent_location_code"],
        ["code"],
    )

    reference_locations = sa.table(
        "reference_locations",
        sa.column("code", sa.String()),
        sa.column("location_type", sa.String()),
        sa.column("parent_location_code", sa.String()),
        sa.column("location_kind", sa.String()),
        sa.column("city", sa.String()),
        sa.column("subdivision_code", sa.String()),
        sa.column("continent_code", sa.String()),
        sa.column("latitude", sa.Float()),
        sa.column("longitude", sa.Float()),
    )

    op.execute(
        reference_locations.update().values(
            location_kind=sa.case(
                (
                    sa.func.upper(reference_locations.c.location_type) == "REGION",
                    "REGION",
                ),
                else_="POINT",
            )
        )
    )
    for row in LOCATION_BACKFILLS:
        code = row["code"]
        values = {key: value for key, value in row.items() if key != "code"}
        op.execute(
            reference_locations.update()
            .where(reference_locations.c.code == code)
            .values(**values)
        )

    op.alter_column("reference_locations", "location_kind", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        "fk_reference_locations_parent_location_code",
        "reference_locations",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_reference_locations_parent_location_code",
        table_name="reference_locations",
    )
    op.drop_column("reference_locations", "longitude")
    op.drop_column("reference_locations", "latitude")
    op.drop_column("reference_locations", "continent_code")
    op.drop_column("reference_locations", "subdivision_code")
    op.drop_column("reference_locations", "city")
    op.drop_column("reference_locations", "location_kind")
    op.drop_column("reference_locations", "parent_location_code")
