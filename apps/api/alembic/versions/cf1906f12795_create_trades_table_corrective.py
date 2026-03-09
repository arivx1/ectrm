"""create trades table corrective"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "cf1906f12795"
down_revision = "01ffa97f68d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS trades (
        trade_id VARCHAR(64) PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        commodity VARCHAR(50) NOT NULL,
        price NUMERIC(18, 6),
        volume NUMERIC(18, 6),
        status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        last_event_id VARCHAR(36) NOT NULL
    )
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS ix_trades_commodity ON trades (commodity)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_trades_commodity")
    op.execute("DROP TABLE IF EXISTS trades")
