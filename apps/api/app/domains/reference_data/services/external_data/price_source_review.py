from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.sync_status import (
    build_external_data_sync_status,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def list_price_source_review_rows(
    db: Session,
    *,
    provider: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int,
    offset: int,
) -> list[dict[str, object]]:
    stmt = select(ReferencePriceIndexSource).order_by(
        ReferencePriceIndexSource.provider.asc(),
        ReferencePriceIndexSource.price_index_code.asc(),
        ReferencePriceIndexSource.series_id.asc(),
        ReferencePriceIndexSource.id.asc(),
    )
    if provider:
        stmt = stmt.where(ReferencePriceIndexSource.provider == provider.strip().upper())
    if is_active is not None:
        stmt = stmt.where(ReferencePriceIndexSource.is_active.is_(is_active))

    sources = db.execute(stmt.limit(limit).offset(offset)).scalars().all()
    if not sources:
        return []

    price_index_codes = sorted({source.price_index_code for source in sources})
    provider_codes = sorted({source.provider for source in sources})
    price_indices = _load_price_indices(db, price_index_codes)
    observations = _latest_observations_by_source(db, price_index_codes)
    runs, successes = _latest_runs_by_provider(db, provider_codes)
    provider_status = {
        str(row["provider"]): row
        for row in build_external_data_sync_status(db).get("providers", [])
    }

    rows: list[dict[str, object]] = []
    for source in sources:
        price_index = price_indices.get(source.price_index_code)
        observation = observations.get(
            (source.price_index_code, source.provider, source.series_id)
        )
        latest_run = runs.get(source.provider)
        latest_success = successes.get(source.provider)
        status = provider_status.get(source.provider)

        rows.append(
            {
                "id": source.id,
                "price_index_code": source.price_index_code,
                "price_index_name": price_index.name if price_index is not None else None,
                "commodity_code": price_index.commodity_code if price_index is not None else None,
                "quote_type": price_index.quote_type if price_index is not None else None,
                "market": price_index.market if price_index is not None else None,
                "location_code": price_index.location_code if price_index is not None else None,
                "price_unit_code": price_index.unit_code if price_index is not None else None,
                "price_currency_code": (
                    price_index.currency_code if price_index is not None else None
                ),
                "price_index_is_active": (
                    price_index.is_active if price_index is not None else None
                ),
                "provider": source.provider,
                "dataset_code": source.dataset_code,
                "series_id": source.series_id,
                "frequency": source.frequency,
                "source_unit": source.source_unit,
                "source_currency_code": source.source_currency_code,
                "transform_rule": source.transform_rule,
                "is_active": source.is_active,
                "review_status": _review_status(
                    source=source,
                    price_index=price_index,
                    observation=observation,
                    provider_health_status=(
                        str(status["health_status"]) if status is not None else None
                    ),
                ),
                "provider_health_status": (
                    str(status["health_status"]) if status is not None else None
                ),
                "latest_run_status": latest_run.status if latest_run is not None else None,
                "latest_run_id": latest_run.id if latest_run is not None else None,
                "last_success_at": (
                    latest_success.finished_at if latest_success is not None else None
                ),
                "provider_error_summary": (
                    str(status["error_summary"])
                    if status is not None and status.get("error_summary") is not None
                    else None
                ),
                "latest_observation_date": (
                    observation.observation_date if observation is not None else None
                ),
                "latest_value": _decimal_to_float(observation.value)
                if observation is not None
                else None,
                "latest_unit_code": observation.unit_code if observation is not None else None,
                "latest_currency_code": (
                    observation.currency_code if observation is not None else None
                ),
                "latest_source_revision": (
                    observation.source_revision if observation is not None else None
                ),
                "latest_downloaded_at": (
                    observation.downloaded_at if observation is not None else None
                ),
                "latest_observation_run_id": (
                    observation.run_id if observation is not None else None
                ),
                "created_at": source.created_at,
                "updated_at": source.updated_at,
                "version": source.version,
            }
        )

    return rows


def _load_price_indices(
    db: Session,
    price_index_codes: list[str],
) -> dict[str, ReferencePriceIndex]:
    rows = db.execute(
        select(ReferencePriceIndex).where(ReferencePriceIndex.code.in_(price_index_codes))
    ).scalars().all()
    return {row.code: row for row in rows}


def _latest_observations_by_source(
    db: Session,
    price_index_codes: list[str],
) -> dict[tuple[str, str, str], PriceIndexObservation]:
    rows = db.execute(
        select(PriceIndexObservation)
        .where(PriceIndexObservation.price_index_code.in_(price_index_codes))
        .order_by(
            PriceIndexObservation.price_index_code.asc(),
            PriceIndexObservation.source_provider.asc(),
            PriceIndexObservation.source_series_id.asc(),
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
    ).scalars().all()

    latest: dict[tuple[str, str, str], PriceIndexObservation] = {}
    for row in rows:
        key = (row.price_index_code, row.source_provider, row.source_series_id)
        if key not in latest:
            latest[key] = row
    return latest


def _latest_runs_by_provider(
    db: Session,
    provider_codes: list[str],
) -> tuple[dict[str, ExternalDataRun], dict[str, ExternalDataRun]]:
    rows = db.execute(
        select(ExternalDataRun)
        .where(ExternalDataRun.provider.in_(provider_codes))
        .order_by(
            ExternalDataRun.provider.asc(),
            ExternalDataRun.started_at.desc(),
            ExternalDataRun.id.desc(),
        )
    ).scalars().all()

    latest: dict[str, ExternalDataRun] = {}
    latest_success: dict[str, ExternalDataRun] = {}
    for row in rows:
        if row.provider not in latest:
            latest[row.provider] = row
        if row.status == "SUCCEEDED" and row.provider not in latest_success:
            latest_success[row.provider] = row

    return latest, latest_success


def _review_status(
    *,
    source: ReferencePriceIndexSource,
    price_index: Optional[ReferencePriceIndex],
    observation: Optional[PriceIndexObservation],
    provider_health_status: Optional[str],
) -> str:
    if price_index is None:
        return "unmapped"
    if not source.is_active or not price_index.is_active:
        return "inactive"
    if observation is None:
        return "missing"
    if provider_health_status in {"failed", "stale", "running", "unknown"}:
        return provider_health_status
    if provider_health_status == "healthy":
        return "current"
    return "loaded"


def _decimal_to_float(value: Decimal) -> float:
    return float(value)
