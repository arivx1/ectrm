from __future__ import annotations

import uuid
import math
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.trade_credit_hold import (
    CREDIT_HOLD_GATED_TRADE_FIELDS,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.domains.operations.services.settlement_payments import trade_has_payment_records
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items
from apps.api.app.domains.risk.services.option_exposures import sync_option_exposures_for_trade_change
from apps.api.app.domains.operations.services.settlement_invoices import trade_has_invoice_record
from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
    evaluate_counterparty_credit_policy,
)
from apps.api.app.domains.reference_data.services.counterparty_standards import (
    counterparty_credit_status_allows_trading,
    normalize_counterparty_credit_status,
)
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.event import EventCreate, EventOut
from apps.api.app.shared.enums import (
    AllocationStatus,
    ConfirmationStatus,
    CreditApprovalStatus,
    InvoiceStatus,
    NominationStatus,
    OptionStyle,
    OptionType,
    PaymentStatus,
    PricingStatus,
    PricingType,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStructure,
    TradeWorkflowType,
)

router = APIRouter(prefix="/events", tags=["events"])

ZERO = Decimal("0")
DEFAULT_SOURCE_SYSTEM = "ETRM"
CREDIT_HOLD_FIELD_LABELS = {
    "confirmation_status": "confirmation",
    "nomination_status": "nomination",
    "allocation_status": "allocation",
    "invoice_status": "invoice",
    "payment_status": "payment",
    "settlement_status": "settlement",
}


def trade_snapshot(db: Session, trade: Trade | None) -> dict[str, object] | None:
    if trade is None:
        return None

    db.flush()
    legs = db.execute(
        select(TradeLeg)
        .where(TradeLeg.trade_id == trade.trade_id)
        .order_by(TradeLeg.leg_no.asc())
    ).scalars().all()

    return {
        "trade_id": trade.trade_id,
        "instrument_type": trade.instrument_type,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "trade_structure": trade.trade_structure,
        "trade_side": trade.trade_side,
        "trade_currency_code": trade.trade_currency_code,
        "price_unit_code": trade.price_unit_code,
        "price": Decimal(str(trade.price or 0)) if trade.price is not None else None,
        "volume": Decimal(str(trade.volume or 0)),
        "option_type": trade.option_type,
        "option_style": trade.option_style,
        "option_strike_price": Decimal(str(trade.option_strike_price))
        if trade.option_strike_price is not None
        else None,
        "option_expiration_date": trade.option_expiration_date,
        "status": trade.status,
        "updated_at": trade.updated_at,
        "legs": [
            {
                "commodity": leg.commodity_code,
                "side": leg.side,
                "volume": Decimal(str(leg.quantity or 0)),
            }
            for leg in legs
        ],
    }


def signed_volume(side: object | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    normalized_side = str(side or TradeSide.BUY.value).strip().upper()
    if normalized_side == TradeSide.SELL.value:
        return volume * Decimal("-1")
    return volume


def active_volume_by_commodity(trade: dict[str, object] | None) -> dict[str, Decimal]:
    instrument_type = (
        str(trade.get("instrument_type") or TradeInstrumentType.LINEAR.value).strip().upper()
        if trade is not None
        else None
    )
    if (
        trade is None
        or trade.get("status") == "CANCELLED"
        or instrument_type == TradeInstrumentType.OPTION.value
    ):
        return {}

    if trade.get("trade_structure") == TradeStructure.SWAP.value:
        totals: dict[str, Decimal] = {}
        for leg in trade.get("legs", []):
            if not isinstance(leg, dict):
                continue
            commodity = str(leg.get("commodity") or "UNKNOWN")
            totals[commodity] = totals.get(commodity, ZERO) + signed_volume(
                leg.get("side"),
                leg.get("volume"),
            )
        return {
            commodity: quantity
            for commodity, quantity in totals.items()
            if quantity != ZERO
        }

    commodity = str(trade.get("commodity") or "UNKNOWN")
    volume = signed_volume(trade.get("trade_side"), trade.get("volume"))
    if volume == ZERO:
        return {}
    return {commodity: volume}


def apply_position_delta(db: Session, commodity: str, delta: Decimal, updated_at: datetime) -> None:
    if delta == ZERO:
        return

    existing = db.execute(
        select(Position).where(Position.commodity == commodity)
    ).scalars().first()

    if existing is None:
        if delta != ZERO:
            db.add(Position(commodity=commodity, net_volume=delta, updated_at=updated_at))
        return

    next_volume = Decimal(str(existing.net_volume)) + delta
    if next_volume == ZERO:
        db.delete(existing)
        return

    existing.net_volume = next_volume
    existing.updated_at = updated_at


def sync_positions_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_contrib = active_volume_by_commodity(before)
    after_contrib = active_volume_by_commodity(after)
    commodities = set(before_contrib) | set(after_contrib)

    for commodity in commodities:
        delta = after_contrib.get(commodity, ZERO) - before_contrib.get(commodity, ZERO)
        apply_position_delta(db, commodity, delta, updated_at)


def normalize_commodity_code(value: object | None) -> str:
    return str(value or "").strip().upper()


def normalize_trade_nature(value: object | None) -> str:
    normalized = str(value or TradeNature.PHYSICAL.value).strip().upper()
    valid_values = {trade_nature.value for trade_nature in TradeNature}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade nature '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_instrument_type(value: object | None) -> str:
    normalized = str(value or TradeInstrumentType.LINEAR.value).strip().upper()
    valid_values = {instrument_type.value for instrument_type in TradeInstrumentType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Instrument type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_structure(value: object | None) -> str:
    normalized = str(value or TradeStructure.SINGLE.value).strip().upper()
    valid_values = {trade_structure.value for trade_structure in TradeStructure}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade structure '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_side(value: object | None) -> str:
    normalized = str(value or TradeSide.BUY.value).strip().upper()
    valid_values = {trade_side.value for trade_side in TradeSide}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade side '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_option_type(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_type.value for option_type in OptionType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_option_style(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_style.value for option_style in OptionStyle}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option style '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_pricing_type(value: object | None) -> str:
    normalized = str(value or PricingType.FIXED.value).strip().upper()
    valid_values = {pricing_type.value for pricing_type in PricingType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Pricing type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_price_index_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def normalize_optional_text(value: object | None, *, uppercase: bool = False) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    return normalized.upper() if uppercase else normalized


def normalize_trade_header_status(
    value: object | None,
    *,
    default: str,
    field_name: str,
    valid_values: set[str],
) -> str:
    normalized = str(value or default).strip().upper()
    if not normalized:
        return default
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{field_name} '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def parse_execution_timestamp(value: object | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="execution_timestamp must be a valid ISO-8601 datetime",
            ) from exc
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="execution_timestamp must be a datetime or ISO-8601 string",
    )


def parse_optional_date(value: object | None, *, field_name: str) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        coerced = value if value.tzinfo is None else value.astimezone(timezone.utc)
        return coerced.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            if "T" in candidate:
                return datetime.fromisoformat(candidate.replace("Z", "+00:00")).date()
            return date.fromisoformat(candidate)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a valid ISO-8601 date",
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{field_name} must be a date or ISO-8601 string",
    )


