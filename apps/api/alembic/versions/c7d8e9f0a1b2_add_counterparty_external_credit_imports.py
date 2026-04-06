"""add counterparty external credit imports

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
"""

from alembic import op
import sqlalchemy as sa

revision = "c7d8e9f0a1b2"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reference_counterparties", sa.Column("lei_code", sa.String(length=20), nullable=True))
    op.add_column("reference_counterparties", sa.Column("duns_number", sa.String(length=20), nullable=True))
    op.add_column("reference_counterparties", sa.Column("ticker_symbol", sa.String(length=32), nullable=True))

    op.create_table(
        "counterparty_external_credit_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("counterparty_code", sa.String(length=50), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("source_entity_id", sa.String(length=120), nullable=True),
        sa.Column("source_entity_name", sa.String(length=200), nullable=True),
        sa.Column("match_basis", sa.String(length=50), nullable=True),
        sa.Column("matched_identifier_value", sa.String(length=120), nullable=True),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("rating_scale", sa.String(length=80), nullable=True),
        sa.Column("rating_value", sa.String(length=80), nullable=True),
        sa.Column("rating_outlook", sa.String(length=80), nullable=True),
        sa.Column("credit_score", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("probability_of_default", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("recommended_limit_currency_code", sa.String(length=20), nullable=True),
        sa.Column("recommended_limit_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("commentary", sa.Text(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["counterparty_code"], ["reference_counterparties.code"]),
        sa.ForeignKeyConstraint(["run_id"], ["external_data_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "counterparty_code",
            "provider",
            "as_of_date",
            name="uq_counterparty_external_credit_snapshot",
        ),
    )


def downgrade() -> None:
    op.drop_table("counterparty_external_credit_snapshots")
    op.drop_column("reference_counterparties", "ticker_symbol")
    op.drop_column("reference_counterparties", "duns_number")
    op.drop_column("reference_counterparties", "lei_code")
