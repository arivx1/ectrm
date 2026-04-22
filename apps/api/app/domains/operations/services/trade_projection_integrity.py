from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.settlement_payments import (
    derive_trade_payment_projection,
    synchronize_trade_payment_projection,
)
from apps.api.app.domains.operations.services.trade_confirmations import create_trade_confirmation
from apps.api.app.domains.operations.services.workflow_items import set_trade_workflow_item_projection
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.event import Event
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
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
from apps.api.app.shared.enums import (
    ActualizationStatus,
    ConfirmationStatus,
    OptionSettlementStatus,
    PaymentStatus,
    SettlementStatus,
    TradeStatus,
    TradeWorkflowType,
)

ZERO = Decimal("0")
AUTO_CLEANABLE_ISSUE_TYPES = ("missing_last_event_no_trade_events",)

DEPENDENT_MODELS: tuple[tuple[str, object], ...] = (
    ("trade_price_terms", TradePriceTerm),
    ("trade_legs", TradeLeg),
    ("delivery_obligations", DeliveryObligation),
    ("option_exposures", OptionExposure),
    ("trade_actualizations", TradeActualization),
    ("trade_accrual_entries", TradeAccrualEntry),
    ("trade_accrual_lots", TradeAccrualLot),
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


@dataclass(frozen=True)
class TradeProjectionInvariantIssue:
    trade_id: str
    issue_type: str
    expected_value: str | None
    actual_value: str | None
    details: dict[str, object]


@dataclass(frozen=True)
class TradeOperationalProjectionRebuildSummary:
    trade_id: str
    before_issue_count: int
    after_issue_count: int
    resolved_issue_types: tuple[str, ...]
    confirmation_record_present: bool
    option_settlement_workflow_present: bool


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


def list_trade_projection_invariant_issues(
    db: Session,
    *,
    trade_ids: list[str] | None = None,
    now: datetime | None = None,
) -> list[TradeProjectionInvariantIssue]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stmt = select(Trade).order_by(*trade_recency_order())
    if trade_ids:
        stmt = stmt.where(Trade.trade_id.in_(trade_ids))

    issues: list[TradeProjectionInvariantIssue] = []
    for trade in db.execute(stmt).scalars().all():
        issues.extend(_actualization_invariant_issues(db, trade=trade))
        issues.extend(_delivery_invariant_issues(db, trade=trade))
        issues.extend(_settlement_invariant_issues(db, trade=trade, now=reference_time))
        issues.extend(_confirmation_invariant_issues(db, trade=trade))
        issues.extend(_option_settlement_invariant_issues(db, trade=trade))
    return issues


def rebuild_trade_operational_projection(
    db: Session,
    *,
    trade_id: str,
    actor_id: str,
    now: datetime | None = None,
) -> TradeOperationalProjectionRebuildSummary:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = db.get(Trade, trade_id)
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")

    before = list_trade_projection_invariant_issues(db, trade_ids=[trade_id], now=reference_time)
    before_issue_types = {issue.issue_type for issue in before}

    if _expected_actualization_status(trade) == ActualizationStatus.NOT_REQUIRED.value:
        trade.actualization_status = ActualizationStatus.NOT_REQUIRED.value
        db.execute(delete(DeliveryObligation).where(DeliveryObligation.trade_id == trade.trade_id))
        set_trade_workflow_item_projection(
            db,
            trade=trade,
            workflow_type=TradeWorkflowType.ACTUALIZATION.value,
            status=ActualizationStatus.NOT_REQUIRED.value,
            actor_id=actor_id,
            now=reference_time,
            rollup_settlement_status=False,
        )

    if _trade_has_invoices(db, trade_id=trade.trade_id):
        synchronize_trade_payment_projection(db, trade=trade, actor_id=actor_id, now=reference_time)

    confirmation = _latest_confirmation(db, trade_id=trade.trade_id)
    if confirmation is None and _requires_confirmation_projection(trade):
        confirmation_out = create_trade_confirmation(
            db,
            trade_id=trade.trade_id,
            actor_id=actor_id,
            status=ConfirmationStatus.PENDING.value,
            now=reference_time,
            enforce_credit_hold_status_change=False,
        )
        confirmation = db.get(TradeConfirmation, confirmation_out.confirmation_id)
    if confirmation is not None:
        set_trade_workflow_item_projection(
            db,
            trade=trade,
            workflow_type=TradeWorkflowType.CONFIRMATION.value,
            status=confirmation.status,
            actor_id=actor_id,
            now=reference_time,
            rollup_settlement_status=False,
        )

    if _is_exercised_option_trade(db, trade=trade):
        set_trade_workflow_item_projection(
            db,
            trade=trade,
            workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
            status=OptionSettlementStatus.PENDING.value,
            actor_id=actor_id,
            now=reference_time,
            rollup_settlement_status=False,
        )

    trade.updated_at = reference_time
    db.flush()

    after = list_trade_projection_invariant_issues(db, trade_ids=[trade_id], now=reference_time)
    after_issue_types = {issue.issue_type for issue in after}
    return TradeOperationalProjectionRebuildSummary(
        trade_id=trade_id,
        before_issue_count=len(before),
        after_issue_count=len(after),
        resolved_issue_types=tuple(sorted(before_issue_types - after_issue_types)),
        confirmation_record_present=_latest_confirmation(db, trade_id=trade_id) is not None,
        option_settlement_workflow_present=_workflow_item(
            db,
            trade_id=trade_id,
            workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
        )
        is not None,
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


def _actualization_invariant_issues(
    db: Session,
    *,
    trade: Trade,
) -> list[TradeProjectionInvariantIssue]:
    expected_status = _expected_actualization_status(trade)
    actual_status = str(trade.actualization_status or "").strip().upper()
    if actual_status == expected_status:
        return []
    return [
        TradeProjectionInvariantIssue(
            trade_id=trade.trade_id,
            issue_type="actualization_status_mismatch",
            expected_value=expected_status,
            actual_value=actual_status or None,
            details={"trade_status": trade.status, "trade_nature": trade.trade_nature},
        )
    ]


def _delivery_invariant_issues(
    db: Session,
    *,
    trade: Trade,
) -> list[TradeProjectionInvariantIssue]:
    delivery_count = int(
        db.execute(
            select(func.count())
            .select_from(DeliveryObligation)
            .where(DeliveryObligation.trade_id == trade.trade_id)
        ).scalar_one()
    )
    if delivery_count == 0 or _expected_actualization_status(trade) != ActualizationStatus.NOT_REQUIRED.value:
        return []
    return [
        TradeProjectionInvariantIssue(
            trade_id=trade.trade_id,
            issue_type="unexpected_delivery_obligation",
            expected_value="0",
            actual_value=str(delivery_count),
            details={"delivery_count": delivery_count},
        )
    ]


def _settlement_invariant_issues(
    db: Session,
    *,
    trade: Trade,
    now: datetime,
) -> list[TradeProjectionInvariantIssue]:
    invoices = db.execute(
        select(TradeInvoice)
        .where(TradeInvoice.trade_id == trade.trade_id)
        .order_by(TradeInvoice.created_at.asc(), TradeInvoice.id.asc())
    ).scalars().all()
    if not invoices:
        return []

    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.trade_id == trade.trade_id)
        .order_by(TradePayment.created_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payments_by_invoice_id: dict[int, list[TradePayment]] = {}
    for payment in payments:
        payments_by_invoice_id.setdefault(payment.invoice_id, []).append(payment)
    projection = derive_trade_payment_projection(
        invoices=invoices,
        payments_by_invoice_id=payments_by_invoice_id,
        now=now,
    )

    issues: list[TradeProjectionInvariantIssue] = []
    if trade.payment_status != projection.payment_status:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="payment_status_mismatch",
                expected_value=projection.payment_status,
                actual_value=trade.payment_status,
                details={"invoice_count": len(invoices), "payment_count": len(payments)},
            )
        )
    if trade.settlement_status != projection.settlement_status:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="settlement_status_mismatch",
                expected_value=projection.settlement_status,
                actual_value=trade.settlement_status,
                details={"invoice_count": len(invoices), "payment_count": len(payments)},
            )
        )

    workflow_item = _workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.PAYMENT.value,
    )
    if workflow_item is None or workflow_item.status != projection.payment_status:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="workflow_status_mismatch",
                expected_value=projection.payment_status,
                actual_value=workflow_item.status if workflow_item is not None else None,
                details={"workflow_type": TradeWorkflowType.PAYMENT.value},
            )
        )
    elif workflow_item.status != trade.payment_status:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="workflow_status_mismatch",
                expected_value=trade.payment_status,
                actual_value=workflow_item.status,
                details={"workflow_type": TradeWorkflowType.PAYMENT.value},
            )
        )
    return issues


