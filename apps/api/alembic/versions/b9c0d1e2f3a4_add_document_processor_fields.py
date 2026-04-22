"""add document processor fields

Revision ID: b9c0d1e2f3a4
Revises: ab1c2d3e4f5a
Create Date: 2026-04-14 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "ab1c2d3e4f5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_ingestions", sa.Column("processor_provider", sa.String(length=32), nullable=True))
    op.add_column("document_ingestions", sa.Column("processor_model", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("document_ingestions", "processor_model")
    op.drop_column("document_ingestions", "processor_provider")
