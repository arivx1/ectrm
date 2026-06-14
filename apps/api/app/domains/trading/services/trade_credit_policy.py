from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
    evaluate_counterparty_credit_policy,
)


def format_counterparty_credit_limit_message(policy_result: dict[str, object]) -> str:
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


def ensure_counterparty_credit_allowed(
    counterparty_credit_policy: dict[str, Any] | None,
    *,
    blocked_action: str,
) -> None:
    if (
        counterparty_credit_policy is not None
        and counterparty_credit_policy["limit_breached"]
        and counterparty_credit_policy["breach_action"] == "BLOCK"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{format_counterparty_credit_limit_message(counterparty_credit_policy)} "
                f"{blocked_action}"
            ),
        )


def evaluate_trade_counterparty_credit_policy(
    db: Session,
    *,
    trade_id: str | None,
    counterparty_code: str | None,
    trade_currency_code: str | None,
    price: object | None,
    volume: object | None,
    status: str | None = "ACTIVE",
) -> dict[str, object] | None:
    return evaluate_counterparty_credit_policy(
        db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade_id,
            counterparty_code=counterparty_code,
            trade_currency_code=trade_currency_code,
            price=price,
            volume=volume,
            status=status or "ACTIVE",
        ),
    )
