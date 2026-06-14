from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.layout_definition import LayoutDefinition
from apps.api.app.schemas.layout_definition import LayoutDefinitionOut, LayoutDefinitionUpdate, LayoutTileSpan

router = APIRouter(prefix="/layout-definitions", tags=["layout-definitions"])

WORKSPACE_TILE_SPANS: dict[str, dict[str, tuple[LayoutTileSpan, ...]]] = {
    "dashboard": {
        "desk-snapshot": ("full", "wide"),
        "market-prices": ("full", "wide"),
        "position-snapshot": ("full", "wide", "half"),
        "operational-attention": ("full", "wide", "half", "side"),
        "recent-timeline": ("full", "wide", "half", "side"),
    },
    "events": {
        "events-controls": ("full", "wide", "half", "side"),
        "events-breakdown": ("full", "wide", "half", "side"),
        "events-stream": ("full", "wide", "half"),
    },
    "risk": {
        "risk-summary": ("full", "wide"),
        "risk-exposure": ("full", "wide", "half"),
        "risk-pricing": ("full", "wide", "half"),
        "risk-books": ("full", "wide"),
    },
    "positions": {
        "positions-summary": ("full", "wide"),
        "positions-by-class": ("full", "wide", "half"),
        "positions-detail": ("full", "wide", "half"),
    },
    "shipments": {
        "shipment-summary": ("full", "wide"),
        "shipment-readiness": ("full", "wide", "half"),
        "shipment-blockers": ("full", "wide", "half"),
        "shipment-queue": ("full", "wide"),
    },
    "scheduling": {
        "scheduling-board": ("full", "wide"),
        "scheduling-attention": ("full", "wide"),
        "scheduling-lanes": ("full", "wide", "half"),
        "scheduling-windows": ("full", "wide", "half"),
        "scheduling-handoffs": ("full", "wide", "half"),
    },
    "pretrade": {
        "pretrade-brief": ("full", "wide", "half"),
        "pretrade-recommendation": ("wide", "half", "side"),
        "pretrade-context": ("full", "wide", "half"),
        "pretrade-scenarios": ("wide", "half", "side"),
        "pretrade-reviews": ("wide", "half", "side"),
    },
    "trades": {
        "create-trade": ("full", "wide"),
        "trade-inspector": ("wide", "half", "side"),
        "trade-pricing-coverage": ("wide", "half", "side"),
        "trade-pending-pricing": ("wide", "half", "side"),
        "trade-books-in-play": ("wide", "half", "side"),
        "trade-largest-line": ("wide", "half", "side"),
        "trade-board": ("full", "wide"),
    },
    "operations": {
        "operations-snapshot": ("full", "wide"),
        "operations-queue": ("full", "wide"),
        "operations-documents": ("full", "wide", "half"),
        "operations-coverage": ("full", "wide", "half"),
        "operations-feeds": ("full", "wide", "half"),
    },
    "settlement": {
        "settlement-summary": ("full", "wide"),
        "settlement-status": ("full", "wide", "half"),
        "settlement-disputes": ("full", "wide", "half"),
        "settlement-queue": ("full", "wide"),
    },
    "reports": {
        "reports-data-sources": ("full", "wide", "half"),
        "reports-draft-validator": ("full", "wide", "half"),
        "reports-overview": ("full", "wide"),
        "reports-trading-eod": ("full", "wide"),
        "reports-exposure": ("full", "wide", "half"),
        "reports-activity": ("full", "wide", "half"),
        "reports-valuation-snapshot": ("full", "wide"),
        "reports-valuation-compare": ("full", "wide"),
        "reports-credit": ("full", "wide"),
        "reports-settlement-lens": ("full", "wide"),
        "reports-settlement-aging": ("full", "wide"),
        "reports-cash-forecast": ("full", "wide", "half"),
        "reports-settlement-exceptions": ("full", "wide"),
    },
}
WORKSPACE_TILE_IDS: dict[str, tuple[str, ...]] = {
    workspace_id: tuple(tile_spans.keys()) for workspace_id, tile_spans in WORKSPACE_TILE_SPANS.items()
}
WORKSPACE_SECTION_IDS: dict[str, dict[str, tuple[str, ...]]] = {
    "operations": {
        "operations-snapshot-cards": (
            "open-workflow",
            "unassigned",
            "due-next-48h",
            "blocked-queue",
            "active-credit-exceptions",
            "option-expiry-alerts",
        ),
    },
    "positions": {
        "positions-summary-cards": (
            "gross-exposure",
            "open-positions",
            "largest-class",
            "freshest-update",
        ),
    },
    "reports": {
        "reports-overview-cards": (
            "active-trades",
            "tracked-commodities",
            "gross-net-volume",
            "pnl-snapshot",
        ),
    },
    "risk": {
        "risk-summary-cards": (
            "gross-linear-exposure",
            "pricing-coverage",
            "largest-linear-class",
            "largest-linear-ticket",
            "open-option-tickets",
            "net-option-delta-proxy",
            "premium-at-risk",
            "marked-open-options",
            "itm-open-options",
            "profitable-at-mark",
            "expiry-alerts",
            "booked-option-pairs",
            "net-package-cashflow",
            "next-option-expiry",
        ),
    },
    "settlement": {
        "settlement-summary-cards": (
            "open-settlement",
            "unissued-invoices",
            "due-overdue",
            "fully-settled",
        ),
    },
    "shipments": {
        "shipment-summary-cards": (
            "tracked-deliveries",
            "logistics-moves",
            "pipeline-flows",
            "power-schedules",
            "manual-overrides",
        ),
    },
}


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