def normalize_optional_number(value: object | None, *, field_name: str) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a numeric value",
        )
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a finite numeric value",
            )
        return float(value)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            return float(Decimal(candidate))
        except Exception as exc:  # pragma: no cover - Decimal uses multiple exception types
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a numeric value",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{field_name} must be a numeric value",
    )


def validate_date_range(
    start_value: date | None,
    end_value: date | None,
    *,
    start_field: str,
    end_field: str,
) -> None:
    if start_value is not None and end_value is not None and end_value < start_value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{end_field} must be on or after {start_field}",
        )


def default_trade_workflow_statuses(trade_nature: str) -> dict[str, str]:
    requires_physical_workflows = trade_nature == TradeNature.PHYSICAL.value
    return {
        "confirmation_status": ConfirmationStatus.PENDING.value,
        "nomination_status": (
            NominationStatus.PENDING.value
            if requires_physical_workflows
            else NominationStatus.NOT_REQUIRED.value
        ),
        "allocation_status": (
            AllocationStatus.PENDING.value
            if requires_physical_workflows
            else AllocationStatus.NOT_REQUIRED.value
        ),
        "invoice_status": (
            InvoiceStatus.PENDING.value
            if requires_physical_workflows
            else InvoiceStatus.NOT_REQUIRED.value
        ),
        "payment_status": PaymentStatus.PENDING.value,
    }


def validate_trade_measurements(
    *,
    trade_structure: str,
    pricing_type: str,
    price: float | None,
    volume: float | None,
) -> None:
    if pricing_type in {PricingType.FIXED.value, PricingType.HYBRID.value} and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price Differential is required when pricing type is FIXED or HYBRID",
        )
    if trade_structure == TradeStructure.SINGLE.value and volume is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Volume is required for SINGLE trades",
        )


def validate_option_fields(
    *,
    instrument_type: str,
    trade_nature: str,
    trade_structure: str,
    pricing_type: str,
    option_type: object | None,
    option_style: object | None,
    option_strike_price: object | None,
    option_expiration_date: object | None,
) -> tuple[str | None, str | None, float | None, date | None]:
    normalized_option_type = normalize_option_type(option_type)
    normalized_option_style = normalize_option_style(option_style)
    normalized_option_strike_price = normalize_optional_number(
        option_strike_price,
        field_name="Option strike price",
    )
    normalized_option_expiration_date = parse_optional_date(
        option_expiration_date,
        field_name="option_expiration_date",
    )

    if instrument_type != TradeInstrumentType.OPTION.value:
        if any(
            value is not None
            for value in (
                normalized_option_type,
                normalized_option_style,
                normalized_option_strike_price,
                normalized_option_expiration_date,
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Option fields can only be set when instrument_type is OPTION",
            )
        return None, None, None, None

    if trade_nature != TradeNature.FINANCIAL.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options must be booked as FINANCIAL trades",
        )
    if trade_structure != TradeStructure.SINGLE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently support SINGLE structure only",
        )
    if pricing_type != PricingType.FIXED.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently require FIXED pricing for premium capture",
        )
    if normalized_option_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_type is required when instrument_type is OPTION",
        )
    if normalized_option_strike_price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_strike_price is required when instrument_type is OPTION",
        )
    if normalized_option_expiration_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_expiration_date is required when instrument_type is OPTION",
        )

    return (
        normalized_option_type,
        normalized_option_style or OptionStyle.AMERICAN.value,
        normalized_option_strike_price,
        normalized_option_expiration_date,
        )


def reject_invoice_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    payload_fields = set(payload_data)

    if {"invoice_status", "settlement_status"} & payload_fields and trade_has_invoice_record(db, trade_id=trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Invoice and settlement statuses are now derived from settlement invoices for this trade. "
                "Update the invoice record from the Settlement workspace instead of amending the trade header."
            ),
        )

    if "payment_status" in payload_fields and trade_has_payment_records(db, trade_id=trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Payment status is now derived from settlement payments for this trade. "
                "Update the payment record from the Settlement workspace instead of amending the trade header."
            ),
        )


def require_active_book(db: Session, book_code: object | None) -> str:
    normalized_book_code = str(book_code or "").strip().upper()
    if not normalized_book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Book is required and must be selected from reference data",
        )

    reference_book = db.execute(
        select(ReferenceBook).where(
            ReferenceBook.code == normalized_book_code,
            ReferenceBook.is_active.is_(True),
        )
    ).scalars().first()
    if reference_book is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Book '{normalized_book_code}' is not active in reference data",
        )

    return normalized_book_code


def require_active_commodity(
    db: Session,
    commodity_class: object | None,
    commodity_code: object | None,
) -> tuple[str, str]:
    normalized_class = normalize_commodity_code(commodity_class)
    normalized_code = normalize_commodity_code(commodity_code)
    if not normalized_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity class is required and must be selected from reference data",
        )
    if not normalized_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity is required and must be selected from reference data",
        )

    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.commodity_class == normalized_class,
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Commodity '{normalized_code}' is not active in commodity class "
                f"'{normalized_class}'"
            ),
        )

    return normalized_class, normalized_code


