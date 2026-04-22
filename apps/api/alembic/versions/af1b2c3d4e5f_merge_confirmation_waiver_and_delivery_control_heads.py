"""merge confirmation waiver and delivery control heads

Revision ID: af1b2c3d4e5f
Revises: 9c8b7a6d5e4f, e8f9a0b1c2d3
Create Date: 2026-04-08 10:25:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "af1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = ("9c8b7a6d5e4f", "e8f9a0b1c2d3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
