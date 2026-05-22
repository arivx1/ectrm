from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional, Protocol, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.price_index_observation import PriceIndexObservation


class NormalizedPriceObservation(Protocol):
    price_index_code: str
    observation_date: Any
    value: Decimal
    unit_code: str
    currency_code: Optional[str]
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: Optional[datetime]
    source_revision: Optional[str]
    downloaded_at: datetime
    raw_payload: dict[str, Any]


def upsert_price_index_observations(
    db: Session,
    *,
    run_id: int,
    observations: Sequence[NormalizedPriceObservation],
) -> tuple[int, set[str]]:
    written = 0
    changed_price_index_codes: set[str] = set()
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
            changed_price_index_codes.add(item.price_index_code)
            continue

        if _price_observation_changed(existing, item):
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
            changed_price_index_codes.add(item.price_index_code)

    db.commit()
    return written, changed_price_index_codes


def _price_observation_changed(
    existing: PriceIndexObservation,
    item: NormalizedPriceObservation,
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
