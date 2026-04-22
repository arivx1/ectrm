"""add agent daily token allocation

Revision ID: l1a2b3c4d5e6
Revises: k0f1a2b3c4d5
Create Date: 2026-04-21 18:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "l1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "k0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_agents",
        sa.Column("daily_token_allocation", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assistant_agents", "daily_token_allocation")
