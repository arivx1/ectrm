from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.actualization_ledger import (
    ACTUALIZATION_SETTLEMENT_ELIGIBLE,
    build_actualization_ledger_report,
)
from apps.api.app.domains.operations.services.audit_events import (
    TradeAuditMutationContext,
    append_trade_audit_event,
)
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_secondary_cost_item import TradeSecondaryCostItem
from apps.api.app.shared.enums import TradeStatus

SECONDARY_COST_STACK_BASIS_V1 = "trade_secondary_cost_stack_v1"
SECONDARY_COST_STATUS_ESTIMATED = "ESTIMATED"
SECONDARY_COST_STATUS_ACCRUED = "ACCRUED"
SECONDARY_COST_STATUS_INVOICED = "INVOICED"
SECONDARY_COST_STATUS_RELIEVED = "RELIEVED"
SECONDARY_COST_STATUS_VOIDED = "VOIDED"
SECONDARY_COST_SETTLEMENT_INCLUDED = "INCLUDED"
SECONDARY_COST_SETTLEMENT_BLOCKED = "BLOCKED"
SECONDARY_COST_SETTLEMENT_EXCLUDED = "EXCLUDED"
SECONDARY_COST_CHARGE_PAYABLE = "PAYABLE"
SECONDARY_COST_CHARGE_RECEIVABLE = "RECEIVABLE"
SECONDARY_COST_QUANTITY_FIXED = "FIXED"
SECONDARY_COST_QUANTITY_SCHEDULED = "SCHEDULED"
SECONDARY_COST_QUANTITY_ACTUAL = "ACTUAL"
DEFAULT_SECONDARY_COST_CURRENCY_CODE = "USD"
ZERO = Decimal("0")

VALID_STATUSES = {
    SECONDARY_COST_STATUS_ESTIMATED,
    SECONDARY_COST_STATUS_ACCRUED,
    SECONDARY_COST_STATUS_INVOICED,
    SECONDARY_COST_STATUS_RELIEVED,
    SECONDARY_COST_STATUS_VOIDED,
}
INITIAL_STATUSES = {SECONDARY_COST_STATUS_ESTIMATED, SECONDARY_COST_STATUS_ACCRUED}
VALID_STATUS_TRANSITIONS = {
    SECONDARY_COST_STATUS_ESTIMATED: {
        SECONDARY_COST_STATUS_ACCRUED,
        SECONDARY_COST_STATUS_VOIDED,
    },
    SECONDARY_COST_STATUS_ACCRUED: {
        SECONDARY_COST_STATUS_INVOICED,
        SECONDARY_COST_STATUS_VOIDED,
    },
    SECONDARY_COST_STATUS_INVOICED: {SECONDARY_COST_STATUS_RELIEVED},
    SECONDARY_COST_STATUS_RELIEVED: set(),
    SECONDARY_COST_STATUS_VOIDED: set(),
}
SETTLEMENT_INCLUDED_STATUSES = {
    SECONDARY_COST_STATUS_ESTIMATED,
    SECONDARY_COST_STATUS_ACCRUED,
}
VALID_CHARGE_SIDES = {SECONDARY_COST_CHARGE_PAYABLE, SECONDARY_COST_CHARGE_RECEIVABLE}
VALID_QUANTITY_BASES = {
    SECONDARY_COST_QUANTITY_FIXED,
    SECONDARY_COST_QUANTITY_SCHEDULED,
    SECONDARY_COST_QUANTITY_ACTUAL,
}


@dataclass(frozen=True)
class SecondaryCostItemInput:
    cost_type: str
    cost_owner: str
    charge_side: str
    amount: Decimal | float | int | str
    currency_code: str | None = None
    delivery_id: str | None = None
    leg_no: int | None = None
    quantity_basis: str = SECONDARY_COST_QUANTITY_FIXED
    quantity: Decimal | float | int | str | None = None
    quantity_unit_code: str | None = None
    rate: Decimal | float | int | str | None = None
    status: str = SECONDARY_COST_STATUS_ESTIMATED
    source: str | None = None
    evidence_reference: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class SecondaryCostSettlementBlocker:
    code: str
    message: str
    field: str | None
    severity: str = "BLOCKING"

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "field": self.field,
            "severity": self.severity,
        }


