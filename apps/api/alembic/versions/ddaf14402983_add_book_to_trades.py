"""add book to trades"""

from alembic import op
import sqlalchemy as sa

revision = "ddaf14402983"
down_revision = "5ac2fa09417e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("book", sa.String(50), nullable=True))
    op.execute("UPDATE trades SET book = 'CRUDE_PHYS' WHERE book IS NULL")
    op.alter_column("trades", "book", nullable=False)
    op.create_index("ix_trades_book", "trades", ["book"])


def downgrade() -> None:
    op.drop_index("ix_trades_book", table_name="trades")
    op.drop_column("trades", "book")
