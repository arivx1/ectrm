from __future__ import annotations

from typing import List
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.external_data import (
    sync_cftc_series,
    sync_eia_series,
    sync_fred_series,
)
from apps.api.app.domains.reference_data.services.external_data.market_context import build_market_context
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.schemas.external_data import (
    EIASyncRequest,
    ExternalDataRunOut,
    ExternalSeriesDefinitionOut,
    ExternalSeriesObservationOut,
    ExternalSeriesSyncRequest,
    MarketContextOut,
    PriceIndexObservationOut,
)

router = APIRouter(tags=["external-data"])

admin_router = APIRouter(prefix="/admin/external-data", tags=["external-data-admin"])


@admin_router.get("/runs", response_model=List[ExternalDataRunOut])
def list_external_data_runs(
    provider: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[ExternalDataRunOut]:
    stmt = select(ExternalDataRun).order_by(ExternalDataRun.started_at.desc()).limit(limit).offset(offset)
    if provider:
        stmt = stmt.where(ExternalDataRun.provider == provider.strip().upper())

    rows = db.execute(stmt).scalars().all()
    return [_to_run_out(row) for row in rows]


@admin_router.get("/runs/{run_id}", response_model=ExternalDataRunOut)
def get_external_data_run(run_id: int, db: Session = Depends(get_db)) -> ExternalDataRunOut:
    row = db.execute(select(ExternalDataRun).where(ExternalDataRun.id == run_id)).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="External data run not found")
    return _to_run_out(row)


@admin_router.post("/eia/sync", response_model=ExternalDataRunOut)
def trigger_eia_sync(payload: EIASyncRequest, db: Session = Depends(get_db)) -> ExternalDataRunOut:
    actor_id = resolve_audit_actor_id(payload.requested_by, required=False)
    run = sync_eia_series(
        db,
        series_id=payload.series_id,
        price_index_code=payload.price_index_code,
        lookback_days=payload.lookback_days,
        requested_by=actor_id,
    )
    return _to_run_out(run)


@admin_router.post("/fred/sync", response_model=ExternalDataRunOut)
def trigger_fred_sync(payload: ExternalSeriesSyncRequest, db: Session = Depends(get_db)) -> ExternalDataRunOut:
    actor_id = resolve_audit_actor_id(payload.requested_by, required=False)
    run = sync_fred_series(
        db,
        series_code=payload.series_code,
        lookback_days=payload.lookback_days,
        requested_by=actor_id,
    )
    return _to_run_out(run)


@admin_router.post("/cftc/sync", response_model=ExternalDataRunOut)
def trigger_cftc_sync(payload: ExternalSeriesSyncRequest, db: Session = Depends(get_db)) -> ExternalDataRunOut:
    actor_id = resolve_audit_actor_id(payload.requested_by, required=False)
    run = sync_cftc_series(
        db,
        series_code=payload.series_code,
        lookback_days=payload.lookback_days,
        requested_by=actor_id,
    )
    return _to_run_out(run)


