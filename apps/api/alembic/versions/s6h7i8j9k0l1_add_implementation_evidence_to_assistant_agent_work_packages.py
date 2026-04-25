"""add implementation evidence to assistant agent work packages

Revision ID: s6h7i8j9k0l1
Revises: r5g6h7i8j9k0
Create Date: 2026-04-23 20:40:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "s6h7i8j9k0l1"
down_revision: Union[str, Sequence[str], None] = "r5g6h7i8j9k0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assistant_agent_work_packages",
        sa.Column("implementation_evidence", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "assistant_agent_work_packages",
        sa.Column("implemented_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assistant_agent_work_packages",
        sa.Column("implemented_by", sa.String(length=128), nullable=True),
    )
    op.alter_column("assistant_agent_work_packages", "implementation_evidence", server_default=None)


def downgrade() -> None:
    op.drop_column("assistant_agent_work_packages", "implemented_by")
    op.drop_column("assistant_agent_work_packages", "implemented_at")
    op.drop_column("assistant_agent_work_packages", "implementation_evidence")
