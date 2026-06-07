from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
)
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.trade import Trade

COUNTERPARTY_CREDIT_POLICY_BASIS_V1 = "counterparty_credit_limit_policy_v1"
COUNTERPARTY_CREDIT_WATCH_UTILIZATION_PERCENT = Decimal("80")
COUNTERPARTY_CREDIT_EXTERNAL_SNAPSHOT_MAX_AGE_DAYS = 30
COUNTERPARTY_CREDIT_STATUS_CLEAR = "CLEAR"
COUNTERPARTY_CREDIT_STATUS_WATCH = "WATCH"
COUNTERPARTY_CREDIT_STATUS_BREACH = "BREACH"
COUNTERPARTY_CREDIT_STATUS_STALE_REVIEW = "STALE_REVIEW"
COUNTERPARTY_CREDIT_STATUS_OVERRIDE_APPROVED = "OVERRIDE_APPROVED"
COUNTERPARTY_CREDIT_STATUS_NOT_COMPARABLE = "NOT_COMPARABLE"
COUNTERPARTY_CREDIT_STATUS_NO_COUNTERPARTY = "NO_COUNTERPARTY"
COUNTERPARTY_CREDIT_STATUS_INACTIVE_TRADE = "INACTIVE_TRADE"
COUNTERPARTY_CREDIT_ACTION_ALLOW = "ALLOW"
COUNTERPARTY_CREDIT_ACTION_WARN = "WARN"
COUNTERPARTY_CREDIT_ACTION_REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
COUNTERPARTY_CREDIT_ACTION_BLOCK = "BLOCK"
COUNTERPARTY_CREDIT_ACTION_REFRESH_REVIEW = "REFRESH_CREDIT_REVIEW"
COUNTERPARTY_CREDIT_ACTION_ALLOW_WITH_OVERRIDE = "ALLOW_WITH_OVERRIDE"
COUNTERPARTY_CREDIT_ACTION_REVIEW_REQUIRED = "REVIEW_REQUIRED"
COUNTERPARTY_CREDIT_OVERRIDE_NOT_PROVIDED = "NOT_PROVIDED"
COUNTERPARTY_CREDIT_OVERRIDE_APPLIED = "APPLIED"
COUNTERPARTY_CREDIT_OVERRIDE_EXPIRED = "EXPIRED"
COUNTERPARTY_CREDIT_OVERRIDE_INSUFFICIENT = "INSUFFICIENT"
COUNTERPARTY_CREDIT_OVERRIDE_CURRENCY_MISMATCH = "CURRENCY_MISMATCH"
COUNTERPARTY_CREDIT_OVERRIDE_INACTIVE = "INACTIVE"


@dataclass(frozen=True)
class CounterpartyCreditTradeInput:
    counterparty_code: str | None
    trade_currency_code: str | None
    price: object | None
    volume: object | None
    trade_id: str | None = None
    status: str = "ACTIVE"


@dataclass(frozen=True)
class CounterpartyCreditOverrideInput:
    override_id: str | int | None
    status: str | None
    limit_currency_code: str | None
    approved_projected_exposure_amount: object | None
    expires_at: datetime | None = None
    approved_by: str | None = None


@dataclass(frozen=True)
class CounterpartyCreditExposureSnapshot:
    counterparty_code: str
    exposure_currency_code: str | None
    exposure_amount: Decimal | None
    active_trade_count: int
    in_exposure_currency_trade_count: int
    priced_trade_count: int
    unpriced_trade_count: int
    out_of_scope_trade_count: int
    latest_trade_updated_at: datetime | None


@dataclass(frozen=True)
class CounterpartyCreditPolicyResult:
    basis: str
    as_of: date
    counterparty_code: str | None
    counterparty_name: str | None
    credit_status: str | None
    policy_status: str
    action_required: str
    breach_action: str
    limit_currency_code: str | None
    limit_amount: Decimal | None
    current_exposure_amount: Decimal | None
    projected_trade_exposure_amount: Decimal | None
    projected_exposure_amount: Decimal | None
    projected_utilization_percent: Decimal | None
    watch_utilization_percent: Decimal
    limit_breached: bool
    comparable: bool
    comparison_reason: str
    review_due_at: date | None
    review_is_stale: bool
    latest_external_snapshot_provider: str | None
    latest_external_snapshot_as_of_date: date | None
    latest_external_snapshot_age_days: int | None
    latest_external_snapshot_is_stale: bool
    override_status: str
    override_id: str | int | None
    override_applied: bool
    stop_reasons: tuple[str, ...]
    warning_reasons: tuple[str, ...]
    exposure_snapshot: CounterpartyCreditExposureSnapshot | None


