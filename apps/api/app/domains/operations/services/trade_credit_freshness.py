from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.reference_counterparty_credit_profile import (
    ReferenceCounterpartyCreditProfile,
)
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.trade import Trade

DEFAULT_EXTERNAL_CREDIT_SNAPSHOT_MAX_AGE_DAYS = 30


@dataclass(frozen=True)
class TradeCreditApprovalFreshnessAssessment:
    trade_id: str
    counterparty_code: str | None
    review_due_at: date | None
    latest_external_snapshot_provider: str | None
    latest_external_snapshot_as_of_date: date | None
    latest_external_snapshot_age_days: int | None
    blocking_reasons: tuple[str, ...]


def _coerce_reference_date(value: datetime | date | None) -> date:
    if value is None:
        return datetime.now(timezone.utc).date()
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(timezone.utc).date()


def assess_trade_credit_approval_freshness(
    db: Session,
    *,
    trade: Trade,
    as_of: datetime | date | None = None,
    external_snapshot_max_age_days: int = DEFAULT_EXTERNAL_CREDIT_SNAPSHOT_MAX_AGE_DAYS,
) -> TradeCreditApprovalFreshnessAssessment:
    counterparty_code = str(trade.counterparty or "").strip().upper() or None
    reference_date = _coerce_reference_date(as_of)
    blocking_reasons: list[str] = []

    profile = None
    latest_snapshot = None
    if counterparty_code is not None:
        profile = db.execute(
            select(ReferenceCounterpartyCreditProfile).where(
                ReferenceCounterpartyCreditProfile.counterparty_code == counterparty_code
            )
        ).scalars().first()
        latest_snapshot = db.execute(
            select(ReferenceCounterpartyExternalCreditSnapshot)
            .where(ReferenceCounterpartyExternalCreditSnapshot.counterparty_code == counterparty_code)
            .order_by(
                ReferenceCounterpartyExternalCreditSnapshot.as_of_date.desc(),
                ReferenceCounterpartyExternalCreditSnapshot.downloaded_at.desc(),
                ReferenceCounterpartyExternalCreditSnapshot.id.desc(),
            )
        ).scalars().first()

    if counterparty_code is None:
        blocking_reasons.append("the trade has no counterparty assigned")
    elif profile is None:
        blocking_reasons.append("no governed credit profile is on file for the counterparty")
    elif profile.review_due_at is None:
        blocking_reasons.append("the governed credit profile has no review due date")
    elif profile.review_due_at < reference_date:
        blocking_reasons.append(
            f"the governed credit review became overdue on {profile.review_due_at.isoformat()}"
        )

    latest_snapshot_age_days = None
    if counterparty_code is not None and latest_snapshot is None:
        blocking_reasons.append("no external credit snapshot is on file for the counterparty")
    elif latest_snapshot is not None:
        latest_snapshot_age_days = max(0, (reference_date - latest_snapshot.as_of_date).days)
        if latest_snapshot_age_days > external_snapshot_max_age_days:
            blocking_reasons.append(
                "the latest external credit snapshot "
                f"({latest_snapshot.provider} as of {latest_snapshot.as_of_date.isoformat()}) is "
                f"{latest_snapshot_age_days} days old, exceeding the "
                f"{external_snapshot_max_age_days}-day freshness limit"
            )

    return TradeCreditApprovalFreshnessAssessment(
        trade_id=trade.trade_id,
        counterparty_code=counterparty_code,
        review_due_at=profile.review_due_at if profile is not None else None,
        latest_external_snapshot_provider=latest_snapshot.provider if latest_snapshot is not None else None,
        latest_external_snapshot_as_of_date=latest_snapshot.as_of_date if latest_snapshot is not None else None,
        latest_external_snapshot_age_days=latest_snapshot_age_days,
        blocking_reasons=tuple(blocking_reasons),
    )


def assert_trade_credit_approval_freshness(
    db: Session,
    *,
    trade: Trade,
    as_of: datetime | date | None = None,
    external_snapshot_max_age_days: int = DEFAULT_EXTERNAL_CREDIT_SNAPSHOT_MAX_AGE_DAYS,
) -> TradeCreditApprovalFreshnessAssessment:
    assessment = assess_trade_credit_approval_freshness(
        db,
        trade=trade,
        as_of=as_of,
        external_snapshot_max_age_days=external_snapshot_max_age_days,
    )
    if not assessment.blocking_reasons:
        return assessment

    counterparty_label = (
        f"counterparty '{assessment.counterparty_code}'"
        if assessment.counterparty_code is not None
        else "the selected trade"
    )
    raise ValueError(
        f"Credit approval cannot be completed for trade '{trade.trade_id}' because {counterparty_label} "
        f"has stale or incomplete credit data: {'; '.join(assessment.blocking_reasons)}. "
        "Refresh the governed review date and import a current external credit snapshot before approving the exception."
    )
