"""create trading sources table"""

from alembic import op
import sqlalchemy as sa

revision = "b7e1c2d3f4a5"
down_revision = (
    "9f3c2d7a4b11",
    "c8f1d2e3a4b5",
    "f1a2b3c4d5e6",
    "f4a8d1c2b3e7",
    "a1c4e8d9f2b3",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trading_sources",
        sa.Column("source_id", sa.Text(), primary_key=True),
        sa.Column("source_name", sa.Text(), nullable=False),
        sa.Column("source_category", sa.Text(), nullable=False),
        sa.Column("dataset_name", sa.Text(), nullable=False),
        sa.Column("business_purpose", sa.Text(), nullable=False),
        sa.Column("asset_classes", sa.Text(), nullable=False),
        sa.Column("products_or_regions", sa.Text(), nullable=False),
        sa.Column("system_owner", sa.Text(), nullable=False),
        sa.Column("business_owner", sa.Text(), nullable=False),
        sa.Column("vendor_or_origin", sa.Text(), nullable=False),
        sa.Column("golden_source", sa.Text(), nullable=False),
        sa.Column("fallback_source", sa.Text(), nullable=False),
        sa.Column("update_frequency", sa.Text(), nullable=False),
        sa.Column("delivery_pattern", sa.Text(), nullable=False),
        sa.Column("latency_requirement", sa.Text(), nullable=False),
        sa.Column("retention_requirement", sa.Text(), nullable=False),
        sa.Column("storage_pattern", sa.Text(), nullable=False),
        sa.Column("schema_owner", sa.Text(), nullable=False),
        sa.Column("quality_checks", sa.Text(), nullable=False),
        sa.Column("reconciliation_method", sa.Text(), nullable=False),
        sa.Column("usage_scope", sa.Text(), nullable=False),
        sa.Column("criticality", sa.Text(), nullable=False),
        sa.Column("license_type", sa.Text(), nullable=False),
        sa.Column("license_restrictions", sa.Text(), nullable=False),
        sa.Column("entitlements_required", sa.Text(), nullable=False),
        sa.Column("cost_model", sa.Text(), nullable=False),
        sa.Column("sensitivity_class", sa.Text(), nullable=False),
        sa.Column("availability_slo", sa.Text(), nullable=False),
        sa.Column("incident_runbook", sa.Text(), nullable=False),
        sa.Column("monitoring_metrics", sa.Text(), nullable=False),
        sa.Column("lineage_notes", sa.Text(), nullable=False),
        sa.Column("last_reviewed_at", sa.Date(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
    )
    op.create_index("ix_trading_sources_source_category", "trading_sources", ["source_category"])
    op.create_index("ix_trading_sources_criticality", "trading_sources", ["criticality"])
    op.create_index("ix_trading_sources_status", "trading_sources", ["status"])


def downgrade() -> None:
    op.drop_index("ix_trading_sources_status", table_name="trading_sources")
    op.drop_index("ix_trading_sources_criticality", table_name="trading_sources")
    op.drop_index("ix_trading_sources_source_category", table_name="trading_sources")
    op.drop_table("trading_sources")
