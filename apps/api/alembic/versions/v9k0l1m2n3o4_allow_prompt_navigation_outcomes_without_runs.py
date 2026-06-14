"""allow prompt navigation outcomes without runs

Revision ID: v9k0l1m2n3o4
Revises: u8j9k0l1m2n3
Create Date: 2026-04-25 10:10:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "v9k0l1m2n3o4"
down_revision: Union[str, Sequence[str], None] = "u8j9k0l1m2n3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("assistant_prompt_navigation_outcomes") as batch_op:
        batch_op.alter_column("run_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("assistant_prompt_navigation_outcomes") as batch_op:
        batch_op.alter_column("run_id", existing_type=sa.Integer(), nullable=False)