def upsert_secondary_cost_item(
    db: Session,
    *,
    trade_id: str,
    payload: SecondaryCostItemInput,
    actor_id: str,
    cost_item_id: str | None = None,
    now: datetime | None = None,
    mutation_context: TradeAuditMutationContext | None = None,
) -> TradeSecondaryCostItem:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = _load_trade(db, trade_id=trade_id)
    delivery = _load_delivery_for_trade(
        db,
        trade=trade,
        delivery_id=payload.delivery_id,
    )
    normalized_status = _normalize_status(payload.status)
    if normalized_status not in INITIAL_STATUSES:
        raise ValueError(
            "Secondary cost items must be created as ESTIMATED or ACCRUED. "
            "Use the status transition service for invoiced, relieved, or voided states."
        )

    row = db.get(TradeSecondaryCostItem, cost_item_id) if cost_item_id else None
    if row is None:
        row = TradeSecondaryCostItem(
            cost_item_id=cost_item_id or f"SC-{uuid4()}",
            trade_id=trade.trade_id,
            delivery_id=delivery.delivery_id if delivery is not None else None,
            leg_no=payload.leg_no if delivery is None else delivery.leg_no,
            cost_type=_normalize_required_code(payload.cost_type, field_name="cost type"),
            cost_owner=_normalize_required_code(payload.cost_owner, field_name="cost owner"),
            charge_side=_normalize_charge_side(payload.charge_side),
            quantity_basis=_normalize_quantity_basis(payload.quantity_basis),
            quantity=_decimal_or_none(payload.quantity),
            quantity_unit_code=_normalize_optional_code(payload.quantity_unit_code),
            rate=_decimal_or_none(payload.rate),
            amount=_normalize_positive_amount(payload.amount, field_name="amount"),
            currency_code=_normalize_currency_code(payload.currency_code, trade=trade),
            status=normalized_status,
            invoice_id=None,
            source=_normalize_optional_text(payload.source),
            evidence_reference=_normalize_optional_text(payload.evidence_reference),
            notes=_normalize_optional_text(payload.notes),
            accrued_at=reference_time if normalized_status == SECONDARY_COST_STATUS_ACCRUED else None,
            invoiced_at=None,
            relieved_at=None,
            voided_at=None,
            voided_by=None,
            void_reason=None,
            created_at=reference_time,
            created_by=actor_id,
            updated_at=reference_time,
            updated_by=actor_id,
            version=1,
        )
        db.add(row)
        db.flush()
        event_type = "TradeSecondaryCostItemCreated"
    else:
        if row.status in {SECONDARY_COST_STATUS_RELIEVED, SECONDARY_COST_STATUS_VOIDED}:
            raise ValueError(
                f"Secondary cost item '{row.cost_item_id}' is {row.status} and cannot be updated."
            )
        if row.trade_id != trade.trade_id:
            raise ValueError(
                f"Secondary cost item '{row.cost_item_id}' belongs to trade '{row.trade_id}', not '{trade.trade_id}'."
            )
        if _normalize_status(payload.status) != row.status:
            raise ValueError("Use transition_secondary_cost_item_status to change secondary cost status.")
        _apply_upsert_changes(
            row=row,
            payload=payload,
            delivery=delivery,
            trade=trade,
            actor_id=actor_id,
            reference_time=reference_time,
        )
        event_type = "TradeSecondaryCostItemUpdated"

    _append_secondary_cost_audit(
        db,
        row=row,
        trade=trade,
        actor_id=actor_id,
        event_type=event_type,
        operation_key="operations.upsert_secondary_cost_item",
        occurred_at=reference_time,
        mutation_context=mutation_context,
        request=jsonable_encoder(payload),
    )
    return row


