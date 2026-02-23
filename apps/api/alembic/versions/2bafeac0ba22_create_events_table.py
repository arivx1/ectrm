"""create events table

Revision ID: 2bafeac0ba22
Revises: 
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2bafeac0ba22"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("event_id", sa.String(36), primary_key=True),
        sa.Column("aggregate_type", sa.String(100), nullable=False),
        sa.Column("aggregate_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(200), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=True),
        sa.Column("correlation_id", sa.String(36), nullable=True),
        sa.Column("causation_id", sa.String(36), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_events_aggregate", "events", ["aggregate_type", "aggregate_id"])
    op.create_index("ix_events_type", "events", ["event_type"])
    op.create_index("ix_events_recorded_at", "events", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_events_recorded_at", table_name="events")
    op.drop_index("ix_events_type", table_name="events")
    op.drop_index("ix_events_aggregate", table_name="events")
    op.drop_table("events")
