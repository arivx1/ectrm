from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.settlement_payments import (
    derive_invoice_payment_projection,
)
from apps.api.app.domains.operations.services.workflow_items import (
    WORKFLOW_CLOSED_STATUS_VALUES,
)
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.shared.enums import (
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    PaymentStatus,
    PricingStatus,
    SettlementStatus,
    TradeNature,
    TradeStatus,
    TradeWorkflowType,
)

ZERO = Decimal("0")


@dataclass(frozen=True)
class TradeAttentionCandidateDefinition:
    candidate_type: str
    label: str
    source_count_key: str
    description: str


@dataclass(frozen=True)
class TradeAttentionCandidate:
    trade_id: str
    candidate_types: tuple[str, ...]
    source_count_keys: tuple[str, ...]
    trade_nature: str
    book: str
    portfolio: str | None
    counterparty: str | None
    commodity_class: str
    commodity: str
    trader_user: str | None
    trade_date: date | None
    execution_timestamp: datetime | None
    delivery_start: date | None
    delivery_end: date | None
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    pricing_status: str
    invoice_status: str
    payment_status: str
    settlement_status: str
    age_days: int | None
    supporting_records: dict[str, object]
    suggested_next_tool: str | None
    next_steps: tuple[str, ...]
    blocking_reasons: tuple[str, ...]
    recommended_action: dict[str, object] | None


TRADE_ATTENTION_CANDIDATE_DEFINITIONS: tuple[TradeAttentionCandidateDefinition, ...] = (
    TradeAttentionCandidateDefinition(
        candidate_type="confirmation_backlog",
        label="Confirmation Backlog",
        source_count_key="dashboard.attention.confirmation_backlog_count",
        description="Active trades executed at least one day ago that are not confirmed.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="nomination_backlog",
        label="Nomination Backlog",
        source_count_key="dashboard.attention.nomination_backlog_count",
        description="Physical trades approaching delivery that are not yet scheduled, nominated, or completed.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="allocation_backlog",
        label="Allocation Backlog",
        source_count_key="dashboard.attention.allocation_backlog_count",
        description="Physical nominated trades that still need allocation completion.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="invoice_backlog",
        label="Invoice Backlog",
        source_count_key="dashboard.attention.invoice_backlog_count",
        description="Physical trades executed at least five days ago with invoice status still open.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="overdue_payment",
        label="Overdue Payment",
        source_count_key="dashboard.attention.overdue_payment_count",
        description="Trades whose payment status or age-derived cash timing is overdue.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="stale_pricing",
        label="Stale Pricing",
        source_count_key="dashboard.attention.stale_pricing_count",
        description="Executed trades whose pricing status is still pending or partially priced after two days.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="incomplete_ops_data",
        label="Incomplete Operations Data",
        source_count_key="dashboard.attention.incomplete_ops_data_count",
        description="Trades missing core operational fields needed for downstream workflow.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="payment_due",
        label="Payment Due",
        source_count_key="settlement.payment_due_count",
        description="Active trades with due or overdue payment status, whether or not payment rows exist yet.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="pending_settlement",
        label="Pending Settlement",
        source_count_key="trades.pending_settlement_count",
        description="Active trades that have not reached settled settlement status.",
    ),
    TradeAttentionCandidateDefinition(
        candidate_type="settlement_exception",
        label="Settlement Exception",
        source_count_key="settlement.trade_exception_count",
        description="Active trades with disputed settlement or invoice state, or overdue payment state.",
    ),
)

TRADE_ATTENTION_CANDIDATE_TYPE_NAMES = tuple(
    definition.candidate_type for definition in TRADE_ATTENTION_CANDIDATE_DEFINITIONS
)
DASHBOARD_ATTENTION_CANDIDATE_TYPE_NAMES = (
    "confirmation_backlog",
    "nomination_backlog",
    "allocation_backlog",
    "invoice_backlog",
    "overdue_payment",
    "stale_pricing",
    "incomplete_ops_data",
)

_DEFINITIONS_BY_TYPE = {
    definition.candidate_type: definition
    for definition in TRADE_ATTENTION_CANDIDATE_DEFINITIONS
}


