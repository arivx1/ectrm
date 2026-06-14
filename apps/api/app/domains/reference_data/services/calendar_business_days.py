from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule

CALENDAR_RULE_TYPE_WEEKLY = "WEEKLY"
CALENDAR_RULE_TYPE_FIXED_DATE = "FIXED_DATE"
CALENDAR_RULE_TYPE_NTH_WEEKDAY = "NTH_WEEKDAY"
CALENDAR_RULE_TYPE_LAST_WEEKDAY = "LAST_WEEKDAY"
CALENDAR_RULE_TYPE_EASTER_OFFSET = "EASTER_OFFSET"

CALENDAR_CLOSURE_TYPE_OPEN = "OPEN"
CALENDAR_CLOSURE_TYPE_FULL_CLOSED = "FULL_CLOSED"
CALENDAR_CLOSURE_TYPE_SHORT_DAY = "SHORT_DAY"

CALENDAR_OBSERVANCE_NONE = "NONE"
CALENDAR_OBSERVANCE_NEAREST_WEEKDAY = "NEAREST_WEEKDAY"
CALENDAR_OBSERVANCE_MONDAY_IF_SUNDAY = "MONDAY_IF_SUNDAY"

VALID_CALENDAR_RULE_TYPES = {
    CALENDAR_RULE_TYPE_WEEKLY,
    CALENDAR_RULE_TYPE_FIXED_DATE,
    CALENDAR_RULE_TYPE_NTH_WEEKDAY,
    CALENDAR_RULE_TYPE_LAST_WEEKDAY,
    CALENDAR_RULE_TYPE_EASTER_OFFSET,
}
VALID_CALENDAR_CLOSURE_TYPES = {
    CALENDAR_CLOSURE_TYPE_FULL_CLOSED,
    CALENDAR_CLOSURE_TYPE_SHORT_DAY,
}
VALID_CALENDAR_OBSERVANCE_SHIFTS = {
    CALENDAR_OBSERVANCE_NONE,
    CALENDAR_OBSERVANCE_NEAREST_WEEKDAY,
    CALENDAR_OBSERVANCE_MONDAY_IF_SUNDAY,
}


@dataclass(frozen=True, slots=True)
class CalendarDayMatch:
    calendar_code: str
    source_kind: str
    source_key: str
    name: str
    closure_type: str
    is_provisional: bool


@dataclass(frozen=True, slots=True)
class CalendarDayStatus:
    calendar_code: str
    evaluated_date: date
    is_business_day: bool
    closure_type: str
    source_calendar_codes: list[str]
    matches: list[CalendarDayMatch]


