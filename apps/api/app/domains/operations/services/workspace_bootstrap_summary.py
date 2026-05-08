from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.workflow_items import (
    WORKFLOW_CLOSED_STATUS_VALUES,
    WORKFLOW_TYPE_TO_QUEUE,
)
from apps.api.app.domains.operations.services.settlement_invoices import (
    count_invoice_issue_candidates,
)
from apps.api.app.domains.operations.services.trade_attention_candidates import (
    DASHBOARD_ATTENTION_CANDIDATE_TYPE_NAMES,
    count_trade_attention_candidates,
    count_trade_attention_candidates_for_types,
)
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem

ACTIVE_TRADE_STATUS = "ACTIVE"
OTHER_COMMODITY_CLASS = "OTHER"
UNIT_TBD_LABEL = "Unit TBD"
MIXED_UOM_LABEL = "Mixed UOM"
SETTLEMENT_BREAKDOWN_ORDER = (
    "PENDING",
    "INVOICED",
    "PARTIALLY_SETTLED",
    "SETTLED",
    "DISPUTED",
)


def _count_rows(db: Session, model: type) -> int:
    return int(db.execute(select(func.count()).select_from(model)).scalar_one())


def _normalize_commodity_class(value: object | None) -> str:
    normalized = str(value or "").strip().upper()
    return normalized or OTHER_COMMODITY_CLASS


def _normalize_unit_label(value: object | None) -> str:
    normalized = str(value or "").strip().upper()
    return normalized or UNIT_TBD_LABEL


def _summarize_unit_labels(labels: set[str]) -> str:
    if not labels:
        return UNIT_TBD_LABEL
    return next(iter(labels)) if len(labels) == 1 else MIXED_UOM_LABEL


def _count_trades(db: Session, *conditions: object) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(Trade).where(Trade.status == ACTIVE_TRADE_STATUS, *conditions)
        ).scalar_one()
    )


def _build_dashboard_position_summary(db: Session) -> dict[str, object]:
    unit_labels_by_class: dict[str, set[str]] = {}
    for commodity_class, unit_of_measure in db.execute(
        select(Trade.commodity_class, Trade.unit_of_measure).where(Trade.status == ACTIVE_TRADE_STATUS)
    ).all():
        normalized_class = _normalize_commodity_class(commodity_class)
        labels = unit_labels_by_class.setdefault(normalized_class, set())
        labels.add(_normalize_unit_label(unit_of_measure))

    bucket_rows: list[dict[str, object]] = []
    for commodity_class, net_volume, commodity_count in db.execute(
        select(
            ReferenceCommodity.commodity_class,
            func.coalesce(func.sum(Position.net_volume), 0),
            func.count(Position.commodity),
        )
        .select_from(Position)
        .join(ReferenceCommodity, ReferenceCommodity.code == Position.commodity, isouter=True)
        .group_by(ReferenceCommodity.commodity_class)
    ).all():
        normalized_class = _normalize_commodity_class(commodity_class)
        bucket_rows.append(
            {
                "commodity_class": normalized_class,
                "unit_label": _summarize_unit_labels(unit_labels_by_class.get(normalized_class, set())),
                "net_volume": float(net_volume or 0),
                "commodity_count": int(commodity_count or 0),
            }
        )

    bucket_rows.sort(key=lambda row: (str(row["commodity_class"]), str(row["unit_label"])))
    largest_bucket = max(bucket_rows, key=lambda row: abs(float(row["net_volume"])), default=None)

    return {
        "gross_exposure": float(sum(abs(float(row["net_volume"])) for row in bucket_rows)),
        "position_count": _count_rows(db, Position),
        "bucket_count": len(bucket_rows),
        "buckets": bucket_rows,
        "largest_bucket": largest_bucket,
    }


def _build_dashboard_attention_summary(db: Session, *, now: datetime) -> dict[str, int]:
    counts = {
        "confirmation_backlog_count": count_trade_attention_candidates(db, "confirmation_backlog", now=now),
        "nomination_backlog_count": count_trade_attention_candidates(db, "nomination_backlog", now=now),
        "allocation_backlog_count": count_trade_attention_candidates(db, "allocation_backlog", now=now),
        "invoice_backlog_count": count_trade_attention_candidates(db, "invoice_backlog", now=now),
        "overdue_payment_count": count_trade_attention_candidates(db, "overdue_payment", now=now),
        "stale_pricing_count": count_trade_attention_candidates(db, "stale_pricing", now=now),
        "incomplete_ops_data_count": count_trade_attention_candidates(db, "incomplete_ops_data", now=now),
    }
    counts["total_count"] = count_trade_attention_candidates_for_types(
        db,
        DASHBOARD_ATTENTION_CANDIDATE_TYPE_NAMES,
        now=now,
    )
    return counts


