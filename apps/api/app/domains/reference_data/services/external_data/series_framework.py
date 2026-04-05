from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.logging import get_logger
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation

logger = get_logger(__name__)


class ExternalSeriesSyncError(RuntimeError):
    pass


@dataclass
class NormalizedSeriesObservation:
    series_code: str
    observation_date: date
    value: Decimal
    unit_code: str
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: Optional[datetime]
    source_revision: Optional[str]
    downloaded_at: datetime
    raw_payload: dict[str, Any]


def parse_period(period: str, frequency: str) -> date:
    normalized_frequency = frequency.strip().lower()
    value = period.strip()
    date_text = value.split("T", maxsplit=1)[0]

    if normalized_frequency in {"daily", "day", "weekly", "week"}:
        return datetime.strptime(date_text, "%Y-%m-%d").date()
    if normalized_frequency in {"monthly", "month"}:
        if len(date_text) == 7:
            return datetime.strptime(date_text, "%Y-%m").date()
        return datetime.strptime(date_text, "%Y-%m-%d").date().replace(day=1)
    if normalized_frequency in {"quarterly", "quarter"}:
        if "-Q" in value:
            year_text, quarter_text = value.split("-Q", maxsplit=1)
            month = ((int(quarter_text) - 1) * 3) + 1
            return date(int(year_text), month, 1)
        parsed = datetime.strptime(date_text, "%Y-%m-%d").date()
        month = (((parsed.month - 1) // 3) * 3) + 1
        return date(parsed.year, month, 1)
    if normalized_frequency in {"annual", "yearly", "year"}:
        if len(date_text) == 4:
            return date(int(date_text), 1, 1)
        parsed = datetime.strptime(date_text, "%Y-%m-%d").date()
        return date(parsed.year, 1, 1)

    raise ExternalSeriesSyncError(f"Unsupported external-series frequency '{frequency}'")


def build_start_argument(
    frequency: str,
    lookback_days: Optional[int],
    today: Optional[date] = None,
) -> Optional[str]:
    if lookback_days is None:
        return None

    anchor = today or date.today()
    start_date = anchor - timedelta(days=lookback_days)
    normalized_frequency = frequency.strip().lower()

    if normalized_frequency in {"daily", "day", "weekly", "week"}:
        return start_date.isoformat()
    if normalized_frequency in {"monthly", "month"}:
        return start_date.strftime("%Y-%m")
    if normalized_frequency in {"quarterly", "quarter"}:
        quarter = ((start_date.month - 1) // 3) + 1
        return f"{start_date.year}-Q{quarter}"
    if normalized_frequency in {"annual", "yearly", "year"}:
        return str(start_date.year)

    raise ExternalSeriesSyncError(f"Unsupported external-series frequency '{frequency}'")


def create_run(
    db: Session,
    *,
    provider: str,
    job_name: str,
    requested_by: Optional[str],
) -> ExternalDataRun:
    now = datetime.now(timezone.utc)
    run = ExternalDataRun(
        provider=provider,
        job_name=job_name,
        status="RUNNING",
        started_at=now,
        finished_at=None,
        requested_by=requested_by,
        series_count=0,
        observation_count=0,
        error_summary=None,
        created_at=now,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def mark_run_failed(db: Session, *, run_id: int, error: Exception) -> ExternalDataRun:
    run = db.get(ExternalDataRun, run_id)
    if run is None:
        logger.error(
            "External data run disappeared before failure could be recorded run_id=%s",
            run_id,
            exc_info=(type(error), error, error.__traceback__),
        )
        raise error

    logger.error(
        "External data sync failed provider=%s job_name=%s run_id=%s",
        run.provider,
        run.job_name,
        run.id,
        exc_info=(type(error), error, error.__traceback__),
    )
    run.status = "FAILED"
    run.finished_at = datetime.now(timezone.utc)
    run.error_summary = str(error)
    db.commit()
    db.refresh(run)
    return run


def load_definitions(
    db: Session,
    *,
    provider: str,
    series_code: Optional[str] = None,
) -> list[ExternalSeriesDefinition]:
    stmt = select(ExternalSeriesDefinition).where(
        ExternalSeriesDefinition.provider == provider,
        ExternalSeriesDefinition.is_active.is_(True),
    )
    if series_code:
        stmt = stmt.where(ExternalSeriesDefinition.code == series_code.strip().upper())

    rows = db.execute(stmt.order_by(ExternalSeriesDefinition.code.asc())).scalars().all()
    if not rows:
        raise ExternalSeriesSyncError(f"No active {provider} external series matched the requested filters")
    return rows


def upsert_observations(
    db: Session,
    *,
    run_id: int,
    observations: list[NormalizedSeriesObservation],
) -> int:
    written = 0
    for item in observations:
        existing = db.execute(
            select(ExternalSeriesObservation).where(
                ExternalSeriesObservation.series_code == item.series_code,
                ExternalSeriesObservation.observation_date == item.observation_date,
                ExternalSeriesObservation.source_provider == item.source_provider,
                ExternalSeriesObservation.source_series_id == item.source_series_id,
            )
        ).scalars().first()

        if existing is None:
            db.add(
                ExternalSeriesObservation(
                    series_code=item.series_code,
                    observation_date=item.observation_date,
                    value=item.value,
                    unit_code=item.unit_code,
                    source_provider=item.source_provider,
                    source_series_id=item.source_series_id,
                    source_frequency=item.source_frequency,
                    source_published_at=item.source_published_at,
                    source_revision=item.source_revision,
                    downloaded_at=item.downloaded_at,
                    run_id=run_id,
                    raw_payload=item.raw_payload,
                    created_at=item.downloaded_at,
                    updated_at=item.downloaded_at,
                )
            )
            written += 1
            continue

        if _observation_changed(existing, item):
            existing.value = item.value
            existing.unit_code = item.unit_code
            existing.source_frequency = item.source_frequency
            existing.source_published_at = item.source_published_at
            existing.source_revision = item.source_revision
            existing.downloaded_at = item.downloaded_at
            existing.run_id = run_id
            existing.raw_payload = item.raw_payload
            existing.updated_at = item.downloaded_at
            written += 1

    db.commit()
    return written


def parse_numeric_value(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        if normalized in {"", ".", "NA", "N/A", "NULL"}:
            return None
        value = normalized.replace(",", "")

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ExternalSeriesSyncError(f"Could not parse numeric value {value!r}") from exc


def _lookup_field_value(row: dict[str, Any], field_name: str) -> Any:
    current: Any = row
    for part in field_name.split("."):
        key = part.strip()
        if not key:
            raise ExternalSeriesSyncError("Transform rule field name was blank")
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def evaluate_transform_rule(
    transform_rule: Optional[str],
    row: dict[str, Any],
    *,
    default_field: str,
) -> Optional[Decimal]:
    rule = (transform_rule or "").strip()
    if not rule:
        return parse_numeric_value(_lookup_field_value(row, default_field))

    if rule.startswith("field:"):
        field_name = rule.split(":", maxsplit=1)[1].strip()
        return parse_numeric_value(_lookup_field_value(row, field_name))

    if rule.startswith("net:"):
        _, long_field, short_field = rule.split(":", maxsplit=2)
        long_value = parse_numeric_value(_lookup_field_value(row, long_field.strip()))
        short_value = parse_numeric_value(_lookup_field_value(row, short_field.strip()))
        if long_value is None or short_value is None:
            return None
        return long_value - short_value

    raise ExternalSeriesSyncError(f"Unsupported transform rule '{transform_rule}'")


def parse_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip().replace("Z", "+00:00")
    if len(text) == 10:
        parsed = datetime.strptime(text, "%Y-%m-%d")
        return parsed.replace(tzinfo=timezone.utc)

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _observation_changed(
    existing: ExternalSeriesObservation,
    item: NormalizedSeriesObservation,
) -> bool:
    return any(
        (
            existing.value != item.value,
            existing.unit_code != item.unit_code,
            existing.source_frequency != item.source_frequency,
            not _datetimes_match(existing.source_published_at, item.source_published_at),
            existing.source_revision != item.source_revision,
            existing.raw_payload != item.raw_payload,
        )
    )


def _datetimes_match(left: Optional[datetime], right: Optional[datetime]) -> bool:
    if left is None or right is None:
        return left is right
    return _normalize_datetime(left) == _normalize_datetime(right)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
