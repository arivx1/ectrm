from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.actualizations import (
    delivery_targets_for_trade,
    list_trade_actualizations_by_delivery_id,
)
from apps.api.app.domains.operations.services.workflow_items import SYSTEM_WORKFLOW_ACTOR
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import TradeNature, TradeStatus

ZERO = Decimal("0")
MANAGED_QUANTITY_ENTRY_TYPES = {"ACTUALIZATION_ESTIMATE", "ACTUALIZATION_TRUE_UP"}
MANAGED_AMOUNT_ENTRY_TYPES = {"PRICE_MARK"}
MANUAL_ENTRY_TYPES = {"MANUAL_ADJUSTMENT", "MANUAL_REVERSAL"}
DEFAULT_ACCRUAL_CURRENCY_CODE = "USD"
ACCRUAL_LOT_ID_NAMESPACE = uuid5(NAMESPACE_URL, "ectrm.trade_accrual_lots")
INVOICE_RELIEF_ENTRY_TYPE = "INVOICE_APPLIED"
DISPUTE_HOLD_ENTRY_TYPE = "DISPUTE_HOLD"
DISPUTE_RELEASE_ENTRY_TYPE = "DISPUTE_RELEASE"


@dataclass(frozen=True)
class InvoiceLotRelief:
    billed_quantity: Decimal = ZERO
    billed_amount: Decimal = ZERO
    disputed_amount: Decimal = ZERO


def _normalize_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


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


def _effective_trade_pricing_inputs(
    trade: Trade,
    *,
    primary_price_term: TradePriceTerm | None,
) -> dict[str, Any]:
    pricing_type = _normalize_code(primary_price_term.pricing_type if primary_price_term is not None else trade.pricing_type) or "FIXED"
    fixed_price_raw = primary_price_term.fixed_price if primary_price_term is not None else trade.price
    fixed_price = Decimal(str(fixed_price_raw)) if fixed_price_raw is not None else None
    price_index_code = _normalize_code(primary_price_term.price_index_code if primary_price_term is not None else trade.price_index_code)
    currency_code = _normalize_code(primary_price_term.currency_code if primary_price_term is not None else trade.trade_currency_code)
    price_unit_code = _normalize_code(primary_price_term.price_unit_code if primary_price_term is not None else trade.price_unit_code)
    return {
        "pricing_type": pricing_type,
        "fixed_price": fixed_price,
        "price_index_code": price_index_code,
        "currency_code": currency_code,
        "price_unit_code": price_unit_code,
    }


def _load_primary_price_terms(
    db: Session,
    *,
    trade_ids: list[str],
) -> dict[str, TradePriceTerm]:
    if not trade_ids:
        return {}

    rows = db.execute(
        select(TradePriceTerm)
        .where(
            TradePriceTerm.trade_id.in_(trade_ids),
            TradePriceTerm.term_no == 1,
        )
        .order_by(TradePriceTerm.trade_id.asc(), TradePriceTerm.updated_at.desc())
    ).scalars().all()

    price_terms_by_trade_id: dict[str, TradePriceTerm] = {}
    for row in rows:
        if row.trade_id not in price_terms_by_trade_id:
            price_terms_by_trade_id[row.trade_id] = row
    return price_terms_by_trade_id


def _load_latest_price_observations(
    db: Session,
    *,
    price_index_codes: set[str],
) -> dict[str, PriceIndexObservation]:
    if not price_index_codes:
        return {}

    rows = db.execute(
        select(PriceIndexObservation)
        .where(PriceIndexObservation.price_index_code.in_(sorted(price_index_codes)))
        .order_by(
            PriceIndexObservation.price_index_code.asc(),
            PriceIndexObservation.observation_date.desc(),
            PriceIndexObservation.downloaded_at.desc(),
            PriceIndexObservation.id.desc(),
        )
    ).scalars().all()

    latest_by_code: dict[str, PriceIndexObservation] = {}
    for row in rows:
        code = _normalize_code(row.price_index_code)
        if code is None or code in latest_by_code:
            continue
        latest_by_code[code] = row
    return latest_by_code


def _effective_mark(
    *,
    pricing_type: str,
    fixed_price: Decimal | None,
    latest_observation: PriceIndexObservation | None,
) -> Decimal | None:
    if pricing_type == "FIXED":
        return fixed_price

    market_mark = Decimal(str(latest_observation.value)) if latest_observation is not None else None
    if pricing_type == "INDEX":
        return market_mark
    if pricing_type == "HYBRID":
        if market_mark is None or fixed_price is None:
            return None
        return market_mark + fixed_price
    return None


def _accrual_lot_id(
    *,
    trade_id: str,
    delivery_id: str,
    accrual_currency_code: str,
) -> str:
    return str(
        uuid5(
            ACCRUAL_LOT_ID_NAMESPACE,
            f"{trade_id}:{delivery_id}:{accrual_currency_code}",
        )
    )


