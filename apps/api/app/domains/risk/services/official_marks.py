from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource

OFFICIAL_MARK_BASIS_V1 = "active_price_index_source_latest_observation_no_interpolation"
OFFICIAL_MARK_INTERPOLATION_NONE = "NONE"
OFFICIAL_MARK_APPROVAL_APPROVED_SOURCE = "APPROVED_SOURCE"
OFFICIAL_MARK_APPROVAL_MISSING_APPROVED_SOURCE = "MISSING_APPROVED_SOURCE"
OFFICIAL_MARK_APPROVAL_MISSING_OBSERVATION = "MISSING_OBSERVATION"
OFFICIAL_MARK_FRESHNESS_FRESH = "FRESH"
OFFICIAL_MARK_FRESHNESS_STALE = "STALE"
OFFICIAL_MARK_FRESHNESS_MISSING = "MISSING"
OFFICIAL_CURVE_STATUS_READY = "READY"
OFFICIAL_CURVE_STATUS_STALE = "STALE"
OFFICIAL_CURVE_STATUS_PARTIAL = "PARTIAL"
OFFICIAL_CURVE_STATUS_MISSING = "MISSING"


@dataclass(frozen=True)
class OfficialMark:
    price_index_code: str
    as_of_date: date
    valuation_basis: str
    interpolation_method: str
    approval_status: str
    freshness_status: str
    price_index_name: str | None = None
    commodity_code: str | None = None
    market: str | None = None
    location_code: str | None = None
    observation_date: date | None = None
    value: Decimal | None = None
    unit_code: str | None = None
    currency_code: str | None = None
    source_provider: str | None = None
    source_series_id: str | None = None
    source_published_at: datetime | None = None
    downloaded_at: datetime | None = None
    run_id: int | None = None
    days_stale: int | None = None
    reason: str | None = None


@dataclass(frozen=True)
class OfficialCurve:
    curve_code: str
    as_of_date: date
    valuation_basis: str
    interpolation_method: str
    status: str
    marks: tuple[OfficialMark, ...]
    missing_price_index_codes: tuple[str, ...]
    fresh_mark_count: int
    stale_mark_count: int
    missing_mark_count: int


def get_official_mark(
    db: Session,
    *,
    price_index_code: str,
    as_of_date: date | datetime | None = None,
) -> OfficialMark:
    normalized_code = _normalize_code(price_index_code)
    effective_as_of = _coerce_as_of_date(as_of_date)
    price_index = db.get(ReferencePriceIndex, normalized_code)
    if price_index is None or not price_index.is_active:
        return _missing_mark(
            price_index_code=normalized_code,
            as_of_date=effective_as_of,
            approval_status=OFFICIAL_MARK_APPROVAL_MISSING_APPROVED_SOURCE,
            reason="Price index is not configured as an active valuation index.",
        )

    approved_sources = _active_sources_for_price_index(db, normalized_code)
    if not approved_sources:
        return _missing_mark(
            price_index_code=normalized_code,
            as_of_date=effective_as_of,
            price_index=price_index,
            approval_status=OFFICIAL_MARK_APPROVAL_MISSING_APPROVED_SOURCE,
            reason="Price index has no active approved source.",
        )

    observation = _latest_approved_observation(
        db,
        price_index_code=normalized_code,
        as_of_date=effective_as_of,
        approved_sources=approved_sources,
    )
    if observation is None:
        return _missing_mark(
            price_index_code=normalized_code,
            as_of_date=effective_as_of,
            price_index=price_index,
            approval_status=OFFICIAL_MARK_APPROVAL_MISSING_OBSERVATION,
            reason="No approved observation exists on or before the as-of date.",
        )

    days_stale = (effective_as_of - observation.observation_date).days
    freshness_status = (
        OFFICIAL_MARK_FRESHNESS_FRESH
        if days_stale == 0
        else OFFICIAL_MARK_FRESHNESS_STALE
    )
    return OfficialMark(
        price_index_code=normalized_code,
        as_of_date=effective_as_of,
        valuation_basis=OFFICIAL_MARK_BASIS_V1,
        interpolation_method=OFFICIAL_MARK_INTERPOLATION_NONE,
        approval_status=OFFICIAL_MARK_APPROVAL_APPROVED_SOURCE,
        freshness_status=freshness_status,
        price_index_name=price_index.name,
        commodity_code=price_index.commodity_code,
        market=price_index.market,
        location_code=price_index.location_code,
        observation_date=observation.observation_date,
        value=observation.value,
        unit_code=observation.unit_code,
        currency_code=observation.currency_code,
        source_provider=observation.source_provider,
        source_series_id=observation.source_series_id,
        source_published_at=observation.source_published_at,
        downloaded_at=observation.downloaded_at,
        run_id=observation.run_id,
        days_stale=days_stale,
    )


