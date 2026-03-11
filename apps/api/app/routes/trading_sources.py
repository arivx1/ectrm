from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.admin.services.trading_sources import (
    list_trading_sources,
    seed_trading_sources_from_csv,
)
from apps.api.app.models.trading_source import TradingSource
from apps.api.app.schemas.trading_source import (
    TradingSourceOut,
    TradingSourceSeedRequest,
    TradingSourceSeedResult,
)

admin_router = APIRouter(prefix="/admin/trading-sources", tags=["trading-sources-admin"])


@admin_router.get("", response_model=List[TradingSourceOut])
def list_admin_trading_sources(
    q: Optional[str] = None,
    source_category: Optional[str] = None,
    criticality: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[TradingSourceOut]:
    rows = list_trading_sources(
        db,
        q=q,
        source_category=source_category,
        criticality=criticality,
        status=status,
        limit=limit,
        offset=offset,
    )
    return [_to_out(row) for row in rows]


@admin_router.post("/seed", response_model=TradingSourceSeedResult)
def seed_admin_trading_sources(
    payload: TradingSourceSeedRequest,
    db: Session = Depends(get_db),
) -> TradingSourceSeedResult:
    summary = seed_trading_sources_from_csv(
        db,
        replace_existing=payload.replace_existing,
    )
    return TradingSourceSeedResult(
        total_rows=summary.total_rows,
        created_count=summary.created_count,
        updated_count=summary.updated_count,
        requested_by=payload.requested_by,
    )


def _to_out(row: TradingSource) -> TradingSourceOut:
    return TradingSourceOut(
        source_id=row.source_id,
        source_name=row.source_name,
        source_category=row.source_category,
        dataset_name=row.dataset_name,
        business_purpose=row.business_purpose,
        asset_classes=row.asset_classes,
        products_or_regions=row.products_or_regions,
        system_owner=row.system_owner,
        business_owner=row.business_owner,
        vendor_or_origin=row.vendor_or_origin,
        golden_source=row.golden_source,
        fallback_source=row.fallback_source,
        update_frequency=row.update_frequency,
        delivery_pattern=row.delivery_pattern,
        latency_requirement=row.latency_requirement,
        retention_requirement=row.retention_requirement,
        storage_pattern=row.storage_pattern,
        schema_owner=row.schema_owner,
        quality_checks=row.quality_checks,
        reconciliation_method=row.reconciliation_method,
        usage_scope=row.usage_scope,
        criticality=row.criticality,
        license_type=row.license_type,
        license_restrictions=row.license_restrictions,
        entitlements_required=row.entitlements_required,
        cost_model=row.cost_model,
        sensitivity_class=row.sensitivity_class,
        availability_slo=row.availability_slo,
        incident_runbook=row.incident_runbook,
        monitoring_metrics=row.monitoring_metrics,
        lineage_notes=row.lineage_notes,
        last_reviewed_at=row.last_reviewed_at,
        status=row.status,
    )
