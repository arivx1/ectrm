from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.domains.reference_data.services.external_data.sync_status import build_external_data_sync_status

DEFAULT_MARKET_CONTEXT_LIMIT = 5
MAX_MARKET_CONTEXT_LIMIT = 10

COMMODITY_ALIASES = {
    "WTI": {"WTI", "CRUDE", "CRUDE_OIL", "OIL"},
    "BRENT": {"BRENT", "CRUDE", "CRUDE_OIL", "OIL"},
    "HH": {"HH", "HENRY", "HENRY HUB", "NATURAL_GAS", "GAS"},
    "NATURAL_GAS": {"NATURAL_GAS", "GAS", "HENRY", "HENRY HUB", "HH"},
    "POWER": {"POWER", "PJM", "ERCOT", "CAISO", "ISO"},
}


def build_market_context(
    db: Session,
    *,
    commodity: Optional[str] = None,
    limit: int = DEFAULT_MARKET_CONTEXT_LIMIT,
) -> dict[str, Any]:
    normalized_limit = max(1, min(int(limit), MAX_MARKET_CONTEXT_LIMIT))
    normalized_commodity = _normalize_commodity(commodity)

    return {
        "generated_at": datetime.now(timezone.utc),
        "commodity": normalized_commodity,
        "price_indices": _load_price_index_context(db, commodity=normalized_commodity, limit=normalized_limit),
        "fundamentals": _load_external_series_context(
            db,
            category="fundamentals",
            commodity=normalized_commodity,
            limit=normalized_limit,
        ),
        "power": _load_external_series_context(db, category="power", limit=normalized_limit),
        "macro": _load_external_series_context(db, category="macro", limit=normalized_limit),
        "positioning": _load_external_series_context(
            db,
            category="positioning",
            commodity=normalized_commodity,
            limit=normalized_limit,
        ),
        "freshness": _load_freshness_context(db),
    }


def build_latest_price_snapshot(
    db: Session,
    *,
    commodity: Optional[str] = None,
    price_index_code: Optional[str] = None,
    limit: int = DEFAULT_MARKET_CONTEXT_LIMIT,
) -> dict[str, Any]:
    normalized_limit = max(1, min(int(limit), MAX_MARKET_CONTEXT_LIMIT))
    normalized_commodity = _normalize_commodity(commodity)
    normalized_price_index_code = _normalize_price_index_code(price_index_code)
    freshness_by_provider = {
        str(row["provider"]).upper(): row
        for row in _load_freshness_context(db)
    }

    if normalized_price_index_code is not None:
        items = _load_specific_price_index_context(db, price_index_code=normalized_price_index_code)
    else:
        items = _load_price_index_context(db, commodity=normalized_commodity, limit=normalized_limit)

    enriched_items: list[dict[str, Any]] = []
    for row in items[:normalized_limit]:
        freshness = freshness_by_provider.get(str(row["source_provider"]).upper())
        enriched_row = dict(row)
        enriched_row["provider_health_status"] = freshness["health_status"] if freshness else "unknown"
        enriched_row["provider_due_for_sync"] = freshness["due_for_sync"] if freshness else None
        enriched_row["provider_observation_age_hours"] = freshness["observation_age_hours"] if freshness else None
        enriched_row["provider_last_success_at"] = freshness["last_success_at"] if freshness else None
        enriched_items.append(enriched_row)

    return {
        "generated_at": datetime.now(timezone.utc),
        "commodity": normalized_commodity,
        "price_index_code": normalized_price_index_code,
        "count": len(enriched_items),
        "items": enriched_items,
    }


