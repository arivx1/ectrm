"""add trade nature structure and price terms"""

from alembic import op
import sqlalchemy as sa

revision = "e6f7a1c2d9b4"
down_revision = "d4b6b4f0cb1d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("trade_nature", sa.String(length=20), nullable=True))
    op.add_column("trades", sa.Column("trade_structure", sa.String(length=20), nullable=True))
    op.execute("UPDATE trades SET trade_nature = 'PHYSICAL' WHERE trade_nature IS NULL")
    op.execute("UPDATE trades SET trade_structure = 'SINGLE' WHERE trade_structure IS NULL")
    op.alter_column("trades", "trade_nature", nullable=False)
    op.alter_column("trades", "trade_structure", nullable=False)
    op.create_index("ix_trades_trade_nature", "trades", ["trade_nature"])
    op.create_index("ix_trades_trade_structure", "trades", ["trade_structure"])

    op.create_table(
        "trade_price_terms",
        sa.Column("trade_price_term_id", sa.String(length=36), primary_key=True),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("term_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("pricing_type", sa.String(length=20), nullable=False),
        sa.Column("fixed_price", sa.Numeric(18, 6), nullable=True),
        sa.Column("price_index_code", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trade_price_terms_trade_id", "trade_price_terms", ["trade_id"])
    op.create_index("ix_trade_price_terms_price_index_code", "trade_price_terms", ["price_index_code"])

    op.execute(
        """
        INSERT INTO trade_price_terms (
            trade_price_term_id,
            trade_id,
            term_no,
            pricing_type,
            fixed_price,
            price_index_code,
            created_at,
            updated_at
        )
        SELECT
            md5(trade_id || '-1'),
            trade_id,
            1,
            pricing_type,
            price,
            price_index_code,
            created_at,
            updated_at
        FROM trades
        """
    )


def downgrade() -> None:
    op.drop_index("ix_trade_price_terms_price_index_code", table_name="trade_price_terms")
    op.drop_index("ix_trade_price_terms_trade_id", table_name="trade_price_terms")
    op.drop_table("trade_price_terms")
    op.drop_index("ix_trades_trade_structure", table_name="trades")
    op.drop_index("ix_trades_trade_nature", table_name="trades")
    op.drop_column("trades", "trade_structure")
    op.drop_column("trades", "trade_nature")
