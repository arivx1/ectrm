from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_credit_policy import (
    ensure_counterparty_credit_allowed,
    evaluate_trade_counterparty_credit_policy,
)


def validate_book_trade_counterparty_credit(
    db: Session,
    *,
    trade_id: str,
    counterparty_code: str | None,
    trade_currency_code: str | None,
    price: object | None,
    volume: object | None,
) -> dict[str, object] | None:
    policy_result = evaluate_trade_counterparty_credit_policy(
        db,
        trade_id=trade_id,
        counterparty_code=counterparty_code,
        trade_currency_code=trade_currency_code,
        price=price,
        volume=volume,
    )
    ensure_counterparty_credit_allowed(
        policy_result,
        blocked_action=(
            "Booking stays blocked until credit raises the limit or changes the breach action."
        ),
    )
    return policy_result


def validate_amend_trade_counterparty_credit(
    db: Session,
    *,
    trade_id: str,
    counterparty_code: str | None,
    trade_currency_code: str | None,
    price: object | None,
    volume: object | None,
    status: str | None,
) -> dict[str, object] | None:
    policy_result = evaluate_trade_counterparty_credit_policy(
        db,
        trade_id=trade_id,
        counterparty_code=counterparty_code,
        trade_currency_code=trade_currency_code,
        price=price,
        volume=volume,
        status=status,
    )
    ensure_counterparty_credit_allowed(
        policy_result,
        blocked_action=(
            "Amendment stays blocked until credit raises the limit or changes the breach action."
        ),
    )
    return policy_result