def transition_secondary_cost_item_status(
    db: Session,
    *,
    cost_item_id: str,
    target_status: str,
    actor_id: str,
    invoice_id: int | None = None,
    void_reason: str | None = None,
    now: datetime | None = None,
    mutation_context: TradeAuditMutationContext | None = None,
) -> TradeSecondaryCostItem:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.get(TradeSecondaryCostItem, cost_item_id)
    if row is None:
        raise LookupError(f"Secondary cost item '{cost_item_id}' was not found.")
    trade = _load_trade(db, trade_id=row.trade_id)
    normalized_target = _normalize_status(target_status)
    if normalized_target == row.status:
        return row
    if normalized_target not in VALID_STATUS_TRANSITIONS.get(row.status, set()):
        raise ValueError(
            f"Cannot transition secondary cost item '{row.cost_item_id}' from {row.status} to {normalized_target}."
        )

    invoice = None
    if normalized_target == SECONDARY_COST_STATUS_INVOICED:
        if invoice_id is None:
            raise ValueError("Invoice id is required when marking a secondary cost item invoiced.")
        invoice = _load_invoice_for_trade(db, trade=trade, invoice_id=invoice_id)
        row.invoice_id = invoice.id
        row.invoiced_at = reference_time
    elif normalized_target == SECONDARY_COST_STATUS_RELIEVED:
        if row.invoice_id is None:
            raise ValueError("An invoiced secondary cost item must retain invoice linkage before relief.")
        invoice = _load_invoice_for_trade(db, trade=trade, invoice_id=row.invoice_id)
        row.relieved_at = reference_time
    elif normalized_target == SECONDARY_COST_STATUS_ACCRUED:
        row.accrued_at = reference_time
    elif normalized_target == SECONDARY_COST_STATUS_VOIDED:
        normalized_void_reason = _normalize_optional_text(void_reason)
        if normalized_void_reason is None:
            raise ValueError("Void reason is required when voiding a secondary cost item.")
        row.voided_at = reference_time
        row.voided_by = actor_id
        row.void_reason = normalized_void_reason

    previous_status = row.status
    row.status = normalized_target
    row.updated_at = reference_time
    row.updated_by = actor_id
    row.version += 1
    db.flush()
    _append_secondary_cost_audit(
        db,
        row=row,
        trade=trade,
        actor_id=actor_id,
        event_type="TradeSecondaryCostItemStatusTransitioned",
        operation_key="operations.transition_secondary_cost_item_status",
        occurred_at=reference_time,
        mutation_context=mutation_context,
        request={
            "from_status": previous_status,
            "target_status": normalized_target,
            "invoice_id": invoice.id if invoice is not None else invoice_id,
            "void_reason": void_reason,
        },
    )
    return row


