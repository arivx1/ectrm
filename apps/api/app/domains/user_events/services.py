from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from apps.api.app.models.user_defined_event import UserDefinedEvent
from apps.api.app.schemas.user_event import UserEventRecurrence

ALLOWED_USER_EVENT_KINDS = frozenset({"HOLIDAY", "REMINDER", "EVENT", "OTHER"})
ALLOWED_RECURRENCE_FREQUENCIES = frozenset({"DAILY", "WEEKLY", "MONTHLY", "YEARLY"})
USER_EVENT_WEEKDAY_CODES = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
USER_EVENT_WEEKDAY_INDEX = {code: index for index, code in enumerate(USER_EVENT_WEEKDAY_CODES)}
MAX_USER_EVENT_OCCURRENCES_PER_EVENT = 5000


@dataclass(frozen=True)
class ExpandedUserEventOccurrence:
    user_event_id: int
    occurrence_index: int
    starts_at: datetime
    ends_at: datetime | None


def coerce_utc(value: datetime, *, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def ensure_valid_user_event_kind(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in ALLOWED_USER_EVENT_KINDS:
        raise ValueError(
            "kind must be one of HOLIDAY, REMINDER, EVENT, or OTHER"
        )
    return normalized


def ensure_valid_user_event_timezone(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Unknown timezone '{normalized}'") from exc
    return normalized


def ensure_valid_user_event_window(
    *,
    starts_at: datetime,
    ends_at: datetime | None,
    timezone_name: str | None,
    recurrence: UserEventRecurrence | None,
) -> None:
    start_utc = coerce_utc(starts_at, field_name="starts_at")
    end_utc = coerce_utc(ends_at, field_name="ends_at") if ends_at is not None else None
    if end_utc is not None and end_utc < start_utc:
        raise ValueError("ends_at must be on or after starts_at")

    normalized_timezone = ensure_valid_user_event_timezone(timezone_name)
    if recurrence is not None:
        if normalized_timezone is None:
            raise ValueError("timezone is required for recurring user-defined events")
        if recurrence.frequency not in ALLOWED_RECURRENCE_FREQUENCIES:
            raise ValueError("recurrence frequency is not supported")
        if recurrence.until_at is not None and coerce_utc(recurrence.until_at, field_name="recurrence.until_at") < start_utc:
            raise ValueError("recurrence.until_at must be on or after starts_at")


def recurrence_from_record(record: UserDefinedEvent) -> UserEventRecurrence | None:
    if not record.recurrence_frequency:
        return None
    return UserEventRecurrence(
        frequency=record.recurrence_frequency,
        interval=record.recurrence_interval or 1,
        by_weekday=list(record.recurrence_by_weekday or []),
        until_at=record.recurrence_until_at,
        count=record.recurrence_count,
    )


def expand_user_event_occurrences(
    records: Iterable[UserDefinedEvent],
    *,
    window_start: datetime,
    window_end: datetime,
    limit: int,
) -> list[ExpandedUserEventOccurrence]:
    if limit <= 0:
        return []

    window_start_utc = coerce_utc(window_start, field_name="window_start")
    window_end_utc = coerce_utc(window_end, field_name="window_end")
    if window_end_utc < window_start_utc:
        raise ValueError("window_end must be on or after window_start")

    occurrences: list[ExpandedUserEventOccurrence] = []
    for record in records:
        occurrences.extend(
            _expand_record_occurrences(
                record,
                window_start=window_start_utc,
                window_end=window_end_utc,
            )
        )

    occurrences.sort(key=lambda occurrence: (occurrence.starts_at, occurrence.user_event_id, occurrence.occurrence_index))
    return occurrences[:limit]


def _expand_record_occurrences(
    record: UserDefinedEvent,
    *,
    window_start: datetime,
    window_end: datetime,
) -> list[ExpandedUserEventOccurrence]:
    start_utc = coerce_utc(record.starts_at, field_name="starts_at")
    end_utc = coerce_utc(record.ends_at, field_name="ends_at") if record.ends_at is not None else None
    duration = (end_utc - start_utc) if end_utc is not None else None
    recurrence = recurrence_from_record(record)

    if recurrence is None:
        if _occurrence_overlaps_window(start_utc, end_utc, window_start=window_start, window_end=window_end):
            return [
                ExpandedUserEventOccurrence(
                    user_event_id=record.id,
                    occurrence_index=0,
                    starts_at=start_utc,
                    ends_at=end_utc,
                )
            ]
        return []

    timezone_name = ensure_valid_user_event_timezone(record.timezone)
    if timezone_name is None:
        raise ValueError("Recurring user-defined events must include a timezone")
    zone = ZoneInfo(timezone_name)

    start_local = start_utc.astimezone(zone)
    search_start_utc = window_start - duration if duration is not None else window_start
    search_start_local = search_start_utc.astimezone(zone)
    until_local = recurrence.until_at.astimezone(zone) if recurrence.until_at is not None else None

    occurrences: list[ExpandedUserEventOccurrence] = []
    for occurrence_index, occurrence_local in _iterate_occurrence_starts(
        start_local=start_local,
        search_start_local=search_start_local,
        window_end=window_end,
        zone=zone,
        recurrence=recurrence,
        until_local=until_local,
    ):
        occurrence_start_utc = occurrence_local.astimezone(timezone.utc)
        occurrence_end_utc = occurrence_start_utc + duration if duration is not None else None
        if _occurrence_overlaps_window(
            occurrence_start_utc,
            occurrence_end_utc,
            window_start=window_start,
            window_end=window_end,
        ):
            occurrences.append(
                ExpandedUserEventOccurrence(
                    user_event_id=record.id,
                    occurrence_index=occurrence_index,
                    starts_at=occurrence_start_utc,
                    ends_at=occurrence_end_utc,
                )
            )
    return occurrences


def _iterate_occurrence_starts(
    *,
    start_local: datetime,
    search_start_local: datetime,
    window_end: datetime,
    zone: ZoneInfo,
    recurrence: UserEventRecurrence,
    until_local: datetime | None,
):
    if recurrence.frequency == "DAILY":
        yield from _iterate_daily_occurrences(
            start_local=start_local,
            search_start_local=search_start_local,
            recurrence=recurrence,
            until_local=until_local,
        )
        return

    if recurrence.frequency == "WEEKLY":
        yield from _iterate_weekly_occurrences(
            start_local=start_local,
            search_start_local=search_start_local,
            recurrence=recurrence,
            until_local=until_local,
            zone=zone,
        )
        return

    if recurrence.frequency == "MONTHLY":
        yield from _iterate_monthly_occurrences(
            start_local=start_local,
            search_start_local=search_start_local,
            recurrence=recurrence,
            until_local=until_local,
            zone=zone,
        )
        return

    if recurrence.frequency == "YEARLY":
        yield from _iterate_yearly_occurrences(
            start_local=start_local,
            search_start_local=search_start_local,
            recurrence=recurrence,
            until_local=until_local,
            zone=zone,
        )
        return

    raise ValueError(f"Unsupported recurrence frequency '{recurrence.frequency}'")


def _iterate_daily_occurrences(
    *,
    start_local: datetime,
    search_start_local: datetime,
    recurrence: UserEventRecurrence,
    until_local: datetime | None,
):
    current = start_local
    occurrence_index = 0

    if search_start_local > start_local:
        delta_days = max((search_start_local.date() - start_local.date()).days, 0)
        jump_count = delta_days // recurrence.interval
        current = start_local + timedelta(days=jump_count * recurrence.interval)
        occurrence_index = jump_count

    expansions = 0
    while expansions < MAX_USER_EVENT_OCCURRENCES_PER_EVENT:
        if recurrence.count is not None and occurrence_index >= recurrence.count:
            break
        if until_local is not None and current > until_local:
            break
        yield occurrence_index, current
        expansions += 1
        occurrence_index += 1
        current = current + timedelta(days=recurrence.interval)


def _iterate_weekly_occurrences(
    *,
    start_local: datetime,
    search_start_local: datetime,
    recurrence: UserEventRecurrence,
    until_local: datetime | None,
    zone: ZoneInfo,
):
    weekdays = recurrence.by_weekday or [USER_EVENT_WEEKDAY_CODES[start_local.weekday()]]
    unique_weekdays = sorted({USER_EVENT_WEEKDAY_INDEX[item] for item in weekdays})
    week_anchor = start_local.date() - timedelta(days=start_local.weekday())
    week_index = 0
    occurrence_index = 0
    expansions = 0

    while expansions < MAX_USER_EVENT_OCCURRENCES_PER_EVENT:
        week_start = week_anchor + timedelta(weeks=week_index * recurrence.interval)
        emitted_in_week = False
        for weekday_index in unique_weekdays:
            occurrence_date = week_start + timedelta(days=weekday_index)
            occurrence_local = _build_local_datetime(occurrence_date, start_local, zone)
            if occurrence_local < start_local:
                continue
            if until_local is not None and occurrence_local > until_local:
                return
            if recurrence.count is not None and occurrence_index >= recurrence.count:
                return
            if occurrence_local >= search_start_local or occurrence_local.date() >= search_start_local.date():
                yield occurrence_index, occurrence_local
                emitted_in_week = True
                expansions += 1
            occurrence_index += 1
            if expansions >= MAX_USER_EVENT_OCCURRENCES_PER_EVENT:
                return
        if not emitted_in_week and week_start > search_start_local.date() and until_local is not None and week_start > until_local.date():
            return
        week_index += 1


def _iterate_monthly_occurrences(
    *,
    start_local: datetime,
    search_start_local: datetime,
    recurrence: UserEventRecurrence,
    until_local: datetime | None,
    zone: ZoneInfo,
):
    current = start_local
    occurrence_index = 0
    expansions = 0

    while expansions < MAX_USER_EVENT_OCCURRENCES_PER_EVENT:
        if recurrence.count is not None and occurrence_index >= recurrence.count:
            break
        if until_local is not None and current > until_local:
            break
        if current >= search_start_local or current.date() >= search_start_local.date():
            yield occurrence_index, current
            expansions += 1
        occurrence_index += 1
        current = _add_months(current, recurrence.interval, zone)


def _iterate_yearly_occurrences(
    *,
    start_local: datetime,
    search_start_local: datetime,
    recurrence: UserEventRecurrence,
    until_local: datetime | None,
    zone: ZoneInfo,
):
    current = start_local
    occurrence_index = 0
    expansions = 0

    while expansions < MAX_USER_EVENT_OCCURRENCES_PER_EVENT:
        if recurrence.count is not None and occurrence_index >= recurrence.count:
            break
        if until_local is not None and current > until_local:
            break
        if current >= search_start_local or current.date() >= search_start_local.date():
            yield occurrence_index, current
            expansions += 1
        occurrence_index += 1
        current = _add_months(current, 12 * recurrence.interval, zone)


def _add_months(value: datetime, months: int, zone: ZoneInfo) -> datetime:
    month_index = value.year * 12 + (value.month - 1) + months
    year = month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return datetime(
        year,
        month,
        day,
        value.hour,
        value.minute,
        value.second,
        value.microsecond,
        tzinfo=zone,
        fold=value.fold,
    )


def _build_local_datetime(occurrence_date, template: datetime, zone: ZoneInfo) -> datetime:
    return datetime(
        occurrence_date.year,
        occurrence_date.month,
        occurrence_date.day,
        template.hour,
        template.minute,
        template.second,
        template.microsecond,
        tzinfo=zone,
        fold=template.fold,
    )


def _occurrence_overlaps_window(
    occurrence_start: datetime,
    occurrence_end: datetime | None,
    *,
    window_start: datetime,
    window_end: datetime,
) -> bool:
    if occurrence_end is None:
        return window_start <= occurrence_start <= window_end
    return occurrence_start <= window_end and occurrence_end >= window_start