def build_official_curve(
    db: Session,
    *,
    curve_code: str,
    price_index_codes: Iterable[str],
    as_of_date: date | datetime | None = None,
) -> OfficialCurve:
    effective_as_of = _coerce_as_of_date(as_of_date)
    normalized_codes = _normalize_unique_codes(price_index_codes)
    marks = tuple(
        get_official_mark(db, price_index_code=code, as_of_date=effective_as_of)
        for code in normalized_codes
    )
    missing_codes = tuple(
        mark.price_index_code
        for mark in marks
        if mark.freshness_status == OFFICIAL_MARK_FRESHNESS_MISSING
    )
    fresh_count = sum(
        1 for mark in marks if mark.freshness_status == OFFICIAL_MARK_FRESHNESS_FRESH
    )
    stale_count = sum(
        1 for mark in marks if mark.freshness_status == OFFICIAL_MARK_FRESHNESS_STALE
    )
    missing_count = len(missing_codes)
    if not marks or missing_count == len(marks):
        status = OFFICIAL_CURVE_STATUS_MISSING
    elif missing_count:
        status = OFFICIAL_CURVE_STATUS_PARTIAL
    elif stale_count:
        status = OFFICIAL_CURVE_STATUS_STALE
    else:
        status = OFFICIAL_CURVE_STATUS_READY

    return OfficialCurve(
        curve_code=_normalize_code(curve_code),
        as_of_date=effective_as_of,
        valuation_basis=OFFICIAL_MARK_BASIS_V1,
        interpolation_method=OFFICIAL_MARK_INTERPOLATION_NONE,
        status=status,
        marks=marks,
        missing_price_index_codes=missing_codes,
        fresh_mark_count=fresh_count,
        stale_mark_count=stale_count,
        missing_mark_count=missing_count,
    )


def _normalize_code(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if not normalized:
        raise ValueError("code is required")
    return normalized


def _normalize_unique_codes(values: Iterable[str]) -> list[str]:
    normalized_codes: list[str] = []
    seen_codes: set[str] = set()
    for value in values:
        normalized = _normalize_code(value)
        if normalized in seen_codes:
            continue
        normalized_codes.append(normalized)
        seen_codes.add(normalized)
    return normalized_codes


def _coerce_as_of_date(value: date | datetime | None) -> date:
    if value is None:
        return datetime.now(timezone.utc).date()
    if isinstance(value, datetime):
        return value.date()
    return value


def _active_sources_for_price_index(
    db: Session,
    price_index_code: str,
) -> set[tuple[str, str]]:
    rows = db.execute(
        select(ReferencePriceIndexSource).where(
            ReferencePriceIndexSource.price_index_code == price_index_code,
            ReferencePriceIndexSource.is_active.is_(True),
        )
    ).scalars().all()
    return {
        (row.provider.strip().upper(), row.series_id.strip())
        for row in rows
        if row.provider and row.series_id
    }


def _latest_approved_observation(
    db: Session,
    *,
    price_index_code: str,
    as_of_date: date,
    approved_sources: set[tuple[str, str]],
) -> PriceIndexObservation | None:
    rows = db.execute(
        select(PriceIndexObservation)
        .where(
            PriceIndexObservation.price_index_code == price_index_code,
            PriceIndexObservation.observation_date <= as_of_date,
        )
        .order_by(
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
    ).scalars().all()
    for row in rows:
        source_key = (row.source_provider.strip().upper(), row.source_series_id.strip())
        if source_key in approved_sources:
            return row
    return None


def _missing_mark(
    *,
    price_index_code: str,
    as_of_date: date,
    approval_status: str,
    reason: str,
    price_index: ReferencePriceIndex | None = None,
) -> OfficialMark:
    return OfficialMark(
        price_index_code=price_index_code,
        as_of_date=as_of_date,
        valuation_basis=OFFICIAL_MARK_BASIS_V1,
        interpolation_method=OFFICIAL_MARK_INTERPOLATION_NONE,
        approval_status=approval_status,
        freshness_status=OFFICIAL_MARK_FRESHNESS_MISSING,
        price_index_name=price_index.name if price_index is not None else None,
        commodity_code=price_index.commodity_code if price_index is not None else None,
        market=price_index.market if price_index is not None else None,
        location_code=price_index.location_code if price_index is not None else None,
        reason=reason,
    )
