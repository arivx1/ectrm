"""merge backfill and publication heads

Revision ID: k0f1a2b3c4d5
Revises: f9a0b1c2d3e5, j9e0f1a2b3c4
Create Date: 2026-04-14 23:12:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "k0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = ("f9a0b1c2d3e5", "j9e0f1a2b3c4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
