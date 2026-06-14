from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    assess_trade_credit_exception,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    get_active_trade_credit_exception,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    invalidate_active_trade_credit_exceptions,
)
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.trading.services.trade_credit_policy import (
    format_counterparty_credit_limit_message,
)
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.shared.enums import CreditApprovalStatus, TradeWorkflowType


def sync_credit_approval_workflow_item(
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
        _sync_required_credit_approval(
            db,
            trade=trade,
            actor_id=actor_id,
            now=now,
            policy_result=policy_result,
            existing_item=existing_item,
        )
        return

    _close_credit_approval_if_no_longer_required(
        db,
        trade=trade,
        actor_id=actor_id,
        now=now,
        existing_item=existing_item,
    )


def _sync_required_credit_approval(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    policy_result: dict[str, object],
    existing_item: TradeWorkflowItem | None,
) -> None:
    if existing_item is not None and existing_item.status == CreditApprovalStatus.APPROVED.value:
        _refresh_approved_credit_exception(
            db,
            trade=trade,
            actor_id=actor_id,
            now=now,
            policy_result=policy_result,
        )
        return
    if existing_item is not None and existing_item.status == CreditApprovalStatus.REJECTED.value:
        return

    notes = (
        f"{format_counterparty_credit_limit_message(policy_result)} "
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


def _refresh_approved_credit_exception(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    policy_result: dict[str, object],
) -> None:
    active_exception = get_active_trade_credit_exception(db, trade_id=trade.trade_id)
    if active_exception is not None:
        exception_assessment = assess_trade_credit_exception(
            exception=active_exception,
            trade=trade,
            db=db,
            now=now,
            policy_result=policy_result,
        )
        if not exception_assessment.revalidation_required:
            return
        revalidation_message = _format_credit_exception_revalidation_message(
            revalidation_reason=exception_assessment.revalidation_reason,
            approved_exception=active_exception,
            current_projected_exposure_amount=exception_assessment.current_projected_exposure_amount,
            remaining_headroom_amount=exception_assessment.remaining_headroom_amount,
        )
        invalidate_active_trade_credit_exceptions(
            db,
            trade_id=trade.trade_id,
            released_at=now,
            released_by=actor_id,
            released_reason=revalidation_message,
            status=CreditApprovalStatus.PENDING_REVIEW.value,
        )
    else:
        revalidation_message = (
            "The prior credit approval has no active exception envelope on file, so the amended trade must be re-reviewed."
        )

    notes = (
        f"{format_counterparty_credit_limit_message(policy_result)} "
        f"{revalidation_message} Trade booking remains in place, but credit approval must be refreshed before the exception can be relied on again."
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


def _close_credit_approval_if_no_longer_required(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    existing_item: TradeWorkflowItem | None,
) -> None:
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


def _format_credit_exception_revalidation_message(
    *,
    revalidation_reason: str | None,
    approved_exception,
    current_projected_exposure_amount: float | None,
    remaining_headroom_amount: float | None,
) -> str:
    normalized_reason = str(revalidation_reason or "").strip().upper()
    if normalized_reason == "EXCEPTION_EXPIRED":
        expires_at = (
            approved_exception.expires_at.date().isoformat()
            if approved_exception.expires_at is not None
            else "the configured expiry date"
        )
        return f"The approved credit exception expired on {expires_at} and must be refreshed."
    if normalized_reason == "EXCEEDS_APPROVED_EXCEPTION":
        currency_code = approved_exception.limit_currency_code
        approved_projected_exposure = float(approved_exception.approved_projected_exposure_amount)
        if current_projected_exposure_amount is not None:
            overrun = current_projected_exposure_amount - approved_projected_exposure
            return (
                "The amended trade now exceeds the previously approved credit exception envelope: "
                f"projected exposure {currency_code} {current_projected_exposure_amount:,.2f} versus approved "
                f"exception ceiling {currency_code} {approved_projected_exposure:,.2f} "
                f"({currency_code} {overrun:,.2f} above the approved envelope)."
            )
        return "The amended trade now exceeds the previously approved credit exception envelope."
    if normalized_reason == "LIMIT_CURRENCY_CHANGED":
        return (
            "The current credit policy comparison basis changed, so the previous approved "
            "exception can no longer be relied on."
        )
    if normalized_reason in {
        "NO_POLICY_CONTEXT",
        "NOT_COMPARABLE",
        "CURRENCY_MISMATCH",
        "MISSING_TRADE_MEASUREMENTS",
    }:
        return (
            "The amended trade can no longer be compared reliably to the approved credit "
            "exception envelope and must be re-reviewed."
        )
    if remaining_headroom_amount is not None and remaining_headroom_amount < 0:
        currency_code = approved_exception.limit_currency_code
        return (
            f"The amended trade is {currency_code} {abs(remaining_headroom_amount):,.2f} "
            "outside the approved exception envelope."
        )
    return (
        "The amended trade must be re-reviewed against credit because the prior exception "
        "no longer covers the new projected exposure."
    )
