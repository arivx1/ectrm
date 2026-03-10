"""create positions table"""

from alembic import op
import sqlalchemy as sa

revision = "5ac2fa09417e"
down_revision = "cf1906f12795"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "positions",
        sa.Column("commodity", sa.String(50), primary_key=True),
        sa.Column("net_volume", sa.Numeric(18, 6), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS positions")
