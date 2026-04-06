from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
)
from apps.api.app.domains.reports.services.counterparty_credit import (
    evaluate_counterparty_credit_policy,
)
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_credit_exception import TradeCreditException
from apps.api.app.schemas.operations import TradeCreditExceptionOut

ACTIVE_TRADE_CREDIT_EXCEPTION_STATUS = "ACTIVE"
DEFAULT_TRADE_CREDIT_EXCEPTION_TTL_DAYS = 7


@dataclass(frozen=True)
class TradeCreditExceptionAssessment:
    exception: TradeCreditException
    current_projected_exposure_amount: float | None
    remaining_headroom_amount: float | None
    revalidation_required: bool
    revalidation_reason: str | None


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _trade_credit_policy(trade: Trade, db: Session) -> dict[str, object] | None:
    return evaluate_counterparty_credit_policy(
        db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade.trade_id,
            counterparty_code=trade.counterparty,
            trade_currency_code=trade.trade_currency_code,
            price=trade.price,
            volume=trade.volume,
            status=trade.status,
        ),
    )


def get_active_trade_credit_exception(db: Session, *, trade_id: str) -> TradeCreditException | None:
    return (
        db.execute(
            select(TradeCreditException)
            .where(
                TradeCreditException.trade_id == trade_id,
                TradeCreditException.released_at.is_(None),
            )
            .order_by(TradeCreditException.approved_at.desc(), TradeCreditException.id.desc())
        )
        .scalars()
        .first()
    )


def invalidate_active_trade_credit_exceptions(
    db: Session,
    *,
    trade_id: str,
    released_at: datetime,
    released_by: str,
    released_reason: str,
    status: str,
) -> int:
    active_exceptions = db.execute(
        select(TradeCreditException).where(
            TradeCreditException.trade_id == trade_id,
            TradeCreditException.released_at.is_(None),
        )
    ).scalars().all()

    for record in active_exceptions:
        record.status = status
        record.released_at = released_at
        record.released_by = released_by
        record.released_reason = released_reason

    if active_exceptions:
        db.flush()
    return len(active_exceptions)


def create_trade_credit_exception(
    db: Session,
    *,
    trade_id: str,
    workflow_item_id: int,
    approval_decision_id: int | None,
    approval_snapshot: dict[str, object],
    approved_at: datetime,
    approved_by: str,
    approval_comment: str,
    expires_at: datetime | None = None,
) -> TradeCreditException:
    limit_currency_code = str(approval_snapshot.get("limit_currency_code") or "").strip().upper()
    approved_projected_exposure_amount = _to_decimal(approval_snapshot.get("projected_exposure_amount"))
    approved_limit_amount = _to_decimal(approval_snapshot.get("limit_amount"))

    if not limit_currency_code or approved_projected_exposure_amount is None:
        raise ValueError(
            "Approving a credit exception requires a comparable projected exposure and limit currency."
        )

    invalidate_active_trade_credit_exceptions(
        db,
        trade_id=trade_id,
        released_at=approved_at,
        released_by=approved_by,
        released_reason="Superseded by a newer credit approval exception.",
        status="SUPERSEDED",
    )

    approved_excess_amount = None
    if approved_limit_amount is not None:
        approved_excess_amount = max(
            approved_projected_exposure_amount - approved_limit_amount,
            Decimal("0"),
        )

    exception = TradeCreditException(
        trade_id=trade_id,
        workflow_item_id=workflow_item_id,
        approval_decision_id=approval_decision_id,
        status=ACTIVE_TRADE_CREDIT_EXCEPTION_STATUS,
        limit_currency_code=limit_currency_code,
        approved_limit_amount=approved_limit_amount,
        approved_projected_exposure_amount=approved_projected_exposure_amount,
        approved_excess_amount=approved_excess_amount,
        approval_comment=approval_comment,
        approved_at=approved_at,
        approved_by=approved_by,
        expires_at=_coerce_utc(expires_at)
        or (approved_at + timedelta(days=DEFAULT_TRADE_CREDIT_EXCEPTION_TTL_DAYS)),
        released_at=None,
        released_by=None,
        released_reason=None,
    )
    db.add(exception)
    db.flush()
    return exception


