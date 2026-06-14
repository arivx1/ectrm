from __future__ import annotations

from dataclasses import dataclass
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.pretrade_reviews import (
    PRETRADE_REVIEW_PRESET_KEY,
    PRETRADE_SHARED_OWNER_KEY,
    parse_pretrade_review_id,
    review_approval_governance_snapshot,
    review_booking_governance_snapshot,
    review_recommendation_run_id,
)
from apps.api.app.domains.trading.services.trade_metadata import build_trade_metadata_contract
from apps.api.app.models.event import Event
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.schemas.trade import TradeMetadataOut, TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


@dataclass(frozen=True)
class _TradePreTradeContext:
    review_id: int
    recommendation_run_id: int | None
    approval_governance_snapshot: object | None
    booking_governance_snapshot: object | None


def _trade_pretrade_context_lookup(db: Session, trade_ids: list[str]) -> dict[str, _TradePreTradeContext]:
    normalized_ids = sorted({trade_id.strip() for trade_id in trade_ids if trade_id and trade_id.strip()})
    if not normalized_ids:
        return {}

    event_rows = db.execute(
        select(Event.aggregate_id, Event.payload).where(
            Event.aggregate_type == "trade",
            Event.event_type == "TradeCreated",
            Event.aggregate_id.in_(normalized_ids),
        )
    ).all()
    review_id_by_trade: dict[str, int] = {}
    for trade_id, payload in event_rows:
        if not isinstance(payload, dict):
            continue
        try:
            review_id = parse_pretrade_review_id(payload.get("pretrade_review_id"))
        except ValueError:
            continue
        if review_id is not None:
            review_id_by_trade[trade_id] = review_id

    if not review_id_by_trade:
        return {}

    review_rows = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == PRETRADE_REVIEW_PRESET_KEY,
            ReportPreset.scope_owner_key == PRETRADE_SHARED_OWNER_KEY,
            ReportPreset.id.in_(sorted(set(review_id_by_trade.values()))),
        )
    ).scalars().all()
    review_by_id = {row.id: row for row in review_rows}

    context_by_trade_id: dict[str, _TradePreTradeContext] = {}
    for trade_id, review_id in review_id_by_trade.items():
        record = review_by_id.get(review_id)
        if record is None:
            continue
        context_by_trade_id[trade_id] = _TradePreTradeContext(
            review_id=review_id,
            recommendation_run_id=review_recommendation_run_id(record),
            approval_governance_snapshot=review_approval_governance_snapshot(record),
            booking_governance_snapshot=review_booking_governance_snapshot(record),
        )
    return context_by_trade_id


def _to_trade_out(row: Trade, *, pretrade_context: _TradePreTradeContext | None = None) -> TradeOut:
    return TradeOut(
        trade_id=row.trade_id,
        originating_option_trade_id=row.originating_option_trade_id,
        external_trade_id=row.external_trade_id,
        source_system=row.source_system,
        created_at=row.created_at,
        updated_at=row.updated_at,
        execution_timestamp=row.execution_timestamp,
        trade_date=row.trade_date,
        effective_start_date=row.effective_start_date,
        effective_end_date=row.effective_end_date,
        quality_spec=row.quality_spec,
        unit_of_measure=row.unit_of_measure,
        trade_currency_code=row.trade_currency_code,
        location_code=row.location_code,
        delivery_start=row.delivery_start,
        delivery_end=row.delivery_end,
        price_unit_code=row.price_unit_code,
        instrument_type=row.instrument_type,
        option_type=row.option_type,
        option_style=row.option_style,
        option_strike_price=float(row.option_strike_price) if row.option_strike_price is not None else None,
        option_expiration_date=row.option_expiration_date,
        trade_nature=row.trade_nature,
        trade_structure=row.trade_structure,
        trade_side=row.trade_side,
        book=row.book,
        portfolio=row.portfolio,
        counterparty=row.counterparty,
        commodity_class=row.commodity_class,
        commodity=row.commodity,
        pricing_type=row.pricing_type,
        pricing_status=row.pricing_status,
        confirmation_status=row.confirmation_status,
        nomination_status=row.nomination_status,
        allocation_status=row.allocation_status,
        actualization_status=row.actualization_status,
        price_index_code=row.price_index_code,
        price=float(row.price) if row.price is not None else None,
        volume=float(row.volume) if row.volume is not None else None,
        invoice_status=row.invoice_status,
        payment_status=row.payment_status,
        settlement_status=row.settlement_status,
        trader_user=row.trader_user,
        status=row.status,
        last_event_id=row.last_event_id,
        pretrade_review_id=pretrade_context.review_id if pretrade_context is not None else None,
        pretrade_recommendation_run_id=pretrade_context.recommendation_run_id if pretrade_context is not None else None,
        pretrade_approval_governance_snapshot=(
            pretrade_context.approval_governance_snapshot if pretrade_context is not None else None
        ),
        pretrade_booking_governance_snapshot=(
            pretrade_context.booking_governance_snapshot if pretrade_context is not None else None
        ),
    )


@router.get("", response_model=List[TradeOut])
def list_trades(
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[TradeOut]:
    rows = db.execute(
        select(Trade)
        .order_by(*trade_recency_order())
        .offset(offset)
        .limit(limit)
    ).scalars().all()
    pretrade_context_by_trade_id = _trade_pretrade_context_lookup(db, [row.trade_id for row in rows])
    return [
        _to_trade_out(
            row,
            pretrade_context=pretrade_context_by_trade_id.get(row.trade_id),
        )
        for row in rows
    ]


@router.get("/metadata", response_model=TradeMetadataOut)
def get_trade_metadata() -> TradeMetadataOut:
    return build_trade_metadata_contract()


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: str, db: Session = Depends(get_db)) -> TradeOut:
    r = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()

    if r is None:
        raise HTTPException(status_code=404, detail="Trade not found")

    return _to_trade_out(
        r,
        pretrade_context=_trade_pretrade_context_lookup(db, [r.trade_id]).get(r.trade_id),
    )
