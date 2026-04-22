"""create reference data tables"""

from alembic import op
import sqlalchemy as sa

revision = "8df0f4f7c2ab"
down_revision = "ddaf14402983"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reference_books",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
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
    op.create_index("ix_reference_books_name", "reference_books", ["name"])
    op.create_index("ix_reference_books_is_active", "reference_books", ["is_active"])

    op.create_table(
        "reference_commodities",
        sa.Column("code", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
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
    op.create_index("ix_reference_commodities_name", "reference_commodities", ["name"])
    op.create_index("ix_reference_commodities_is_active", "reference_commodities", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_reference_commodities_is_active", table_name="reference_commodities")
    op.drop_index("ix_reference_commodities_name", table_name="reference_commodities")
    op.drop_table("reference_commodities")

    op.drop_index("ix_reference_books_is_active", table_name="reference_books")
    op.drop_index("ix_reference_books_name", table_name="reference_books")
    op.drop_table("reference_books")
