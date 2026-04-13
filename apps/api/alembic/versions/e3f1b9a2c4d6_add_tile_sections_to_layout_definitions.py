"""add tile sections to layout definitions

Revision ID: e3f1b9a2c4d6
Revises: d2c4b6a8e0f1
Create Date: 2026-04-13 11:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f1b9a2c4d6"
down_revision: Union[str, Sequence[str], None] = "d2c4b6a8e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "layout_definitions",
        sa.Column("tile_sections", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("layout_definitions", "tile_sections")
