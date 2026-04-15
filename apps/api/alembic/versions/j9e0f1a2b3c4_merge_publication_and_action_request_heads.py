"""merge publication and action request heads

Revision ID: j9e0f1a2b3c4
Revises: 2c3d4e5f6a7b, i8d9e0f1a2b3
Create Date: 2026-04-14 23:05:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "j9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = ("2c3d4e5f6a7b", "i8d9e0f1a2b3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
