from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.http import execute_http_action
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.pipeline_reference_standards import (
    DEFAULT_PIPELINE_COMMODITY_FAMILY,
    DEFAULT_PIPELINE_JURISDICTION_TYPE,
    DEFAULT_PIPELINE_TOPOLOGY_MODEL,
    list_pipeline_commodity_families,
    list_pipeline_jurisdiction_types,
    list_pipeline_topology_models,
    normalize_pipeline_commodity_family,
    normalize_pipeline_jurisdiction_type,
    normalize_pipeline_topology_model,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_pipeline_detail import ReferencePipelineDetail
from apps.api.app.schemas.reference_data import (
    PipelineDetailCreate,
    PipelineDetailOut,
    PipelineDetailStandardsOut,
    PipelineDetailStatusUpdate,
    PipelineDetailUpdate,
)

from .common import (
    clean_optional_text,
    ensure_active_location_exists,
    ensure_active_pipeline_asset_exists,
)

router = APIRouter()


def _to_pipeline_detail_out(record: ReferencePipelineDetail) -> PipelineDetailOut:
    return PipelineDetailOut(
        pipeline_code=record.pipeline_code,
        commodity_family=record.commodity_family,
        jurisdiction_type=record.jurisdiction_type,
        topology_model=record.topology_model,
        market_hub_location_code=record.market_hub_location_code,
        in_service_year=record.in_service_year,
        cross_border=record.cross_border,
        is_bidirectional=record.is_bidirectional,
        tariff_url=record.tariff_url,
        ebb_url=record.ebb_url,
        is_active=record.is_active,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _get_pipeline_detail_record(db: Session, pipeline_code: str) -> ReferencePipelineDetail:
    normalized_pipeline_code = normalize_code(pipeline_code)
    record = db.execute(
        select(ReferencePipelineDetail).where(
            ReferencePipelineDetail.pipeline_code == normalized_pipeline_code
        )
    ).scalars().first()
    if record is None:
        raise HTTPException(status_code=404, detail="ReferencePipelineDetail not found")
    return record


def _normalize_market_hub_location_code(db: Session, value: Optional[str]) -> Optional[str]:
    if value is None or not value.strip():
        return None
    return ensure_active_location_exists(db, value)


def _build_pipeline_detail_values(
    db: Session,
    payload: PipelineDetailCreate | PipelineDetailUpdate,
    *,
    current_record: ReferencePipelineDetail | None = None,
) -> dict[str, object]:
    provided_fields = payload.model_fields_set if current_record is not None else None

    def use_value(field_name: str, fallback: object) -> object:
        if current_record is None:
            return getattr(payload, field_name)
        if field_name in provided_fields:
            return getattr(payload, field_name)
        return fallback

    return {
        "commodity_family": normalize_pipeline_commodity_family(
            str(use_value("commodity_family", current_record.commodity_family if current_record else ""))
        ),
        "jurisdiction_type": normalize_pipeline_jurisdiction_type(
            str(use_value("jurisdiction_type", current_record.jurisdiction_type if current_record else ""))
        ),
        "topology_model": normalize_pipeline_topology_model(
            str(use_value("topology_model", current_record.topology_model if current_record else ""))
        ),
        "market_hub_location_code": _normalize_market_hub_location_code(
            db,
            use_value(
                "market_hub_location_code",
                current_record.market_hub_location_code if current_record else None,
            ),
        ),
        "in_service_year": use_value(
            "in_service_year",
            current_record.in_service_year if current_record else None,
        ),
        "cross_border": bool(
            use_value("cross_border", current_record.cross_border if current_record else False)
        ),
        "is_bidirectional": bool(
            use_value(
                "is_bidirectional",
                current_record.is_bidirectional if current_record else False,
            )
        ),
        "tariff_url": clean_optional_text(
            use_value("tariff_url", current_record.tariff_url if current_record else None)
        ),
        "ebb_url": clean_optional_text(
            use_value("ebb_url", current_record.ebb_url if current_record else None)
        ),
        "effective_from": use_value(
            "effective_from",
            current_record.effective_from if current_record else None,
        ),
        "effective_to": use_value(
            "effective_to",
            current_record.effective_to if current_record else None,
        ),
    }


@router.get("/pipeline-details", response_model=List[PipelineDetailOut])
def list_pipeline_details(
    q: Optional[str] = None,
    commodity_family: Optional[str] = None,
    jurisdiction_type: Optional[str] = None,
    topology_model: Optional[str] = None,
    cross_border: Optional[bool] = None,
    is_bidirectional: Optional[bool] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[PipelineDetailOut]:
    stmt = (
        select(ReferencePipelineDetail)
        .join(ReferenceAsset, ReferenceAsset.code == ReferencePipelineDetail.pipeline_code)
        .order_by(ReferencePipelineDetail.pipeline_code.asc())
        .limit(limit)
        .offset(offset)
    )

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ReferencePipelineDetail.pipeline_code.ilike(pattern),
                ReferenceAsset.name.ilike(pattern),
                ReferenceAsset.description.ilike(pattern),
                ReferencePipelineDetail.commodity_family.ilike(pattern),
                ReferencePipelineDetail.jurisdiction_type.ilike(pattern),
                ReferencePipelineDetail.topology_model.ilike(pattern),
            )
        )
    if commodity_family:
        stmt = stmt.where(
            ReferencePipelineDetail.commodity_family
            == normalize_pipeline_commodity_family(commodity_family)
        )
    if jurisdiction_type:
        stmt = stmt.where(
            ReferencePipelineDetail.jurisdiction_type
            == normalize_pipeline_jurisdiction_type(jurisdiction_type)
        )
    if topology_model:
        stmt = stmt.where(
            ReferencePipelineDetail.topology_model
            == normalize_pipeline_topology_model(topology_model)
        )
    if cross_border is not None:
        stmt = stmt.where(ReferencePipelineDetail.cross_border == cross_border)
    if is_bidirectional is not None:
        stmt = stmt.where(ReferencePipelineDetail.is_bidirectional == is_bidirectional)
    if is_active is not None:
        stmt = stmt.where(ReferencePipelineDetail.is_active == is_active)

    rows = db.execute(stmt).scalars().all()
    return [_to_pipeline_detail_out(row) for row in rows]


@router.get("/pipeline-details/standards", response_model=PipelineDetailStandardsOut)
def list_pipeline_detail_standards() -> PipelineDetailStandardsOut:
    return PipelineDetailStandardsOut(
        default_commodity_family=DEFAULT_PIPELINE_COMMODITY_FAMILY,
        commodity_families=list_pipeline_commodity_families(),
        default_jurisdiction_type=DEFAULT_PIPELINE_JURISDICTION_TYPE,
        jurisdiction_types=list_pipeline_jurisdiction_types(),
        default_topology_model=DEFAULT_PIPELINE_TOPOLOGY_MODEL,
        topology_models=list_pipeline_topology_models(),
    )


@router.post("/pipeline-details", response_model=PipelineDetailOut, status_code=201)
def create_pipeline_detail(
    payload: PipelineDetailCreate,
    db: Session = Depends(get_db),
) -> PipelineDetailOut:
    normalized_pipeline_code = ensure_active_pipeline_asset_exists(db, payload.pipeline_code)
    existing = db.execute(
        select(ReferencePipelineDetail).where(
            ReferencePipelineDetail.pipeline_code == normalized_pipeline_code
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pipeline detail already exists",
        )

    values = _build_pipeline_detail_values(db, payload)

    def create_record() -> ReferencePipelineDetail:
        now = datetime.now(timezone.utc)
        actor_id = resolve_audit_actor_id(payload.created_by)
        record = ReferencePipelineDetail(
            pipeline_code=normalized_pipeline_code,
            commodity_family=values["commodity_family"],
            jurisdiction_type=values["jurisdiction_type"],
            topology_model=values["topology_model"],
            market_hub_location_code=values["market_hub_location_code"],
            in_service_year=values["in_service_year"],
            cross_border=values["cross_border"],
            is_bidirectional=values["is_bidirectional"],
            tariff_url=values["tariff_url"],
            ebb_url=values["ebb_url"],
            is_active=True,
            effective_from=values["effective_from"],
            effective_to=values["effective_to"],
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
        )
        db.add(record)
        return record

    record = execute_http_action(db, create_record, commit=True)
    db.refresh(record)
    return _to_pipeline_detail_out(record)


@router.get("/pipeline-details/{pipeline_code}", response_model=PipelineDetailOut)
def get_pipeline_detail(
    pipeline_code: str,
    db: Session = Depends(get_db),
) -> PipelineDetailOut:
    return _to_pipeline_detail_out(_get_pipeline_detail_record(db, pipeline_code))


@router.put("/pipeline-details/{pipeline_code}", response_model=PipelineDetailOut)
def update_pipeline_detail(
    pipeline_code: str,
    payload: PipelineDetailUpdate,
    db: Session = Depends(get_db),
) -> PipelineDetailOut:
    record = _get_pipeline_detail_record(db, pipeline_code)
    values = _build_pipeline_detail_values(db, payload, current_record=record)

    def update_record() -> ReferencePipelineDetail:
        record.commodity_family = values["commodity_family"]
        record.jurisdiction_type = values["jurisdiction_type"]
        record.topology_model = values["topology_model"]
        record.market_hub_location_code = values["market_hub_location_code"]
        record.in_service_year = values["in_service_year"]
        record.cross_border = values["cross_border"]
        record.is_bidirectional = values["is_bidirectional"]
        record.tariff_url = values["tariff_url"]
        record.ebb_url = values["ebb_url"]
        record.effective_from = values["effective_from"]
        record.effective_to = values["effective_to"]
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, update_record, commit=True)
    db.refresh(updated_record)
    return _to_pipeline_detail_out(updated_record)


@router.post("/pipeline-details/{pipeline_code}/deactivate", response_model=PipelineDetailOut)
def deactivate_pipeline_detail(
    pipeline_code: str,
    payload: PipelineDetailStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelineDetailOut:
    record = _get_pipeline_detail_record(db, pipeline_code)

    def update_record() -> ReferencePipelineDetail:
        record.is_active = False
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, update_record, commit=True)
    db.refresh(updated_record)
    return _to_pipeline_detail_out(updated_record)


@router.post("/pipeline-details/{pipeline_code}/activate", response_model=PipelineDetailOut)
def activate_pipeline_detail(
    pipeline_code: str,
    payload: PipelineDetailStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelineDetailOut:
    record = _get_pipeline_detail_record(db, pipeline_code)

    def update_record() -> ReferencePipelineDetail:
        record.is_active = True
        record.updated_at = datetime.now(timezone.utc)
        record.updated_by = resolve_audit_actor_id(payload.updated_by)
        record.version += 1
        return record

    updated_record = execute_http_action(db, update_record, commit=True)
    db.refresh(updated_record)
    return _to_pipeline_detail_out(updated_record)
