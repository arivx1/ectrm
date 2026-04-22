"""merge trade actualizations and confirmations

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7, c5d6e7f8a9b0
Create Date: 2026-04-07 22:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = ("c2d3e4f5a6b7", "c5d6e7f8a9b0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