def build_counterparty_credit_exposure_snapshot(
    db: Session,
    *,
    counterparty_code: str,
    exposure_currency_code: str | None,
    excluded_trade_id: str | None = None,
) -> CounterpartyCreditExposureSnapshot:
    normalized_counterparty = _normalize_code(counterparty_code) or str(counterparty_code)
    active_trade_stmt = select(Trade).where(
        Trade.status == "ACTIVE",
        Trade.counterparty == normalized_counterparty,
    )
    if excluded_trade_id is not None:
        active_trade_stmt = active_trade_stmt.where(Trade.trade_id != excluded_trade_id)

    trades = db.execute(active_trade_stmt).scalars().all()
    latest_trade_updated_at = max((trade.updated_at for trade in trades), default=None)
    if exposure_currency_code is None:
        return CounterpartyCreditExposureSnapshot(
            counterparty_code=normalized_counterparty,
            exposure_currency_code=None,
            exposure_amount=None,
            active_trade_count=len(trades),
            in_exposure_currency_trade_count=0,
            priced_trade_count=0,
            unpriced_trade_count=0,
            out_of_scope_trade_count=len(trades),
            latest_trade_updated_at=latest_trade_updated_at,
        )

    normalized_currency = _normalize_code(exposure_currency_code)
    exposure_amount = Decimal("0")
    in_scope_count = 0
    priced_count = 0
    unpriced_count = 0
    for trade in trades:
        if _normalize_code(trade.trade_currency_code) != normalized_currency:
            continue
        in_scope_count += 1
        trade_exposure = trade_exposure_amount(
            trade_currency_code=trade.trade_currency_code,
            price=trade.price,
            volume=trade.volume,
            required_currency_code=normalized_currency,
        )
        if trade_exposure is None:
            unpriced_count += 1
            continue
        exposure_amount += trade_exposure
        priced_count += 1

    return CounterpartyCreditExposureSnapshot(
        counterparty_code=normalized_counterparty,
        exposure_currency_code=normalized_currency,
        exposure_amount=exposure_amount,
        active_trade_count=len(trades),
        in_exposure_currency_trade_count=in_scope_count,
        priced_trade_count=priced_count,
        unpriced_trade_count=unpriced_count,
        out_of_scope_trade_count=len(trades) - in_scope_count,
        latest_trade_updated_at=latest_trade_updated_at,
    )


