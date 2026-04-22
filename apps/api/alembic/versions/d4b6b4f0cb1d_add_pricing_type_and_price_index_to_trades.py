"""add pricing type and price index to trades"""

from alembic import op
import sqlalchemy as sa

revision = "d4b6b4f0cb1d"
down_revision = "b2d6e4a13c1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("pricing_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "trades",
        sa.Column("price_index_code", sa.String(length=50), nullable=True),
    )
    op.execute("UPDATE trades SET pricing_type = 'FIXED' WHERE pricing_type IS NULL")
    op.alter_column("trades", "pricing_type", nullable=False)
    op.create_index("ix_trades_pricing_type", "trades", ["pricing_type"])
    op.create_index("ix_trades_price_index_code", "trades", ["price_index_code"])


def downgrade() -> None:
    op.drop_index("ix_trades_price_index_code", table_name="trades")
    op.drop_index("ix_trades_pricing_type", table_name="trades")
    op.drop_column("trades", "price_index_code")
    op.drop_column("trades", "pricing_type")
