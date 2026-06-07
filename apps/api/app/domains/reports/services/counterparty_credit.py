from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
)
from apps.api.app.domains.risk.services.counterparty_credit_policy import (
    CounterpartyCreditTradeInput,
    build_counterparty_credit_exposure_snapshot,
    evaluate_counterparty_credit_limit_policy,
    serialize_counterparty_credit_policy_result,
)
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.trade import Trade


def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def evaluate_counterparty_credit_policy(
    db: Session,
    *,
    trade_input: CounterpartyCreditTradeInput,
) -> dict[str, object] | None:
    policy_result = evaluate_counterparty_credit_limit_policy(
        db,
        trade_input=trade_input,
    )
    if policy_result.policy_status in {"NO_COUNTERPARTY", "INACTIVE_TRADE"}:
        return None

    return serialize_counterparty_credit_policy_result(policy_result)


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

        exposure_snapshot = build_counterparty_credit_exposure_snapshot(
            db,
            counterparty_code=counterparty.code,
            exposure_currency_code=exposure_currency_code,
        )
        exposure_amount_decimal = exposure_snapshot.exposure_amount or Decimal("0")
        exposure_amount = (
            float(exposure_snapshot.exposure_amount)
            if exposure_snapshot.exposure_amount is not None
            else None
        )

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
                "in_exposure_currency_trade_count": exposure_snapshot.in_exposure_currency_trade_count,
                "priced_trade_count": exposure_snapshot.priced_trade_count,
                "unpriced_trade_count": exposure_snapshot.unpriced_trade_count,
                "out_of_scope_trade_count": exposure_snapshot.out_of_scope_trade_count,
                "limit_currency_code": limit_currency_code,
                "limit_amount": limit_amount,
                "limit_utilization_percent": limit_utilization_percent,
                "limit_breached": limit_breached,
                "credit_rating": profile.credit_rating if profile is not None else None,
                "review_due_at": review_due_at,
                "review_is_due": review_due_at is not None and review_due_at <= report_date,
                "breach_action": profile.breach_action if profile is not None else DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
                "latest_trade_updated_at": exposure_snapshot.latest_trade_updated_at,
            }
        )

    return rows
