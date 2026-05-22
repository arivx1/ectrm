"""merge market document persona branch heads

Revision ID: n0p1q2r3s4t5
Revises: d4e5f6a7b8c0, d9e0f1a2b3c4, f2a3b4c5d6e7, m9n0p1q2r3s4, p9q0r1s2t3u4, z9b0c1d2e3f4
Create Date: 2026-05-22 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union


revision: str = "n0p1q2r3s4t5"
down_revision: Union[str, Sequence[str], None] = (
    "d4e5f6a7b8c0",
    "d9e0f1a2b3c4",
    "f2a3b4c5d6e7",
    "m9n0p1q2r3s4",
    "p9q0r1s2t3u4",
    "z9b0c1d2e3f4",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
