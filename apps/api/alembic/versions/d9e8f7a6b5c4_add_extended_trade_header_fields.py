"""add extended trade header fields

Revision ID: d9e8f7a6b5c4
Revises: c4d5e6f7a8b9
"""

from alembic import op
import sqlalchemy as sa

revision = "d9e8f7a6b5c4"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("external_trade_id", sa.String(length=128), nullable=True))
    op.add_column("trades", sa.Column("source_system", sa.String(length=120), nullable=True))
    op.add_column("trades", sa.Column("execution_timestamp", sa.DateTime(timezone=True), nullable=True))
    op.add_column("trades", sa.Column("portfolio", sa.String(length=50), nullable=True))
    op.add_column("trades", sa.Column("counterparty", sa.String(length=50), nullable=True))
    op.add_column(
        "trades",
        sa.Column(
            "pricing_status",
            sa.String(length=30),
            nullable=False,
            server_default="PENDING",
        ),
    )
    op.add_column(
        "trades",
        sa.Column(
            "settlement_status",
            sa.String(length=30),
            nullable=False,
            server_default="PENDING",
        ),
    )
    op.add_column("trades", sa.Column("trader_user", sa.String(length=128), nullable=True))

    op.execute("UPDATE trades SET pricing_status = 'PENDING' WHERE pricing_status IS NULL")
    op.execute("UPDATE trades SET settlement_status = 'PENDING' WHERE settlement_status IS NULL")

    op.alter_column("trades", "pricing_status", server_default=None)
    op.alter_column("trades", "settlement_status", server_default=None)


def downgrade() -> None:
    op.drop_column("trades", "trader_user")
    op.drop_column("trades", "settlement_status")
    op.drop_column("trades", "pricing_status")
    op.drop_column("trades", "counterparty")
    op.drop_column("trades", "portfolio")
    op.drop_column("trades", "execution_timestamp")
    op.drop_column("trades", "source_system")
    op.drop_column("trades", "external_trade_id")