def assess_trade_credit_exception(
    *,
    exception: TradeCreditException,
    trade: Trade,
    db: Session,
    now: datetime,
    policy_result: dict[str, object] | None = None,
) -> TradeCreditExceptionAssessment:
    normalized_now = _coerce_utc(now) or datetime.now(timezone.utc)
    effective_policy_result = policy_result if policy_result is not None else _trade_credit_policy(trade, db)

    current_projected_exposure_amount = None
    remaining_headroom_amount = None
    revalidation_required = False
    revalidation_reason = None

    approved_projected_exposure_amount = _to_decimal(exception.approved_projected_exposure_amount)
    expires_at = _coerce_utc(exception.expires_at) or normalized_now

    if expires_at <= normalized_now:
        revalidation_required = True
        revalidation_reason = "EXCEPTION_EXPIRED"

    if effective_policy_result is None:
        if revalidation_reason is None:
            revalidation_required = True
            revalidation_reason = "NO_POLICY_CONTEXT"
    else:
        projected_exposure_amount = _to_decimal(effective_policy_result.get("projected_exposure_amount"))
        if projected_exposure_amount is not None:
            current_projected_exposure_amount = float(projected_exposure_amount)
        if projected_exposure_amount is not None and approved_projected_exposure_amount is not None:
            remaining_headroom_amount = float(approved_projected_exposure_amount - projected_exposure_amount)

        if not effective_policy_result.get("comparable"):
            if revalidation_reason is None:
                revalidation_required = True
                comparison_reason = str(effective_policy_result.get("comparison_reason") or "").strip().upper()
                revalidation_reason = comparison_reason or "NOT_COMPARABLE"
        elif (
            str(effective_policy_result.get("limit_currency_code") or "").strip().upper()
            != str(exception.limit_currency_code or "").strip().upper()
        ):
            if revalidation_reason is None:
                revalidation_required = True
                revalidation_reason = "LIMIT_CURRENCY_CHANGED"
        elif (
            projected_exposure_amount is not None
            and approved_projected_exposure_amount is not None
            and projected_exposure_amount > approved_projected_exposure_amount
        ):
            if revalidation_reason is None:
                revalidation_required = True
                revalidation_reason = "EXCEEDS_APPROVED_EXCEPTION"

    return TradeCreditExceptionAssessment(
        exception=exception,
        current_projected_exposure_amount=current_projected_exposure_amount,
        remaining_headroom_amount=remaining_headroom_amount,
        revalidation_required=revalidation_required,
        revalidation_reason=revalidation_reason,
    )


def build_active_trade_credit_exception_lookup(
    db: Session,
    *,
    trades: Iterable[Trade],
    now: datetime | None = None,
) -> dict[str, TradeCreditExceptionOut]:
    trade_records = [trade for trade in trades if trade.trade_id]
    if not trade_records:
        return {}

    normalized_now = _coerce_utc(now) or datetime.now(timezone.utc)
    trade_ids = tuple(dict.fromkeys(trade.trade_id for trade in trade_records))
    active_exceptions = db.execute(
        select(TradeCreditException)
        .where(
            TradeCreditException.trade_id.in_(trade_ids),
            TradeCreditException.released_at.is_(None),
        )
        .order_by(TradeCreditException.approved_at.desc(), TradeCreditException.id.desc())
    ).scalars().all()

    latest_exception_by_trade_id: dict[str, TradeCreditException] = {}
    for record in active_exceptions:
        latest_exception_by_trade_id.setdefault(record.trade_id, record)

    out: dict[str, TradeCreditExceptionOut] = {}
    for trade in trade_records:
        record = latest_exception_by_trade_id.get(trade.trade_id)
        if record is None:
            continue
        assessment = assess_trade_credit_exception(
            exception=record,
            trade=trade,
            db=db,
            now=normalized_now,
        )
        out[trade.trade_id] = TradeCreditExceptionOut(
            exception_id=record.id,
            trade_id=record.trade_id,
            workflow_item_id=record.workflow_item_id,
            approval_decision_id=record.approval_decision_id,
            status=record.status,
            limit_currency_code=record.limit_currency_code,
            approved_limit_amount=float(record.approved_limit_amount) if record.approved_limit_amount is not None else None,
            approved_projected_exposure_amount=float(record.approved_projected_exposure_amount),
            approved_excess_amount=float(record.approved_excess_amount) if record.approved_excess_amount is not None else None,
            approval_comment=record.approval_comment,
            approved_at=record.approved_at,
            approved_by=record.approved_by,
            expires_at=record.expires_at,
            released_at=record.released_at,
            released_by=record.released_by,
            released_reason=record.released_reason,
            current_projected_exposure_amount=assessment.current_projected_exposure_amount,
            remaining_headroom_amount=assessment.remaining_headroom_amount,
            revalidation_required=assessment.revalidation_required,
            revalidation_reason=assessment.revalidation_reason,
        )
    return out