def normalize_calendar_rule_type(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in VALID_CALENDAR_RULE_TYPES:
        raise ValueError(f"Unsupported calendar rule type '{normalized}'")
    return normalized


def normalize_calendar_closure_type(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in VALID_CALENDAR_CLOSURE_TYPES:
        raise ValueError(f"Unsupported calendar closure type '{normalized}'")
    return normalized


def normalize_calendar_observance_shift(value: str | None) -> str:
    normalized = value.strip().upper() if value is not None else CALENDAR_OBSERVANCE_NONE
    if normalized not in VALID_CALENDAR_OBSERVANCE_SHIFTS:
        raise ValueError(f"Unsupported calendar observance shift '{normalized}'")
    return normalized


def validate_calendar_rule_configuration(
    *,
    rule_type: str,
    closure_type: str,
    month: int | None,
    day: int | None,
    weekday: int | None,
    occurrence: int | None,
    offset_days: int | None,
    observance_shift: str | None,
) -> None:
    normalized_rule_type = normalize_calendar_rule_type(rule_type)
    normalize_calendar_closure_type(closure_type)
    normalized_observance = normalize_calendar_observance_shift(observance_shift)

    if month is not None and not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")
    if day is not None and not 1 <= day <= 31:
        raise ValueError("day must be between 1 and 31")
    if weekday is not None and not 0 <= weekday <= 6:
        raise ValueError("weekday must be between 0 (Monday) and 6 (Sunday)")
    if occurrence is not None and occurrence <= 0:
        raise ValueError("occurrence must be greater than 0")

    if normalized_rule_type == CALENDAR_RULE_TYPE_WEEKLY:
        if weekday is None:
            raise ValueError("WEEKLY rules require weekday")
        if any(value is not None for value in (month, day, occurrence, offset_days)):
            raise ValueError("WEEKLY rules may only specify weekday")
        if normalized_observance != CALENDAR_OBSERVANCE_NONE:
            raise ValueError("WEEKLY rules do not support observance_shift")
        return

    if normalized_rule_type == CALENDAR_RULE_TYPE_FIXED_DATE:
        if month is None or day is None:
            raise ValueError("FIXED_DATE rules require month and day")
        if any(value is not None for value in (weekday, occurrence, offset_days)):
            raise ValueError("FIXED_DATE rules may only specify month, day, and observance_shift")
        return

    if normalized_rule_type == CALENDAR_RULE_TYPE_NTH_WEEKDAY:
        if month is None or weekday is None or occurrence is None:
            raise ValueError("NTH_WEEKDAY rules require month, weekday, and occurrence")
        if any(value is not None for value in (day, offset_days)):
            raise ValueError("NTH_WEEKDAY rules may not specify day or offset_days")
        if normalized_observance != CALENDAR_OBSERVANCE_NONE:
            raise ValueError("NTH_WEEKDAY rules do not support observance_shift")
        return

    if normalized_rule_type == CALENDAR_RULE_TYPE_LAST_WEEKDAY:
        if month is None or weekday is None:
            raise ValueError("LAST_WEEKDAY rules require month and weekday")
        if any(value is not None for value in (day, occurrence, offset_days)):
            raise ValueError("LAST_WEEKDAY rules may only specify month and weekday")
        if normalized_observance != CALENDAR_OBSERVANCE_NONE:
            raise ValueError("LAST_WEEKDAY rules do not support observance_shift")
        return

    if offset_days is None:
        raise ValueError("EASTER_OFFSET rules require offset_days")
    if any(value is not None for value in (month, day, weekday, occurrence)):
        raise ValueError("EASTER_OFFSET rules may only specify offset_days")
    if normalized_observance != CALENDAR_OBSERVANCE_NONE:
        raise ValueError("EASTER_OFFSET rules do not support observance_shift")


def resolve_calendar_source_codes(
    db: Session,
    *,
    calendar_code: str,
    evaluated_date: date,
) -> list[str]:
    normalized_code = normalize_code(calendar_code)
    calendar = db.get(ReferenceCalendar, normalized_code)
    if calendar is None:
        raise LookupError(f"Calendar '{normalized_code}' does not exist")

    visiting: set[str] = set()
    visited: set[str] = set()
    ordered_codes: list[str] = []

    def visit(code: str) -> None:
        if code in visited:
            return
        if code in visiting:
            raise ValueError("Calendar overlay hierarchy cannot contain cycles")

        visiting.add(code)
        overlay_rows = db.execute(
            select(ReferenceCalendarOverlay)
            .where(
                ReferenceCalendarOverlay.calendar_code == code,
                ReferenceCalendarOverlay.is_active.is_(True),
            )
            .order_by(
                ReferenceCalendarOverlay.priority.asc(),
                ReferenceCalendarOverlay.overlay_calendar_code.asc(),
            )
        ).scalars().all()
        for overlay_row in overlay_rows:
            if _record_applies_on_date(
                overlay_row.effective_from,
                overlay_row.effective_to,
                evaluated_date,
            ):
                visit(overlay_row.overlay_calendar_code)
        visiting.remove(code)
        visited.add(code)
        ordered_codes.append(code)

    visit(normalized_code)
    return ordered_codes


def evaluate_calendar_day(
    db: Session,
    *,
    calendar_code: str,
    evaluated_date: date,
) -> CalendarDayStatus:
    source_calendar_codes = resolve_calendar_source_codes(
        db,
        calendar_code=calendar_code,
        evaluated_date=evaluated_date,
    )
    matches: list[CalendarDayMatch] = []

    for source_calendar_code in source_calendar_codes:
        holiday_rows = db.execute(
            select(ReferenceCalendarHoliday).where(
                ReferenceCalendarHoliday.calendar_code == source_calendar_code,
                ReferenceCalendarHoliday.holiday_date == evaluated_date,
                ReferenceCalendarHoliday.is_active.is_(True),
            )
        ).scalars().all()
        for holiday_row in holiday_rows:
            matches.append(
                CalendarDayMatch(
                    calendar_code=source_calendar_code,
                    source_kind="HOLIDAY",
                    source_key=f"{holiday_row.calendar_code}:{holiday_row.holiday_date.isoformat()}",
                    name=holiday_row.name,
                    closure_type=holiday_row.closure_type,
                    is_provisional=holiday_row.is_provisional,
                )
            )

        rule_rows = db.execute(
            select(ReferenceCalendarRule)
            .where(
                ReferenceCalendarRule.calendar_code == source_calendar_code,
                ReferenceCalendarRule.is_active.is_(True),
            )
            .order_by(ReferenceCalendarRule.id.asc())
        ).scalars().all()
        for rule_row in rule_rows:
            if not _record_applies_on_date(rule_row.effective_from, rule_row.effective_to, evaluated_date):
                continue
            if not _rule_matches_date(rule_row, evaluated_date):
                continue
            matches.append(
                CalendarDayMatch(
                    calendar_code=source_calendar_code,
                    source_kind="RULE",
                    source_key=f"{rule_row.calendar_code}:rule:{rule_row.id}",
                    name=rule_row.name,
                    closure_type=rule_row.closure_type,
                    is_provisional=rule_row.is_provisional,
                )
            )

    if any(match.closure_type == CALENDAR_CLOSURE_TYPE_FULL_CLOSED for match in matches):
        return CalendarDayStatus(
            calendar_code=normalize_code(calendar_code),
            evaluated_date=evaluated_date,
            is_business_day=False,
            closure_type=CALENDAR_CLOSURE_TYPE_FULL_CLOSED,
            source_calendar_codes=source_calendar_codes,
            matches=matches,
        )

    if any(match.closure_type == CALENDAR_CLOSURE_TYPE_SHORT_DAY for match in matches):
        return CalendarDayStatus(
            calendar_code=normalize_code(calendar_code),
            evaluated_date=evaluated_date,
            is_business_day=True,
            closure_type=CALENDAR_CLOSURE_TYPE_SHORT_DAY,
            source_calendar_codes=source_calendar_codes,
            matches=matches,
        )

    return CalendarDayStatus(
        calendar_code=normalize_code(calendar_code),
        evaluated_date=evaluated_date,
        is_business_day=True,
        closure_type=CALENDAR_CLOSURE_TYPE_OPEN,
        source_calendar_codes=source_calendar_codes,
        matches=matches,
    )


def next_business_day(
    db: Session,
    *,
    calendar_code: str,
    start_date: date,
    include_start: bool = False,
    max_search_days: int = 3660,
) -> date:
    current = start_date if include_start else start_date + timedelta(days=1)
    for _ in range(max_search_days):
        if evaluate_calendar_day(db, calendar_code=calendar_code, evaluated_date=current).is_business_day:
            return current
        current += timedelta(days=1)
    raise LookupError(f"No business day found within {max_search_days} days for calendar '{normalize_code(calendar_code)}'")


def add_business_days(
    db: Session,
    *,
    calendar_code: str,
    start_date: date,
    business_days: int,
    include_start: bool = False,
) -> date:
    if business_days < 0:
        raise ValueError("business_days must be greater than or equal to 0")
    if business_days == 0:
        return start_date

    current = start_date
    remaining = business_days
    while remaining > 0:
        current = next_business_day(
            db,
            calendar_code=calendar_code,
            start_date=current,
            include_start=include_start,
        )
        include_start = False
        remaining -= 1
    return current


def business_days_between(
    db: Session,
    *,
    calendar_code: str,
    start_date: date,
    end_date: date,
    include_start: bool = True,
    include_end: bool = False,
) -> int:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    current = start_date
    business_day_count = 0
    while current < end_date or (include_end and current == end_date):
        if current != start_date or include_start:
            if evaluate_calendar_day(db, calendar_code=calendar_code, evaluated_date=current).is_business_day:
                business_day_count += 1
        current += timedelta(days=1)
    return business_day_count


def _record_applies_on_date(
    effective_from: datetime | None,
    effective_to: datetime | None,
    evaluated_date: date,
) -> bool:
    if effective_from is not None and evaluated_date < effective_from.date():
        return False
    if effective_to is not None and evaluated_date > effective_to.date():
        return False
    return True


def _rule_matches_date(rule_row: ReferenceCalendarRule, evaluated_date: date) -> bool:
    if rule_row.rule_type == CALENDAR_RULE_TYPE_WEEKLY:
        return evaluated_date.weekday() == rule_row.weekday

    if rule_row.rule_type == CALENDAR_RULE_TYPE_FIXED_DATE:
        nominal_date = date(evaluated_date.year, rule_row.month or 1, rule_row.day or 1)
        if evaluated_date == nominal_date:
            return True
        observed_date = _observed_date(nominal_date, rule_row.observance_shift)
        return observed_date is not None and evaluated_date == observed_date

    if rule_row.rule_type == CALENDAR_RULE_TYPE_NTH_WEEKDAY:
        return evaluated_date == _nth_weekday_of_month(
            evaluated_date.year,
            rule_row.month or 1,
            rule_row.weekday or 0,
            rule_row.occurrence or 1,
        )

    if rule_row.rule_type == CALENDAR_RULE_TYPE_LAST_WEEKDAY:
        return evaluated_date == _last_weekday_of_month(
            evaluated_date.year,
            rule_row.month or 1,
            rule_row.weekday or 0,
        )

    easter_sunday = _easter_sunday(evaluated_date.year)
    return evaluated_date == easter_sunday + timedelta(days=rule_row.offset_days or 0)


def _observed_date(nominal_date: date, observance_shift: str | None) -> date | None:
    normalized_observance = normalize_calendar_observance_shift(observance_shift)
    if normalized_observance == CALENDAR_OBSERVANCE_NONE:
        return None
    if normalized_observance == CALENDAR_OBSERVANCE_NEAREST_WEEKDAY:
        if nominal_date.weekday() == 5:
            return nominal_date - timedelta(days=1)
        if nominal_date.weekday() == 6:
            return nominal_date + timedelta(days=1)
        return nominal_date
    if nominal_date.weekday() == 6:
        return nominal_date + timedelta(days=1)
    return None


def _nth_weekday_of_month(year: int, month: int, weekday: int, occurrence: int) -> date:
    first_day = date(year, month, 1)
    days_until_weekday = (weekday - first_day.weekday()) % 7
    candidate = first_day + timedelta(days=days_until_weekday + (occurrence - 1) * 7)
    if candidate.month != month:
        raise ValueError("occurrence does not exist for the provided month and weekday")
    return candidate


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    if month == 12:
        first_of_next_month = date(year + 1, 1, 1)
    else:
        first_of_next_month = date(year, month + 1, 1)
    candidate = first_of_next_month - timedelta(days=1)
    while candidate.weekday() != weekday:
        candidate -= timedelta(days=1)
    return candidate


def _easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)