def build_secondary_cost_stack_report(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    include_voided: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    generated_at = _coerce_utc(now) or datetime.now(timezone.utc)
    statement = select(TradeSecondaryCostItem).order_by(
        TradeSecondaryCostItem.trade_id.asc(),
        TradeSecondaryCostItem.delivery_id.asc(),
        TradeSecondaryCostItem.created_at.asc(),
        TradeSecondaryCostItem.cost_item_id.asc(),
    )
    if trade_id is not None:
        statement = statement.where(TradeSecondaryCostItem.trade_id == trade_id)
    if delivery_id is not None:
        statement = statement.where(TradeSecondaryCostItem.delivery_id == delivery_id)
    if not include_voided:
        statement = statement.where(TradeSecondaryCostItem.status != SECONDARY_COST_STATUS_VOIDED)

    rows = db.execute(statement).scalars().all()
    entries = [
        build_secondary_cost_stack_entry(
            db,
            row=row,
            generated_at=generated_at,
        )
        for row in rows
    ]
    return {
        "generated_at": generated_at,
        "basis": SECONDARY_COST_STACK_BASIS_V1,
        "filters": {
            "trade_id": trade_id,
            "delivery_id": delivery_id,
            "include_voided": include_voided,
        },
        "summary": _cost_stack_summary(entries),
        "currency_summaries": _currency_summaries(entries),
        "entries": entries,
    }


def build_secondary_cost_stack_entry(
    db: Session,
    *,
    row: TradeSecondaryCostItem,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    reference_time = _coerce_utc(generated_at) or datetime.now(timezone.utc)
    trade = db.get(Trade, row.trade_id)
    delivery = db.get(DeliveryObligation, row.delivery_id) if row.delivery_id else None
    invoice = db.get(TradeInvoice, row.invoice_id) if row.invoice_id is not None else None
    actualization_linkage = _actualization_linkage(db, row=row)
    blockers = _settlement_blockers(
        row=row,
        trade=trade,
        delivery=delivery,
        actualization_linkage=actualization_linkage,
    )
    lifecycle_amounts = _lifecycle_amounts(row)
    settlement_linkage = _settlement_linkage(row=row, blockers=blockers)
    signed_amount = _signed_amount(row)
    return {
        "generated_at": reference_time,
        "basis": SECONDARY_COST_STACK_BASIS_V1,
        "cost_item_id": row.cost_item_id,
        "trade_id": row.trade_id,
        "delivery_id": row.delivery_id,
        "leg_no": row.leg_no,
        "cost_type": row.cost_type,
        "cost_owner": row.cost_owner,
        "charge_side": row.charge_side,
        "status": row.status,
        "quantity_basis": row.quantity_basis,
        "quantity": _decimal_to_float(row.quantity),
        "quantity_unit_code": row.quantity_unit_code,
        "rate": _decimal_to_float(row.rate),
        "amount": float(Decimal(str(row.amount))),
        "signed_amount": float(signed_amount),
        "currency_code": row.currency_code,
        "source": row.source,
        "evidence_reference": row.evidence_reference,
        "notes": row.notes,
        "trade_economics": _trade_economics_dict(trade),
        "actualization_linkage": actualization_linkage,
        "lifecycle_amounts": lifecycle_amounts,
        "settlement_linkage": settlement_linkage,
        "invoice_id": row.invoice_id,
        "invoice_number": invoice.invoice_number if invoice is not None else None,
        "accrued_at": _coerce_utc(row.accrued_at),
        "invoiced_at": _coerce_utc(row.invoiced_at),
        "relieved_at": _coerce_utc(row.relieved_at),
        "voided_at": _coerce_utc(row.voided_at),
        "voided_by": row.voided_by,
        "void_reason": row.void_reason,
        "created_at": _coerce_utc(row.created_at),
        "created_by": row.created_by,
        "updated_at": _coerce_utc(row.updated_at),
        "updated_by": row.updated_by,
        "version": row.version,
    }


def _apply_upsert_changes(
    *,
    row: TradeSecondaryCostItem,
    payload: SecondaryCostItemInput,
    delivery: DeliveryObligation | None,
    trade: Trade,
    actor_id: str,
    reference_time: datetime,
) -> None:
    next_values: dict[str, Any] = {
        "delivery_id": delivery.delivery_id if delivery is not None else None,
        "leg_no": payload.leg_no if delivery is None else delivery.leg_no,
        "cost_type": _normalize_required_code(payload.cost_type, field_name="cost type"),
        "cost_owner": _normalize_required_code(payload.cost_owner, field_name="cost owner"),
        "charge_side": _normalize_charge_side(payload.charge_side),
        "quantity_basis": _normalize_quantity_basis(payload.quantity_basis),
        "quantity": _decimal_or_none(payload.quantity),
        "quantity_unit_code": _normalize_optional_code(payload.quantity_unit_code),
        "rate": _decimal_or_none(payload.rate),
        "amount": _normalize_positive_amount(payload.amount, field_name="amount"),
        "currency_code": _normalize_currency_code(payload.currency_code, trade=trade),
        "source": _normalize_optional_text(payload.source),
        "evidence_reference": _normalize_optional_text(payload.evidence_reference),
        "notes": _normalize_optional_text(payload.notes),
    }
    changed = False
    for field_name, next_value in next_values.items():
        if getattr(row, field_name) != next_value:
            setattr(row, field_name, next_value)
            changed = True
    if changed:
        row.updated_at = reference_time
        row.updated_by = actor_id
        row.version += 1


def _settlement_blockers(
    *,
    row: TradeSecondaryCostItem,
    trade: Trade | None,
    delivery: DeliveryObligation | None,
    actualization_linkage: dict[str, Any],
) -> list[SecondaryCostSettlementBlocker]:
    blockers: list[SecondaryCostSettlementBlocker] = []
    if row.status == SECONDARY_COST_STATUS_VOIDED:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="VOIDED_COST_ITEM",
                message="Voided secondary cost items cannot feed settlement preview.",
                field="status",
            )
        )
    if trade is None:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_TRADE",
                message="Secondary cost item must resolve to a trade before settlement preview.",
                field="trade_id",
            )
        )
    elif trade.status != TradeStatus.ACTIVE.value:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="INACTIVE_TRADE",
                message="Secondary cost settlement preview applies only to active trades.",
                field="status",
            )
        )
    if row.delivery_id is not None and delivery is None:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_DELIVERY",
                message="Delivery-scoped secondary cost item must resolve to a delivery obligation.",
                field="delivery_id",
            )
        )
    if Decimal(str(row.amount)) <= ZERO:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_AMOUNT",
                message="Secondary cost amount must be greater than zero.",
                field="amount",
            )
        )
    if _normalize_optional_code(row.currency_code) is None:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_CURRENCY",
                message="Secondary cost currency is required for settlement preview.",
                field="currency_code",
            )
        )
    if _normalize_optional_text(row.source) is None:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_SOURCE_EVIDENCE",
                message="Secondary cost source evidence is required for settlement preview.",
                field="source",
            )
        )
    if row.quantity_basis == SECONDARY_COST_QUANTITY_ACTUAL and not actualization_linkage["eligible"]:
        blockers.append(
            SecondaryCostSettlementBlocker(
                code="MISSING_ACTUALIZATION_EVIDENCE",
                message="Actual-basis secondary costs require eligible actualization evidence.",
                field="quantity_basis",
            )
        )
    return blockers