def evaluate_counterparty_credit_limit_policy(
    db: Session,
    *,
    trade_input: CounterpartyCreditTradeInput,
    as_of: date | datetime | None = None,
    override: CounterpartyCreditOverrideInput | None = None,
    watch_utilization_percent: Decimal = COUNTERPARTY_CREDIT_WATCH_UTILIZATION_PERCENT,
    external_snapshot_max_age_days: int = COUNTERPARTY_CREDIT_EXTERNAL_SNAPSHOT_MAX_AGE_DAYS,
) -> CounterpartyCreditPolicyResult:
    reference_date = _coerce_reference_date(as_of)
    counterparty_code = _normalize_code(trade_input.counterparty_code)
    normalized_status = _normalize_code(trade_input.status) or "ACTIVE"
    if normalized_status != "ACTIVE":
        return _empty_policy_result(
            as_of=reference_date,
            counterparty_code=counterparty_code,
            policy_status=COUNTERPARTY_CREDIT_STATUS_INACTIVE_TRADE,
            action_required=COUNTERPARTY_CREDIT_ACTION_ALLOW,
            comparison_reason="inactive_trade",
            watch_utilization_percent=watch_utilization_percent,
        )
    if counterparty_code is None:
        return _empty_policy_result(
            as_of=reference_date,
            counterparty_code=None,
            policy_status=COUNTERPARTY_CREDIT_STATUS_NO_COUNTERPARTY,
            action_required=COUNTERPARTY_CREDIT_ACTION_ALLOW,
            comparison_reason="missing_counterparty",
            watch_utilization_percent=watch_utilization_percent,
        )

    counterparty = db.get(ReferenceCounterparty, counterparty_code)
    profile = db.execute(
        select(ReferenceCounterpartyCreditProfile).where(
            ReferenceCounterpartyCreditProfile.counterparty_code == counterparty_code
        )
    ).scalars().first()
    latest_snapshot = _latest_external_credit_snapshot(db, counterparty_code=counterparty_code)

    profile_breach_action = (
        _normalize_code(profile.breach_action)
        if profile is not None
        else DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION
    ) or DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION
    limit_currency_code = _normalize_code(profile.limit_currency_code) if profile is not None else None
    limit_amount = _to_decimal(profile.limit_amount) if profile is not None else None
    exposure_snapshot = build_counterparty_credit_exposure_snapshot(
        db,
        counterparty_code=counterparty_code,
        exposure_currency_code=limit_currency_code,
        excluded_trade_id=trade_input.trade_id,
    )
    review_due_at = profile.review_due_at if profile is not None else None
    review_is_stale = bool(review_due_at is not None and review_due_at < reference_date)
    latest_snapshot_age_days = (
        max(0, (reference_date - latest_snapshot.as_of_date).days)
        if latest_snapshot is not None
        else None
    )
    latest_snapshot_is_stale = bool(
        latest_snapshot_age_days is not None
        and latest_snapshot_age_days > external_snapshot_max_age_days
    )
    warning_reasons = _credit_freshness_warnings(
        profile=profile,
        review_is_stale=review_is_stale,
        latest_snapshot=latest_snapshot,
        latest_snapshot_age_days=latest_snapshot_age_days,
        latest_snapshot_is_stale=latest_snapshot_is_stale,
        external_snapshot_max_age_days=external_snapshot_max_age_days,
    )

    if profile is None:
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_NOT_COMPARABLE,
            action_required=COUNTERPARTY_CREDIT_ACTION_REVIEW_REQUIRED,
            breach_action=profile_breach_action,
            comparison_reason="missing_credit_profile",
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            warning_reasons=warning_reasons,
            stop_reasons=("no governed credit profile is on file for the counterparty",),
        )
    if limit_currency_code is None or limit_amount is None or limit_amount <= Decimal("0"):
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_NOT_COMPARABLE,
            action_required=COUNTERPARTY_CREDIT_ACTION_REVIEW_REQUIRED,
            breach_action=profile_breach_action,
            comparison_reason="missing_limit_configuration",
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            warning_reasons=warning_reasons,
            stop_reasons=("credit limit currency and amount must be configured before policy can compare exposure",),
        )

    projected_trade_exposure = trade_exposure_amount(
        trade_currency_code=trade_input.trade_currency_code,
        price=trade_input.price,
        volume=trade_input.volume,
        required_currency_code=limit_currency_code,
    )
    current_exposure = exposure_snapshot.exposure_amount or Decimal("0")
    projected_exposure = current_exposure
    comparable = projected_trade_exposure is not None
    comparison_reason = "comparable"
    if comparable:
        projected_exposure += projected_trade_exposure
    elif _normalize_code(trade_input.trade_currency_code) != limit_currency_code:
        comparison_reason = "currency_mismatch"
    else:
        comparison_reason = "missing_trade_measurements"

    if not comparable:
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_NOT_COMPARABLE,
            action_required=COUNTERPARTY_CREDIT_ACTION_REVIEW_REQUIRED,
            breach_action=profile_breach_action,
            limit_amount=limit_amount,
            current_exposure=current_exposure,
            projected_trade_exposure=None,
            projected_exposure=None,
            comparable=False,
            comparison_reason=comparison_reason,
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            warning_reasons=warning_reasons,
            stop_reasons=("trade exposure cannot be compared to the governed credit limit",),
        )

    utilization_percent = (projected_exposure / limit_amount) * Decimal("100")
    limit_breached = projected_exposure > limit_amount
    override_status = _override_status(
        override=override,
        as_of=reference_date,
        limit_currency_code=limit_currency_code,
        projected_exposure=projected_exposure,
    )
    if limit_breached and override_status == COUNTERPARTY_CREDIT_OVERRIDE_APPLIED:
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_OVERRIDE_APPROVED,
            action_required=COUNTERPARTY_CREDIT_ACTION_ALLOW_WITH_OVERRIDE,
            breach_action=profile_breach_action,
            limit_amount=limit_amount,
            current_exposure=current_exposure,
            projected_trade_exposure=projected_trade_exposure,
            projected_exposure=projected_exposure,
            utilization_percent=utilization_percent,
            limit_breached=True,
            comparable=True,
            comparison_reason=comparison_reason,
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            override_status=override_status,
            override=override,
            warning_reasons=warning_reasons,
        )
    if limit_breached:
        stop_reasons = ["projected exposure exceeds the governed credit limit"]
        if override_status not in {
            COUNTERPARTY_CREDIT_OVERRIDE_NOT_PROVIDED,
            COUNTERPARTY_CREDIT_OVERRIDE_APPLIED,
        }:
            stop_reasons.append(f"credit override is {override_status.lower()}")
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_BREACH,
            action_required=_breach_action_required(profile_breach_action),
            breach_action=profile_breach_action,
            limit_amount=limit_amount,
            current_exposure=current_exposure,
            projected_trade_exposure=projected_trade_exposure,
            projected_exposure=projected_exposure,
            utilization_percent=utilization_percent,
            limit_breached=True,
            comparable=True,
            comparison_reason=comparison_reason,
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            override_status=override_status,
            override=override,
            warning_reasons=warning_reasons,
            stop_reasons=tuple(stop_reasons),
        )
    if review_is_stale:
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_STALE_REVIEW,
            action_required=COUNTERPARTY_CREDIT_ACTION_REFRESH_REVIEW,
            breach_action=profile_breach_action,
            limit_amount=limit_amount,
            current_exposure=current_exposure,
            projected_trade_exposure=projected_trade_exposure,
            projected_exposure=projected_exposure,
            utilization_percent=utilization_percent,
            comparable=True,
            comparison_reason=comparison_reason,
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            override_status=override_status,
            warning_reasons=warning_reasons,
            stop_reasons=("governed credit review is stale",),
        )
    if utilization_percent >= watch_utilization_percent:
        return _policy_result(
            as_of=reference_date,
            counterparty=counterparty,
            counterparty_code=counterparty_code,
            profile=profile,
            policy_status=COUNTERPARTY_CREDIT_STATUS_WATCH,
            action_required=COUNTERPARTY_CREDIT_ACTION_WARN,
            breach_action=profile_breach_action,
            limit_amount=limit_amount,
            current_exposure=current_exposure,
            projected_trade_exposure=projected_trade_exposure,
            projected_exposure=projected_exposure,
            utilization_percent=utilization_percent,
            comparable=True,
            comparison_reason=comparison_reason,
            watch_utilization_percent=watch_utilization_percent,
            exposure_snapshot=exposure_snapshot,
            latest_snapshot=latest_snapshot,
            latest_snapshot_age_days=latest_snapshot_age_days,
            latest_snapshot_is_stale=latest_snapshot_is_stale,
            override_status=override_status,
            warning_reasons=warning_reasons + ("projected utilization is in the credit watch zone",),
        )

    return _policy_result(
        as_of=reference_date,
        counterparty=counterparty,
        counterparty_code=counterparty_code,
        profile=profile,
        policy_status=COUNTERPARTY_CREDIT_STATUS_CLEAR,
        action_required=COUNTERPARTY_CREDIT_ACTION_ALLOW,
        breach_action=profile_breach_action,
        limit_amount=limit_amount,
        current_exposure=current_exposure,
        projected_trade_exposure=projected_trade_exposure,
        projected_exposure=projected_exposure,
        utilization_percent=utilization_percent,
        comparable=True,
        comparison_reason=comparison_reason,
        watch_utilization_percent=watch_utilization_percent,
        exposure_snapshot=exposure_snapshot,
        latest_snapshot=latest_snapshot,
        latest_snapshot_age_days=latest_snapshot_age_days,
        latest_snapshot_is_stale=latest_snapshot_is_stale,
        override_status=override_status,
        warning_reasons=warning_reasons,
    )


