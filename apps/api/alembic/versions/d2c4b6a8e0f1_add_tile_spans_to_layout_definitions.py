"""add tile spans to layout definitions

Revision ID: d2c4b6a8e0f1
Revises: c2d3e4f5a6b7
Create Date: 2026-04-05 13:05:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2c4b6a8e0f1"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "layout_definitions",
        sa.Column("tile_spans", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("layout_definitions", "tile_spans")