def require_active_counterparty(db: Session, counterparty_code: object | None) -> str | None:
    normalized_counterparty_code = normalize_optional_text(counterparty_code, uppercase=True)
    if normalized_counterparty_code is None:
        return None

    reference_counterparty = db.execute(
        select(ReferenceCounterparty).where(
            ReferenceCounterparty.code == normalized_counterparty_code,
            ReferenceCounterparty.is_active.is_(True),
        )
    ).scalars().first()
    if reference_counterparty is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Counterparty '{normalized_counterparty_code}' is not active in reference data",
        )
    if not counterparty_credit_status_allows_trading(reference_counterparty.credit_status):
        normalized_credit_status = normalize_counterparty_credit_status(
            reference_counterparty.credit_status
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Counterparty '{normalized_counterparty_code}' is not tradable because "
                f"credit status is '{normalized_credit_status}'. Set it to APPROVED before "
                f"booking or amending trades."
            ),
        )

    return normalized_counterparty_code


def _format_counterparty_credit_limit_message(policy_result: dict[str, object]) -> str:
    counterparty_code = str(policy_result["counterparty_code"])
    limit_currency_code = str(policy_result["limit_currency_code"])
    projected_exposure_amount = float(policy_result["projected_exposure_amount"])
    limit_amount = float(policy_result["limit_amount"])
    projected_utilization_percent = float(policy_result["projected_utilization_percent"])
    breach_action = str(policy_result["breach_action"])
    return (
        f"Counterparty '{counterparty_code}' would exceed its approved credit limit: projected exposure "
        f"{limit_currency_code} {projected_exposure_amount:,.2f} versus limit "
        f"{limit_currency_code} {limit_amount:,.2f} ({projected_utilization_percent:.1f}% utilization). "
        f"Breach action is '{breach_action}'."
    )


def _requested_credit_hold_blocked_fields(
    trade: Trade,
    payload_data: dict[str, object],
) -> list[str]:
    blocked_fields: list[str] = []
    for field_name in CREDIT_HOLD_GATED_TRADE_FIELDS:
        if field_name not in payload_data:
            continue
        next_value = payload_data.get(field_name)
        if next_value is None:
            continue
        normalized_next_value = str(next_value).strip().upper()
        current_value = str(getattr(trade, field_name) or "").strip().upper()
        if normalized_next_value and normalized_next_value != current_value:
            blocked_fields.append(CREDIT_HOLD_FIELD_LABELS[field_name])
    return blocked_fields


def _sync_credit_approval_workflow_item(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    policy_result: dict[str, object] | None,
) -> None:
    existing_item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade.trade_id,
            TradeWorkflowItem.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value,
        )
    ).scalars().first()

    requires_approval = bool(
        policy_result is not None
        and policy_result.get("limit_breached")
        and policy_result.get("breach_action") == "REQUIRE_APPROVAL"
    )
    if requires_approval:
        if existing_item is not None and existing_item.status in {
            CreditApprovalStatus.APPROVED.value,
            CreditApprovalStatus.REJECTED.value,
        }:
            return
        notes = (
            f"{_format_counterparty_credit_limit_message(policy_result)} "
            "Trade booking is allowed, but credit review is required before the breach can be accepted."
        )
        create_trade_workflow_item(
            db,
            trade_id=trade.trade_id,
            workflow_type=TradeWorkflowType.CREDIT_APPROVAL.value,
            actor_id=actor_id,
            enforce_credit_authorization=False,
            status=CreditApprovalStatus.PENDING_REVIEW.value,
            notes=notes,
            now=now,
        )
        return

    if existing_item is None or existing_item.status in {
        CreditApprovalStatus.APPROVED.value,
        CreditApprovalStatus.NOT_REQUIRED.value,
    }:
        return

    notes = (
        f"{existing_item.notes}\n"
        "Closed automatically because projected exposure is now within the approved credit tolerance."
        if existing_item.notes
        else "Closed automatically because projected exposure is now within the approved credit tolerance."
    )
    create_trade_workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.CREDIT_APPROVAL.value,
        actor_id=actor_id,
        enforce_credit_authorization=False,
        status=CreditApprovalStatus.NOT_REQUIRED.value,
        notes=notes,
        now=now,
    )


def require_active_portfolio(
    db: Session,
    portfolio_code: object | None,
    *,
    book_code: str,
) -> str | None:
    normalized_portfolio_code = normalize_optional_text(portfolio_code, uppercase=True)
    if normalized_portfolio_code is None:
        return None

    reference_portfolio = db.execute(
        select(ReferencePortfolio).where(
            ReferencePortfolio.code == normalized_portfolio_code,
            ReferencePortfolio.is_active.is_(True),
        )
    ).scalars().first()
    if reference_portfolio is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Portfolio '{normalized_portfolio_code}' is not active in reference data",
        )
    if reference_portfolio.book_code != book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Portfolio '{normalized_portfolio_code}' belongs to book "
                f"'{reference_portfolio.book_code}', not '{book_code}'"
            ),
        )

    return normalized_portfolio_code


def require_active_price_index(
    db: Session,
    pricing_type: object | None,
    price_index_code: object | None,
) -> tuple[str, str | None]:
    normalized_pricing_type = normalize_pricing_type(pricing_type)
    normalized_price_index_code = normalize_price_index_code(price_index_code)

    if normalized_pricing_type in {PricingType.INDEX.value, PricingType.HYBRID.value}:
        if normalized_price_index_code is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price index is required when pricing type is INDEX or HYBRID",
            )
    if normalized_price_index_code is None:
        return normalized_pricing_type, None

    reference_price_index = db.execute(
        select(ReferencePriceIndex).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalars().first()
    if reference_price_index is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Price index '{normalized_price_index_code}' is not active",
        )

    return normalized_pricing_type, normalized_price_index_code


def require_active_unit(db: Session, unit_code: object | None) -> str | None:
    normalized_unit_code = normalize_optional_text(unit_code, uppercase=True)
    if normalized_unit_code is None:
        return None

    reference_unit = db.execute(
        select(ReferenceUnit).where(
            ReferenceUnit.code == normalized_unit_code,
            ReferenceUnit.is_active.is_(True),
        )
    ).scalars().first()
    if reference_unit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unit '{normalized_unit_code}' is not active in reference data",
        )

    return normalized_unit_code