def get_trade_attention_candidate_definition(candidate_type: str) -> TradeAttentionCandidateDefinition:
    normalized = _normalize_candidate_type(candidate_type)
    return _DEFINITIONS_BY_TYPE[normalized]


def _normalize_candidate_type(candidate_type: str) -> str:
    normalized = str(candidate_type or "").strip().lower()
    if normalized not in _DEFINITIONS_BY_TYPE:
        allowed = ", ".join(TRADE_ATTENTION_CANDIDATE_TYPE_NAMES)
        raise ValueError(f"Unsupported trade attention candidate type '{candidate_type}'. Expected one of: {allowed}.")
    return normalized


def _reference_time(now: Optional[datetime] = None) -> datetime:
    if now is None:
        return datetime.now(timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _trade_age_days(trade: Trade, *, reference_time: datetime) -> int | None:
    execution_timestamp = _coerce_utc(trade.execution_timestamp)
    if execution_timestamp is not None:
        return max(0, int((reference_time - execution_timestamp).total_seconds() // 86_400))
    if trade.trade_date is not None:
        return max(0, (reference_time.date() - trade.trade_date).days)
    return None


def _trade_attention_condition(candidate_type: str, *, reference_time: datetime) -> object:
    today = reference_time.date()
    if candidate_type == "confirmation_backlog":
        return and_(
            Trade.execution_timestamp.is_not(None),
            Trade.execution_timestamp <= reference_time - timedelta(days=1),
            Trade.confirmation_status != ConfirmationStatus.CONFIRMED.value,
        )
    if candidate_type == "nomination_backlog":
        return and_(
            Trade.trade_nature == TradeNature.PHYSICAL.value,
            Trade.delivery_start.is_not(None),
            Trade.delivery_start <= today + timedelta(days=3),
            Trade.nomination_status.notin_(
                (
                    NominationStatus.NOT_REQUIRED.value,
                    NominationStatus.SCHEDULED.value,
                    NominationStatus.NOMINATED.value,
                    NominationStatus.COMPLETED.value,
                )
            ),
        )
    if candidate_type == "allocation_backlog":
        return and_(
            Trade.trade_nature == TradeNature.PHYSICAL.value,
            Trade.nomination_status.in_((NominationStatus.NOMINATED.value, NominationStatus.COMPLETED.value)),
            Trade.allocation_status.notin_(
                (
                    AllocationStatus.NOT_REQUIRED.value,
                    AllocationStatus.ALLOCATED.value,
                    AllocationStatus.COMPLETED.value,
                )
            ),
        )
    if candidate_type == "invoice_backlog":
        return and_(
            Trade.trade_nature == TradeNature.PHYSICAL.value,
            Trade.execution_timestamp.is_not(None),
            Trade.execution_timestamp <= reference_time - timedelta(days=5),
            Trade.invoice_status.notin_(
                (
                    InvoiceStatus.NOT_REQUIRED.value,
                    InvoiceStatus.ISSUED.value,
                    InvoiceStatus.APPROVED.value,
                )
            ),
        )
    if candidate_type == "overdue_payment":
        return or_(
            Trade.payment_status == PaymentStatus.OVERDUE.value,
            and_(
                Trade.execution_timestamp.is_not(None),
                Trade.execution_timestamp <= reference_time - timedelta(days=10),
                or_(
                    Trade.invoice_status.in_((InvoiceStatus.ISSUED.value, InvoiceStatus.APPROVED.value)),
                    Trade.settlement_status.in_(
                        (
                            SettlementStatus.INVOICED.value,
                            SettlementStatus.PARTIALLY_SETTLED.value,
                        )
                    ),
                ),
                Trade.payment_status.notin_((PaymentStatus.NOT_REQUIRED.value, PaymentStatus.PAID.value)),
            ),
        )
    if candidate_type == "stale_pricing":
        return and_(
            Trade.execution_timestamp.is_not(None),
            Trade.execution_timestamp <= reference_time - timedelta(days=2),
            Trade.pricing_status.in_((PricingStatus.PENDING.value, PricingStatus.PARTIALLY_PRICED.value)),
        )
    if candidate_type == "incomplete_ops_data":
        return or_(
            Trade.execution_timestamp.is_(None),
            Trade.external_trade_id.is_(None),
            Trade.counterparty.is_(None),
            Trade.unit_of_measure.is_(None),
            and_(
                Trade.trade_nature == TradeNature.PHYSICAL.value,
                or_(
                    Trade.location_code.is_(None),
                    Trade.delivery_start.is_(None),
                    Trade.delivery_end.is_(None),
                    Trade.price_unit_code.is_(None),
                ),
            ),
        )
    if candidate_type == "payment_due":
        return Trade.payment_status.in_((PaymentStatus.DUE.value, PaymentStatus.OVERDUE.value))
    if candidate_type == "pending_settlement":
        return Trade.settlement_status != SettlementStatus.SETTLED.value
    if candidate_type == "settlement_exception":
        return or_(
            Trade.settlement_status == SettlementStatus.DISPUTED.value,
            Trade.invoice_status == InvoiceStatus.DISPUTED.value,
            Trade.payment_status == PaymentStatus.OVERDUE.value,
        )
    raise AssertionError(f"Unhandled trade attention candidate type '{candidate_type}'.")


def trade_attention_condition(candidate_type: str, *, now: Optional[datetime] = None) -> object:
    return _trade_attention_condition(_normalize_candidate_type(candidate_type), reference_time=_reference_time(now))


def count_trade_attention_candidates(
    db: Session,
    candidate_type: str,
    *,
    now: Optional[datetime] = None,
) -> int:
    reference_time = _reference_time(now)
    normalized = _normalize_candidate_type(candidate_type)
    return int(
        db.execute(
            select(func.count())
            .select_from(Trade)
            .where(
                Trade.status == TradeStatus.ACTIVE.value,
                _trade_attention_condition(normalized, reference_time=reference_time),
            )
        ).scalar_one()
    )


def count_trade_attention_candidates_for_types(
    db: Session,
    candidate_types: tuple[str, ...],
    *,
    now: Optional[datetime] = None,
) -> int:
    reference_time = _reference_time(now)
    normalized_types = tuple(_normalize_candidate_type(candidate_type) for candidate_type in candidate_types)
    if not normalized_types:
        return 0
    return int(
        db.execute(
            select(func.count())
            .select_from(Trade)
            .where(
                Trade.status == TradeStatus.ACTIVE.value,
                or_(
                    *[
                        _trade_attention_condition(candidate_type, reference_time=reference_time)
                        for candidate_type in normalized_types
                    ]
                ),
            )
        ).scalar_one()
    )


def _matches_candidate_type(trade: Trade, candidate_type: str, *, reference_time: datetime) -> bool:
    execution_timestamp = _coerce_utc(trade.execution_timestamp)
    today = reference_time.date()
    if candidate_type == "confirmation_backlog":
        return (
            execution_timestamp is not None
            and execution_timestamp <= reference_time - timedelta(days=1)
            and trade.confirmation_status != ConfirmationStatus.CONFIRMED.value
        )
    if candidate_type == "nomination_backlog":
        return (
            trade.trade_nature == TradeNature.PHYSICAL.value
            and trade.delivery_start is not None
            and trade.delivery_start <= today + timedelta(days=3)
            and trade.nomination_status
            not in {
                NominationStatus.NOT_REQUIRED.value,
                NominationStatus.SCHEDULED.value,
                NominationStatus.NOMINATED.value,
                NominationStatus.COMPLETED.value,
            }
        )
    if candidate_type == "allocation_backlog":
        return (
            trade.trade_nature == TradeNature.PHYSICAL.value
            and trade.nomination_status in {NominationStatus.NOMINATED.value, NominationStatus.COMPLETED.value}
            and trade.allocation_status
            not in {
                AllocationStatus.NOT_REQUIRED.value,
                AllocationStatus.ALLOCATED.value,
                AllocationStatus.COMPLETED.value,
            }
        )
    if candidate_type == "invoice_backlog":
        return (
            trade.trade_nature == TradeNature.PHYSICAL.value
            and execution_timestamp is not None
            and execution_timestamp <= reference_time - timedelta(days=5)
            and trade.invoice_status
            not in {
                InvoiceStatus.NOT_REQUIRED.value,
                InvoiceStatus.ISSUED.value,
                InvoiceStatus.APPROVED.value,
            }
        )
    if candidate_type == "overdue_payment":
        return trade.payment_status == PaymentStatus.OVERDUE.value or (
            execution_timestamp is not None
            and execution_timestamp <= reference_time - timedelta(days=10)
            and (
                trade.invoice_status in {InvoiceStatus.ISSUED.value, InvoiceStatus.APPROVED.value}
                or trade.settlement_status
                in {SettlementStatus.INVOICED.value, SettlementStatus.PARTIALLY_SETTLED.value}
            )
            and trade.payment_status not in {PaymentStatus.NOT_REQUIRED.value, PaymentStatus.PAID.value}
        )
    if candidate_type == "stale_pricing":
        return (
            execution_timestamp is not None
            and execution_timestamp <= reference_time - timedelta(days=2)
            and trade.pricing_status in {PricingStatus.PENDING.value, PricingStatus.PARTIALLY_PRICED.value}
        )
    if candidate_type == "incomplete_ops_data":
        return (
            execution_timestamp is None
            or trade.external_trade_id is None
            or trade.counterparty is None
            or trade.unit_of_measure is None
            or (
                trade.trade_nature == TradeNature.PHYSICAL.value
                and (
                    trade.location_code is None
                    or trade.delivery_start is None
                    or trade.delivery_end is None
                    or trade.price_unit_code is None
                )
            )
        )
    if candidate_type == "payment_due":
        return trade.payment_status in {PaymentStatus.DUE.value, PaymentStatus.OVERDUE.value}
    if candidate_type == "pending_settlement":
        return trade.settlement_status != SettlementStatus.SETTLED.value
    if candidate_type == "settlement_exception":
        return (
            trade.settlement_status == SettlementStatus.DISPUTED.value
            or trade.invoice_status == InvoiceStatus.DISPUTED.value
            or trade.payment_status == PaymentStatus.OVERDUE.value
        )
    raise AssertionError(f"Unhandled trade attention candidate type '{candidate_type}'.")


def _candidate_types_for_trade(
    trade: Trade,
    *,
    requested_types: tuple[str, ...],
    reference_time: datetime,
) -> tuple[str, ...]:
    return tuple(
        candidate_type
        for candidate_type in requested_types
        if _matches_candidate_type(trade, candidate_type, reference_time=reference_time)
    )


def _load_confirmations_by_trade_id(
    db: Session,
    *,
    trade_ids: list[str],
) -> tuple[dict[str, int], dict[str, TradeConfirmation]]:
    confirmation_counts: dict[str, int] = {trade_id: 0 for trade_id in trade_ids}
    current_confirmations: dict[str, TradeConfirmation] = {}
    if not trade_ids:
        return confirmation_counts, current_confirmations

    confirmations = db.execute(
        select(TradeConfirmation)
        .where(TradeConfirmation.trade_id.in_(trade_ids))
        .order_by(TradeConfirmation.trade_id.asc(), TradeConfirmation.id.desc())
    ).scalars().all()
    for confirmation in confirmations:
        confirmation_counts[confirmation.trade_id] = confirmation_counts.get(confirmation.trade_id, 0) + 1
        current_confirmations.setdefault(confirmation.trade_id, confirmation)
    return confirmation_counts, current_confirmations


def _load_workflow_items_by_trade_id(
    db: Session,
    *,
    trade_ids: list[str],
) -> dict[str, list[TradeWorkflowItem]]:
    items_by_trade_id: dict[str, list[TradeWorkflowItem]] = {trade_id: [] for trade_id in trade_ids}
    if not trade_ids:
        return items_by_trade_id

    rows = db.execute(
        select(TradeWorkflowItem)
        .where(TradeWorkflowItem.trade_id.in_(trade_ids))
        .order_by(
            TradeWorkflowItem.trade_id.asc(),
            TradeWorkflowItem.due_at.is_(None),
            TradeWorkflowItem.due_at.asc(),
            TradeWorkflowItem.id.asc(),
        )
    ).scalars().all()
    for item in rows:
        if item.status in WORKFLOW_CLOSED_STATUS_VALUES.get(item.workflow_type, set()):
            continue
        items_by_trade_id.setdefault(item.trade_id, []).append(item)
    return items_by_trade_id


def _load_settlement_records(
    db: Session,
    *,
    trade_ids: list[str],
) -> tuple[dict[str, list[TradeInvoice]], dict[str, list[TradePayment]], dict[int, list[TradePayment]]]:
    invoices_by_trade_id: dict[str, list[TradeInvoice]] = {trade_id: [] for trade_id in trade_ids}
    payments_by_trade_id: dict[str, list[TradePayment]] = {trade_id: [] for trade_id in trade_ids}
    payments_by_invoice_id: dict[int, list[TradePayment]] = {}
    if not trade_ids:
        return invoices_by_trade_id, payments_by_trade_id, payments_by_invoice_id

    invoices = db.execute(
        select(TradeInvoice)
        .where(TradeInvoice.trade_id.in_(trade_ids))
        .order_by(TradeInvoice.trade_id.asc(), TradeInvoice.due_at.asc(), TradeInvoice.id.asc())
    ).scalars().all()
    invoice_ids = [invoice.id for invoice in invoices]
    for invoice in invoices:
        invoices_by_trade_id.setdefault(invoice.trade_id, []).append(invoice)

    if invoice_ids:
        payments = db.execute(
            select(TradePayment)
            .where(TradePayment.invoice_id.in_(invoice_ids))
            .order_by(TradePayment.invoice_id.asc(), TradePayment.due_at.asc(), TradePayment.id.asc())
        ).scalars().all()
        for payment in payments:
            payments_by_trade_id.setdefault(payment.trade_id, []).append(payment)
            payments_by_invoice_id.setdefault(payment.invoice_id, []).append(payment)
    return invoices_by_trade_id, payments_by_trade_id, payments_by_invoice_id


def _serialize_open_workflow_items(items: list[TradeWorkflowItem]) -> list[dict[str, object]]:
    return [
        {
            "item_id": item.id,
            "workflow_type": item.workflow_type,
            "status": item.status,
            "owner": item.owner,
            "due_at": item.due_at,
        }
        for item in items
    ]


def _select_payment_invoice_candidate(
    *,
    invoices: list[TradeInvoice],
    payments_by_invoice_id: dict[int, list[TradePayment]],
    reference_time: datetime,
) -> tuple[TradeInvoice | None, Decimal]:
    best_invoice: TradeInvoice | None = None
    best_outstanding = ZERO
    for invoice in invoices:
        projection = derive_invoice_payment_projection(
            invoice=invoice,
            payments=payments_by_invoice_id.get(invoice.id, []),
            now=reference_time,
        )
        if projection.outstanding_amount <= ZERO:
            continue
        if best_invoice is None:
            best_invoice = invoice
            best_outstanding = projection.outstanding_amount
            continue
        best_due_at = _coerce_utc(best_invoice.due_at) or reference_time
        invoice_due_at = _coerce_utc(invoice.due_at) or reference_time
        if (invoice_due_at, invoice.id) < (best_due_at, best_invoice.id):
            best_invoice = invoice
            best_outstanding = projection.outstanding_amount
    return best_invoice, best_outstanding


def _candidate_next_steps(
    *,
    candidate_types: tuple[str, ...],
    confirmation_count: int,
    current_confirmation: TradeConfirmation | None,
    invoices: list[TradeInvoice],
    payments: list[TradePayment],
    open_workflow_items: list[TradeWorkflowItem],
    payment_invoice: TradeInvoice | None,
) -> tuple[tuple[str, ...], str | None, tuple[str, ...], dict[str, object] | None]:
    next_steps: list[str] = []
    blocking_reasons: list[str] = []
    suggested_tool: str | None = None
    recommended_action: dict[str, object] | None = None

    if "confirmation_backlog" in candidate_types:
        suggested_tool = suggested_tool or "list_trade_confirmations"
        if confirmation_count == 0:
            blocking_reasons.append("No persisted confirmation ledger row exists for this trade.")
            next_steps.append("Create or locate the managed confirmation record before issuing or resolving it.")
        elif current_confirmation is not None:
            next_steps.append("Review the current confirmation row and counterparty receipt state.")
            if current_confirmation.status in {ConfirmationStatus.PENDING.value, ConfirmationStatus.SENT.value}:
                recommended_action = recommended_action or {
                    "action_type": "issue_trade_confirmation",
                    "requires_approval": True,
                    "payload": {"confirmation_id": current_confirmation.id},
                    "basis": "current_confirmation_record",
                }

    if "nomination_backlog" in candidate_types:
        suggested_tool = suggested_tool or "list_workflow_items"
        next_steps.append("Inspect the nomination workflow and delivery timing before marking nomination progress.")
        if not any(item.workflow_type == TradeWorkflowType.NOMINATION.value for item in open_workflow_items):
            blocking_reasons.append("No open nomination workflow item exists for this trade.")

    if "allocation_backlog" in candidate_types:
        suggested_tool = suggested_tool or "list_workflow_items"
        next_steps.append("Inspect the allocation workflow after nomination evidence is clear.")
        if not any(item.workflow_type == TradeWorkflowType.ALLOCATION.value for item in open_workflow_items):
            blocking_reasons.append("No open allocation workflow item exists for this trade.")

    if "invoice_backlog" in candidate_types:
        suggested_tool = suggested_tool or ("list_trade_invoices" if invoices else "list_invoice_issue_candidates")
        if invoices:
            next_steps.append("Review existing invoice rows and their status before issuing or approving another step.")
        else:
            blocking_reasons.append("No persisted invoice row exists for this trade.")
            next_steps.append("Use invoice issue candidates to inspect deterministic invoice readiness.")

    if "payment_due" in candidate_types or "overdue_payment" in candidate_types:
        suggested_tool = suggested_tool or ("list_trade_payments" if payments else "list_trade_attention_candidates")
        if payment_invoice is not None:
            next_steps.append("Review the open invoice balance and stage a payment record only with approval.")
            recommended_action = recommended_action or {
                "action_type": "create_trade_payment",
                "requires_approval": True,
                "payload": {"invoice_id": payment_invoice.id},
                "basis": "open_invoice_balance",
            }
        elif invoices:
            next_steps.append("Review invoice balances before creating another payment record.")
        else:
            blocking_reasons.append("No persisted invoice row exists, so a payment record cannot be tied to an invoice yet.")
            next_steps.append("Resolve invoice issuance before relying on payment ledger rows.")

    if "stale_pricing" in candidate_types:
        suggested_tool = suggested_tool or "get_trade_workbench"
        next_steps.append("Review pricing inputs and reference data before updating pricing state.")

    if "incomplete_ops_data" in candidate_types:
        suggested_tool = suggested_tool or "get_trade_workbench"
        next_steps.append("Fill missing operational fields before downstream automation treats the trade as ready.")

    if "pending_settlement" in candidate_types:
        suggested_tool = suggested_tool or "get_trade_settlement_summary"
        next_steps.append("Review settlement state across invoices, payments, and workflow items.")

    if "settlement_exception" in candidate_types:
        suggested_tool = suggested_tool or "get_trade_settlement_summary"
        next_steps.append("Review disputed or overdue settlement evidence before staging an action.")

    if not next_steps:
        next_steps.append("Review the trade workbench for the current operational state.")
    return tuple(dict.fromkeys(next_steps)), suggested_tool, tuple(dict.fromkeys(blocking_reasons)), recommended_action


def _to_trade_attention_candidate(
    *,
    trade: Trade,
    candidate_types: tuple[str, ...],
    reference_time: datetime,
    confirmation_count: int,
    current_confirmation: TradeConfirmation | None,
    invoices: list[TradeInvoice],
    payments: list[TradePayment],
    payments_by_invoice_id: dict[int, list[TradePayment]],
    open_workflow_items: list[TradeWorkflowItem],
) -> TradeAttentionCandidate:
    payment_invoice, open_payment_amount = _select_payment_invoice_candidate(
        invoices=invoices,
        payments_by_invoice_id=payments_by_invoice_id,
        reference_time=reference_time,
    )
    next_steps, suggested_tool, blocking_reasons, recommended_action = _candidate_next_steps(
        candidate_types=candidate_types,
        confirmation_count=confirmation_count,
        current_confirmation=current_confirmation,
        invoices=invoices,
        payments=payments,
        open_workflow_items=open_workflow_items,
        payment_invoice=payment_invoice,
    )
    source_count_keys = tuple(_DEFINITIONS_BY_TYPE[candidate_type].source_count_key for candidate_type in candidate_types)
    supporting_records = {
        "confirmation_count": confirmation_count,
        "current_confirmation_id": current_confirmation.id if current_confirmation is not None else None,
        "current_confirmation_status": current_confirmation.status if current_confirmation is not None else None,
        "current_confirmation_receipt_status": (
            current_confirmation.receipt_status if current_confirmation is not None else None
        ),
        "invoice_count": len(invoices),
        "payment_count": len(payments),
        "open_workflow_item_count": len(open_workflow_items),
        "open_workflow_items": _serialize_open_workflow_items(open_workflow_items),
        "candidate_invoice_id": payment_invoice.id if payment_invoice is not None else None,
        "candidate_invoice_number": payment_invoice.invoice_number if payment_invoice is not None else None,
        "candidate_invoice_open_amount": float(open_payment_amount) if payment_invoice is not None else None,
    }
    return TradeAttentionCandidate(
        trade_id=trade.trade_id,
        candidate_types=candidate_types,
        source_count_keys=source_count_keys,
        trade_nature=trade.trade_nature,
        book=trade.book,
        portfolio=trade.portfolio,
        counterparty=trade.counterparty,
        commodity_class=trade.commodity_class,
        commodity=trade.commodity,
        trader_user=trade.trader_user,
        trade_date=trade.trade_date,
        execution_timestamp=_coerce_utc(trade.execution_timestamp),
        delivery_start=trade.delivery_start,
        delivery_end=trade.delivery_end,
        confirmation_status=trade.confirmation_status,
        nomination_status=trade.nomination_status,
        allocation_status=trade.allocation_status,
        pricing_status=trade.pricing_status,
        invoice_status=trade.invoice_status,
        payment_status=trade.payment_status,
        settlement_status=trade.settlement_status,
        age_days=_trade_age_days(trade, reference_time=reference_time),
        supporting_records=supporting_records,
        suggested_next_tool=suggested_tool,
        next_steps=next_steps,
        blocking_reasons=blocking_reasons,
        recommended_action=recommended_action,
    )


def list_trade_attention_candidates(
    db: Session,
    *,
    candidate_type: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[TradeAttentionCandidate]:
    reference_time = _reference_time(now)
    requested_types = (
        (_normalize_candidate_type(candidate_type),)
        if candidate_type is not None
        else TRADE_ATTENTION_CANDIDATE_TYPE_NAMES
    )
    conditions = [
        _trade_attention_condition(candidate_type, reference_time=reference_time)
        for candidate_type in requested_types
    ]
    stmt = (
        select(Trade)
        .where(
            Trade.status == TradeStatus.ACTIVE.value,
            or_(*conditions),
        )
        .order_by(
            Trade.execution_timestamp.is_(None).asc(),
            Trade.execution_timestamp.asc(),
            Trade.updated_at.asc(),
            Trade.trade_id.asc(),
        )
    )
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    trades = db.execute(stmt).scalars().all()
    trade_ids = [trade.trade_id for trade in trades]
    confirmation_counts, current_confirmations = _load_confirmations_by_trade_id(db, trade_ids=trade_ids)
    open_workflow_items_by_trade_id = _load_workflow_items_by_trade_id(db, trade_ids=trade_ids)
    invoices_by_trade_id, payments_by_trade_id, payments_by_invoice_id = _load_settlement_records(
        db,
        trade_ids=trade_ids,
    )
    candidates: list[TradeAttentionCandidate] = []
    for trade in trades:
        matching_types = _candidate_types_for_trade(
            trade,
            requested_types=requested_types,
            reference_time=reference_time,
        )
        if not matching_types:
            continue
        candidates.append(
            _to_trade_attention_candidate(
                trade=trade,
                candidate_types=matching_types,
                reference_time=reference_time,
                confirmation_count=confirmation_counts.get(trade.trade_id, 0),
                current_confirmation=current_confirmations.get(trade.trade_id),
                invoices=invoices_by_trade_id.get(trade.trade_id, []),
                payments=payments_by_trade_id.get(trade.trade_id, []),
                payments_by_invoice_id=payments_by_invoice_id,
                open_workflow_items=open_workflow_items_by_trade_id.get(trade.trade_id, []),
            )
        )
    return candidates
