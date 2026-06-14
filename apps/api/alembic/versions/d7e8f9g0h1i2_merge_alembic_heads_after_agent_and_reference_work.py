"""merge alembic heads after agent and reference work

Revision ID: d7e8f9g0h1i2
Revises: 04d3f5a6b7c9, b5c6d7e8f9g0, c6d7e8f9g0h1, v9k0l1m2n3o4
Create Date: 2026-05-01 09:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union


revision: str = "d7e8f9g0h1i2"
down_revision: Union[str, Sequence[str], None] = (
    "04d3f5a6b7c9",
    "b5c6d7e8f9g0",
    "c6d7e8f9g0h1",
    "v9k0l1m2n3o4",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
