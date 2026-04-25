"""add asset reality to reference assets

Revision ID: v9w0x1y2z3a4
Revises: u8j9k0l1m2n3
Create Date: 2026-04-25 15:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "v9w0x1y2z3a4"
down_revision: Union[str, Sequence[str], None] = "u8j9k0l1m2n3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reference_assets",
        sa.Column(
            "asset_reality",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'REAL'"),
        ),
    )
    op.create_index("ix_reference_assets_asset_reality", "reference_assets", ["asset_reality"])


def downgrade() -> None:
    op.drop_index("ix_reference_assets_asset_reality", table_name="reference_assets")
    op.drop_column("reference_assets", "asset_reality")
