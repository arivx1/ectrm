"""add wiki page archival fields

Revision ID: b6c7d8e9f0g1
Revises: a5c6d7e8f9g0
Create Date: 2026-05-16 17:20:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6c7d8e9f0g1"
down_revision: Union[str, Sequence[str], None] = "a5c6d7e8f9g0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wiki_pages", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("wiki_pages", sa.Column("archived_by", sa.String(length=128), nullable=True))
    op.create_index("ix_wiki_pages_archived_at", "wiki_pages", ["archived_at"])


def downgrade() -> None:
    op.drop_index("ix_wiki_pages_archived_at", table_name="wiki_pages")
    op.drop_column("wiki_pages", "archived_by")
    op.drop_column("wiki_pages", "archived_at")