def trade_exposure_amount(
    *,
    trade_currency_code: str | None,
    price: object | None,
    volume: object | None,
    required_currency_code: str | None,
) -> Decimal | None:
    normalized_required_currency = _normalize_code(required_currency_code)
    if normalized_required_currency is None:
        return None
    if _normalize_code(trade_currency_code) != normalized_required_currency:
        return None

    price_decimal = _to_decimal(price)
    volume_decimal = _to_decimal(volume)
    if price_decimal is None or volume_decimal is None:
        return None
    return abs(price_decimal * volume_decimal)


def serialize_counterparty_credit_policy_result(
    result: CounterpartyCreditPolicyResult,
) -> dict[str, Any]:
    return {
        "basis": result.basis,
        "as_of": result.as_of,
        "counterparty_code": result.counterparty_code,
        "counterparty_name": result.counterparty_name,
        "credit_status": result.credit_status,
        "policy_status": result.policy_status,
        "action_required": result.action_required,
        "breach_action": result.breach_action,
        "limit_currency_code": result.limit_currency_code,
        "limit_amount": _float_or_none(result.limit_amount),
        "current_exposure_amount": _float_or_none(result.current_exposure_amount),
        "projected_trade_exposure_amount": _float_or_none(result.projected_trade_exposure_amount),
        "projected_exposure_amount": _float_or_none(result.projected_exposure_amount),
        "projected_utilization_percent": _float_or_none(result.projected_utilization_percent),
        "watch_utilization_percent": float(result.watch_utilization_percent),
        "limit_breached": result.limit_breached,
        "comparable": result.comparable,
        "comparison_reason": result.comparison_reason,
        "review_due_at": result.review_due_at,
        "review_is_stale": result.review_is_stale,
        "latest_external_snapshot_provider": result.latest_external_snapshot_provider,
        "latest_external_snapshot_as_of_date": result.latest_external_snapshot_as_of_date,
        "latest_external_snapshot_age_days": result.latest_external_snapshot_age_days,
        "latest_external_snapshot_is_stale": result.latest_external_snapshot_is_stale,
        "override_status": result.override_status,
        "override_id": result.override_id,
        "override_applied": result.override_applied,
        "stop_reasons": list(result.stop_reasons),
        "warning_reasons": list(result.warning_reasons),
    }


