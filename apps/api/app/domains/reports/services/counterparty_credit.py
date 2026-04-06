from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
)
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.trade import Trade


@dataclass(frozen=True)
class CounterpartyCreditTradeInput:
    counterparty_code: str | None
    trade_currency_code: str | None
    price: object | None
    volume: object | None
    trade_id: str | None = None
    status: str = "ACTIVE"


def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _trade_exposure_amount(
    *,
    trade_currency_code: str | None,
    price: object | None,
    volume: object | None,
    required_currency_code: str | None,
) -> Decimal | None:
    if required_currency_code is None:
        return None
    if trade_currency_code != required_currency_code:
        return None

    price_decimal = _to_decimal(price)
    volume_decimal = _to_decimal(volume)
    if price_decimal is None or volume_decimal is None:
        return None
    return abs(price_decimal * volume_decimal)


def evaluate_counterparty_credit_policy(
    db: Session,
    *,
    trade_input: CounterpartyCreditTradeInput,
) -> dict[str, object] | None:
    counterparty_code = trade_input.counterparty_code
    if counterparty_code is None or str(trade_input.status or "ACTIVE").strip().upper() != "ACTIVE":
        return None

    profile = db.execute(
        select(ReferenceCounterpartyCreditProfile).where(
            ReferenceCounterpartyCreditProfile.counterparty_code == counterparty_code
        )
    ).scalars().first()
    if profile is None:
        return None

    limit_currency_code = profile.limit_currency_code
    limit_amount_decimal = _to_decimal(profile.limit_amount)
    if limit_currency_code is None or limit_amount_decimal is None or limit_amount_decimal <= Decimal("0"):
        return {
            "counterparty_code": counterparty_code,
            "breach_action": profile.breach_action,
            "limit_currency_code": limit_currency_code,
            "limit_amount": float(limit_amount_decimal) if limit_amount_decimal is not None else None,
            "current_exposure_amount": None,
            "projected_trade_exposure_amount": None,
            "projected_exposure_amount": None,
            "projected_utilization_percent": None,
            "limit_breached": False,
            "comparable": False,
            "comparison_reason": "missing_limit_configuration",
        }

    active_trade_stmt = select(Trade).where(
        Trade.status == "ACTIVE",
        Trade.counterparty == counterparty_code,
    )
    if trade_input.trade_id is not None:
        active_trade_stmt = active_trade_stmt.where(Trade.trade_id != trade_input.trade_id)

    active_trades = db.execute(active_trade_stmt).scalars().all()

    current_exposure_amount_decimal = Decimal("0")
    for trade in active_trades:
        trade_exposure_amount = _trade_exposure_amount(
            trade_currency_code=trade.trade_currency_code,
            price=trade.price,
            volume=trade.volume,
            required_currency_code=limit_currency_code,
        )
        if trade_exposure_amount is None:
            continue
        current_exposure_amount_decimal += trade_exposure_amount

    projected_trade_exposure_amount_decimal = _trade_exposure_amount(
        trade_currency_code=trade_input.trade_currency_code,
        price=trade_input.price,
        volume=trade_input.volume,
        required_currency_code=limit_currency_code,
    )
    projected_exposure_amount_decimal = current_exposure_amount_decimal
    comparable = projected_trade_exposure_amount_decimal is not None
    comparison_reason = "comparable"
    if projected_trade_exposure_amount_decimal is not None:
        projected_exposure_amount_decimal += projected_trade_exposure_amount_decimal
    elif trade_input.trade_currency_code != limit_currency_code:
        comparison_reason = "currency_mismatch"
    else:
        comparison_reason = "missing_trade_measurements"

    projected_utilization_percent = None
    limit_breached = False
    if comparable:
        projected_utilization_percent = float(
            (projected_exposure_amount_decimal / limit_amount_decimal) * Decimal("100")
        )
        limit_breached = projected_exposure_amount_decimal > limit_amount_decimal

    return {
        "counterparty_code": counterparty_code,
        "breach_action": profile.breach_action,
        "limit_currency_code": limit_currency_code,
        "limit_amount": float(limit_amount_decimal),
        "current_exposure_amount": float(current_exposure_amount_decimal),
        "projected_trade_exposure_amount": float(projected_trade_exposure_amount_decimal)
        if projected_trade_exposure_amount_decimal is not None
        else None,
        "projected_exposure_amount": float(projected_exposure_amount_decimal)
        if comparable
        else None,
        "projected_utilization_percent": projected_utilization_percent,
        "limit_breached": limit_breached,
        "comparable": comparable,
        "comparison_reason": comparison_reason,
    }