def require_active_currency(db: Session, currency_code: object | None) -> str | None:
    normalized_currency_code = normalize_optional_text(currency_code, uppercase=True)
    if normalized_currency_code is None:
        return None

    reference_currency = db.execute(
        select(ReferenceCurrency).where(
            ReferenceCurrency.code == normalized_currency_code,
            ReferenceCurrency.is_active.is_(True),
        )
    ).scalars().first()
    if reference_currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency '{normalized_currency_code}' is not active in reference data",
        )

    return normalized_currency_code


def require_active_location(db: Session, location_code: object | None) -> str | None:
    normalized_location_code = normalize_optional_text(location_code, uppercase=True)
    if normalized_location_code is None:
        return None

    reference_location = db.execute(
        select(ReferenceLocation).where(
            ReferenceLocation.code == normalized_location_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalars().first()
    if reference_location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Location '{normalized_location_code}' is not active in reference data",
        )

    return normalized_location_code


def validate_trade_structure_payload(
    trade_structure: str,
    trade_side: object | None,
    legs_payload: object | None,
) -> tuple[str | None, list[dict[str, object]]]:
    if legs_payload is None:
        legs = []
    elif isinstance(legs_payload, list):
        legs = [leg for leg in legs_payload if isinstance(leg, dict)]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="legs must be an array of objects when provided",
        )

    if trade_structure == TradeStructure.SINGLE.value:
        normalized_trade_side = normalize_trade_side(trade_side)
        return normalized_trade_side, legs

    if trade_side is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="trade_side cannot be set on SWAP trades; use legs instead",
        )
    if len(legs) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SWAP trades require at least two legs",
        )
    return None, legs


