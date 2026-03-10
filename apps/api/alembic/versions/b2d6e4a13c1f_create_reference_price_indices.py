"""create reference price indices"""

from alembic import op
import sqlalchemy as sa

revision = "b2d6e4a13c1f"
down_revision = "f8b9c1d4e6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reference_price_indices",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("commodity_code", sa.String(length=50), nullable=False),
        sa.Column("currency_code", sa.String(length=20), nullable=False),
        sa.Column("unit_code", sa.String(length=20), nullable=False),
        sa.Column("provider", sa.String(length=120), nullable=False),
        sa.Column("market", sa.String(length=120), nullable=True),
        sa.Column("location_code", sa.String(length=50), nullable=True),
        sa.Column("calendar_code", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_reference_price_indices_name", "reference_price_indices", ["name"])
    op.create_index("ix_reference_price_indices_is_active", "reference_price_indices", ["is_active"])
    op.create_index(
        "ix_reference_price_indices_commodity_code",
        "reference_price_indices",
        ["commodity_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_reference_price_indices_commodity_code", table_name="reference_price_indices")
    op.drop_index("ix_reference_price_indices_is_active", table_name="reference_price_indices")
    op.drop_index("ix_reference_price_indices_name", table_name="reference_price_indices")
    op.drop_table("reference_price_indices")
