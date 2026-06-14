from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime, timezone
from io import StringIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.calendar_business_days import (
    normalize_calendar_closure_type,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday

REQUIRED_CALENDAR_HOLIDAY_IMPORT_COLUMNS = ("holiday_date", "name")


@dataclass(frozen=True)
class CalendarHolidayImportSummary:
    calendar_code: str
    total_rows: int
    created_count: int
    updated_count: int
    deactivated_count: int
    skipped_count: int


@dataclass(frozen=True)
class _CalendarHolidayImportRow:
    holiday_date: date
    name: str
    closure_type: str
    is_provisional: bool
    description: str | None
    is_active: bool


def import_calendar_holidays_from_csv(
    db: Session,
    *,
    calendar_code: str,
    csv_text: str,
    actor_id: str,
    replace_existing: bool = True,
    deactivate_missing: bool = False,
    now: datetime | None = None,
) -> CalendarHolidayImportSummary:
    normalized_code = normalize_code(calendar_code)
    calendar = db.get(ReferenceCalendar, normalized_code)
    if calendar is None:
        raise LookupError(f"Calendar '{normalized_code}' does not exist")

    imported_rows = _parse_calendar_holiday_rows(csv_text)
    imported_dates = {row.holiday_date for row in imported_rows}
    reference_time = now or datetime.now(timezone.utc)

    existing_rows = db.execute(
        select(ReferenceCalendarHoliday)
        .where(ReferenceCalendarHoliday.calendar_code == normalized_code)
        .order_by(ReferenceCalendarHoliday.holiday_date.asc())
    ).scalars().all()
    existing_by_date = {row.holiday_date: row for row in existing_rows}

    created_count = 0
    updated_count = 0
    skipped_count = 0

    for imported in imported_rows:
        existing = existing_by_date.get(imported.holiday_date)
        if existing is None:
            db.add(
                ReferenceCalendarHoliday(
                    calendar_code=normalized_code,
                    holiday_date=imported.holiday_date,
                    name=imported.name,
                    closure_type=imported.closure_type,
                    is_provisional=imported.is_provisional,
                    description=imported.description,
                    is_active=imported.is_active,
                    created_at=reference_time,
                    created_by=actor_id,
                    updated_at=reference_time,
                    updated_by=actor_id,
                    version=1,
                )
            )
            created_count += 1
            continue

        if not replace_existing:
            skipped_count += 1
            continue

        changed = False
        if existing.name != imported.name:
            existing.name = imported.name
            changed = True
        if existing.closure_type != imported.closure_type:
            existing.closure_type = imported.closure_type
            changed = True
        if existing.is_provisional != imported.is_provisional:
            existing.is_provisional = imported.is_provisional
            changed = True
        if existing.description != imported.description:
            existing.description = imported.description
            changed = True
        if existing.is_active != imported.is_active:
            existing.is_active = imported.is_active
            changed = True
        if changed:
            existing.updated_at = reference_time
            existing.updated_by = actor_id
            existing.version += 1
            updated_count += 1

    deactivated_count = 0
    if deactivate_missing:
        for existing in existing_rows:
            if existing.holiday_date in imported_dates or not existing.is_active:
                continue
            existing.is_active = False
            existing.updated_at = reference_time
            existing.updated_by = actor_id
            existing.version += 1
            deactivated_count += 1

    return CalendarHolidayImportSummary(
        calendar_code=normalized_code,
        total_rows=len(imported_rows),
        created_count=created_count,
        updated_count=updated_count,
        deactivated_count=deactivated_count,
        skipped_count=skipped_count,
    )


def _parse_calendar_holiday_rows(csv_text: str) -> list[_CalendarHolidayImportRow]:
    normalized_text = csv_text.strip()
    if not normalized_text:
        raise ValueError("csv_text is required")

    reader = csv.DictReader(StringIO(normalized_text))
    if reader.fieldnames is None:
        raise ValueError("CSV header row is required")

    header_map = {_normalize_header_name(name): name for name in reader.fieldnames if name is not None}
    missing_headers = [column for column in REQUIRED_CALENDAR_HOLIDAY_IMPORT_COLUMNS if column not in header_map]
    if missing_headers:
        raise ValueError(
            "Calendar holiday import requires columns: "
            + ", ".join(REQUIRED_CALENDAR_HOLIDAY_IMPORT_COLUMNS)
        )

    imported_rows: list[_CalendarHolidayImportRow] = []
    seen_dates: set[date] = set()
    for line_number, csv_row in enumerate(reader, start=2):
        if not any(str(value or "").strip() for value in csv_row.values()):
            continue
        holiday_date = _parse_required_date(
            csv_row.get(header_map["holiday_date"]),
            line_number=line_number,
            field_name="holiday_date",
        )
        if holiday_date in seen_dates:
            raise ValueError(
                f"Calendar holiday import contains duplicate holiday_date '{holiday_date.isoformat()}' on line {line_number}."
            )
        seen_dates.add(holiday_date)
        imported_rows.append(
            _CalendarHolidayImportRow(
                holiday_date=holiday_date,
                name=_parse_required_text(
                    csv_row.get(header_map["name"]),
                    line_number=line_number,
                    field_name="name",
                ),
                closure_type=normalize_calendar_closure_type(
                    _parse_optional_text(csv_row.get(header_map.get("closure_type")))
                    or "FULL_CLOSED"
                ),
                is_provisional=_parse_optional_bool(
                    csv_row.get(header_map.get("is_provisional")),
                    line_number=line_number,
                    field_name="is_provisional",
                    default=False,
                ),
                description=_parse_optional_text(csv_row.get(header_map.get("description"))),
                is_active=_parse_optional_bool(
                    csv_row.get(header_map.get("is_active")),
                    line_number=line_number,
                    field_name="is_active",
                    default=True,
                ),
            )
        )
    return imported_rows


def _normalize_header_name(value: str) -> str:
    return value.strip().lower()


def _parse_required_date(value: str | None, *, line_number: int, field_name: str) -> date:
    normalized = _parse_required_text(value, line_number=line_number, field_name=field_name)
    try:
        return date.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(
            f"Calendar holiday import line {line_number} has invalid {field_name} '{normalized}'. Expected YYYY-MM-DD."
        ) from exc


def _parse_required_text(value: str | None, *, line_number: int, field_name: str) -> str:
    normalized = _parse_optional_text(value)
    if normalized is None:
        raise ValueError(f"Calendar holiday import line {line_number} is missing {field_name}.")
    return normalized


def _parse_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _parse_optional_bool(
    value: str | None,
    *,
    line_number: int,
    field_name: str,
    default: bool,
) -> bool:
    normalized = _parse_optional_text(value)
    if normalized is None:
        return default

    truthy = {"1", "true", "t", "yes", "y"}
    falsy = {"0", "false", "f", "no", "n"}
    lowered = normalized.lower()
    if lowered in truthy:
        return True
    if lowered in falsy:
        return False
    raise ValueError(
        f"Calendar holiday import line {line_number} has invalid {field_name} '{normalized}'. Expected true or false."
    )
