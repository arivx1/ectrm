"""create counterparty credit profiles

Revision ID: b6c7d8e9f0a1
Revises: a4d9e2f1b6c7
"""

from alembic import op
import sqlalchemy as sa

revision = "b6c7d8e9f0a1"
down_revision = "a4d9e2f1b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "counterparty_credit_profiles",
        sa.Column("counterparty_code", sa.String(length=50), sa.ForeignKey("reference_counterparties.code"), nullable=False),
        sa.Column("credit_rating", sa.String(length=80), nullable=True),
        sa.Column("review_due_at", sa.Date(), nullable=True),
        sa.Column("limit_currency_code", sa.String(length=20), nullable=True),
        sa.Column("limit_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("breach_action", sa.String(length=50), nullable=False, server_default="REQUIRE_APPROVAL"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("counterparty_code"),
    )


def downgrade() -> None:
    op.drop_table("counterparty_credit_profiles")
