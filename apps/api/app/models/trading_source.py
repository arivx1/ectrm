from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradingSource(Base):
    __tablename__ = "trading_sources"

    source_id: Mapped[str] = mapped_column(Text, primary_key=True)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    source_category: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_name: Mapped[str] = mapped_column(Text, nullable=False)
    business_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    asset_classes: Mapped[str] = mapped_column(Text, nullable=False)
    products_or_regions: Mapped[str] = mapped_column(Text, nullable=False)
    system_owner: Mapped[str] = mapped_column(Text, nullable=False)
    business_owner: Mapped[str] = mapped_column(Text, nullable=False)
    vendor_or_origin: Mapped[str] = mapped_column(Text, nullable=False)
    golden_source: Mapped[str] = mapped_column(Text, nullable=False)
    fallback_source: Mapped[str] = mapped_column(Text, nullable=False)
    update_frequency: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_pattern: Mapped[str] = mapped_column(Text, nullable=False)
    latency_requirement: Mapped[str] = mapped_column(Text, nullable=False)
    retention_requirement: Mapped[str] = mapped_column(Text, nullable=False)
    storage_pattern: Mapped[str] = mapped_column(Text, nullable=False)
    schema_owner: Mapped[str] = mapped_column(Text, nullable=False)
    quality_checks: Mapped[str] = mapped_column(Text, nullable=False)
    reconciliation_method: Mapped[str] = mapped_column(Text, nullable=False)
    usage_scope: Mapped[str] = mapped_column(Text, nullable=False)
    criticality: Mapped[str] = mapped_column(Text, nullable=False)
    license_type: Mapped[str] = mapped_column(Text, nullable=False)
    license_restrictions: Mapped[str] = mapped_column(Text, nullable=False)
    entitlements_required: Mapped[str] = mapped_column(Text, nullable=False)
    cost_model: Mapped[str] = mapped_column(Text, nullable=False)
    sensitivity_class: Mapped[str] = mapped_column(Text, nullable=False)
    availability_slo: Mapped[str] = mapped_column(Text, nullable=False)
    incident_runbook: Mapped[str] = mapped_column(Text, nullable=False)
    monitoring_metrics: Mapped[str] = mapped_column(Text, nullable=False)
    lineage_notes: Mapped[str] = mapped_column(Text, nullable=False)
    last_reviewed_at: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