def build_counterparty_credit_report(
    db: Session,
    *,
    as_of: date | None = None,
) -> list[dict]:
    report_date = as_of or date.today()
    counterparties = db.execute(
        select(ReferenceCounterparty).order_by(ReferenceCounterparty.code.asc())
    ).scalars().all()
    profiles = {
        profile.counterparty_code: profile
        for profile in db.execute(
            select(ReferenceCounterpartyCreditProfile)
        ).scalars().all()
    }
    active_trades = db.execute(
        select(Trade).where(
            Trade.status == "ACTIVE",
            Trade.counterparty.is_not(None),
        )
    ).scalars().all()

    trades_by_counterparty: dict[str, list[Trade]] = defaultdict(list)
    for trade in active_trades:
        if trade.counterparty is None:
            continue
        trades_by_counterparty[trade.counterparty].append(trade)

    rows: list[dict] = []
    for counterparty in counterparties:
        profile = profiles.get(counterparty.code)
        trades = trades_by_counterparty.get(counterparty.code, [])
        trade_currencies = {trade.trade_currency_code for trade in trades if trade.trade_currency_code}
        limit_currency_code = profile.limit_currency_code if profile is not None else None

        if limit_currency_code is not None:
            exposure_currency_code = limit_currency_code
        elif len(trade_currencies) == 1:
            exposure_currency_code = next(iter(trade_currencies))
        else:
            exposure_currency_code = None

        in_scope_trades = (
            [trade for trade in trades if trade.trade_currency_code == exposure_currency_code]
            if exposure_currency_code is not None
            else []
        )

        exposure_amount_decimal = Decimal("0")
        priced_trade_count = 0
        unpriced_trade_count = 0
        for trade in in_scope_trades:
            price = _to_decimal(trade.price)
            volume = _to_decimal(trade.volume)
            if price is None or volume is None:
                unpriced_trade_count += 1
                continue
            exposure_amount_decimal += abs(price * volume)
            priced_trade_count += 1

        if exposure_currency_code is None:
            exposure_amount = None
        else:
            exposure_amount = float(exposure_amount_decimal)

        limit_amount_decimal = _to_decimal(profile.limit_amount) if profile is not None else None
        limit_amount = float(limit_amount_decimal) if limit_amount_decimal is not None else None
        limit_utilization_percent = None
        limit_breached = False
        if limit_amount_decimal is not None:
            limit_utilization_percent = float((exposure_amount_decimal / limit_amount_decimal) * Decimal("100"))
            limit_breached = exposure_amount_decimal > limit_amount_decimal

        review_due_at = profile.review_due_at if profile is not None else None

        rows.append(
            {
                "counterparty_code": counterparty.code,
                "counterparty_name": counterparty.name,
                "counterparty_type": counterparty.counterparty_type,
                "credit_status": counterparty.credit_status,
                "active_trade_count": len(trades),
                "exposure_currency_code": exposure_currency_code,
                "exposure_amount": exposure_amount,
                "in_exposure_currency_trade_count": len(in_scope_trades),
                "priced_trade_count": priced_trade_count,
                "unpriced_trade_count": unpriced_trade_count,
                "out_of_scope_trade_count": len(trades) - len(in_scope_trades),
                "limit_currency_code": limit_currency_code,
                "limit_amount": limit_amount,
                "limit_utilization_percent": limit_utilization_percent,
                "limit_breached": limit_breached,
                "credit_rating": profile.credit_rating if profile is not None else None,
                "review_due_at": review_due_at,
                "review_is_due": review_due_at is not None and review_due_at <= report_date,
                "breach_action": profile.breach_action if profile is not None else DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
                "latest_trade_updated_at": max((trade.updated_at for trade in trades), default=None),
            }
        )

    return rows