def _settlement_linkage(
    *,
    row: TradeSecondaryCostItem,
    blockers: list[SecondaryCostSettlementBlocker],
) -> dict[str, Any]:
    if row.status not in SETTLEMENT_INCLUDED_STATUSES:
        return {
            "status": SECONDARY_COST_SETTLEMENT_EXCLUDED,
            "included": False,
            "settlement_amount": None,
            "currency_code": row.currency_code,
            "reason": _settlement_exclusion_reason(row.status),
            "blockers": [blocker.to_dict() for blocker in blockers],
        }
    if blockers:
        return {
            "status": SECONDARY_COST_SETTLEMENT_BLOCKED,
            "included": False,
            "settlement_amount": None,
            "currency_code": row.currency_code,
            "reason": "SECONDARY_COST_BLOCKED",
            "blockers": [blocker.to_dict() for blocker in blockers],
        }
    return {
        "status": SECONDARY_COST_SETTLEMENT_INCLUDED,
        "included": True,
        "settlement_amount": float(_signed_amount(row)),
        "currency_code": row.currency_code,
        "reason": (
            "ESTIMATED_SECONDARY_COST"
            if row.status == SECONDARY_COST_STATUS_ESTIMATED
            else "ACCRUED_SECONDARY_COST"
        ),
        "blockers": [],
    }


def _settlement_exclusion_reason(status: str) -> str:
    if status == SECONDARY_COST_STATUS_INVOICED:
        return "ALREADY_INVOICED"
    if status == SECONDARY_COST_STATUS_RELIEVED:
        return "RELIEVED_BY_SETTLEMENT"
    if status == SECONDARY_COST_STATUS_VOIDED:
        return "VOIDED"
    return "NOT_SETTLEMENT_PREVIEW_STATUS"


def _actualization_linkage(
    db: Session,
    *,
    row: TradeSecondaryCostItem,
) -> dict[str, Any]:
    if row.delivery_id is None:
        return {
            "required": row.quantity_basis == SECONDARY_COST_QUANTITY_ACTUAL,
            "eligible": row.quantity_basis != SECONDARY_COST_QUANTITY_ACTUAL,
            "delivery_id": None,
            "actualization_id": None,
            "status": "NOT_REQUIRED",
            "blockers": [],
        }
    report = build_actualization_ledger_report(
        db,
        delivery_id=row.delivery_id,
        include_voided=False,
    )
    entry = report["entries"][0] if report["entries"] else None
    if entry is None:
        return {
            "required": row.quantity_basis == SECONDARY_COST_QUANTITY_ACTUAL,
            "eligible": row.quantity_basis != SECONDARY_COST_QUANTITY_ACTUAL,
            "delivery_id": row.delivery_id,
            "actualization_id": None,
            "status": "MISSING",
            "actual_quantity": None,
            "actual_gas_day": None,
            "blockers": [],
        }
    settlement_linkage = entry["settlement_linkage"]
    return {
        "required": row.quantity_basis == SECONDARY_COST_QUANTITY_ACTUAL,
        "eligible": settlement_linkage["status"] == ACTUALIZATION_SETTLEMENT_ELIGIBLE,
        "delivery_id": row.delivery_id,
        "actualization_id": entry["actualization_id"],
        "status": settlement_linkage["status"],
        "actual_quantity": entry["actual_quantity"],
        "actual_gas_day": entry["actual_gas_day"],
        "blockers": settlement_linkage["blockers"],
    }