def _managed_entry_net_totals(
    db: Session,
    *,
    accrual_lot_ids: list[str],
) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
    quantity_totals = {accrual_lot_id: ZERO for accrual_lot_id in accrual_lot_ids}
    amount_totals = {accrual_lot_id: ZERO for accrual_lot_id in accrual_lot_ids}
    if not accrual_lot_ids:
        return quantity_totals, amount_totals

    rows = db.execute(
        select(TradeAccrualEntry)
        .where(TradeAccrualEntry.accrual_lot_id.in_(accrual_lot_ids))
        .order_by(TradeAccrualEntry.accrual_lot_id.asc(), TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
    ).scalars().all()

    for row in rows:
        if row.entry_type in MANAGED_QUANTITY_ENTRY_TYPES and row.quantity_delta is not None:
            quantity_totals[row.accrual_lot_id] += Decimal(str(row.quantity_delta))
        if row.entry_type in MANAGED_AMOUNT_ENTRY_TYPES:
            amount_totals[row.accrual_lot_id] += Decimal(str(row.amount_delta))
    return quantity_totals, amount_totals


def _manual_entry_net_totals(
    db: Session,
    *,
    accrual_lot_ids: list[str],
) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
    quantity_totals = {accrual_lot_id: ZERO for accrual_lot_id in accrual_lot_ids}
    amount_totals = {accrual_lot_id: ZERO for accrual_lot_id in accrual_lot_ids}
    if not accrual_lot_ids:
        return quantity_totals, amount_totals

    rows = db.execute(
        select(TradeAccrualEntry)
        .where(
            TradeAccrualEntry.accrual_lot_id.in_(accrual_lot_ids),
            TradeAccrualEntry.entry_type.in_(tuple(sorted(MANUAL_ENTRY_TYPES))),
        )
        .order_by(TradeAccrualEntry.accrual_lot_id.asc(), TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
    ).scalars().all()

    for row in rows:
        if row.quantity_delta is not None:
            quantity_totals[row.accrual_lot_id] += Decimal(str(row.quantity_delta))
        amount_totals[row.accrual_lot_id] += Decimal(str(row.amount_delta))
    return quantity_totals, amount_totals


def _lot_status(
    *,
    actualized_quantity: Decimal,
    is_priced: bool,
    billed_quantity: Decimal,
    billed_amount: Decimal,
    collected_amount: Decimal,
    disputed_amount: Decimal,
    closed_at: datetime | None,
) -> str:
    if closed_at is not None:
        return "REVERSED"
    if actualized_quantity <= ZERO or not is_priced:
        return "ESTIMATED"
    if disputed_amount > ZERO:
        return "DISPUTED"
    if billed_quantity <= ZERO and billed_amount <= ZERO:
        return "ACCRUED"
    if billed_quantity < actualized_quantity:
        return "PARTIALLY_BILLED"
    if collected_amount <= ZERO:
        return "BILLED"
    if collected_amount < billed_amount:
        return "PARTIALLY_COLLECTED"
    return "COLLECTED"


def _append_quantity_entry(
    db: Session,
    *,
    lot: TradeAccrualLot,
    quantity_delta: Decimal,
    existing_quantity_total: Decimal,
    effective_date: datetime,
    actor_id: str,
    created_at: datetime,
) -> None:
    if quantity_delta == ZERO:
        return
    entry_type = "ACTUALIZATION_ESTIMATE" if existing_quantity_total == ZERO else "ACTUALIZATION_TRUE_UP"
    db.add(
        TradeAccrualEntry(
            entry_id=str(uuid4()),
            accrual_lot_id=lot.accrual_lot_id,
            entry_type=entry_type,
            trade_id=lot.trade_id,
            delivery_id=lot.delivery_id,
            invoice_id=None,
            payment_id=None,
            effective_date=effective_date.date(),
            currency_code=lot.accrual_currency_code,
            quantity_delta=quantity_delta,
            amount_delta=ZERO,
            reference_price=None,
            price_index_code=None,
            fx_rate=None,
            notes="System-managed accrual sync from delivery actualization.",
            reversal_of_entry_id=None,
            created_at=created_at,
            created_by=actor_id,
        )
    )


def _append_price_mark_entry(
    db: Session,
    *,
    lot: TradeAccrualLot,
    amount_delta: Decimal,
    effective_date: datetime,
    actor_id: str,
    created_at: datetime,
    reference_price: Decimal | None,
    price_index_code: str | None,
) -> None:
    if amount_delta == ZERO:
        return
    db.add(
        TradeAccrualEntry(
            entry_id=str(uuid4()),
            accrual_lot_id=lot.accrual_lot_id,
            entry_type="PRICE_MARK",
            trade_id=lot.trade_id,
            delivery_id=lot.delivery_id,
            invoice_id=None,
            payment_id=None,
            effective_date=effective_date.date(),
            currency_code=lot.accrual_currency_code,
            quantity_delta=None,
            amount_delta=amount_delta,
            reference_price=reference_price,
            price_index_code=price_index_code,
            fx_rate=None,
            notes="System-managed accrual mark refresh.",
            reversal_of_entry_id=None,
            created_at=created_at,
            created_by=actor_id,
        )
    )


def _append_invoice_relief_entry(
    db: Session,
    *,
    lot: TradeAccrualLot,
    invoice: TradeInvoice,
    billed_quantity_delta: Decimal,
    billed_amount_delta: Decimal,
    effective_at: datetime,
    actor_id: str,
    created_at: datetime,
) -> None:
    if billed_quantity_delta == ZERO and billed_amount_delta == ZERO:
        return

    db.add(
        TradeAccrualEntry(
            entry_id=str(uuid4()),
            accrual_lot_id=lot.accrual_lot_id,
            entry_type=INVOICE_RELIEF_ENTRY_TYPE,
            trade_id=lot.trade_id,
            delivery_id=lot.delivery_id,
            invoice_id=invoice.id,
            payment_id=None,
            effective_date=effective_at.date(),
            currency_code=lot.accrual_currency_code,
            quantity_delta=(-billed_quantity_delta) if billed_quantity_delta != ZERO else None,
            amount_delta=-billed_amount_delta,
            reference_price=None,
            price_index_code=None,
            fx_rate=None,
            notes=f"System-managed invoice relief sync for {invoice.invoice_number}.",
            reversal_of_entry_id=None,
            created_at=created_at,
            created_by=actor_id,
        )
    )


def _append_dispute_entry(
    db: Session,
    *,
    lot: TradeAccrualLot,
    invoice: TradeInvoice,
    disputed_amount_delta: Decimal,
    effective_at: datetime,
    actor_id: str,
    created_at: datetime,
) -> None:
    if disputed_amount_delta == ZERO:
        return

    entry_type = DISPUTE_HOLD_ENTRY_TYPE if disputed_amount_delta > ZERO else DISPUTE_RELEASE_ENTRY_TYPE
    db.add(
        TradeAccrualEntry(
            entry_id=str(uuid4()),
            accrual_lot_id=lot.accrual_lot_id,
            entry_type=entry_type,
            trade_id=lot.trade_id,
            delivery_id=lot.delivery_id,
            invoice_id=invoice.id,
            payment_id=None,
            effective_date=effective_at.date(),
            currency_code=lot.accrual_currency_code,
            quantity_delta=None,
            amount_delta=disputed_amount_delta,
            reference_price=None,
            price_index_code=None,
            fx_rate=None,
            notes=(
                f"Invoice dispute hold opened for {invoice.invoice_number}."
                if disputed_amount_delta > ZERO
                else f"Invoice dispute hold released for {invoice.invoice_number}."
            ),
            reversal_of_entry_id=None,
            created_at=created_at,
            created_by=actor_id,
        )
    )


def _invoice_relief_states_by_lot(
    db: Session,
    *,
    invoice_id: int,
) -> dict[str, InvoiceLotRelief]:
    rows = db.execute(
        select(TradeAccrualEntry)
        .where(TradeAccrualEntry.invoice_id == invoice_id)
        .order_by(
            TradeAccrualEntry.effective_date.asc(),
            TradeAccrualEntry.created_at.asc(),
            TradeAccrualEntry.entry_id.asc(),
        )
    ).scalars().all()

    states: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {
            "billed_quantity": ZERO,
            "billed_amount": ZERO,
            "disputed_amount": ZERO,
        }
    )
    for row in rows:
        if row.entry_type == INVOICE_RELIEF_ENTRY_TYPE:
            if row.quantity_delta is not None:
                states[row.accrual_lot_id]["billed_quantity"] += -Decimal(str(row.quantity_delta))
            states[row.accrual_lot_id]["billed_amount"] += -Decimal(str(row.amount_delta))
        elif row.entry_type in {DISPUTE_HOLD_ENTRY_TYPE, DISPUTE_RELEASE_ENTRY_TYPE}:
            states[row.accrual_lot_id]["disputed_amount"] += Decimal(str(row.amount_delta))

    return {
        lot_id: InvoiceLotRelief(
            billed_quantity=values["billed_quantity"],
            billed_amount=values["billed_amount"],
            disputed_amount=values["disputed_amount"],
        )
        for lot_id, values in states.items()
    }


def _candidate_lots_for_invoice(
    *,
    invoice: TradeInvoice,
    lots: list[TradeAccrualLot],
) -> list[TradeAccrualLot]:
    return [
        lot
        for lot in lots
        if lot.closed_at is None
        and lot.accrual_currency_code == invoice.invoice_currency_code
        and (invoice.delivery_id is None or lot.delivery_id == invoice.delivery_id)
    ]


def _allocate_invoice_relief(
    *,
    invoice: TradeInvoice,
    candidate_lots: list[TradeAccrualLot],
    current_relief_by_lot_id: dict[str, InvoiceLotRelief],
) -> dict[str, InvoiceLotRelief] | None:
    if invoice.status == InvoiceStatus.NOT_REQUIRED.value:
        return {}

    requested_billed_quantity = (
        Decimal(str(invoice.billed_quantity))
        if invoice.billed_quantity is not None
        else None
    )
    requested_billed_amount = Decimal(str(invoice.invoice_amount))
    remaining_quantity = requested_billed_quantity or ZERO
    remaining_amount = requested_billed_amount

    quantity_allocations = {lot.accrual_lot_id: ZERO for lot in candidate_lots}
    amount_allocations = {lot.accrual_lot_id: ZERO for lot in candidate_lots}

    if requested_billed_quantity is not None:
        for lot in candidate_lots:
            current_relief = current_relief_by_lot_id.get(lot.accrual_lot_id, InvoiceLotRelief())
            available_quantity = max(
                Decimal(str(lot.actualized_quantity))
                - (Decimal(str(lot.billed_quantity)) - current_relief.billed_quantity),
                ZERO,
            )
            quantity_to_allocate = min(available_quantity, remaining_quantity)
            quantity_allocations[lot.accrual_lot_id] = quantity_to_allocate
            remaining_quantity -= quantity_to_allocate
            if remaining_quantity <= ZERO:
                break
        if remaining_quantity > ZERO:
            return None

    for lot in candidate_lots:
        current_relief = current_relief_by_lot_id.get(lot.accrual_lot_id, InvoiceLotRelief())
        available_amount = max(
            Decimal(str(lot.accrued_amount))
            - (Decimal(str(lot.billed_amount)) - current_relief.billed_amount),
            ZERO,
        )
        amount_to_allocate = min(available_amount, remaining_amount)
        amount_allocations[lot.accrual_lot_id] = amount_to_allocate
        remaining_amount -= amount_to_allocate
        if remaining_amount <= ZERO:
            break

    if remaining_amount > ZERO:
        return None

    desired_disputed_amounts = {
        lot.accrual_lot_id: (
            amount_allocations[lot.accrual_lot_id]
            if invoice.status == InvoiceStatus.DISPUTED.value
            else ZERO
        )
        for lot in candidate_lots
    }
    return {
        lot.accrual_lot_id: InvoiceLotRelief(
            billed_quantity=quantity_allocations[lot.accrual_lot_id],
            billed_amount=amount_allocations[lot.accrual_lot_id],
            disputed_amount=desired_disputed_amounts[lot.accrual_lot_id],
        )
        for lot in candidate_lots
    }


def _set_lot_invoice_state(
    *,
    lot: TradeAccrualLot,
    billed_quantity: Decimal,
    billed_amount: Decimal,
    disputed_amount: Decimal,
    actor_id: str,
    updated_at: datetime,
) -> None:
    changed = False
    if Decimal(str(lot.billed_quantity)) != billed_quantity:
        lot.billed_quantity = billed_quantity
        changed = True
    if Decimal(str(lot.billed_amount)) != billed_amount:
        lot.billed_amount = billed_amount
        changed = True
    if Decimal(str(lot.disputed_amount)) != disputed_amount:
        lot.disputed_amount = disputed_amount
        changed = True

    next_status = _lot_status(
        actualized_quantity=Decimal(str(lot.actualized_quantity)),
        is_priced=Decimal(str(lot.accrued_amount)) > ZERO,
        billed_quantity=billed_quantity,
        billed_amount=billed_amount,
        collected_amount=Decimal(str(lot.collected_amount)),
        disputed_amount=disputed_amount,
        closed_at=_coerce_utc(lot.closed_at),
    )
    if lot.status != next_status:
        lot.status = next_status
        changed = True

    if changed:
        lot.updated_at = updated_at
        lot.updated_by = actor_id
        lot.version += 1


def _ordered_invoice_relief_lot_ids(
    *,
    lots: list[TradeAccrualLot],
    candidate_lots: list[TradeAccrualLot],
    current_relief_by_lot_id: dict[str, InvoiceLotRelief],
    desired_relief_by_lot_id: dict[str, InvoiceLotRelief],
) -> list[str]:
    seen: set[str] = set()
    ordered_lot_ids: list[str] = []

    for lot in candidate_lots:
        if lot.accrual_lot_id in seen:
            continue
        seen.add(lot.accrual_lot_id)
        ordered_lot_ids.append(lot.accrual_lot_id)

    for lot in lots:
        if lot.accrual_lot_id in seen:
            continue
        if lot.accrual_lot_id not in current_relief_by_lot_id and lot.accrual_lot_id not in desired_relief_by_lot_id:
            continue
        seen.add(lot.accrual_lot_id)
        ordered_lot_ids.append(lot.accrual_lot_id)

    for lot_id in sorted(set(current_relief_by_lot_id) | set(desired_relief_by_lot_id)):
        if lot_id in seen:
            continue
        ordered_lot_ids.append(lot_id)

    return ordered_lot_ids


def _synchronize_invoice_relief(
    db: Session,
    *,
    invoice: TradeInvoice,
    actor_id: str,
    now: datetime,
    strict: bool,
) -> bool:
    lots = db.execute(
        select(TradeAccrualLot)
        .where(TradeAccrualLot.trade_id == invoice.trade_id)
        .order_by(TradeAccrualLot.opened_at.asc(), TradeAccrualLot.accrual_lot_id.asc())
    ).scalars().all()
    lots_by_id = {lot.accrual_lot_id: lot for lot in lots}
    current_relief_by_lot_id = _invoice_relief_states_by_lot(db, invoice_id=invoice.id)
    candidate_lots = _candidate_lots_for_invoice(invoice=invoice, lots=lots)

    if not candidate_lots and not current_relief_by_lot_id:
        return False

    desired_relief_by_lot_id = _allocate_invoice_relief(
        invoice=invoice,
        candidate_lots=candidate_lots,
        current_relief_by_lot_id=current_relief_by_lot_id,
    )
    if desired_relief_by_lot_id is None:
        if strict:
            scope_label = f"delivery '{invoice.delivery_id}'" if invoice.delivery_id else "open accrual lots"
            raise ValueError(
                f"Invoice '{invoice.invoice_number}' could not be fully linked to {scope_label} "
                f"in {invoice.invoice_currency_code}. Record matching actualization or reduce the invoice scope."
            )
        return False

    effective_at = _coerce_utc(invoice.updated_at) or _coerce_utc(invoice.issued_at) or now
    changed = False
    entry_sequence = 0
    for lot_id in _ordered_invoice_relief_lot_ids(
        lots=lots,
        candidate_lots=candidate_lots,
        current_relief_by_lot_id=current_relief_by_lot_id,
        desired_relief_by_lot_id=desired_relief_by_lot_id,
    ):
        lot = lots_by_id.get(lot_id)
        if lot is None:
            continue

        current_relief = current_relief_by_lot_id.get(lot_id, InvoiceLotRelief())
        desired_relief = desired_relief_by_lot_id.get(lot_id, InvoiceLotRelief())
        billed_quantity_delta = desired_relief.billed_quantity - current_relief.billed_quantity
        billed_amount_delta = desired_relief.billed_amount - current_relief.billed_amount
        disputed_amount_delta = desired_relief.disputed_amount - current_relief.disputed_amount

        _append_invoice_relief_entry(
            db,
            lot=lot,
            invoice=invoice,
            billed_quantity_delta=billed_quantity_delta,
            billed_amount_delta=billed_amount_delta,
            effective_at=effective_at,
            actor_id=actor_id,
            created_at=now + timedelta(microseconds=entry_sequence),
        )
        entry_sequence += 1
        _append_dispute_entry(
            db,
            lot=lot,
            invoice=invoice,
            disputed_amount_delta=disputed_amount_delta,
            effective_at=effective_at,
            actor_id=actor_id,
            created_at=now + timedelta(microseconds=entry_sequence),
        )
        entry_sequence += 1
        _set_lot_invoice_state(
            lot=lot,
            billed_quantity=desired_relief.billed_quantity,
            billed_amount=desired_relief.billed_amount,
            disputed_amount=desired_relief.disputed_amount,
            actor_id=actor_id,
            updated_at=now,
        )
        if (
            billed_quantity_delta != ZERO
            or billed_amount_delta != ZERO
            or disputed_amount_delta != ZERO
        ):
            changed = True
    return changed


def _sync_existing_lot_to_target(
    db: Session,
    *,
    lot: TradeAccrualLot,
    desired_actualized_quantity: Decimal,
    desired_accrued_amount: Decimal,
    manual_quantity_total: Decimal,
    manual_amount_total: Decimal,
    planned_quantity: Decimal | None,
    quantity_unit_code: str | None,
    book: str,
    portfolio: str | None,
    counterparty: str | None,
    commodity_class: str,
    commodity: str,
    trade_currency_code: str | None,
    opened_at: datetime,
    actor_id: str,
    updated_at: datetime,
    is_priced: bool,
    reference_price: Decimal | None,
    price_index_code: str | None,
    mark_effective_at: datetime,
    quantity_effective_at: datetime,
    quantity_total: Decimal,
    amount_total: Decimal,
    notes: str | None,
) -> None:
    quantity_delta = desired_actualized_quantity - quantity_total
    amount_delta = desired_accrued_amount - amount_total
    total_actualized_quantity = desired_actualized_quantity + manual_quantity_total
    total_accrued_amount = desired_accrued_amount + manual_amount_total

    _append_quantity_entry(
        db,
        lot=lot,
        quantity_delta=quantity_delta,
        existing_quantity_total=quantity_total,
        effective_date=quantity_effective_at,
        actor_id=actor_id,
        created_at=updated_at,
    )
    _append_price_mark_entry(
        db,
        lot=lot,
        amount_delta=amount_delta,
        effective_date=mark_effective_at,
        actor_id=actor_id,
        created_at=updated_at,
        reference_price=reference_price,
        price_index_code=price_index_code,
    )

    changed = False
    next_values = {
        "book": book,
        "portfolio": portfolio,
        "counterparty": counterparty,
        "commodity_class": commodity_class,
        "commodity": commodity,
        "trade_currency_code": trade_currency_code,
        "quantity_unit_code": quantity_unit_code,
        "planned_quantity": planned_quantity,
        "actualized_quantity": total_actualized_quantity,
        "accrued_amount": total_accrued_amount,
        "opened_at": opened_at,
        "closed_at": None,
        "notes": notes,
    }
    for field_name, next_value in next_values.items():
        if getattr(lot, field_name) != next_value:
            setattr(lot, field_name, next_value)
            changed = True

    next_status = _lot_status(
        actualized_quantity=total_actualized_quantity,
        is_priced=is_priced or total_accrued_amount > ZERO,
        billed_quantity=Decimal(str(lot.billed_quantity)),
        billed_amount=Decimal(str(lot.billed_amount)),
        collected_amount=Decimal(str(lot.collected_amount)),
        disputed_amount=Decimal(str(lot.disputed_amount)),
        closed_at=None,
    )
    if lot.status != next_status:
        lot.status = next_status
        changed = True

    if changed or quantity_delta != ZERO or amount_delta != ZERO:
        lot.updated_at = updated_at
        lot.updated_by = actor_id
        if changed:
            lot.version += 1


def synchronize_trade_accruals(
    db: Session,
    *,
    trade_id: str,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: datetime | None = None,
) -> int:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    existing_lots = db.execute(
        select(TradeAccrualLot)
        .where(TradeAccrualLot.trade_id == trade_id)
        .order_by(TradeAccrualLot.opened_at.asc(), TradeAccrualLot.accrual_lot_id.asc())
    ).scalars().all()
    lots_by_id = {lot.accrual_lot_id: lot for lot in existing_lots}
    quantity_totals, amount_totals = _managed_entry_net_totals(
        db,
        accrual_lot_ids=[lot.accrual_lot_id for lot in existing_lots],
    )
    manual_quantity_totals, manual_amount_totals = _manual_entry_net_totals(
        db,
        accrual_lot_ids=[lot.accrual_lot_id for lot in existing_lots],
    )

    if (
        trade is None
        or trade.status != TradeStatus.ACTIVE.value
        or trade.trade_nature != TradeNature.PHYSICAL.value
    ):
        for lot in existing_lots:
            _sync_existing_lot_to_target(
                db,
                lot=lot,
                desired_actualized_quantity=ZERO,
                desired_accrued_amount=ZERO,
                manual_quantity_total=manual_quantity_totals.get(lot.accrual_lot_id, ZERO),
                manual_amount_total=manual_amount_totals.get(lot.accrual_lot_id, ZERO),
                planned_quantity=lot.planned_quantity,
                quantity_unit_code=lot.quantity_unit_code,
                book=lot.book,
                portfolio=lot.portfolio,
                counterparty=lot.counterparty,
                commodity_class=lot.commodity_class,
                commodity=lot.commodity,
                trade_currency_code=lot.trade_currency_code,
                opened_at=lot.opened_at,
                actor_id=actor_id,
                updated_at=reference_time,
                is_priced=False,
                reference_price=None,
                price_index_code=None,
                mark_effective_at=reference_time,
                quantity_effective_at=reference_time,
                quantity_total=quantity_totals.get(lot.accrual_lot_id, ZERO),
                amount_total=amount_totals.get(lot.accrual_lot_id, ZERO),
                notes=lot.notes,
            )
            lot.closed_at = reference_time
            lot.status = "REVERSED"
        db.flush()
        return 0

    targets = delivery_targets_for_trade(db, trade=trade)
    actualizations_by_delivery_id = list_trade_actualizations_by_delivery_id(db, trade_ids=[trade.trade_id])
    primary_price_term = _load_primary_price_terms(db, trade_ids=[trade.trade_id]).get(trade.trade_id)
    pricing_inputs = _effective_trade_pricing_inputs(trade, primary_price_term=primary_price_term)
    latest_observations = _load_latest_price_observations(
        db,
        price_index_codes={pricing_inputs["price_index_code"]} if pricing_inputs["price_index_code"] else set(),
    )
    latest_observation = latest_observations.get(pricing_inputs["price_index_code"]) if pricing_inputs["price_index_code"] else None
    effective_mark = _effective_mark(
        pricing_type=pricing_inputs["pricing_type"],
        fixed_price=pricing_inputs["fixed_price"],
        latest_observation=latest_observation,
    )
    accrual_currency_code = (
        pricing_inputs["currency_code"]
        or _normalize_code(getattr(latest_observation, "currency_code", None))
        or _normalize_code(trade.trade_currency_code)
        or DEFAULT_ACCRUAL_CURRENCY_CODE
    )

    touched_lot_ids: set[str] = set()
    synchronized_count = 0

    for target in targets:
        actualization = actualizations_by_delivery_id.get(target.delivery_id)
        if actualization is None:
            continue

        actualized_quantity = Decimal(str(actualization.actual_quantity))
        if actualized_quantity <= ZERO:
            continue

        desired_amount = actualized_quantity * effective_mark if effective_mark is not None else ZERO
        planned_quantity = (
            Decimal(str(target.planned_quantity))
            if target.planned_quantity is not None
            else None
        )
        lot_id = _accrual_lot_id(
            trade_id=trade.trade_id,
            delivery_id=target.delivery_id,
            accrual_currency_code=accrual_currency_code,
        )
        lot = lots_by_id.get(lot_id)
        if lot is None:
            lot = TradeAccrualLot(
                accrual_lot_id=lot_id,
                trade_id=trade.trade_id,
                delivery_id=target.delivery_id,
                leg_no=target.leg_no,
                book=trade.book,
                portfolio=trade.portfolio,
                counterparty=trade.counterparty,
                commodity_class=trade.commodity_class,
                commodity=trade.commodity,
                trade_currency_code=trade.trade_currency_code,
                accrual_currency_code=accrual_currency_code,
                quantity_unit_code=target.unit_of_measure,
                planned_quantity=planned_quantity,
                actualized_quantity=ZERO,
                billed_quantity=ZERO,
                accrued_amount=ZERO,
                billed_amount=ZERO,
                collected_amount=ZERO,
                disputed_amount=ZERO,
                status="ESTIMATED",
                opened_at=_coerce_utc(actualization.actualized_at) or reference_time,
                closed_at=None,
                notes=actualization.notes,
                created_at=reference_time,
                created_by=actor_id,
                updated_at=reference_time,
                updated_by=actor_id,
                version=1,
            )
            db.add(lot)
            db.flush()
            lots_by_id[lot_id] = lot
            quantity_totals[lot_id] = ZERO
            amount_totals[lot_id] = ZERO
            manual_quantity_totals[lot_id] = ZERO
            manual_amount_totals[lot_id] = ZERO

        touched_lot_ids.add(lot_id)
        _sync_existing_lot_to_target(
            db,
            lot=lot,
            desired_actualized_quantity=actualized_quantity,
            desired_accrued_amount=desired_amount,
            manual_quantity_total=manual_quantity_totals.get(lot_id, ZERO),
            manual_amount_total=manual_amount_totals.get(lot_id, ZERO),
            planned_quantity=planned_quantity,
            quantity_unit_code=target.unit_of_measure,
            book=trade.book,
            portfolio=trade.portfolio,
            counterparty=trade.counterparty,
            commodity_class=trade.commodity_class,
            commodity=trade.commodity,
            trade_currency_code=trade.trade_currency_code,
            opened_at=_coerce_utc(actualization.actualized_at) or reference_time,
            actor_id=actor_id,
            updated_at=reference_time,
            is_priced=effective_mark is not None,
            reference_price=effective_mark,
            price_index_code=pricing_inputs["price_index_code"],
            mark_effective_at=(
                datetime.combine(latest_observation.observation_date, datetime.min.time(), tzinfo=timezone.utc)
                if latest_observation is not None
                else (_coerce_utc(actualization.actualized_at) or reference_time)
            ),
            quantity_effective_at=_coerce_utc(actualization.actualized_at) or reference_time,
            quantity_total=quantity_totals.get(lot_id, ZERO),
            amount_total=amount_totals.get(lot_id, ZERO),
            notes=actualization.notes,
        )
        synchronized_count += 1

    for lot_id, lot in lots_by_id.items():
        if lot_id in touched_lot_ids:
            continue
        _sync_existing_lot_to_target(
            db,
            lot=lot,
            desired_actualized_quantity=ZERO,
            desired_accrued_amount=ZERO,
            manual_quantity_total=manual_quantity_totals.get(lot_id, ZERO),
            manual_amount_total=manual_amount_totals.get(lot_id, ZERO),
            planned_quantity=lot.planned_quantity,
            quantity_unit_code=lot.quantity_unit_code,
            book=lot.book,
            portfolio=lot.portfolio,
            counterparty=lot.counterparty,
            commodity_class=lot.commodity_class,
            commodity=lot.commodity,
            trade_currency_code=lot.trade_currency_code,
            opened_at=lot.opened_at,
            actor_id=actor_id,
            updated_at=reference_time,
            is_priced=False,
            reference_price=None,
            price_index_code=None,
            mark_effective_at=reference_time,
            quantity_effective_at=reference_time,
            quantity_total=quantity_totals.get(lot_id, ZERO),
            amount_total=amount_totals.get(lot_id, ZERO),
            notes=lot.notes,
        )
        lot.closed_at = reference_time
        lot.status = "REVERSED"

    synchronize_trade_invoice_reliefs(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        now=reference_time,
        strict=False,
    )
    db.flush()
    return synchronized_count


def _refresh_lot_rollup_from_entries(
    db: Session,
    *,
    lot: TradeAccrualLot,
    actor_id: str,
    updated_at: datetime,
) -> None:
    managed_quantity_totals, managed_amount_totals = _managed_entry_net_totals(
        db,
        accrual_lot_ids=[lot.accrual_lot_id],
    )
    manual_quantity_totals, manual_amount_totals = _manual_entry_net_totals(
        db,
        accrual_lot_ids=[lot.accrual_lot_id],
    )
    total_actualized_quantity = (
        managed_quantity_totals.get(lot.accrual_lot_id, ZERO)
        + manual_quantity_totals.get(lot.accrual_lot_id, ZERO)
    )
    total_accrued_amount = (
        managed_amount_totals.get(lot.accrual_lot_id, ZERO)
        + manual_amount_totals.get(lot.accrual_lot_id, ZERO)
    )

    changed = False
    if Decimal(str(lot.actualized_quantity)) != total_actualized_quantity:
        lot.actualized_quantity = total_actualized_quantity
        changed = True
    if Decimal(str(lot.accrued_amount)) != total_accrued_amount:
        lot.accrued_amount = total_accrued_amount
        changed = True

    next_status = _lot_status(
        actualized_quantity=total_actualized_quantity,
        is_priced=total_accrued_amount > ZERO,
        billed_quantity=Decimal(str(lot.billed_quantity)),
        billed_amount=Decimal(str(lot.billed_amount)),
        collected_amount=Decimal(str(lot.collected_amount)),
        disputed_amount=Decimal(str(lot.disputed_amount)),
        closed_at=_coerce_utc(lot.closed_at),
    )
    if lot.status != next_status:
        lot.status = next_status
        changed = True

    if changed:
        lot.updated_at = updated_at
        lot.updated_by = actor_id
        lot.version += 1


def synchronize_trade_invoice_relief(
    db: Session,
    *,
    invoice_id: int,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: datetime | None = None,
    strict: bool = False,
) -> bool:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    invoice = db.get(TradeInvoice, invoice_id)
    if invoice is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")
    return _synchronize_invoice_relief(
        db,
        invoice=invoice,
        actor_id=actor_id,
        now=reference_time,
        strict=strict,
    )


def synchronize_trade_invoice_reliefs(
    db: Session,
    *,
    trade_id: str,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: datetime | None = None,
    strict: bool = False,
) -> int:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    invoices = db.execute(
        select(TradeInvoice)
        .where(TradeInvoice.trade_id == trade_id)
        .order_by(TradeInvoice.issued_at.asc(), TradeInvoice.id.asc())
    ).scalars().all()

    synchronized_count = 0
    for invoice in invoices:
        if _synchronize_invoice_relief(
            db,
            invoice=invoice,
            actor_id=actor_id,
            now=reference_time,
            strict=strict,
        ):
            synchronized_count += 1
    return synchronized_count


def rebuild_trade_accruals_ledger(
    db: Session,
    *,
    trade_ids: list[str] | None = None,
    price_index_codes: list[str] | None = None,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: datetime | None = None,
) -> int:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_price_index_codes = {
        code
        for code in (_normalize_code(value) for value in (price_index_codes or []))
        if code
    }

    if trade_ids:
        target_trade_ids = sorted({str(trade_id).strip() for trade_id in trade_ids if str(trade_id).strip()})
    else:
        trades = db.execute(
            select(Trade)
            .order_by(Trade.updated_at.desc(), Trade.trade_id.asc())
        ).scalars().all()
        primary_price_terms = _load_primary_price_terms(db, trade_ids=[trade.trade_id for trade in trades])
        target_trade_ids = []
        for trade in trades:
            if normalized_price_index_codes:
                pricing_inputs = _effective_trade_pricing_inputs(
                    trade,
                    primary_price_term=primary_price_terms.get(trade.trade_id),
                )
                if pricing_inputs["price_index_code"] not in normalized_price_index_codes:
                    continue
            target_trade_ids.append(trade.trade_id)

    synchronized_count = 0
    for trade_id in target_trade_ids:
        synchronized_count += synchronize_trade_accruals(
            db,
            trade_id=trade_id,
            actor_id=actor_id,
            now=reference_time,
        )
    return synchronized_count


def _lot_filters(
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
) -> list[Any]:
    filters: list[Any] = []

    normalized_trade_id = _normalize_code(trade_id)
    if normalized_trade_id:
        filters.append(func.upper(TradeAccrualLot.trade_id) == normalized_trade_id)

    normalized_delivery_id = _normalize_code(delivery_id)
    if normalized_delivery_id:
        filters.append(func.upper(TradeAccrualLot.delivery_id) == normalized_delivery_id)

    normalized_book = _normalize_code(book)
    if normalized_book:
        filters.append(func.upper(TradeAccrualLot.book) == normalized_book)

    normalized_portfolio = _normalize_code(portfolio)
    if normalized_portfolio:
        filters.append(func.upper(TradeAccrualLot.portfolio) == normalized_portfolio)

    normalized_counterparty = _normalize_code(counterparty)
    if normalized_counterparty:
        filters.append(func.upper(TradeAccrualLot.counterparty) == normalized_counterparty)

    normalized_commodity_class = _normalize_code(commodity_class)
    if normalized_commodity_class:
        filters.append(func.upper(TradeAccrualLot.commodity_class) == normalized_commodity_class)

    normalized_accrual_currency_code = _normalize_code(accrual_currency_code)
    if normalized_accrual_currency_code:
        filters.append(func.upper(TradeAccrualLot.accrual_currency_code) == normalized_accrual_currency_code)

    normalized_status = _normalize_code(status_filter)
    if normalized_status:
        filters.append(func.upper(TradeAccrualLot.status) == normalized_status)

    return filters


def _to_lot_out(
    lot: TradeAccrualLot,
    *,
    entry_count: int,
    last_entry_at: datetime | None,
) -> dict[str, Any]:
    actualized_quantity = lot.actualized_quantity
    billed_quantity = lot.billed_quantity
    accrued_amount = lot.accrued_amount
    billed_amount = lot.billed_amount
    collected_amount = lot.collected_amount
    disputed_amount = lot.disputed_amount

    return {
        "accrual_lot_id": lot.accrual_lot_id,
        "trade_id": lot.trade_id,
        "delivery_id": lot.delivery_id,
        "leg_no": lot.leg_no,
        "book": lot.book,
        "portfolio": lot.portfolio,
        "counterparty": lot.counterparty,
        "commodity_class": lot.commodity_class,
        "commodity": lot.commodity,
        "trade_currency_code": lot.trade_currency_code,
        "accrual_currency_code": lot.accrual_currency_code,
        "quantity_unit_code": lot.quantity_unit_code,
        "planned_quantity": _decimal_to_float(lot.planned_quantity),
        "actualized_quantity": float(actualized_quantity),
        "billed_quantity": float(billed_quantity),
        "accrued_amount": float(accrued_amount),
        "billed_amount": float(billed_amount),
        "collected_amount": float(collected_amount),
        "disputed_amount": float(disputed_amount),
        "unbilled_quantity": float(actualized_quantity - billed_quantity),
        "unbilled_amount": float(accrued_amount - billed_amount),
        "billed_uncollected_amount": float(billed_amount - collected_amount),
        "net_open_amount": float(accrued_amount - collected_amount),
        "status": lot.status,
        "opened_at": _coerce_utc(lot.opened_at),
        "closed_at": _coerce_utc(lot.closed_at),
        "notes": lot.notes,
        "created_at": _coerce_utc(lot.created_at),
        "created_by": lot.created_by,
        "updated_at": _coerce_utc(lot.updated_at),
        "updated_by": lot.updated_by,
        "version": lot.version,
        "entry_count": entry_count,
        "last_entry_at": _coerce_utc(last_entry_at),
    }


def list_accrual_lots(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = (
        select(TradeAccrualLot)
        .where(
            *_lot_filters(
                trade_id=trade_id,
                delivery_id=delivery_id,
                book=book,
                portfolio=portfolio,
                counterparty=counterparty,
                commodity_class=commodity_class,
                accrual_currency_code=accrual_currency_code,
                status_filter=status_filter,
            )
        )
        .order_by(TradeAccrualLot.opened_at.desc(), TradeAccrualLot.accrual_lot_id.asc())
    )
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    lots = db.execute(stmt).scalars().all()
    if not lots:
        return []

    lot_ids = [lot.accrual_lot_id for lot in lots]
    entry_summary_rows = db.execute(
        select(
            TradeAccrualEntry.accrual_lot_id,
            func.count(TradeAccrualEntry.entry_id),
            func.max(TradeAccrualEntry.created_at),
        )
        .where(TradeAccrualEntry.accrual_lot_id.in_(lot_ids))
        .group_by(TradeAccrualEntry.accrual_lot_id)
    ).all()
    entry_summaries = {
        accrual_lot_id: {"entry_count": int(entry_count), "last_entry_at": _coerce_utc(last_entry_at)}
        for accrual_lot_id, entry_count, last_entry_at in entry_summary_rows
    }

    return [
        _to_lot_out(
            lot,
            entry_count=entry_summaries.get(lot.accrual_lot_id, {}).get("entry_count", 0),
            last_entry_at=entry_summaries.get(lot.accrual_lot_id, {}).get("last_entry_at"),
        )
        for lot in lots
    ]


def list_accrual_entries(
    db: Session,
    *,
    accrual_lot_id: str,
) -> list[dict[str, Any]]:
    lot = db.get(TradeAccrualLot, accrual_lot_id)
    if lot is None:
        raise LookupError(f"Accrual lot '{accrual_lot_id}' was not found.")

    rows = db.execute(
        select(TradeAccrualEntry)
        .where(TradeAccrualEntry.accrual_lot_id == accrual_lot_id)
        .order_by(
            TradeAccrualEntry.effective_date.asc(),
            TradeAccrualEntry.created_at.asc(),
            TradeAccrualEntry.entry_id.asc(),
        )
    ).scalars().all()

    return [
        {
            "entry_id": row.entry_id,
            "accrual_lot_id": row.accrual_lot_id,
            "entry_type": row.entry_type,
            "trade_id": row.trade_id,
            "delivery_id": row.delivery_id,
            "invoice_id": row.invoice_id,
            "payment_id": row.payment_id,
            "effective_date": row.effective_date,
            "currency_code": row.currency_code,
            "quantity_delta": _decimal_to_float(row.quantity_delta),
            "amount_delta": float(row.amount_delta),
            "reference_price": _decimal_to_float(row.reference_price),
            "price_index_code": row.price_index_code,
            "fx_rate": _decimal_to_float(row.fx_rate),
            "notes": row.notes,
            "created_at": _coerce_utc(row.created_at),
            "created_by": row.created_by,
        }
        for row in rows
    ]


def build_accrual_reconciliation_report(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    rows = db.execute(
        select(
            TradeAccrualLot.book,
            TradeAccrualLot.portfolio,
            TradeAccrualLot.counterparty,
            TradeAccrualLot.commodity_class,
            TradeAccrualLot.accrual_currency_code,
            func.count(TradeAccrualLot.accrual_lot_id),
            func.sum(TradeAccrualLot.actualized_quantity),
            func.sum(TradeAccrualLot.billed_quantity),
            func.sum(TradeAccrualLot.accrued_amount),
            func.sum(TradeAccrualLot.billed_amount),
            func.sum(TradeAccrualLot.collected_amount),
            func.sum(TradeAccrualLot.disputed_amount),
        )
        .where(
            *_lot_filters(
                trade_id=trade_id,
                delivery_id=delivery_id,
                book=book,
                portfolio=portfolio,
                counterparty=counterparty,
                commodity_class=commodity_class,
                accrual_currency_code=accrual_currency_code,
                status_filter=status_filter,
            )
        )
        .group_by(
            TradeAccrualLot.book,
            TradeAccrualLot.portfolio,
            TradeAccrualLot.counterparty,
            TradeAccrualLot.commodity_class,
            TradeAccrualLot.accrual_currency_code,
        )
        .order_by(
            TradeAccrualLot.book.asc(),
            TradeAccrualLot.portfolio.asc(),
            TradeAccrualLot.counterparty.asc(),
            TradeAccrualLot.commodity_class.asc(),
            TradeAccrualLot.accrual_currency_code.asc(),
        )
    ).all()

    report_rows: list[dict[str, Any]] = []
    currency_summaries: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "currency_code": "",
            "lot_count": 0,
            "accrued_amount": 0.0,
            "billed_amount": 0.0,
            "collected_amount": 0.0,
            "disputed_amount": 0.0,
            "unbilled_amount": 0.0,
            "billed_uncollected_amount": 0.0,
            "net_open_amount": 0.0,
        }
    )
    total_lot_count = 0

    for row in rows:
        (
            row_book,
            row_portfolio,
            row_counterparty,
            row_commodity_class,
            row_currency_code,
            row_lot_count,
            row_actualized_quantity,
            row_billed_quantity,
            row_accrued_amount,
            row_billed_amount,
            row_collected_amount,
            row_disputed_amount,
        ) = row

        actualized_quantity = Decimal(str(row_actualized_quantity or 0))
        billed_quantity = Decimal(str(row_billed_quantity or 0))
        accrued_amount = Decimal(str(row_accrued_amount or 0))
        billed_amount = Decimal(str(row_billed_amount or 0))
        collected_amount = Decimal(str(row_collected_amount or 0))
        disputed_amount = Decimal(str(row_disputed_amount or 0))
        unbilled_quantity = actualized_quantity - billed_quantity
        unbilled_amount = accrued_amount - billed_amount
        billed_uncollected_amount = billed_amount - collected_amount
        net_open_amount = accrued_amount - collected_amount
        lot_count = int(row_lot_count or 0)

        report_rows.append(
            {
                "book": row_book,
                "portfolio": row_portfolio,
                "counterparty": row_counterparty,
                "commodity_class": row_commodity_class,
                "currency_code": row_currency_code,
                "lot_count": lot_count,
                "actualized_quantity": float(actualized_quantity),
                "billed_quantity": float(billed_quantity),
                "unbilled_quantity": float(unbilled_quantity),
                "accrued_amount": float(accrued_amount),
                "billed_amount": float(billed_amount),
                "collected_amount": float(collected_amount),
                "disputed_amount": float(disputed_amount),
                "unbilled_amount": float(unbilled_amount),
                "billed_uncollected_amount": float(billed_uncollected_amount),
                "net_open_amount": float(net_open_amount),
            }
        )

        total_lot_count += lot_count
        currency_summary = currency_summaries[row_currency_code]
        currency_summary["currency_code"] = row_currency_code
        currency_summary["lot_count"] += lot_count
        currency_summary["accrued_amount"] += float(accrued_amount)
        currency_summary["billed_amount"] += float(billed_amount)
        currency_summary["collected_amount"] += float(collected_amount)
        currency_summary["disputed_amount"] += float(disputed_amount)
        currency_summary["unbilled_amount"] += float(unbilled_amount)
        currency_summary["billed_uncollected_amount"] += float(billed_uncollected_amount)
        currency_summary["net_open_amount"] += float(net_open_amount)

    return {
        "generated_at": generated_at,
        "row_count": len(report_rows),
        "lot_count": total_lot_count,
        "currency_summaries": sorted(currency_summaries.values(), key=lambda row: row["currency_code"]),
        "rows": report_rows,
    }
