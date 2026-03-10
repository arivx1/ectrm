"""add trade side and trade legs"""

from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e6f7a1c2d9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("trade_side", sa.String(length=20), nullable=True))
    op.create_index("ix_trades_trade_side", "trades", ["trade_side"])

    op.execute(
        """
        UPDATE trades
        SET trade_side = 'BUY'
        WHERE trade_structure = 'SINGLE' AND trade_side IS NULL
        """
    )

    op.create_table(
        "trade_legs",
        sa.Column("trade_leg_id", sa.String(length=36), primary_key=True),
        sa.Column("trade_id", sa.String(length=64), nullable=False),
        sa.Column("leg_no", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(length=20), nullable=False),
        sa.Column("commodity_class", sa.String(length=50), nullable=False),
        sa.Column("commodity_code", sa.String(length=50), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trade_legs_trade_id", "trade_legs", ["trade_id"])
    op.create_index("ix_trade_legs_trade_leg_no", "trade_legs", ["trade_id", "leg_no"], unique=True)

    op.execute(
        """
        INSERT INTO trade_legs (
            trade_leg_id,
            trade_id,
            leg_no,
            side,
            commodity_class,
            commodity_code,
            quantity,
            created_at,
            updated_at
        )
        SELECT
            md5(trade_id || '-leg-1'),
            trade_id,
            1,
            COALESCE(trade_side, 'BUY'),
            commodity_class,
            commodity,
            volume,
            created_at,
            updated_at
        FROM trades
        WHERE trade_structure = 'SINGLE'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_trade_legs_trade_leg_no", table_name="trade_legs")
    op.drop_index("ix_trade_legs_trade_id", table_name="trade_legs")
    op.drop_table("trade_legs")
    op.drop_index("ix_trades_trade_side", table_name="trades")
    op.drop_column("trades", "trade_side")