@router.get("/market-data/external-series", response_model=List[ExternalSeriesDefinitionOut])
def list_external_series_definitions(
    provider: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[ExternalSeriesDefinitionOut]:
    stmt = select(ExternalSeriesDefinition).order_by(
        ExternalSeriesDefinition.provider.asc(),
        ExternalSeriesDefinition.category.asc(),
        ExternalSeriesDefinition.code.asc(),
    )
    if provider:
        stmt = stmt.where(ExternalSeriesDefinition.provider == provider.strip().upper())
    if category:
        stmt = stmt.where(ExternalSeriesDefinition.category == category.strip().lower())

    rows = db.execute(stmt.limit(limit).offset(offset)).scalars().all()
    return [_to_external_series_definition_out(row) for row in rows]


@router.get("/market-data/context", response_model=MarketContextOut)
def get_market_context(
    commodity: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> MarketContextOut:
    payload = build_market_context(db, commodity=commodity, limit=limit)
    return MarketContextOut(**payload)


@router.get(
    "/market-data/external-series/{series_code}/observations",
    response_model=List[ExternalSeriesObservationOut],
)
def list_external_series_observations(
    series_code: str,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> List[ExternalSeriesObservationOut]:
    rows = db.execute(
        select(ExternalSeriesObservation)
        .where(ExternalSeriesObservation.series_code == series_code.strip().upper())
        .order_by(
            ExternalSeriesObservation.observation_date.desc(),
            ExternalSeriesObservation.downloaded_at.desc(),
            ExternalSeriesObservation.id.desc(),
        )
        .limit(limit)
    ).scalars().all()
    return [_to_external_series_observation_out(row) for row in rows]


@router.get(
    "/market-data/external-series/{series_code}/observations/latest",
    response_model=ExternalSeriesObservationOut,
)
def get_latest_external_series_observation(
    series_code: str,
    db: Session = Depends(get_db),
) -> ExternalSeriesObservationOut:
    row = db.execute(
        select(ExternalSeriesObservation)
        .where(ExternalSeriesObservation.series_code == series_code.strip().upper())
        .order_by(
            ExternalSeriesObservation.observation_date.desc(),
            ExternalSeriesObservation.downloaded_at.desc(),
            ExternalSeriesObservation.id.desc(),
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="External series observation not found")
    return _to_external_series_observation_out(row)


@router.get(
    "/market-data/price-indices/{price_index_code}/observations",
    response_model=List[PriceIndexObservationOut],
)
def list_price_index_observations(
    price_index_code: str,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> List[PriceIndexObservationOut]:
    rows = db.execute(
        select(PriceIndexObservation)
        .where(PriceIndexObservation.price_index_code == price_index_code.strip().upper())
        .order_by(
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
        .limit(limit)
    ).scalars().all()
    return [_to_observation_out(row) for row in rows]


@router.get(
    "/market-data/price-indices/{price_index_code}/observations/latest",
    response_model=PriceIndexObservationOut,
)
def get_latest_price_index_observation(
    price_index_code: str,
    db: Session = Depends(get_db),
) -> PriceIndexObservationOut:
    row = db.execute(
        select(PriceIndexObservation)
        .where(PriceIndexObservation.price_index_code == price_index_code.strip().upper())
        .order_by(
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Price index observation not found")
    return _to_observation_out(row)


def _to_run_out(row: ExternalDataRun) -> ExternalDataRunOut:
    return ExternalDataRunOut(
        id=row.id,
        provider=row.provider,
        job_name=row.job_name,
        status=row.status,
        started_at=row.started_at,
        finished_at=row.finished_at,
        requested_by=row.requested_by,
        series_count=row.series_count,
        observation_count=row.observation_count,
        error_summary=row.error_summary,
        created_at=row.created_at,
    )


def _to_external_series_definition_out(row: ExternalSeriesDefinition) -> ExternalSeriesDefinitionOut:
    return ExternalSeriesDefinitionOut(
        code=row.code,
        provider=row.provider,
        dataset_code=row.dataset_code,
        series_id=row.series_id,
        name=row.name,
        category=row.category,
        frequency=row.frequency,
        unit_code=row.unit_code,
        source_url=row.source_url,
        description=row.description,
        query_params=row.query_params,
        transform_rule=row.transform_rule,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
        version=row.version,
    )


def _to_external_series_observation_out(row: ExternalSeriesObservation) -> ExternalSeriesObservationOut:
    return ExternalSeriesObservationOut(
        id=row.id,
        series_code=row.series_code,
        observation_date=row.observation_date,
        value=float(row.value),
        unit_code=row.unit_code,
        source_provider=row.source_provider,
        source_series_id=row.source_series_id,
        source_frequency=row.source_frequency,
        source_published_at=row.source_published_at,
        source_revision=row.source_revision,
        downloaded_at=row.downloaded_at,
        run_id=row.run_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_observation_out(row: PriceIndexObservation) -> PriceIndexObservationOut:
    return PriceIndexObservationOut(
        id=row.id,
        price_index_code=row.price_index_code,
        observation_date=row.observation_date,
        value=float(row.value),
        unit_code=row.unit_code,
        currency_code=row.currency_code,
        source_provider=row.source_provider,
        source_series_id=row.source_series_id,
        source_frequency=row.source_frequency,
        source_published_at=row.source_published_at,
        source_revision=row.source_revision,
        downloaded_at=row.downloaded_at,
        run_id=row.run_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
