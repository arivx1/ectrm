"""add delivery control fields

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-04-08 08:05:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_obligations",
        sa.Column("book_source", sa.String(length=32), nullable=False, server_default="TRADE_DERIVED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("portfolio_source", sa.String(length=32), nullable=False, server_default="TRADE_DERIVED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("counterparty_source", sa.String(length=32), nullable=False, server_default="TRADE_DERIVED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("location_source", sa.String(length=32), nullable=False, server_default="TRADE_DERIVED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("delivery_window_source", sa.String(length=32), nullable=False, server_default="TRADE_DERIVED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("execution_status", sa.String(length=32), nullable=False, server_default="PLANNED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("execution_status_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("operations_owner", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("operations_owner_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("external_reference", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("external_reference_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("ops_notes", sa.String(length=2000), nullable=True),
    )
    op.add_column(
        "delivery_obligations",
        sa.Column("ops_notes_source", sa.String(length=32), nullable=False, server_default="SYSTEM_GENERATED"),
    )


def downgrade() -> None:
    op.drop_column("delivery_obligations", "ops_notes_source")
    op.drop_column("delivery_obligations", "ops_notes")
    op.drop_column("delivery_obligations", "external_reference_source")
    op.drop_column("delivery_obligations", "external_reference")
    op.drop_column("delivery_obligations", "operations_owner_source")
    op.drop_column("delivery_obligations", "operations_owner")
    op.drop_column("delivery_obligations", "execution_status_source")
    op.drop_column("delivery_obligations", "execution_status")
    op.drop_column("delivery_obligations", "delivery_window_source")
    op.drop_column("delivery_obligations", "location_source")
    op.drop_column("delivery_obligations", "counterparty_source")
    op.drop_column("delivery_obligations", "portfolio_source")
    op.drop_column("delivery_obligations", "book_source")
