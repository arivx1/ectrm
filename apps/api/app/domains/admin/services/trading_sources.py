from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.models.trading_source import TradingSource


def default_trading_source_csv_path() -> Path:
    return Path(__file__).resolve().parents[6] / "docs" / "engineering" / "trading-source-register.csv"


@dataclass
class TradingSourceSeedSummary:
    total_rows: int
    created_count: int
    updated_count: int


def list_trading_sources(
    db: Session,
    *,
    q: str | None,
    source_category: str | None,
    criticality: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> list[TradingSource]:
    stmt = select(TradingSource).order_by(TradingSource.source_id.asc()).limit(limit).offset(offset)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                TradingSource.source_id.ilike(pattern),
                TradingSource.source_name.ilike(pattern),
                TradingSource.source_category.ilike(pattern),
                TradingSource.business_owner.ilike(pattern),
                TradingSource.system_owner.ilike(pattern),
            )
        )
    if source_category:
        stmt = stmt.where(TradingSource.source_category == source_category.strip())
    if criticality:
        stmt = stmt.where(TradingSource.criticality == criticality.strip())
    if status:
        stmt = stmt.where(TradingSource.status == status.strip())

    return db.execute(stmt).scalars().all()


def seed_trading_sources_from_csv(
    db: Session,
    *,
    csv_path: Path | None = None,
    replace_existing: bool = True,
) -> TradingSourceSeedSummary:
    path = csv_path or default_trading_source_csv_path()
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))

    created_count = 0
    updated_count = 0

    for row in rows:
        record = db.execute(
            select(TradingSource).where(TradingSource.source_id == row["source_id"])
        ).scalars().first()
        values = _row_to_model_values(row)

        if record is None:
            db.add(TradingSource(**values))
            created_count += 1
            continue

        if replace_existing:
            for key, value in values.items():
                setattr(record, key, value)
            updated_count += 1

    db.commit()
    return TradingSourceSeedSummary(
        total_rows=len(rows),
        created_count=created_count,
        updated_count=updated_count,
    )


def _row_to_model_values(row: dict[str, str]) -> dict[str, str | date]:
    return {
        "source_id": row["source_id"],
        "source_name": row["source_name"],
        "source_category": row["source_category"],
        "dataset_name": row["dataset_name"],
        "business_purpose": row["business_purpose"],
        "asset_classes": row["asset_classes"],
        "products_or_regions": row["products_or_regions"],
        "system_owner": row["system_owner"],
        "business_owner": row["business_owner"],
        "vendor_or_origin": row["vendor_or_origin"],
        "golden_source": row["golden_source"],
        "fallback_source": row["fallback_source"],
        "update_frequency": row["update_frequency"],
        "delivery_pattern": row["delivery_pattern"],
        "latency_requirement": row["latency_requirement"],
        "retention_requirement": row["retention_requirement"],
        "storage_pattern": row["storage_pattern"],
        "schema_owner": row["schema_owner"],
        "quality_checks": row["quality_checks"],
        "reconciliation_method": row["reconciliation_method"],
        "usage_scope": row["usage_scope"],
        "criticality": row["criticality"],
        "license_type": row["license_type"],
        "license_restrictions": row["license_restrictions"],
        "entitlements_required": row["entitlements_required"],
        "cost_model": row["cost_model"],
        "sensitivity_class": row["sensitivity_class"],
        "availability_slo": row["availability_slo"],
        "incident_runbook": row["incident_runbook"],
        "monitoring_metrics": row["monitoring_metrics"],
        "lineage_notes": row["lineage_notes"],
        "last_reviewed_at": date.fromisoformat(row["last_reviewed_at"]),
        "status": row["status"],
    }
