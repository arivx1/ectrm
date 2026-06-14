from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.price_index_observation_writer import (
    upsert_price_index_observations,
)
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    mark_run_failed,
)
from apps.api.app.domains.reference_data.services.external_data.usda_nass_client import (
    USDANASSClient,
    USDANASSClientError,
)
from apps.api.app.domains.reference_data.services.external_data.usda_nass_price_mapper import (
    normalize_usda_nass_price_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def sync_usda_nass_series(
    db: Session,
    *,
    client: Optional[USDANASSClient] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    nass_client = client or USDANASSClient()
    run = create_run(db, provider="USDA_NASS", job_name="sync_usda_nass_prices", requested_by=requested_by)

    try:
        mappings = _load_price_mappings(db, price_index_code=price_index_code)
        if not mappings:
            raise ExternalSeriesSyncError(
                "No active USDA NASS price-index sources matched the requested filters"
            )

        run.series_count = len(mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        changed_price_index_codes: set[str] = set()
        start_year = _start_year_from_lookback(lookback_days=lookback_days, today=today)

        for mapping in mappings:
            query_params = _query_params_for_mapping(mapping, start_year=start_year)
            payload = nass_client.fetch_price_series(query_params=query_params)
            observations = normalize_usda_nass_price_observations(
                mapping=mapping,
                payload=payload,
                downloaded_at=downloaded_at,
            )
            written_count, changed_codes = upsert_price_index_observations(
                db,
                run_id=run.id,
                observations=observations,
            )
            total_observations += written_count
            changed_price_index_codes.update(changed_codes)

        if changed_price_index_codes:
            rebuild_trade_accruals_ledger(
                db,
                price_index_codes=sorted(changed_price_index_codes),
                actor_id=requested_by or "external_data:usda_nass_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("USDA NASS run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (USDANASSClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_price_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "USDA_NASS",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(
            ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper()
        )
    return db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()


def _query_params_for_mapping(
    mapping: ReferencePriceIndexSource,
    *,
    start_year: Optional[int],
) -> dict[str, Any]:
    raw_rule = (mapping.transform_rule or "").strip()
    if not raw_rule:
        raise ExternalSeriesSyncError(
            f"USDA NASS source {mapping.series_id} is missing query parameters"
        )

    try:
        rule = json.loads(raw_rule)
    except json.JSONDecodeError as exc:
        raise ExternalSeriesSyncError(
            f"USDA NASS source {mapping.series_id} has invalid query parameter JSON"
        ) from exc

    params = rule.get("query_params") if isinstance(rule, dict) else None
    if not isinstance(params, dict) or not params:
        raise ExternalSeriesSyncError(
            f"USDA NASS source {mapping.series_id} is missing query_params"
        )

    normalized_params = {str(key): value for key, value in params.items()}
    if start_year is not None:
        normalized_params["year__GE"] = start_year
    return normalized_params


def _start_year_from_lookback(
    *,
    lookback_days: Optional[int],
    today: Optional[date],
) -> Optional[int]:
    if lookback_days is None:
        return None
    anchor = today or date.today()
    return (anchor - timedelta(days=lookback_days)).year
