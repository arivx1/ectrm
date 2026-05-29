"""add allowed transport modes to reference commodities

Revision ID: y4z5a6b7c8d9
Revises: 04d3f5a6b7c9, 4f6e7d8c9b10, 5e6f7a8b9c0d, 6f7a8b9c0d1e, a4b5c6d7e8fa, b5c6d7e8f9g0, b8c9d0e1f2a3, c1d2e3f4a5b6, c1d2e3f4a5c0, g1h2i3j4k5l6, h1i2j3k4l5m6, r8s9t0u1v2w3, s1t2u3v4w5x6, u1v2w3x4y5z6, v9k0l1m2n3o4, v9w0x1y2z3a4, x1y2z3a4b5c6
Create Date: 2026-05-14 11:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "y4z5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = (
    "04d3f5a6b7c9",
    "4f6e7d8c9b10",
    "5e6f7a8b9c0d",
    "6f7a8b9c0d1e",
    "a4b5c6d7e8fa",
    "b5c6d7e8f9g0",
    "b8c9d0e1f2a3",
    "c1d2e3f4a5b6",
    "c1d2e3f4a5c0",
    "g1h2i3j4k5l6",
    "h1i2j3k4l5m6",
    "r8s9t0u1v2w3",
    "s1t2u3v4w5x6",
    "u1v2w3x4y5z6",
    "v9k0l1m2n3o4",
    "v9w0x1y2z3a4",
    "x1y2z3a4b5c6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_columns = {
        column["name"]
        for column in sa.inspect(bind).get_columns("reference_commodities")
    }
    if "allowed_transport_modes" not in existing_columns:
        op.add_column(
            "reference_commodities",
            sa.Column(
                "allowed_transport_modes",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            ),
        )

    commodity_table = sa.table(
        "reference_commodities",
        sa.column("code", sa.String(length=50)),
        sa.column("commodity_class", sa.String(length=50)),
        sa.column("allowed_transport_modes", sa.JSON()),
    )

    by_code = {
        "POWER": ["POWER_GRID"],
        "REC": ["POWER_GRID"],
        "LNG": ["TRUCK", "RAIL", "BARGE", "VESSEL"],
    }
    by_class = {
        "POWER": ["POWER_GRID"],
        "NATURAL_GAS": ["PIPELINE"],
        "CRUDE_OIL": ["PIPELINE", "TRUCK", "RAIL", "BARGE", "VESSEL"],
        "REFINED_PRODUCTS": ["PIPELINE", "TRUCK", "RAIL", "BARGE", "VESSEL"],
        "NGL": ["PIPELINE", "TRUCK", "RAIL", "BARGE", "VESSEL"],
        "ENVIRONMENTAL": ["STORAGE"],
    }
    fallback = ["AIR", "TRUCK", "RAIL", "BARGE", "VESSEL", "STORAGE"]

    rows = bind.execute(
        sa.select(
            commodity_table.c.code,
            commodity_table.c.commodity_class,
        )
    ).all()
    for row in rows:
        allowed_transport_modes = by_code.get(row.code) or by_class.get(row.commodity_class) or fallback
        bind.execute(
            commodity_table.update()
            .where(commodity_table.c.code == row.code)
            .values(allowed_transport_modes=allowed_transport_modes)
        )


def downgrade() -> None:
    op.drop_column("reference_commodities", "allowed_transport_modes")