def _confirmation_invariant_issues(
    db: Session,
    *,
    trade: Trade,
) -> list[TradeProjectionInvariantIssue]:
    if not _requires_confirmation_projection(trade):
        return []

    issues: list[TradeProjectionInvariantIssue] = []
    confirmation = _latest_confirmation(db, trade_id=trade.trade_id)
    workflow_item = _workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.CONFIRMATION.value,
    )
    if confirmation is None:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="missing_confirmation_record",
                expected_value="present",
                actual_value=None,
                details={},
            )
        )
    if workflow_item is None:
        issues.append(
            TradeProjectionInvariantIssue(
                trade_id=trade.trade_id,
                issue_type="missing_automated_workflow_item",
                expected_value=TradeWorkflowType.CONFIRMATION.value,
                actual_value=None,
                details={"workflow_type": TradeWorkflowType.CONFIRMATION.value},
            )
        )
    return issues


def _option_settlement_invariant_issues(
    db: Session,
    *,
    trade: Trade,
) -> list[TradeProjectionInvariantIssue]:
    if not _is_exercised_option_trade(db, trade=trade):
        return []
    workflow_item = _workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
    )
    if workflow_item is not None:
        return []
    return [
        TradeProjectionInvariantIssue(
            trade_id=trade.trade_id,
            issue_type="missing_option_settlement_workflow",
            expected_value=TradeWorkflowType.OPTION_SETTLEMENT.value,
            actual_value=None,
            details={},
        )
    ]


