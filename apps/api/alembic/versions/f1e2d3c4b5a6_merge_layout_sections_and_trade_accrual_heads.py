"""merge layout sections and trade accrual heads

Revision ID: f1e2d3c4b5a6
Revises: e3f1b9a2c4d6, h7c8d9e0f1a2
Create Date: 2026-04-13 14:45:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = ("e3f1b9a2c4d6", "h7c8d9e0f1a2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
