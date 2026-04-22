"""add trade quality spec and unit

Revision ID: a9b8c7d6e5f4
Revises: f6a7b8c9d0e1
Create Date: 2026-03-27 17:15:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("quality_spec", sa.String(length=255), nullable=True))
    op.add_column("trades", sa.Column("unit_of_measure", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("trades", "unit_of_measure")
    op.drop_column("trades", "quality_spec")
