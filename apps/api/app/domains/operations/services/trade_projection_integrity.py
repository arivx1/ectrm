from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.event import Event
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_credit_approval_decision import TradeCreditApprovalDecision
from apps.api.app.models.trade_credit_exception import TradeCreditException
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.domains.risk.services.option_exposures import rebuild_option_exposures_projection

ZERO = Decimal("0")
AUTO_CLEANABLE_ISSUE_TYPES = ("missing_last_event_no_trade_events",)

DEPENDENT_MODELS: tuple[tuple[str, object], ...] = (
    ("trade_price_terms", TradePriceTerm),
    ("trade_legs", TradeLeg),
    ("delivery_obligations", DeliveryObligation),
    ("option_exposures", OptionExposure),
    ("trade_actualizations", TradeActualization),
    ("trade_confirmations", TradeConfirmation),
    ("trade_credit_approval_decisions", TradeCreditApprovalDecision),
    ("trade_credit_exceptions", TradeCreditException),
    ("trade_invoices", TradeInvoice),
    ("trade_payments", TradePayment),
    ("trade_workflow_items", TradeWorkflowItem),
)


@dataclass(frozen=True)
class TradeProjectionIntegrityIssue:
    trade_id: str
    last_event_id: str
    issue_type: str
    created_at: datetime
    updated_at: datetime
    matching_trade_event_count: int
    dependent_counts: dict[str, int]
    last_event_aggregate_type: str | None = None
    last_event_aggregate_id: str | None = None

    @property
    def is_auto_cleanable(self) -> bool:
        return self.issue_type in AUTO_CLEANABLE_ISSUE_TYPES


@dataclass(frozen=True)
class TradeProjectionCleanupSummary:
    scanned_issue_count: int
    deleted_trade_ids: tuple[str, ...]
    skipped_trade_ids: tuple[str, ...]
    deleted_row_counts: dict[str, int]
    positions_rebuilt: int
    option_exposures_rebuilt: int


def list_trade_projection_integrity_issues(
    db: Session,
    *,
    trade_ids: list[str] | None = None,
) -> list[TradeProjectionIntegrityIssue]:
    stmt = select(Trade).order_by(*trade_recency_order())
    if trade_ids:
        stmt = stmt.where(Trade.trade_id.in_(trade_ids))

    trades = db.execute(stmt).scalars().all()
    issues: list[TradeProjectionIntegrityIssue] = []
    for trade in trades:
        matching_trade_event_count = int(
            db.execute(
                select(func.count())
                .select_from(Event)
                .where(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == trade.trade_id,
                )
            ).scalar_one()
        )
        last_event = db.execute(select(Event).where(Event.event_id == trade.last_event_id)).scalars().first()

        issue_type: str | None = None
        if last_event is None:
            if matching_trade_event_count == 0:
                issue_type = "missing_last_event_no_trade_events"
            else:
                issue_type = "missing_last_event_with_trade_events"
        elif last_event.aggregate_type != "trade" or last_event.aggregate_id != trade.trade_id:
            issue_type = "last_event_points_to_other_aggregate"

        if issue_type is None:
            continue

        issues.append(
            TradeProjectionIntegrityIssue(
                trade_id=trade.trade_id,
                last_event_id=trade.last_event_id,
                issue_type=issue_type,
                created_at=trade.created_at,
                updated_at=trade.updated_at,
                matching_trade_event_count=matching_trade_event_count,
                dependent_counts=_count_dependent_rows(db, trade.trade_id),
                last_event_aggregate_type=last_event.aggregate_type if last_event is not None else None,
                last_event_aggregate_id=last_event.aggregate_id if last_event is not None else None,
            )
        )

    return issues