def _cost_stack_summary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "total_items": len(entries),
        "estimated_items": sum(1 for entry in entries if entry["status"] == SECONDARY_COST_STATUS_ESTIMATED),
        "accrued_items": sum(1 for entry in entries if entry["status"] == SECONDARY_COST_STATUS_ACCRUED),
        "invoiced_items": sum(1 for entry in entries if entry["status"] == SECONDARY_COST_STATUS_INVOICED),
        "relieved_items": sum(1 for entry in entries if entry["status"] == SECONDARY_COST_STATUS_RELIEVED),
        "voided_items": sum(1 for entry in entries if entry["status"] == SECONDARY_COST_STATUS_VOIDED),
        "settlement_included_items": sum(
            1 for entry in entries if entry["settlement_linkage"]["status"] == SECONDARY_COST_SETTLEMENT_INCLUDED
        ),
        "settlement_blocked_items": sum(
            1 for entry in entries if entry["settlement_linkage"]["status"] == SECONDARY_COST_SETTLEMENT_BLOCKED
        ),
        "settlement_excluded_items": sum(
            1 for entry in entries if entry["settlement_linkage"]["status"] == SECONDARY_COST_SETTLEMENT_EXCLUDED
        ),
    }


def _currency_summaries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    for entry in entries:
        currency_code = entry["currency_code"] or DEFAULT_SECONDARY_COST_CURRENCY_CODE
        summary = summaries.setdefault(
            currency_code,
            {
                "currency_code": currency_code,
                "estimated_amount": 0.0,
                "accrued_amount": 0.0,
                "invoiced_amount": 0.0,
                "relieved_amount": 0.0,
                "settlement_preview_amount": 0.0,
            },
        )
        for key in ("estimated_amount", "accrued_amount", "invoiced_amount", "relieved_amount"):
            summary[key] += entry["lifecycle_amounts"][key]
        if entry["settlement_linkage"]["included"]:
            summary["settlement_preview_amount"] += entry["settlement_linkage"]["settlement_amount"] or 0.0
    return [summaries[key] for key in sorted(summaries)]


def _lifecycle_amounts(row: TradeSecondaryCostItem) -> dict[str, float]:
    signed_amount = _signed_amount(row)
    return {
        "estimated_amount": float(signed_amount) if row.status == SECONDARY_COST_STATUS_ESTIMATED else 0.0,
        "accrued_amount": float(signed_amount)
        if row.status in {
            SECONDARY_COST_STATUS_ACCRUED,
            SECONDARY_COST_STATUS_INVOICED,
            SECONDARY_COST_STATUS_RELIEVED,
        }
        else 0.0,
        "invoiced_amount": float(signed_amount)
        if row.status in {SECONDARY_COST_STATUS_INVOICED, SECONDARY_COST_STATUS_RELIEVED}
        else 0.0,
        "relieved_amount": float(signed_amount) if row.status == SECONDARY_COST_STATUS_RELIEVED else 0.0,
    }


def _trade_economics_dict(trade: Trade | None) -> dict[str, Any]:
    if trade is None:
        return {
            "trade_price": None,
            "trade_volume": None,
            "trade_currency_code": None,
            "price_unit_code": None,
            "book": None,
            "portfolio": None,
            "commodity_class": None,
            "commodity": None,
        }
    return {
        "trade_price": _decimal_to_float(_decimal_or_none(trade.price)),
        "trade_volume": _decimal_to_float(_decimal_or_none(trade.volume)),
        "trade_currency_code": trade.trade_currency_code,
        "price_unit_code": trade.price_unit_code,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
    }


