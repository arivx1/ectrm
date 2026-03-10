from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.eia_client import (
    EIAClient,
    EIAClientError,
)
from apps.api.app.domains.reference_data.services.external_data.eia_mapper import (
    EIAMappingError,
    NormalizedObservation,
    build_start_argument,
    normalize_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class EIASyncError(RuntimeError):
    pass


def sync_eia_series(
    db: Session,
    *,
    client: Optional[EIAClient] = None,
    series_id: Optional[str] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
) -> ExternalDataRun:
    eia_client = client or EIAClient()
    run = _create_run(db, requested_by=requested_by)

    try:
        mappings = _load_mappings(db, series_id=series_id, price_index_code=price_index_code)
        run.series_count = len(mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        for mapping in mappings:
            start = build_start_argument(mapping.frequency, lookback_days)
            payload = eia_client.fetch_series(
                series_id=mapping.series_id,
                frequency=mapping.frequency.lower(),
                start=start,
            )
            observations = normalize_observations(
                mapping=mapping,
                payload=payload,
                downloaded_at=downloaded_at,
            )
            total_observations += _upsert_observations(
                db,
                run_id=run.id,
                observations=observations,
            )

        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (EIAClientError, EIAMappingError, EIASyncError) as exc:
        db.rollback()
        run = db.get(ExternalDataRun, run.id)
        if run is not None:
            run.status = "FAILED"
            run.finished_at = datetime.now(timezone.utc)
            run.error_summary = str(exc)
            db.commit()
            db.refresh(run)
            return run
        raise


def _create_run(db: Session, *, requested_by: Optional[str]) -> ExternalDataRun:
    now = datetime.now(timezone.utc)
    run = ExternalDataRun(
        provider="EIA",
        job_name="sync_eia_price_data",
        status="RUNNING",
        started_at=now,
        finished_at=None,
        requested_by=requested_by,
        series_count=0,
        observation_count=0,
        error_summary=None,
        created_at=now,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _load_mappings(
    db: Session,
    *,
    series_id: Optional[str],
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "EIA",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if series_id:
        stmt = stmt.where(ReferencePriceIndexSource.series_id == series_id.strip())
    if price_index_code:
        stmt = stmt.where(ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper())

    rows = db.execute(stmt.order_by(ReferencePriceIndexSource.id.asc())).scalars().all()
    if not rows:
        raise EIASyncError("No active EIA source mappings matched the requested filters")
    return rows


def _upsert_observations(
    db: Session,
    *,
    run_id: int,
    observations: list[NormalizedObservation],
) -> int:
    written = 0
    for item in observations:
        existing = db.execute(
            select(PriceIndexObservation).where(
                PriceIndexObservation.price_index_code == item.price_index_code,
                PriceIndexObservation.observation_date == item.observation_date,
                PriceIndexObservation.source_provider == item.source_provider,
                PriceIndexObservation.source_series_id == item.source_series_id,
            )
        ).scalars().first()

        if existing is None:
            db.add(
                PriceIndexObservation(
                    price_index_code=item.price_index_code,
                    observation_date=item.observation_date,
                    value=item.value,
                    unit_code=item.unit_code,
                    currency_code=item.currency_code,
                    source_provider=item.source_provider,
                    source_series_id=item.source_series_id,
                    source_frequency=item.source_frequency,
                    source_published_at=item.source_published_at,
                    source_revision=item.source_revision,
                    downloaded_at=item.downloaded_at,
                    run_id=run_id,
                    raw_payload=item.raw_payload,
                    created_at=item.downloaded_at,
                    updated_at=item.downloaded_at,
                )
            )
            written += 1
            continue

        if _observation_changed(existing, item):
            existing.value = item.value
            existing.unit_code = item.unit_code
            existing.currency_code = item.currency_code
            existing.source_frequency = item.source_frequency
            existing.source_published_at = item.source_published_at
            existing.source_revision = item.source_revision
            existing.downloaded_at = item.downloaded_at
            existing.run_id = run_id
            existing.raw_payload = item.raw_payload
            existing.updated_at = item.downloaded_at
            written += 1

    db.commit()
    return written


def _observation_changed(
    existing: PriceIndexObservation,
    item: NormalizedObservation,
) -> bool:
    return any(
        (
            existing.value != item.value,
            existing.unit_code != item.unit_code,
            existing.currency_code != item.currency_code,
            existing.source_frequency != item.source_frequency,
            not _datetimes_match(existing.source_published_at, item.source_published_at),
            existing.source_revision != item.source_revision,
            existing.raw_payload != item.raw_payload,
        )
    )


def _datetimes_match(left: Optional[datetime], right: Optional[datetime]) -> bool:
    if left is None or right is None:
        return left is right
    return _normalize_datetime(left) == _normalize_datetime(right)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