def _normalize_commodity(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_price_index_code(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _commodity_terms(commodity: Optional[str]) -> set[str]:
    if commodity is None:
        return set()
    return {commodity, *(COMMODITY_ALIASES.get(commodity, set()))}


def _load_price_index_context(
    db: Session,
    *,
    commodity: Optional[str],
    limit: int,
) -> list[dict[str, Any]]:
    candidates = _select_price_index_candidates(db, commodity=commodity, limit=limit)
    items: list[dict[str, Any]] = []
    for price_index in candidates:
        observation = _latest_price_index_observation(db, price_index.code)
        if observation is None:
            continue
        items.append(_serialize_price_index_context_row(price_index, observation))
        if len(items) >= limit:
            break
    return items


def _load_specific_price_index_context(
    db: Session,
    *,
    price_index_code: str,
) -> list[dict[str, Any]]:
    price_index = db.get(ReferencePriceIndex, price_index_code)
    if price_index is None or not price_index.is_active:
        return []
    observation = _latest_price_index_observation(db, price_index.code)
    if observation is None:
        return []
    return [_serialize_price_index_context_row(price_index, observation)]


def _select_price_index_candidates(
    db: Session,
    *,
    commodity: Optional[str],
    limit: int,
) -> list[ReferencePriceIndex]:
    if commodity:
        terms = sorted(_commodity_terms(commodity))
        conditions = []
        for term in terms:
            pattern = f"%{term}%"
            conditions.extend(
                [
                    ReferencePriceIndex.code.ilike(pattern),
                    ReferencePriceIndex.name.ilike(pattern),
                    ReferencePriceIndex.description.ilike(pattern),
                    ReferencePriceIndex.commodity_code.ilike(pattern),
                    ReferencePriceIndex.market.ilike(pattern),
                    ReferencePriceIndex.location_code.ilike(pattern),
                ]
            )
        stmt = (
            select(ReferencePriceIndex)
            .where(ReferencePriceIndex.is_active.is_(True), or_(*conditions))
            .order_by(ReferencePriceIndex.provider.asc(), ReferencePriceIndex.name.asc())
        )
        return db.execute(stmt.limit(limit * 3)).scalars().all()

    ranked_codes = [
        row[0]
        for row in db.execute(
            select(Trade.price_index_code, func.count())
            .where(
                Trade.status == "ACTIVE",
                Trade.price_index_code.is_not(None),
            )
            .group_by(Trade.price_index_code)
            .order_by(func.count().desc(), Trade.price_index_code.asc())
        ).all()
        if row[0]
    ]
    selected: list[ReferencePriceIndex] = []
    seen_codes: set[str] = set()

    for code in ranked_codes:
        price_index = db.get(ReferencePriceIndex, code)
        if price_index is None or not price_index.is_active or price_index.code in seen_codes:
            continue
        selected.append(price_index)
        seen_codes.add(price_index.code)
        if len(selected) >= limit:
            return selected

    fallbacks = db.execute(
        select(ReferencePriceIndex)
        .where(ReferencePriceIndex.is_active.is_(True))
        .order_by(ReferencePriceIndex.provider.asc(), ReferencePriceIndex.name.asc())
        .limit(limit * 3)
    ).scalars().all()
    for price_index in fallbacks:
        if price_index.code in seen_codes:
            continue
        selected.append(price_index)
        seen_codes.add(price_index.code)
        if len(selected) >= limit:
            break
    return selected


def _latest_price_index_observation(db: Session, price_index_code: str) -> Optional[PriceIndexObservation]:
    return db.execute(
        select(PriceIndexObservation)
        .where(PriceIndexObservation.price_index_code == price_index_code)
        .order_by(
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
    ).scalars().first()


def _serialize_price_index_context_row(
    price_index: ReferencePriceIndex,
    observation: PriceIndexObservation,
) -> dict[str, Any]:
    return {
        "price_index_code": price_index.code,
        "name": price_index.name,
        "commodity_code": price_index.commodity_code,
        "quote_type": price_index.quote_type,
        "market": price_index.market,
        "location_code": price_index.location_code,
        "observation_date": observation.observation_date,
        "value": float(observation.value),
        "unit_code": observation.unit_code,
        "currency_code": observation.currency_code,
        "source_provider": observation.source_provider,
        "source_series_id": observation.source_series_id,
        "downloaded_at": observation.downloaded_at,
    }


def _load_external_series_context(
    db: Session,
    *,
    category: str,
    limit: int,
    commodity: Optional[str] = None,
) -> list[dict[str, Any]]:
    definitions = db.execute(
        select(ExternalSeriesDefinition)
        .where(
            ExternalSeriesDefinition.is_active.is_(True),
            ExternalSeriesDefinition.category == category,
        )
        .order_by(ExternalSeriesDefinition.code.asc())
    ).scalars().all()

    if commodity and category in {"fundamentals", "positioning"}:
        terms = _commodity_terms(commodity)
        definitions = [definition for definition in definitions if _matches_terms(definition, terms)]

    items: list[dict[str, Any]] = []
    for definition in definitions:
        observation = _latest_external_series_observation(db, definition.code)
        if observation is None:
            continue
        items.append(
            {
                "series_code": definition.code,
                "name": definition.name,
                "category": definition.category,
                "observation_date": observation.observation_date,
                "value": float(observation.value),
                "unit_code": observation.unit_code,
                "source_provider": observation.source_provider,
                "source_series_id": observation.source_series_id,
                "downloaded_at": observation.downloaded_at,
            }
        )
        if len(items) >= limit:
            break
    return items


def _load_freshness_context(db: Session) -> list[dict[str, Any]]:
    status = build_external_data_sync_status(db)
    return [
        {
            "provider": row["provider"],
            "label": row["label"],
            "category": row["category"],
            "health_status": row["health_status"],
            "latest_run_status": row["latest_run_status"],
            "due_for_sync": row["due_for_sync"],
            "last_success_at": row["last_success_at"],
            "latest_observation_at": row["latest_observation_at"],
            "observation_age_hours": row["observation_age_hours"],
            "error_summary": row["error_summary"],
        }
        for row in status["providers"]
    ]


def _latest_external_series_observation(db: Session, series_code: str) -> Optional[ExternalSeriesObservation]:
    return db.execute(
        select(ExternalSeriesObservation)
        .where(ExternalSeriesObservation.series_code == series_code)
        .order_by(
            ExternalSeriesObservation.observation_date.desc(),
            ExternalSeriesObservation.downloaded_at.desc(),
            ExternalSeriesObservation.id.desc(),
        )
    ).scalars().first()


def _matches_terms(definition: ExternalSeriesDefinition, terms: set[str]) -> bool:
    haystack = " ".join(
        value
        for value in (
            definition.code,
            definition.name,
            definition.description or "",
            definition.series_id,
        )
        if value
    ).upper()
    return any(term in haystack for term in terms)
