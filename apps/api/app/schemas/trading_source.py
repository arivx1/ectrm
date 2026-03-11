from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class TradingSourceOut(BaseModel):
    source_id: str
    source_name: str
    source_category: str
    dataset_name: str
    business_purpose: str
    asset_classes: str
    products_or_regions: str
    system_owner: str
    business_owner: str
    vendor_or_origin: str
    golden_source: str
    fallback_source: str
    update_frequency: str
    delivery_pattern: str
    latency_requirement: str
    retention_requirement: str
    storage_pattern: str
    schema_owner: str
    quality_checks: str
    reconciliation_method: str
    usage_scope: str
    criticality: str
    license_type: str
    license_restrictions: str
    entitlements_required: str
    cost_model: str
    sensitivity_class: str
    availability_slo: str
    incident_runbook: str
    monitoring_metrics: str
    lineage_notes: str
    last_reviewed_at: date
    status: str


class TradingSourceSeedRequest(BaseModel):
    requested_by: str = Field(..., min_length=1, max_length=128)
    replace_existing: bool = True


class TradingSourceSeedResult(BaseModel):
    total_rows: int
    created_count: int
    updated_count: int
    requested_by: str