def _empty_policy_result(
    *,
    as_of: date,
    counterparty_code: str | None,
    policy_status: str,
    action_required: str,
    comparison_reason: str,
    watch_utilization_percent: Decimal,
) -> CounterpartyCreditPolicyResult:
    return CounterpartyCreditPolicyResult(
        basis=COUNTERPARTY_CREDIT_POLICY_BASIS_V1,
        as_of=as_of,
        counterparty_code=counterparty_code,
        counterparty_name=None,
        credit_status=None,
        policy_status=policy_status,
        action_required=action_required,
        breach_action=DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
        limit_currency_code=None,
        limit_amount=None,
        current_exposure_amount=None,
        projected_trade_exposure_amount=None,
        projected_exposure_amount=None,
        projected_utilization_percent=None,
        watch_utilization_percent=watch_utilization_percent,
        limit_breached=False,
        comparable=False,
        comparison_reason=comparison_reason,
        review_due_at=None,
        review_is_stale=False,
        latest_external_snapshot_provider=None,
        latest_external_snapshot_as_of_date=None,
        latest_external_snapshot_age_days=None,
        latest_external_snapshot_is_stale=False,
        override_status=COUNTERPARTY_CREDIT_OVERRIDE_NOT_PROVIDED,
        override_id=None,
        override_applied=False,
        stop_reasons=(),
        warning_reasons=(),
        exposure_snapshot=None,
    )


def _policy_result(
    *,
    as_of: date,
    counterparty: ReferenceCounterparty | None,
    counterparty_code: str,
    profile: ReferenceCounterpartyCreditProfile | None,
    policy_status: str,
    action_required: str,
    breach_action: str,
    comparison_reason: str,
    watch_utilization_percent: Decimal,
    exposure_snapshot: CounterpartyCreditExposureSnapshot | None,
    latest_snapshot: ReferenceCounterpartyExternalCreditSnapshot | None,
    latest_snapshot_age_days: int | None,
    latest_snapshot_is_stale: bool,
    limit_amount: Decimal | None = None,
    current_exposure: Decimal | None = None,
    projected_trade_exposure: Decimal | None = None,
    projected_exposure: Decimal | None = None,
    utilization_percent: Decimal | None = None,
    limit_breached: bool = False,
    comparable: bool = False,
    override_status: str = COUNTERPARTY_CREDIT_OVERRIDE_NOT_PROVIDED,
    override: CounterpartyCreditOverrideInput | None = None,
    stop_reasons: tuple[str, ...] = (),
    warning_reasons: tuple[str, ...] = (),
) -> CounterpartyCreditPolicyResult:
    return CounterpartyCreditPolicyResult(
        basis=COUNTERPARTY_CREDIT_POLICY_BASIS_V1,
        as_of=as_of,
        counterparty_code=counterparty_code,
        counterparty_name=counterparty.name if counterparty is not None else None,
        credit_status=counterparty.credit_status if counterparty is not None else None,
        policy_status=policy_status,
        action_required=action_required,
        breach_action=breach_action,
        limit_currency_code=_normalize_code(profile.limit_currency_code) if profile is not None else None,
        limit_amount=limit_amount,
        current_exposure_amount=current_exposure,
        projected_trade_exposure_amount=projected_trade_exposure,
        projected_exposure_amount=projected_exposure,
        projected_utilization_percent=utilization_percent,
        watch_utilization_percent=watch_utilization_percent,
        limit_breached=limit_breached,
        comparable=comparable,
        comparison_reason=comparison_reason,
        review_due_at=profile.review_due_at if profile is not None else None,
        review_is_stale=bool(profile and profile.review_due_at and profile.review_due_at < as_of),
        latest_external_snapshot_provider=latest_snapshot.provider if latest_snapshot is not None else None,
        latest_external_snapshot_as_of_date=latest_snapshot.as_of_date if latest_snapshot is not None else None,
        latest_external_snapshot_age_days=latest_snapshot_age_days,
        latest_external_snapshot_is_stale=latest_snapshot_is_stale,
        override_status=override_status,
        override_id=override.override_id if override is not None else None,
        override_applied=override_status == COUNTERPARTY_CREDIT_OVERRIDE_APPLIED,
        stop_reasons=stop_reasons,
        warning_reasons=warning_reasons,
        exposure_snapshot=exposure_snapshot,
    )


