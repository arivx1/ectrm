"""add movement correction fields

Revision ID: c6d7e8f9g0h1
Revises: a4b5c6d7e8f9
Create Date: 2026-04-29 17:45:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c6d7e8f9g0h1"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("delivery_events", sa.Column("reversal_of_event_id", sa.Integer(), nullable=True))
    op.add_column("delivery_events", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.create_index(
        "ix_delivery_events_reversal_of_event_id",
        "delivery_events",
        ["reversal_of_event_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_delivery_events_reversal_of_event_id_delivery_events",
        "delivery_events",
        "delivery_events",
        ["reversal_of_event_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("trade_actualizations", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("trade_actualizations", sa.Column("voided_by", sa.String(length=128), nullable=True))
    op.add_column("trade_actualizations", sa.Column("void_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("trade_actualizations", "void_reason")
    op.drop_column("trade_actualizations", "voided_by")
    op.drop_column("trade_actualizations", "voided_at")

    op.drop_constraint(
        "fk_delivery_events_reversal_of_event_id_delivery_events",
        "delivery_events",
        type_="foreignkey",
    )
    op.drop_index("ix_delivery_events_reversal_of_event_id", table_name="delivery_events")
    op.drop_column("delivery_events", "reversal_reason")
    op.drop_column("delivery_events", "reversal_of_event_id")