def _append_secondary_cost_audit(
    db: Session,
    *,
    row: TradeSecondaryCostItem,
    trade: Trade,
    actor_id: str,
    event_type: str,
    operation_key: str,
    occurred_at: datetime,
    mutation_context: TradeAuditMutationContext | None,
    request: dict[str, Any],
) -> None:
    append_trade_audit_event(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=occurred_at,
        causation_id=f"secondary-cost:{row.cost_item_id}",
        operation_key=operation_key,
        mutation_context=mutation_context,
        payload={
            "basis": SECONDARY_COST_STACK_BASIS_V1,
            "request": request,
            "secondary_cost": jsonable_encoder(
                build_secondary_cost_stack_entry(
                    db,
                    row=row,
                    generated_at=occurred_at,
                )
            ),
        },
    )


def _load_trade(db: Session, *, trade_id: str) -> Trade:
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")
    return trade


def _load_delivery_for_trade(
    db: Session,
    *,
    trade: Trade,
    delivery_id: str | None,
) -> DeliveryObligation | None:
    normalized_delivery_id = _normalize_optional_text(delivery_id)
    if normalized_delivery_id is None:
        return None
    delivery = db.get(DeliveryObligation, normalized_delivery_id)
    if delivery is None:
        raise LookupError(f"Delivery '{normalized_delivery_id}' was not found.")
    if delivery.trade_id != trade.trade_id:
        raise ValueError(
            f"Delivery '{normalized_delivery_id}' belongs to trade '{delivery.trade_id}', not '{trade.trade_id}'."
        )
    return delivery


def _load_invoice_for_trade(db: Session, *, trade: Trade, invoice_id: int) -> TradeInvoice:
    invoice = db.get(TradeInvoice, invoice_id)
    if invoice is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")
    if invoice.trade_id != trade.trade_id:
        raise ValueError(
            f"Invoice '{invoice_id}' belongs to trade '{invoice.trade_id}', not '{trade.trade_id}'."
        )
    return invoice


def _signed_amount(row: TradeSecondaryCostItem) -> Decimal:
    amount = Decimal(str(row.amount))
    return -amount if row.charge_side == SECONDARY_COST_CHARGE_PAYABLE else amount


def _normalize_status(value: object | None) -> str:
    normalized = _normalize_required_code(value, field_name="secondary cost status")
    if normalized not in VALID_STATUSES:
        raise ValueError(
            f"Secondary cost status '{normalized}' is invalid. Expected one of: {', '.join(sorted(VALID_STATUSES))}."
        )
    return normalized


def _normalize_charge_side(value: object | None) -> str:
    normalized = _normalize_required_code(value, field_name="charge side")
    if normalized not in VALID_CHARGE_SIDES:
        raise ValueError(
            f"Secondary cost charge side '{normalized}' is invalid. Expected PAYABLE or RECEIVABLE."
        )
    return normalized


def _normalize_quantity_basis(value: object | None) -> str:
    normalized = _normalize_required_code(value, field_name="quantity basis")
    if normalized not in VALID_QUANTITY_BASES:
        expected_values = ", ".join(sorted(VALID_QUANTITY_BASES))
        raise ValueError(
            f"Secondary cost quantity basis '{normalized}' is invalid. "
            f"Expected one of: {expected_values}."
        )
    return normalized


def _normalize_currency_code(value: object | None, *, trade: Trade) -> str:
    return (
        _normalize_optional_code(value)
        or _normalize_optional_code(trade.trade_currency_code)
        or DEFAULT_SECONDARY_COST_CURRENCY_CODE
    )


def _normalize_required_code(value: object | None, *, field_name: str) -> str:
    normalized = _normalize_optional_code(value)
    if normalized is None:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_optional_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_positive_amount(value: object | None, *, field_name: str) -> Decimal:
    normalized = _decimal_or_none(value)
    if normalized is None:
        raise ValueError(f"{field_name} must be a numeric value.")
    if normalized <= ZERO:
        raise ValueError(f"{field_name} must be greater than zero.")
    return normalized


def _decimal_or_none(value: object | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, InvalidOperation):
        return None


def _decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