def _build_settlement_summary(db: Session, *, now: datetime) -> dict[str, object]:
    invoice_item_open_condition = and_(
        TradeWorkflowItem.workflow_type == "INVOICE",
        TradeWorkflowItem.status.notin_(tuple(WORKFLOW_CLOSED_STATUS_VALUES["INVOICE"])),
    )
    payment_item_open_condition = and_(
        TradeWorkflowItem.workflow_type == "PAYMENT",
        TradeWorkflowItem.status.notin_(tuple(WORKFLOW_CLOSED_STATUS_VALUES["PAYMENT"])),
    )
    settlement_open_work_item_condition = or_(
        invoice_item_open_condition,
        payment_item_open_condition,
    )

    breakdown_counts = {
        str(status): int(count)
        for status, count in db.execute(
            select(Trade.settlement_status, func.count())
            .select_from(Trade)
            .where(Trade.status == ACTIVE_TRADE_STATUS)
            .group_by(Trade.settlement_status)
        ).all()
    }

    return {
        "open_work_item_count": int(
            db.execute(
                select(func.count())
                .select_from(TradeWorkflowItem)
                .where(settlement_open_work_item_condition)
            ).scalar_one()
        ),
        "invoice_pending_count": count_invoice_issue_candidates(db),
        "payment_due_count": count_trade_attention_candidates(db, "payment_due", now=now),
        "settled_count": _count_trades(
            db,
            Trade.settlement_status == "SETTLED",
            Trade.payment_status.in_(("PAID", "NOT_REQUIRED")),
        ),
        "trade_exception_count": count_trade_attention_candidates(db, "settlement_exception", now=now),
        "workflow_exception_count": int(
            db.execute(
                select(func.count())
                .select_from(TradeWorkflowItem)
                .where(
                    settlement_open_work_item_condition,
                    or_(
                        TradeWorkflowItem.due_at < now,
                        TradeWorkflowItem.status.in_(("DISPUTED", "OVERDUE")),
                    ),
                )
            ).scalar_one()
        ),
        "breakdown": [
            {
                "status": status,
                "count": breakdown_counts.get(status, 0),
            }
            for status in SETTLEMENT_BREAKDOWN_ORDER
            if breakdown_counts.get(status, 0) > 0
        ],
    }


def build_workspace_bootstrap_summary(
    db: Session,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    now = now or datetime.now(timezone.utc)
    total_trade_count = _count_rows(db, Trade)
    active_trade_count = int(
        db.execute(select(func.count()).select_from(Trade).where(Trade.status == ACTIVE_TRADE_STATUS)).scalar_one()
    )
    priced_active_count = int(
        db.execute(
            select(func.count())
            .select_from(Trade)
            .where(
                Trade.status == ACTIVE_TRADE_STATUS,
                Trade.price.is_not(None),
            )
        ).scalar_one()
    )
    pending_pricing_count = int(
        db.execute(
            select(func.count())
            .select_from(Trade)
            .where(
                Trade.status == ACTIVE_TRADE_STATUS,
                Trade.pricing_status == "PENDING",
            )
        ).scalar_one()
    )
    pending_settlement_count = count_trade_attention_candidates(db, "pending_settlement", now=now)
    tracked_book_count = int(
        db.execute(
            select(func.count(func.distinct(Trade.book)))
            .select_from(Trade)
            .where(Trade.status == ACTIVE_TRADE_STATUS)
        ).scalar_one()
    )
    total_active_volume = float(
        db.execute(
            select(func.coalesce(func.sum(Trade.volume), 0))
            .select_from(Trade)
            .where(Trade.status == ACTIVE_TRADE_STATUS)
        ).scalar_one()
        or 0
    )

    workflow_rows = db.execute(
        select(
            TradeWorkflowItem.workflow_type,
            TradeWorkflowItem.status,
            func.count(),
        ).group_by(
            TradeWorkflowItem.workflow_type,
            TradeWorkflowItem.status,
        )
    ).all()

    total_open_work_items = 0
    operations_queue_count = 0
    settlement_queue_count = 0
    for workflow_type, status, count in workflow_rows:
        normalized_type = str(workflow_type or "").strip()
        normalized_status = str(status or "").strip()
        if normalized_status in WORKFLOW_CLOSED_STATUS_VALUES.get(normalized_type, set()):
            continue

        normalized_count = int(count)
        total_open_work_items += normalized_count
        queue = WORKFLOW_TYPE_TO_QUEUE.get(normalized_type)
        if queue == "operations":
            operations_queue_count += normalized_count
        elif queue == "settlement":
            settlement_queue_count += normalized_count

    return {
        "trades": {
            "total_count": total_trade_count,
            "active_count": active_trade_count,
            "priced_active_count": priced_active_count,
            "pending_pricing_count": pending_pricing_count,
            "pending_settlement_count": pending_settlement_count,
            "tracked_book_count": tracked_book_count,
            "total_active_volume": total_active_volume,
        },
        "positions": {
            "total_count": _count_rows(db, Position),
        },
        "option_exposures": {
            "total_count": _count_rows(db, OptionExposure),
        },
        "deliveries": {
            "total_count": _count_rows(db, DeliveryObligation),
        },
        "confirmations": {
            "total_count": _count_rows(db, TradeConfirmation),
        },
        "work_items": {
            "total_count": total_open_work_items,
            "operations_queue_count": operations_queue_count,
            "settlement_queue_count": settlement_queue_count,
        },
        "invoices": {
            "total_count": _count_rows(db, TradeInvoice),
        },
        "payments": {
            "total_count": _count_rows(db, TradePayment),
        },
        "dashboard": {
            "positions": _build_dashboard_position_summary(db),
            "attention": _build_dashboard_attention_summary(db, now=now),
        },
        "settlement": _build_settlement_summary(db, now=now),
    }
