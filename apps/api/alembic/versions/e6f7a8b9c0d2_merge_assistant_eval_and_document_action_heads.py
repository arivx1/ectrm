"""merge assistant eval and document action heads

Revision ID: e6f7a8b9c0d2
Revises: 1b2c3d4e5f6a, e5f6a7b8c9d1
Create Date: 2026-04-14 21:45:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "e6f7a8b9c0d2"
down_revision: Union[str, Sequence[str], None] = ("1b2c3d4e5f6a", "e5f6a7b8c9d1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