def _expected_actualization_status(trade: Trade) -> str:
    if trade.status != TradeStatus.ACTIVE.value or trade.trade_nature != "PHYSICAL":
        return ActualizationStatus.NOT_REQUIRED.value
    return trade.actualization_status or ActualizationStatus.PENDING.value


def _requires_confirmation_projection(trade: Trade) -> bool:
    if trade.status != TradeStatus.ACTIVE.value:
        return False
    return str(trade.confirmation_status or "").strip().upper() in {
        ConfirmationStatus.PENDING.value,
        ConfirmationStatus.SENT.value,
        ConfirmationStatus.CONFIRMED.value,
        ConfirmationStatus.DISPUTED.value,
    }


def _is_exercised_option_trade(
    db: Session,
    *,
    trade: Trade,
) -> bool:
    if str(getattr(trade, "instrument_type", "LINEAR") or "LINEAR").strip().upper() != "OPTION":
        return False
    if trade.status == TradeStatus.EXERCISED.value:
        return True
    return (
        db.execute(
            select(Event.event_id)
            .where(
                Event.aggregate_type == "trade",
                Event.aggregate_id == trade.trade_id,
                Event.event_type == "OptionExercised",
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )


def _latest_confirmation(db: Session, *, trade_id: str) -> TradeConfirmation | None:
    return db.execute(
        select(TradeConfirmation)
        .where(TradeConfirmation.trade_id == trade_id)
        .order_by(TradeConfirmation.id.desc())
    ).scalars().first()


def _workflow_item(
    db: Session,
    *,
    trade_id: str,
    workflow_type: str,
) -> TradeWorkflowItem | None:
    return db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade_id,
            TradeWorkflowItem.workflow_type == workflow_type,
        )
    ).scalars().first()


def _trade_has_invoices(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(
            select(TradeInvoice.id)
            .where(TradeInvoice.trade_id == trade_id)
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )


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


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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