def _latest_external_credit_snapshot(
    db: Session,
    *,
    counterparty_code: str,
) -> ReferenceCounterpartyExternalCreditSnapshot | None:
    return db.execute(
        select(ReferenceCounterpartyExternalCreditSnapshot)
        .where(ReferenceCounterpartyExternalCreditSnapshot.counterparty_code == counterparty_code)
        .order_by(
            ReferenceCounterpartyExternalCreditSnapshot.as_of_date.desc(),
            ReferenceCounterpartyExternalCreditSnapshot.downloaded_at.desc(),
            ReferenceCounterpartyExternalCreditSnapshot.id.desc(),
        )
    ).scalars().first()


def _override_status(
    *,
    override: CounterpartyCreditOverrideInput | None,
    as_of: date,
    limit_currency_code: str,
    projected_exposure: Decimal,
) -> str:
    if override is None:
        return COUNTERPARTY_CREDIT_OVERRIDE_NOT_PROVIDED
    if _normalize_code(override.status) not in {"ACTIVE", "APPROVED"}:
        return COUNTERPARTY_CREDIT_OVERRIDE_INACTIVE
    if override.expires_at is not None and _coerce_reference_date(override.expires_at) < as_of:
        return COUNTERPARTY_CREDIT_OVERRIDE_EXPIRED
    if _normalize_code(override.limit_currency_code) != limit_currency_code:
        return COUNTERPARTY_CREDIT_OVERRIDE_CURRENCY_MISMATCH
    approved_projected_exposure = _to_decimal(override.approved_projected_exposure_amount)
    if approved_projected_exposure is None or approved_projected_exposure < projected_exposure:
        return COUNTERPARTY_CREDIT_OVERRIDE_INSUFFICIENT
    return COUNTERPARTY_CREDIT_OVERRIDE_APPLIED


def _credit_freshness_warnings(
    *,
    profile: ReferenceCounterpartyCreditProfile | None,
    review_is_stale: bool,
    latest_snapshot: ReferenceCounterpartyExternalCreditSnapshot | None,
    latest_snapshot_age_days: int | None,
    latest_snapshot_is_stale: bool,
    external_snapshot_max_age_days: int,
) -> tuple[str, ...]:
    warnings: list[str] = []
    if profile is not None and profile.review_due_at is None:
        warnings.append("governed credit profile has no review due date")
    if review_is_stale:
        warnings.append("governed credit review is stale")
    if latest_snapshot is None:
        warnings.append("no external credit snapshot is on file for the counterparty")
    elif latest_snapshot_is_stale and latest_snapshot_age_days is not None:
        warnings.append(
            f"latest external credit snapshot is {latest_snapshot_age_days} days old, "
            f"exceeding the {external_snapshot_max_age_days}-day freshness limit"
        )
    return tuple(warnings)


def _breach_action_required(breach_action: str) -> str:
    normalized = _normalize_code(breach_action)
    if normalized == "BLOCK":
        return COUNTERPARTY_CREDIT_ACTION_BLOCK
    if normalized == "WARN":
        return COUNTERPARTY_CREDIT_ACTION_WARN
    return COUNTERPARTY_CREDIT_ACTION_REQUIRE_APPROVAL


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _float_or_none(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _coerce_reference_date(value: datetime | date | None) -> date:
    if value is None:
        return datetime.now(timezone.utc).date()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.date()
        return value.astimezone(timezone.utc).date()
    return value
