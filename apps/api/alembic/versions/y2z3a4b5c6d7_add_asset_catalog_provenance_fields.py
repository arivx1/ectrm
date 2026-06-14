"""add asset catalog provenance fields

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5d6
Create Date: 2026-04-27 10:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "y2z3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "x1y2z3a4b5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "reference_assets",
        "code",
        existing_type=sa.String(length=50),
        type_=sa.String(length=100),
        existing_nullable=False,
    )
    op.add_column("reference_assets", sa.Column("source_name", sa.String(length=255), nullable=True))
    op.add_column("reference_assets", sa.Column("source_url", sa.Text(), nullable=True))
    op.add_column("reference_assets", sa.Column("confidence", sa.Float(), nullable=True))
    op.add_column("reference_assets", sa.Column("notes", sa.Text(), nullable=True))
    op.create_index("ix_reference_assets_source_name", "reference_assets", ["source_name"])


def downgrade() -> None:
    op.drop_index("ix_reference_assets_source_name", table_name="reference_assets")
    op.drop_column("reference_assets", "notes")
    op.drop_column("reference_assets", "confidence")
    op.drop_column("reference_assets", "source_url")
    op.drop_column("reference_assets", "source_name")
    op.alter_column(
        "reference_assets",
        "code",
        existing_type=sa.String(length=100),
        type_=sa.String(length=50),
        existing_nullable=False,
    )
