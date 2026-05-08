from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.calendar_business_days import (
    evaluate_calendar_day,
    next_business_day,
)
from apps.api.app.domains.reference_data.services.records import normalize_code


@dataclass(frozen=True)
class SettlementDueDateResolution:
    due_at: datetime
    due_calendar_code: str | None
    was_adjusted: bool
    adjustment_reason: str | None


def resolve_settlement_due_at(
    db: Session,
    *,
    due_at: datetime,
    due_calendar_code: str | None,
) -> SettlementDueDateResolution:
    normalized_calendar_code = _normalize_optional_calendar_code(due_calendar_code)
    if normalized_calendar_code is None:
        return SettlementDueDateResolution(
            due_at=due_at,
            due_calendar_code=None,
            was_adjusted=False,
            adjustment_reason=None,
        )

    status = evaluate_calendar_day(
        db,
        calendar_code=normalized_calendar_code,
        evaluated_date=due_at.date(),
    )
    if status.is_business_day:
        return SettlementDueDateResolution(
            due_at=due_at,
            due_calendar_code=normalized_calendar_code,
            was_adjusted=False,
            adjustment_reason=None,
        )

    adjusted_date = next_business_day(
        db,
        calendar_code=normalized_calendar_code,
        start_date=due_at.date(),
        include_start=False,
    )
    adjusted_due_at = datetime.combine(adjusted_date, due_at.timetz())
    if adjusted_due_at.tzinfo is None and due_at.tzinfo is not None:
        adjusted_due_at = adjusted_due_at.replace(tzinfo=due_at.tzinfo)
    return SettlementDueDateResolution(
        due_at=adjusted_due_at,
        due_calendar_code=normalized_calendar_code,
        was_adjusted=True,
        adjustment_reason=(
            f"Rolled settlement due date from {due_at.date().isoformat()} to "
            f"{adjusted_date.isoformat()} on calendar {normalized_calendar_code}."
        ),
    )


def _normalize_optional_calendar_code(value: str | None) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalize_code(normalized)