def cleanup_auto_cleanable_trade_projection_issues(
    db: Session,
    *,
    trade_ids: list[str] | None = None,
) -> TradeProjectionCleanupSummary:
    issues = list_trade_projection_integrity_issues(db, trade_ids=trade_ids)
    candidates = [issue for issue in issues if issue.is_auto_cleanable]
    skipped_trade_ids = tuple(issue.trade_id for issue in issues if not issue.is_auto_cleanable)

    deleted_row_counts = {table_name: 0 for table_name, _ in DEPENDENT_MODELS}
    deleted_row_counts["trades"] = 0
    if not candidates:
        return TradeProjectionCleanupSummary(
            scanned_issue_count=len(issues),
            deleted_trade_ids=(),
            skipped_trade_ids=skipped_trade_ids,
            deleted_row_counts=deleted_row_counts,
            positions_rebuilt=_count_positions(db),
            option_exposures_rebuilt=_count_option_exposures(db),
        )

    candidate_trade_ids = [issue.trade_id for issue in candidates]

    for table_name, model in DEPENDENT_MODELS:
        deleted_row_counts[table_name] = int(
            db.execute(delete(model).where(model.trade_id.in_(candidate_trade_ids))).rowcount or 0
        )

    deleted_row_counts["trades"] = int(
        db.execute(delete(Trade).where(Trade.trade_id.in_(candidate_trade_ids))).rowcount or 0
    )

    positions_rebuilt = rebuild_positions_projection(db)
    option_exposures_rebuilt = rebuild_option_exposures_projection(db)

    return TradeProjectionCleanupSummary(
        scanned_issue_count=len(issues),
        deleted_trade_ids=tuple(candidate_trade_ids),
        skipped_trade_ids=skipped_trade_ids,
        deleted_row_counts=deleted_row_counts,
        positions_rebuilt=positions_rebuilt,
        option_exposures_rebuilt=option_exposures_rebuilt,
    )


def rebuild_positions_projection(db: Session) -> int:
    db.execute(text("DELETE FROM positions"))
    db.flush()

    trades = db.execute(select(Trade)).scalars().all()
    legs_by_trade_id: dict[str, list[TradeLeg]] = {}
    for leg in db.execute(
        select(TradeLeg).order_by(TradeLeg.trade_id.asc(), TradeLeg.leg_no.asc())
    ).scalars():
        legs_by_trade_id.setdefault(leg.trade_id, []).append(leg)

    totals: dict[str, dict[str, object]] = {}
    now = datetime.now(timezone.utc)

    for trade in trades:
        if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
            continue
        if str(getattr(trade, "instrument_type", "LINEAR") or "LINEAR").strip().upper() == "OPTION":
            continue

        trade_updated_at = trade.updated_at or now
        legs = legs_by_trade_id.get(trade.trade_id, [])
        if legs:
            for leg in legs:
                _accumulate_position(
                    totals,
                    leg.commodity_code,
                    _signed_quantity(leg.side, leg.quantity),
                    leg.updated_at or trade_updated_at,
                )
            continue

        _accumulate_position(
            totals,
            trade.commodity,
            _signed_quantity(trade.trade_side, trade.volume),
            trade_updated_at,
        )

    count = 0
    for commodity, payload in totals.items():
        net_volume = Decimal(str(payload["net_volume"]))
        if net_volume == ZERO:
            continue
        db.add(
            Position(
                commodity=commodity,
                net_volume=net_volume,
                updated_at=payload["updated_at"],
            )
        )
        count += 1
    db.flush()
    return count


def _count_dependent_rows(db: Session, trade_id: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table_name, model in DEPENDENT_MODELS:
        counts[table_name] = int(
            db.execute(
                select(func.count())
                .select_from(model)
                .where(model.trade_id == trade_id)
            ).scalar_one()
        )
    return counts


def _signed_quantity(side: str | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    if (side or "BUY").strip().upper() == "SELL":
        return volume * Decimal("-1")
    return volume


def _accumulate_position(
    totals: dict[str, dict[str, object]],
    commodity: str | None,
    delta: Decimal,
    updated_at: datetime,
) -> None:
    normalized_commodity = str(commodity or "UNKNOWN").strip().upper() or "UNKNOWN"
    if delta == ZERO:
        return

    current = totals.setdefault(
        normalized_commodity,
        {"net_volume": ZERO, "updated_at": updated_at},
    )
    current["net_volume"] = Decimal(str(current["net_volume"])) + delta
    if updated_at > current["updated_at"]:
        current["updated_at"] = updated_at


def _count_positions(db: Session) -> int:
    return int(db.execute(select(func.count()).select_from(Position)).scalar_one())


def _count_option_exposures(db: Session) -> int:
    return int(db.execute(select(func.count()).select_from(OptionExposure)).scalar_one())
