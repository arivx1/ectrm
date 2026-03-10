"""create trades projection table

Revision ID: 01ffa97f68d1
Revises: 2bafeac0ba22
"""
from alembic import op
import sqlalchemy as sa

revision = "01ffa97f68d1"
down_revision = "2bafeac0ba22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trades",
        sa.Column("trade_id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("commodity", sa.String(50), nullable=False),
        sa.Column("price", sa.Numeric(18, 6), nullable=True),
        sa.Column("volume", sa.Numeric(18, 6), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        sa.Column("last_event_id", sa.String(36), nullable=False),
    )
    op.create_index("ix_trades_commodity", "trades", ["commodity"])


def downgrade() -> None:
    op.drop_index("ix_trades_commodity", table_name="trades")
    op.drop_table("trades")
