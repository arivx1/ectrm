"""add trade commercial term fields

Revision ID: 0f7e6d5c4b3a
Revises: fc2d3e4f5a6b
"""

from alembic import op
import sqlalchemy as sa

revision = "0f7e6d5c4b3a"
down_revision = "fc2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("trade_date", sa.Date(), nullable=True))
    op.add_column("trades", sa.Column("effective_start_date", sa.Date(), nullable=True))
    op.add_column("trades", sa.Column("effective_end_date", sa.Date(), nullable=True))
    op.add_column("trades", sa.Column("trade_currency_code", sa.String(length=20), nullable=True))
    op.add_column("trades", sa.Column("location_code", sa.String(length=50), nullable=True))
    op.add_column("trades", sa.Column("delivery_start", sa.Date(), nullable=True))
    op.add_column("trades", sa.Column("delivery_end", sa.Date(), nullable=True))
    op.add_column("trades", sa.Column("price_unit_code", sa.String(length=20), nullable=True))

    op.add_column("trade_legs", sa.Column("location_code", sa.String(length=50), nullable=True))
    op.add_column("trade_legs", sa.Column("quantity_unit_code", sa.String(length=20), nullable=True))
    op.add_column("trade_legs", sa.Column("delivery_start", sa.Date(), nullable=True))
    op.add_column("trade_legs", sa.Column("delivery_end", sa.Date(), nullable=True))

    op.add_column("trade_price_terms", sa.Column("currency_code", sa.String(length=20), nullable=True))
    op.add_column("trade_price_terms", sa.Column("price_unit_code", sa.String(length=20), nullable=True))

    op.execute(
        """
        UPDATE trades
        SET trade_date = COALESCE(
            DATE(execution_timestamp AT TIME ZONE 'UTC'),
            DATE(created_at AT TIME ZONE 'UTC')
        )
        WHERE trade_date IS NULL
        """
    )
    op.execute(
        """
        UPDATE trade_legs AS legs
        SET quantity_unit_code = trades.unit_of_measure
        FROM trades
        WHERE legs.trade_id = trades.trade_id
          AND legs.quantity_unit_code IS NULL
          AND trades.unit_of_measure IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("trade_price_terms", "price_unit_code")
    op.drop_column("trade_price_terms", "currency_code")

    op.drop_column("trade_legs", "delivery_end")
    op.drop_column("trade_legs", "delivery_start")
    op.drop_column("trade_legs", "quantity_unit_code")
    op.drop_column("trade_legs", "location_code")

    op.drop_column("trades", "price_unit_code")
    op.drop_column("trades", "delivery_end")
    op.drop_column("trades", "delivery_start")
    op.drop_column("trades", "location_code")
    op.drop_column("trades", "trade_currency_code")
    op.drop_column("trades", "effective_end_date")
    op.drop_column("trades", "effective_start_date")
    op.drop_column("trades", "trade_date")