def _workspace_tile_ids(workspace_id: str) -> tuple[str, ...]:
    tile_spans = WORKSPACE_TILE_SPANS.get(workspace_id)
    if tile_spans is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{workspace_id}' does not support personal layouts.",
        )
    return tuple(tile_spans.keys())


def _workspace_tile_spans(workspace_id: str) -> dict[str, tuple[LayoutTileSpan, ...]]:
    tile_spans = WORKSPACE_TILE_SPANS.get(workspace_id)
    if tile_spans is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{workspace_id}' does not support personal layouts.",
        )
    return tile_spans


def _workspace_section_ids(workspace_id: str) -> dict[str, tuple[str, ...]]:
    _workspace_tile_ids(workspace_id)
    return WORKSPACE_SECTION_IDS.get(workspace_id, {})


def _validate_layout_payload(workspace_id: str, payload: LayoutDefinitionUpdate) -> None:
    tile_spans = _workspace_tile_spans(workspace_id)
    allowed_tile_ids = set(tile_spans)
    tile_ids = tuple(tile_spans.keys())
    section_ids = _workspace_section_ids(workspace_id)

    if set(payload.order) != allowed_tile_ids or len(payload.order) != len(tile_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Layout order must include each supported tile exactly once for workspace '{workspace_id}'.",
        )

    unknown_hidden_tiles = [tile_id for tile_id in payload.hidden if tile_id not in allowed_tile_ids]
    if unknown_hidden_tiles:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Hidden tiles are not supported for workspace '{workspace_id}': {', '.join(unknown_hidden_tiles)}.",
        )

    unknown_span_tiles = [tile_id for tile_id in payload.spans if tile_id not in allowed_tile_ids]
    if unknown_span_tiles:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Span overrides are not supported for workspace '{workspace_id}': {', '.join(unknown_span_tiles)}.",
        )

    for tile_id, span in payload.spans.items():
        allowed_spans = tile_spans[tile_id]
        if span not in allowed_spans:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Span '{span}' is not supported for tile '{tile_id}' in workspace '{workspace_id}'. "
                    f"Allowed spans: {', '.join(allowed_spans)}."
                ),
            )

    unknown_sections = [section_id for section_id in payload.sections if section_id not in section_ids]
    if unknown_sections:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nested sections are not supported for workspace '{workspace_id}': {', '.join(unknown_sections)}.",
        )

    for section_id, item_order in payload.sections.items():
        allowed_item_ids = section_ids[section_id]
        if set(item_order) != set(allowed_item_ids) or len(item_order) != len(allowed_item_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Section '{section_id}' order must include each supported item exactly once "
                    f"for workspace '{workspace_id}'."
                ),
            )


def _to_out(record: LayoutDefinition) -> LayoutDefinitionOut:
    return LayoutDefinitionOut(
        workspace_id=record.workspace_id,
        order=list(record.tile_order),
        hidden=list(record.hidden_tiles),
        spans=dict(record.tile_spans or {}),
        sections=dict(record.tile_sections or {}),
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


@router.get("/{workspace_id}", response_model=Optional[LayoutDefinitionOut])
def get_layout_definition(
    workspace_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[LayoutDefinitionOut]:
    actor_id = _require_authenticated_actor(request)
    _workspace_tile_ids(workspace_id)

    record = db.execute(
        select(LayoutDefinition).where(
            LayoutDefinition.user_id == actor_id,
            LayoutDefinition.workspace_id == workspace_id,
        )
    ).scalars().first()
    if record is None:
        return None

    return _to_out(record)


@router.put("/{workspace_id}", response_model=LayoutDefinitionOut)
def upsert_layout_definition(
    workspace_id: str,
    payload: LayoutDefinitionUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> LayoutDefinitionOut:
    actor_id = _require_authenticated_actor(request)
    _validate_layout_payload(workspace_id, payload)

    now = datetime.now(timezone.utc)
    record = db.execute(
        select(LayoutDefinition).where(
            LayoutDefinition.user_id == actor_id,
            LayoutDefinition.workspace_id == workspace_id,
        )
    ).scalars().first()

    if record is None:
        record = LayoutDefinition(
            user_id=actor_id,
            workspace_id=workspace_id,
            tile_order=payload.order,
            hidden_tiles=payload.hidden,
            tile_spans=dict(payload.spans),
            tile_sections={section_id: list(item_ids) for section_id, item_ids in payload.sections.items()},
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
        )
        db.add(record)
    else:
        record.tile_order = payload.order
        record.hidden_tiles = payload.hidden
        record.tile_spans = dict(payload.spans)
        record.tile_sections = {section_id: list(item_ids) for section_id, item_ids in payload.sections.items()}
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1

    db.commit()
    db.refresh(record)
    return _to_out(record)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_layout_definition(
    workspace_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    actor_id = _require_authenticated_actor(request)
    _workspace_tile_ids(workspace_id)

    record = db.execute(
        select(LayoutDefinition).where(
            LayoutDefinition.user_id == actor_id,
            LayoutDefinition.workspace_id == workspace_id,
        )
    ).scalars().first()
    if record is not None:
        db.delete(record)
        db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