def sync_trade_legs(
    db: Session,
    trade_id: str,
    trade_structure: str,
    trade_side: str | None,
    default_commodity_class: str,
    default_commodity_code: str,
    default_volume: object | None,
    default_location_code: str | None,
    default_quantity_unit_code: str | None,
    default_delivery_start: date | None,
    default_delivery_end: date | None,
    legs_payload: list[dict[str, object]],
    timestamp: datetime,
) -> None:
    existing_legs = db.execute(
        select(TradeLeg).where(TradeLeg.trade_id == trade_id)
    ).scalars().all()
    existing_by_leg_no = {leg.leg_no: leg for leg in existing_legs}
    touched_leg_numbers: set[int] = set()

    if trade_structure == TradeStructure.SINGLE.value:
        legs_to_sync = [
            {
                "leg_no": 1,
                "side": trade_side,
                "commodity_class": default_commodity_class,
                "commodity_code": default_commodity_code,
                "location_code": default_location_code,
                "quantity": default_volume,
                "quantity_unit_code": default_quantity_unit_code,
                "delivery_start": default_delivery_start,
                "delivery_end": default_delivery_end,
            }
        ]
    else:
        source_legs_payload = legs_payload
        if not source_legs_payload:
            source_legs_payload = [
                {
                    "leg_no": leg.leg_no,
                    "side": leg.side,
                    "commodity_class": leg.commodity_class,
                    "commodity": leg.commodity_code,
                    "volume": leg.quantity,
                }
                for leg in sorted(existing_legs, key=lambda leg: leg.leg_no)
            ]
        legs_to_sync = []
        for index, leg_payload in enumerate(source_legs_payload, start=1):
            leg_no_raw = leg_payload.get("leg_no", index)
            try:
                leg_no = int(leg_no_raw)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Each leg must provide a numeric leg_no",
                ) from None
            side = normalize_trade_side(leg_payload.get("side"))
            commodity_class, commodity_code = require_active_commodity(
                db,
                leg_payload.get("commodity_class", default_commodity_class),
                leg_payload.get("commodity", default_commodity_code),
            )
            location_code = require_active_location(
                db,
                leg_payload.get("location_code", default_location_code),
            )
            quantity_unit_code = require_active_unit(
                db,
                leg_payload.get("quantity_unit_code", default_quantity_unit_code),
            )
            delivery_start = parse_optional_date(
                leg_payload.get("delivery_start", default_delivery_start),
                field_name=f"Leg {leg_no} delivery_start",
            )
            delivery_end = parse_optional_date(
                leg_payload.get("delivery_end", default_delivery_end),
                field_name=f"Leg {leg_no} delivery_end",
            )
            validate_date_range(
                delivery_start,
                delivery_end,
                start_field=f"leg {leg_no} delivery_start",
                end_field=f"leg {leg_no} delivery_end",
            )
            legs_to_sync.append(
                {
                    "leg_no": leg_no,
                    "side": side,
                    "commodity_class": commodity_class,
                    "commodity_code": commodity_code,
                    "location_code": location_code,
                    "quantity": leg_payload.get("volume", default_volume),
                    "quantity_unit_code": quantity_unit_code,
                    "delivery_start": delivery_start,
                    "delivery_end": delivery_end,
                }
            )

    for leg_data in legs_to_sync:
        leg_no = leg_data["leg_no"]
        touched_leg_numbers.add(leg_no)
        existing_leg = existing_by_leg_no.get(leg_no)
        if existing_leg is None:
            db.add(
                TradeLeg(
                    trade_leg_id=str(uuid.uuid4()),
                    trade_id=trade_id,
                    leg_no=leg_no,
                    side=leg_data["side"],
                    commodity_class=leg_data["commodity_class"],
                    commodity_code=leg_data["commodity_code"],
                    location_code=leg_data["location_code"],
                    quantity=leg_data["quantity"],
                    quantity_unit_code=leg_data["quantity_unit_code"],
                    delivery_start=leg_data["delivery_start"],
                    delivery_end=leg_data["delivery_end"],
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            )
            continue

        existing_leg.side = leg_data["side"]
        existing_leg.commodity_class = leg_data["commodity_class"]
        existing_leg.commodity_code = leg_data["commodity_code"]
        existing_leg.location_code = leg_data["location_code"]
        existing_leg.quantity = leg_data["quantity"]
        existing_leg.quantity_unit_code = leg_data["quantity_unit_code"]
        existing_leg.delivery_start = leg_data["delivery_start"]
        existing_leg.delivery_end = leg_data["delivery_end"]
        existing_leg.updated_at = timestamp

    for existing_leg in existing_legs:
        if existing_leg.leg_no not in touched_leg_numbers:
            db.delete(existing_leg)


def sync_primary_price_term(
    db: Session,
    trade_id: str,
    pricing_type: str,
    fixed_price: object | None,
    price_index_code: str | None,
    currency_code: str | None,
    price_unit_code: str | None,
    timestamp: datetime,
) -> None:
    term = db.execute(
        select(TradePriceTerm).where(
            TradePriceTerm.trade_id == trade_id,
            TradePriceTerm.term_no == 1,
        )
    ).scalars().first()

    if term is None:
        term = TradePriceTerm(
            trade_price_term_id=str(uuid.uuid4()),
            trade_id=trade_id,
            term_no=1,
            pricing_type=pricing_type,
            fixed_price=fixed_price,
            price_index_code=price_index_code,
            currency_code=currency_code,
            price_unit_code=price_unit_code,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(term)
        return

    term.pricing_type = pricing_type
    term.fixed_price = fixed_price
    term.price_index_code = price_index_code
    term.currency_code = currency_code
    term.price_unit_code = price_unit_code
    term.updated_at = timestamp


@router.post("", response_model=EventOut, status_code=201)
def append_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)) -> EventOut:
    correlation_id = getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")
    recorded_at = datetime.now(timezone.utc)

    e = Event(
        event_id=str(uuid.uuid4()),
        aggregate_type=payload.aggregate_type,
        aggregate_id=payload.aggregate_id,
        event_type=payload.event_type,
        occurred_at=payload.occurred_at,
        recorded_at=recorded_at,
        actor_id=getattr(request.state, "actor_id", None) or payload.actor_id,
        correlation_id=correlation_id,
        causation_id=payload.causation_id,
        schema_version=payload.schema_version,
        payload=payload.payload,
    )
    try:
        db.add(e)
        db.flush()

        if e.aggregate_type == "trade" and e.event_type in {"TradeCreated", "TradeAmended", "TradeCancelled"}:
            payload_data = e.payload or {}
            existing = db.execute(
                select(Trade).where(Trade.trade_id == e.aggregate_id)
            ).scalars().first()
            before = trade_snapshot(db, existing)

            if e.event_type == "TradeCreated" and existing is not None:
                raise HTTPException(status_code=409, detail="Trade already exists")
            if e.event_type in {"TradeAmended", "TradeCancelled"} and existing is None:
                raise HTTPException(status_code=404, detail="Trade not found")

            if e.event_type == "TradeCreated":
                instrument_type = normalize_instrument_type(payload_data.get("instrument_type"))
                trade_nature_value = payload_data.get("trade_nature")
                if instrument_type == TradeInstrumentType.OPTION.value and trade_nature_value in {None, ""}:
                    trade_nature_value = TradeNature.FINANCIAL.value
                trade_nature = normalize_trade_nature(trade_nature_value)
                workflow_defaults = default_trade_workflow_statuses(trade_nature)
                trade_structure = normalize_trade_structure(payload_data.get("trade_structure"))
                trade_side, legs_payload = validate_trade_structure_payload(
                    trade_structure,
                    payload_data.get("trade_side"),
                    payload_data.get("legs"),
                )
                book = require_active_book(db, payload_data.get("book"))
                commodity_class, commodity = require_active_commodity(
                    db,
                    payload_data.get("commodity_class"),
                    payload_data.get("commodity"),
                )
                price = normalize_optional_number(
                    payload_data.get("price"),
                    field_name="Price Differential",
                )
                volume = normalize_optional_number(payload_data.get("volume"), field_name="Volume")
                external_trade_id = normalize_optional_text(payload_data.get("external_trade_id"))
                source_system = (
                    normalize_optional_text(payload_data.get("source_system"), uppercase=True)
                    or DEFAULT_SOURCE_SYSTEM
                )
                execution_timestamp = parse_execution_timestamp(payload_data.get("execution_timestamp"))
                trade_date = parse_optional_date(
                    payload_data.get("trade_date"),
                    field_name="trade_date",
                )
                if trade_date is None:
                    trade_date = (execution_timestamp or e.occurred_at).date()
                effective_start_date = parse_optional_date(
                    payload_data.get("effective_start_date"),
                    field_name="effective_start_date",
                )
                effective_end_date = parse_optional_date(
                    payload_data.get("effective_end_date"),
                    field_name="effective_end_date",
                )
                quality_spec = normalize_optional_text(payload_data.get("quality_spec"))
                unit_of_measure = require_active_unit(db, payload_data.get("unit_of_measure"))
                trade_currency_code = require_active_currency(
                    db,
                    payload_data.get("trade_currency_code"),
                )
                location_code = require_active_location(db, payload_data.get("location_code"))
                delivery_start = parse_optional_date(
                    payload_data.get("delivery_start"),
                    field_name="delivery_start",
                )
                delivery_end = parse_optional_date(
                    payload_data.get("delivery_end"),
                    field_name="delivery_end",
                )
                price_unit_code = require_active_unit(db, payload_data.get("price_unit_code"))
                counterparty = require_active_counterparty(db, payload_data.get("counterparty"))
                portfolio = require_active_portfolio(
                    db,
                    payload_data.get("portfolio"),
                    book_code=book,
                )
                pricing_status = normalize_trade_header_status(
                    payload_data.get("pricing_status"),
                    default="PENDING",
                    field_name="Pricing status",
                    valid_values={pricing_status.value for pricing_status in PricingStatus},
                )
                confirmation_status = normalize_trade_header_status(
                    payload_data.get("confirmation_status"),
                    default=workflow_defaults["confirmation_status"],
                    field_name="Confirmation status",
                    valid_values={confirmation_status.value for confirmation_status in ConfirmationStatus},
                )
                nomination_status = normalize_trade_header_status(
                    payload_data.get("nomination_status"),
                    default=workflow_defaults["nomination_status"],
                    field_name="Nomination status",
                    valid_values={nomination_status.value for nomination_status in NominationStatus},
                )
                allocation_status = normalize_trade_header_status(
                    payload_data.get("allocation_status"),
                    default=workflow_defaults["allocation_status"],
                    field_name="Allocation status",
                    valid_values={allocation_status.value for allocation_status in AllocationStatus},
                )
                settlement_status = normalize_trade_header_status(
                    payload_data.get("settlement_status"),
                    default="PENDING",
                    field_name="Settlement status",
                    valid_values={settlement_status.value for settlement_status in SettlementStatus},
                )
                invoice_status = normalize_trade_header_status(
                    payload_data.get("invoice_status"),
                    default=workflow_defaults["invoice_status"],
                    field_name="Invoice status",
                    valid_values={invoice_status.value for invoice_status in InvoiceStatus},
                )
                payment_status = normalize_trade_header_status(
                    payload_data.get("payment_status"),
                    default=workflow_defaults["payment_status"],
                    field_name="Payment status",
                    valid_values={payment_status.value for payment_status in PaymentStatus},
                )
                trader_user = normalize_optional_text(payload_data.get("trader_user"))
                pricing_type, price_index_code = require_active_price_index(
                    db,
                    payload_data.get("pricing_type"),
                    payload_data.get("price_index_code"),
                )
                option_type, option_style, option_strike_price, option_expiration_date = (
                    validate_option_fields(
                        instrument_type=instrument_type,
                        trade_nature=trade_nature,
                        trade_structure=trade_structure,
                        pricing_type=pricing_type,
                        option_type=payload_data.get("option_type"),
                        option_style=payload_data.get("option_style"),
                        option_strike_price=payload_data.get("option_strike_price"),
                        option_expiration_date=payload_data.get("option_expiration_date"),
                    )
                )
                validate_date_range(
                    effective_start_date,
                    effective_end_date,
                    start_field="effective_start_date",
                    end_field="effective_end_date",
                )
                validate_date_range(
                    delivery_start,
                    delivery_end,
                    start_field="delivery_start",
                    end_field="delivery_end",
                )
                validate_trade_measurements(
                    trade_structure=trade_structure,
                    pricing_type=pricing_type,
                    price=price,
                    volume=volume,
                )
                counterparty_credit_policy = evaluate_counterparty_credit_policy(
                    db,
                    trade_input=CounterpartyCreditTradeInput(
                        trade_id=e.aggregate_id,
                        counterparty_code=counterparty,
                        trade_currency_code=trade_currency_code,
                        price=price,
                        volume=volume,
                    ),
                )
                if (
                    counterparty_credit_policy is not None
                    and counterparty_credit_policy["limit_breached"]
                    and counterparty_credit_policy["breach_action"] == "BLOCK"
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"{_format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                            "Booking stays blocked until credit raises the limit or changes the breach action."
                        ),
                    )

                existing = Trade(
                    trade_id=e.aggregate_id,
                    external_trade_id=external_trade_id,
                    source_system=source_system,
                    created_at=recorded_at,
                    updated_at=recorded_at,
                    execution_timestamp=execution_timestamp,
                    trade_date=trade_date,
                    effective_start_date=effective_start_date,
                    effective_end_date=effective_end_date,
                    quality_spec=quality_spec,
                    unit_of_measure=unit_of_measure,
                    trade_currency_code=trade_currency_code,
                    location_code=location_code,
                    delivery_start=delivery_start,
                    delivery_end=delivery_end,
                    price_unit_code=price_unit_code,
                    instrument_type=instrument_type,
                    option_type=option_type,
                    option_style=option_style,
                    option_strike_price=option_strike_price,
                    option_expiration_date=option_expiration_date,
                    trade_nature=trade_nature,
                    trade_structure=trade_structure,
                    trade_side=trade_side,
                    book=book,
                    portfolio=portfolio,
                    counterparty=counterparty,
                    commodity_class=commodity_class,
                    commodity=commodity,
                    pricing_type=pricing_type,
                    pricing_status=pricing_status,
                    confirmation_status=confirmation_status,
                    nomination_status=nomination_status,
                    allocation_status=allocation_status,
                    price_index_code=price_index_code,
                    price=price,
                    volume=volume,
                    invoice_status=invoice_status,
                    payment_status=payment_status,
                    settlement_status=settlement_status,
                    trader_user=trader_user,
                    status="ACTIVE",
                    last_event_id=e.event_id,
                )
                db.add(existing)
                sync_primary_price_term(
                    db,
                    e.aggregate_id,
                    pricing_type,
                    price,
                    price_index_code,
                    trade_currency_code,
                    price_unit_code,
                    recorded_at,
                )
                sync_trade_legs(
                    db,
                    e.aggregate_id,
                    trade_structure,
                    trade_side,
                    commodity_class,
                    commodity,
                    volume,
                    location_code,
                    unit_of_measure,
                    delivery_start,
                    delivery_end,
                    legs_payload,
                    recorded_at,
                )
                workflow_actor_id = e.actor_id or "system.event"
                synchronize_trade_workflow_items(
                    db,
                    existing,
                    actor_id=workflow_actor_id,
                    now=recorded_at,
                )
                _sync_credit_approval_workflow_item(
                    db,
                    trade=existing,
                    actor_id=workflow_actor_id,
                    now=recorded_at,
                    policy_result=counterparty_credit_policy,
                )

            elif e.event_type == "TradeAmended" and existing is not None:
                existing.updated_at = recorded_at
                reject_invoice_projection_override(db, trade_id=existing.trade_id, payload_data=payload_data)
                credit_hold_state = get_trade_credit_hold_state(db, trade_id=existing.trade_id)
                blocked_fields = (
                    _requested_credit_hold_blocked_fields(existing, payload_data)
                    if credit_hold_state.hold_active
                    else []
                )
                if blocked_fields:
                    field_summary = ", ".join(blocked_fields)
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=format_trade_credit_hold_message(
                            existing.trade_id,
                            credit_hold_state,
                            blocked_action=(
                                f"Changing {field_summary} lifecycle status is blocked until credit approves "
                                "the trade or the trade is amended back within limit."
                            ),
                        ),
                    )

                legs_payload: list[dict[str, object]] | None = None
                should_sync_legs = False
                if "instrument_type" in payload_data and payload_data["instrument_type"] is not None:
                    existing.instrument_type = normalize_instrument_type(payload_data["instrument_type"])
                if "trade_nature" in payload_data and payload_data["trade_nature"] is not None:
                    existing.trade_nature = normalize_trade_nature(payload_data["trade_nature"])
                if "trade_structure" in payload_data and payload_data["trade_structure"] is not None:
                    existing.trade_structure = normalize_trade_structure(payload_data["trade_structure"])
                if (
                    "trade_structure" in payload_data
                    or "trade_side" in payload_data
                    or "legs" in payload_data
                ):
                    trade_side_value = (
                        payload_data.get("trade_side")
                        if "trade_side" in payload_data
                        else (
                            existing.trade_side
                            if existing.trade_structure == TradeStructure.SINGLE.value
                            else None
                        )
                    )
                    normalized_trade_side, legs_payload = validate_trade_structure_payload(
                        existing.trade_structure,
                        trade_side_value,
                        payload_data.get("legs"),
                    )
                    existing.trade_side = normalized_trade_side
                    should_sync_legs = True
                if "book" in payload_data and payload_data["book"] is not None:
                    existing.book = require_active_book(db, payload_data["book"])
                if "external_trade_id" in payload_data:
                    existing.external_trade_id = normalize_optional_text(payload_data.get("external_trade_id"))
                if "source_system" in payload_data:
                    existing.source_system = normalize_optional_text(
                        payload_data.get("source_system"),
                        uppercase=True,
                    )
                if "execution_timestamp" in payload_data:
                    existing.execution_timestamp = parse_execution_timestamp(
                        payload_data.get("execution_timestamp")
                    )
                if "trade_date" in payload_data:
                    existing.trade_date = parse_optional_date(
                        payload_data.get("trade_date"),
                        field_name="trade_date",
                    )
                if "effective_start_date" in payload_data:
                    existing.effective_start_date = parse_optional_date(
                        payload_data.get("effective_start_date"),
                        field_name="effective_start_date",
                    )
                if "effective_end_date" in payload_data:
                    existing.effective_end_date = parse_optional_date(
                        payload_data.get("effective_end_date"),
                        field_name="effective_end_date",
                    )
                if "quality_spec" in payload_data:
                    existing.quality_spec = normalize_optional_text(payload_data.get("quality_spec"))
                if "unit_of_measure" in payload_data:
                    existing.unit_of_measure = require_active_unit(db, payload_data.get("unit_of_measure"))
                    should_sync_legs = True
                if "trade_currency_code" in payload_data:
                    existing.trade_currency_code = require_active_currency(
                        db,
                        payload_data.get("trade_currency_code"),
                    )
                if "location_code" in payload_data:
                    existing.location_code = require_active_location(
                        db,
                        payload_data.get("location_code"),
                    )
                    should_sync_legs = True
                if "delivery_start" in payload_data:
                    existing.delivery_start = parse_optional_date(
                        payload_data.get("delivery_start"),
                        field_name="delivery_start",
                    )
                    should_sync_legs = True
                if "delivery_end" in payload_data:
                    existing.delivery_end = parse_optional_date(
                        payload_data.get("delivery_end"),
                        field_name="delivery_end",
                    )
                    should_sync_legs = True
                if "price_unit_code" in payload_data:
                    existing.price_unit_code = require_active_unit(
                        db,
                        payload_data.get("price_unit_code"),
                    )
                if (
                    "commodity" in payload_data and payload_data["commodity"] is not None
                ) or (
                    "commodity_class" in payload_data and payload_data["commodity_class"] is not None
                ):
                    commodity_class, commodity = require_active_commodity(
                        db,
                        payload_data.get("commodity_class", existing.commodity_class),
                        payload_data.get("commodity", existing.commodity),
                    )
                    existing.commodity_class = commodity_class
                    existing.commodity = commodity
                    if existing.trade_structure == TradeStructure.SINGLE.value or legs_payload is not None:
                        should_sync_legs = True
                if (
                    "pricing_type" in payload_data and payload_data["pricing_type"] is not None
                ) or (
                    "price_index_code" in payload_data
                ):
                    pricing_type, price_index_code = require_active_price_index(
                        db,
                        payload_data.get("pricing_type", existing.pricing_type),
                        payload_data.get("price_index_code", existing.price_index_code),
                    )
                    existing.pricing_type = pricing_type
                    existing.price_index_code = price_index_code
                if "price" in payload_data:
                    existing.price = normalize_optional_number(
                        payload_data.get("price"),
                        field_name="Price Differential",
                    )
                if "volume" in payload_data:
                    existing.volume = normalize_optional_number(
                        payload_data.get("volume"),
                        field_name="Volume",
                    )
                    if existing.trade_structure == TradeStructure.SINGLE.value:
                        should_sync_legs = True
                if "counterparty" in payload_data:
                    existing.counterparty = require_active_counterparty(
                        db,
                        payload_data.get("counterparty"),
                    )
                else:
                    existing.counterparty = require_active_counterparty(
                        db,
                        existing.counterparty,
                    )
                if "portfolio" in payload_data or "book" in payload_data:
                    existing.portfolio = require_active_portfolio(
                        db,
                        payload_data.get("portfolio", existing.portfolio),
                        book_code=existing.book,
                    )
                if "pricing_status" in payload_data:
                    existing.pricing_status = normalize_trade_header_status(
                        payload_data.get("pricing_status"),
                        default=existing.pricing_status,
                        field_name="Pricing status",
                        valid_values={pricing_status.value for pricing_status in PricingStatus},
                    )
                if "confirmation_status" in payload_data:
                    existing.confirmation_status = normalize_trade_header_status(
                        payload_data.get("confirmation_status"),
                        default=existing.confirmation_status,
                        field_name="Confirmation status",
                        valid_values={confirmation_status.value for confirmation_status in ConfirmationStatus},
                    )
                if "nomination_status" in payload_data:
                    existing.nomination_status = normalize_trade_header_status(
                        payload_data.get("nomination_status"),
                        default=existing.nomination_status,
                        field_name="Nomination status",
                        valid_values={nomination_status.value for nomination_status in NominationStatus},
                    )
                if "allocation_status" in payload_data:
                    existing.allocation_status = normalize_trade_header_status(
                        payload_data.get("allocation_status"),
                        default=existing.allocation_status,
                        field_name="Allocation status",
                        valid_values={allocation_status.value for allocation_status in AllocationStatus},
                    )
                if "invoice_status" in payload_data:
                    existing.invoice_status = normalize_trade_header_status(
                        payload_data.get("invoice_status"),
                        default=existing.invoice_status,
                        field_name="Invoice status",
                        valid_values={invoice_status.value for invoice_status in InvoiceStatus},
                    )
                if "payment_status" in payload_data:
                    existing.payment_status = normalize_trade_header_status(
                        payload_data.get("payment_status"),
                        default=existing.payment_status,
                        field_name="Payment status",
                        valid_values={payment_status.value for payment_status in PaymentStatus},
                    )
                if "settlement_status" in payload_data:
                    existing.settlement_status = normalize_trade_header_status(
                        payload_data.get("settlement_status"),
                        default=existing.settlement_status,
                        field_name="Settlement status",
                        valid_values={settlement_status.value for settlement_status in SettlementStatus},
                    )
                if "trader_user" in payload_data:
                    existing.trader_user = normalize_optional_text(payload_data.get("trader_user"))
                if "status" in payload_data and payload_data["status"] is not None:
                    existing.status = payload_data["status"]

                option_type_value = existing.option_type
                if "option_type" in payload_data:
                    option_type_value = payload_data.get("option_type")
                option_style_value = existing.option_style
                if "option_style" in payload_data:
                    option_style_value = payload_data.get("option_style")
                option_strike_price_value = existing.option_strike_price
                if "option_strike_price" in payload_data:
                    option_strike_price_value = payload_data.get("option_strike_price")
                option_expiration_date_value = existing.option_expiration_date
                if "option_expiration_date" in payload_data:
                    option_expiration_date_value = payload_data.get("option_expiration_date")
                if (
                    "instrument_type" in payload_data
                    and existing.instrument_type != TradeInstrumentType.OPTION.value
                ):
                    option_type_value = payload_data.get("option_type")
                    option_style_value = payload_data.get("option_style")
                    option_strike_price_value = payload_data.get("option_strike_price")
                    option_expiration_date_value = payload_data.get("option_expiration_date")

                validate_date_range(
                    existing.effective_start_date,
                    existing.effective_end_date,
                    start_field="effective_start_date",
                    end_field="effective_end_date",
                )
                validate_date_range(
                    existing.delivery_start,
                    existing.delivery_end,
                    start_field="delivery_start",
                    end_field="delivery_end",
                )
                validate_trade_measurements(
                    trade_structure=existing.trade_structure,
                    pricing_type=existing.pricing_type,
                    price=existing.price,
                    volume=existing.volume,
                )
                (
                    existing.option_type,
                    existing.option_style,
                    existing.option_strike_price,
                    existing.option_expiration_date,
                ) = validate_option_fields(
                    instrument_type=existing.instrument_type,
                    trade_nature=existing.trade_nature,
                    trade_structure=existing.trade_structure,
                    pricing_type=existing.pricing_type,
                    option_type=option_type_value,
                    option_style=option_style_value,
                    option_strike_price=option_strike_price_value,
                    option_expiration_date=option_expiration_date_value,
                )
                counterparty_credit_policy = evaluate_counterparty_credit_policy(
                    db,
                    trade_input=CounterpartyCreditTradeInput(
                        trade_id=existing.trade_id,
                        counterparty_code=existing.counterparty,
                        trade_currency_code=existing.trade_currency_code,
                        price=existing.price,
                        volume=existing.volume,
                        status=existing.status,
                    ),
                )
                if (
                    counterparty_credit_policy is not None
                    and counterparty_credit_policy["limit_breached"]
                    and counterparty_credit_policy["breach_action"] == "BLOCK"
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"{_format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                            "Amendment stays blocked until credit raises the limit or changes the breach action."
                        ),
                    )
                existing.last_event_id = e.event_id
                sync_primary_price_term(
                    db,
                    e.aggregate_id,
                    existing.pricing_type,
                    existing.price,
                    existing.price_index_code,
                    existing.trade_currency_code,
                    existing.price_unit_code,
                    recorded_at,
                )
                if should_sync_legs:
                    sync_trade_legs(
                        db,
                        e.aggregate_id,
                        existing.trade_structure,
                        existing.trade_side,
                        existing.commodity_class,
                        existing.commodity,
                        existing.volume,
                        existing.location_code,
                        existing.unit_of_measure,
                        existing.delivery_start,
                        existing.delivery_end,
                        legs_payload or [],
                        recorded_at,
                    )
                workflow_actor_id = e.actor_id or "system.event"
                synchronize_trade_workflow_items(
                    db,
                    existing,
                    actor_id=workflow_actor_id,
                    now=recorded_at,
                )
                _sync_credit_approval_workflow_item(
                    db,
                    trade=existing,
                    actor_id=workflow_actor_id,
                    now=recorded_at,
                    policy_result=counterparty_credit_policy,
                )

            elif e.event_type == "TradeCancelled" and existing is not None:
                existing.updated_at = recorded_at
                existing.status = "CANCELLED"
                existing.last_event_id = e.event_id

            after = trade_snapshot(db, existing)
            sync_positions_for_trade_change(db, before, after, recorded_at)
            sync_option_exposures_for_trade_change(db, before, after, recorded_at)

        db.commit()
        db.refresh(e)
    except Exception:
        db.rollback()
        raise

    return EventOut(
        event_id=e.event_id,
        aggregate_type=e.aggregate_type,
        aggregate_id=e.aggregate_id,
        event_type=e.event_type,
        occurred_at=e.occurred_at,
        recorded_at=e.recorded_at,
        actor_id=e.actor_id,
        correlation_id=e.correlation_id,
        causation_id=e.causation_id,
        schema_version=e.schema_version,
        payload=e.payload,
    )


@router.get("", response_model=List[EventOut])
def list_events(
    aggregate_type: Optional[str] = None,
    aggregate_id: Optional[str] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> List[EventOut]:
    stmt = select(Event).order_by(Event.recorded_at.desc()).limit(limit)

    if aggregate_type:
        stmt = stmt.where(Event.aggregate_type == aggregate_type)
    if aggregate_id:
        stmt = stmt.where(Event.aggregate_id == aggregate_id)

    rows = db.execute(stmt).scalars().all()
    return [
        EventOut(
            event_id=r.event_id,
            aggregate_type=r.aggregate_type,
            aggregate_id=r.aggregate_id,
            event_type=r.event_type,
            occurred_at=r.occurred_at,
            recorded_at=r.recorded_at,
            actor_id=r.actor_id,
            correlation_id=r.correlation_id,
            causation_id=r.causation_id,
            schema_version=r.schema_version,
            payload=r.payload,
        )
        for r in rows
    ]
