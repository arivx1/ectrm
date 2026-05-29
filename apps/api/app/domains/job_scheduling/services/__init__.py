from __future__ import annotations

import hashlib
import json
from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_catalog import ASSISTANT_ACTION_CATALOG
from apps.api.app.domains.job_scheduling.schemas import (
    DeterministicJobCatalogEntryOut,
    EnqueueEventJobRunsRequest,
    EventJobTrigger,
    JobExecutionPlan,
    JobRecurrence,
    JobRunOut,
    JobScheduleCreate,
    JobScheduleOut,
    JobScheduleUpdate,
    TimeJobTrigger,
)
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.job_schedule import JobRun, JobSchedule

WEEKDAY_CODES = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
WEEKDAY_INDEX = {code: index for index, code in enumerate(WEEKDAY_CODES)}
TERMINAL_RUN_STATUSES = frozenset({"SUCCEEDED", "FAILED", "CANCELLED", "SKIPPED"})
ACTIVE_AGENT_STATUS = "ACTIVE"
SCHEDULER_AUTHORITY_RANK = {
    "OBSERVE": 1,
    "EXPLAIN": 2,
    "DRAFT": 3,
    "STAGE": 4,
}


@dataclass(frozen=True)
class DeterministicJobCatalogEntry:
    key: str
    label: str
    description: str
    risk_level: str
    expected_output: str
    authority_note: str


DETERMINISTIC_JOB_CATALOG: tuple[DeterministicJobCatalogEntry, ...] = (
    DeterministicJobCatalogEntry(
        key="external_data_sync",
        label="External data sync",
        description="Run a configured external-data sync through the provider-specific typed sync service.",
        risk_level="LOW",
        expected_output="External data run record plus provider-specific observations or error summary.",
        authority_note="May update platform-loaded market data only through existing sync services.",
    ),
    DeterministicJobCatalogEntry(
        key="projection_rebuild",
        label="Projection rebuild",
        description="Rebuild a governed read-model projection from durable source records.",
        risk_level="MEDIUM",
        expected_output="Projection rebuild result, counts, and validation errors when present.",
        authority_note="Must not invent business truth; source events and typed records remain authoritative.",
    ),
    DeterministicJobCatalogEntry(
        key="trading_eod_readiness",
        label="Trading EOD readiness",
        description="Evaluate end-of-day readiness checks over trades, positions, settlement, and operations state.",
        risk_level="MEDIUM",
        expected_output="Readiness summary and optional staged workflow/action recommendations.",
        authority_note="Business mutations must be staged through approved action requests.",
    ),
    DeterministicJobCatalogEntry(
        key="control_tower_digest",
        label="Control tower digest",
        description="Summarize stale runs, pending action requests, and agent outcomes for operator review.",
        risk_level="LOW",
        expected_output="Internal digest with links to runs, action requests, and intervention candidates.",
        authority_note="Digest generation is read-only unless paired with an approved staged action type.",
    ),
    DeterministicJobCatalogEntry(
        key="document_reprocessing_scan",
        label="Document reprocessing scan",
        description="Find document ingestions that are eligible for a governed reprocessing proposal.",
        risk_level="LOW",
        expected_output="Candidate list or staged reprocess_document_ingestion action requests.",
        authority_note="Actual reprocessing must use the existing document workflow/action contract.",
    ),
)
DETERMINISTIC_JOB_KEYS = frozenset(entry.key for entry in DETERMINISTIC_JOB_CATALOG)
ASSISTANT_ACTION_NAMES = frozenset(entry.name for entry in ASSISTANT_ACTION_CATALOG)


def list_deterministic_job_catalog() -> list[DeterministicJobCatalogEntryOut]:
    return [
        DeterministicJobCatalogEntryOut(
            key=entry.key,
            label=entry.label,
            description=entry.description,
            risk_level=entry.risk_level,
            expected_output=entry.expected_output,
            authority_note=entry.authority_note,
        )
        for entry in DETERMINISTIC_JOB_CATALOG
    ]


def create_job_schedule(db: Session, *, payload: JobScheduleCreate, actor_id: str) -> JobSchedule:
    _validate_execution_plan(db, payload.execution_plan)
    now = datetime.now(timezone.utc)
    record = JobSchedule(
        name=payload.name,
        description=payload.description,
        status="ACTIVE",
        trigger_type=payload.trigger_type,
        allowed_action_types=[],
        execution_payload={},
        is_user_enabled=True,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    _apply_trigger(record, time_trigger=payload.time_trigger, event_trigger=payload.event_trigger)
    _apply_execution_plan(record, payload.execution_plan)
    record.next_run_at = calculate_next_run_at(record, after=None, emitted_count=0)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_job_schedules(
    db: Session,
    *,
    status: str | None,
    trigger_type: str | None,
    limit: int,
    offset: int,
) -> list[JobSchedule]:
    stmt = select(JobSchedule).order_by(JobSchedule.updated_at.desc(), JobSchedule.id.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(JobSchedule.status == status)
    if trigger_type:
        stmt = stmt.where(JobSchedule.trigger_type == trigger_type)
    return list(db.execute(stmt).scalars().all())


def get_job_schedule(db: Session, *, schedule_id: int) -> JobSchedule | None:
    return db.get(JobSchedule, schedule_id)


def update_job_schedule(
    db: Session,
    *,
    schedule_id: int,
    payload: JobScheduleUpdate,
    actor_id: str,
) -> JobSchedule:
    record = _require_job_schedule(db, schedule_id=schedule_id)
    if payload.execution_plan is not None:
        _validate_execution_plan(db, payload.execution_plan)

    if "name" in payload.model_fields_set and payload.name is not None:
        record.name = payload.name
    if "description" in payload.model_fields_set:
        record.description = payload.description
    if payload.time_trigger is not None:
        if record.trigger_type != "TIME":
            raise ValueError("time_trigger can only update TIME schedules")
        _apply_time_trigger(record, payload.time_trigger)
        record.next_run_at = calculate_next_run_at(record, after=None, emitted_count=_count_time_runs(db, record.id))
    if payload.event_trigger is not None:
        if record.trigger_type != "EVENT":
            raise ValueError("event_trigger can only update EVENT schedules")
        _apply_event_trigger(record, payload.event_trigger)
        record.next_run_at = None
    if payload.execution_plan is not None:
        _apply_execution_plan(record, payload.execution_plan)
    if payload.status is not None:
        record.status = payload.status
        record.is_user_enabled = payload.status == "ACTIVE"
        if record.status == "ACTIVE" and record.trigger_type == "TIME":
            record.next_run_at = calculate_next_run_at(
                record,
                after=datetime.now(timezone.utc),
                emitted_count=_count_time_runs(db, record.id),
            )
        elif record.status != "ACTIVE":
            record.next_run_at = None

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def materialize_due_time_runs(
    db: Session,
    *,
    as_of: datetime,
    limit: int,
    actor_id: str,
) -> list[JobRun]:
    as_of_utc = _coerce_utc(as_of)
    records = list(
        db.execute(
            select(JobSchedule)
            .where(
                JobSchedule.status == "ACTIVE",
                JobSchedule.trigger_type == "TIME",
                JobSchedule.next_run_at.is_not(None),
                JobSchedule.next_run_at <= as_of_utc,
            )
            .order_by(JobSchedule.next_run_at.asc(), JobSchedule.id.asc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    materialized: list[JobRun] = []
    for schedule in records:
        emitted_count = _count_time_runs(db, schedule.id)
        while schedule.next_run_at is not None and _coerce_utc(schedule.next_run_at) <= as_of_utc:
            if len(materialized) >= limit:
                break
            scheduled_for = _coerce_utc(schedule.next_run_at)
            run, created = _create_or_get_run(
                db,
                schedule=schedule,
                trigger_type="TIME",
                scheduled_for=scheduled_for,
                event_source=None,
                event_type=None,
                trigger_ref=scheduled_for.isoformat(),
                event_payload=None,
                idempotency_key=_time_idempotency_key(schedule, scheduled_for),
                actor_id=actor_id,
            )
            materialized.append(run)
            if created:
                emitted_count += 1
            schedule.last_run_at = scheduled_for
            schedule.next_run_at = calculate_next_run_at(
                schedule,
                after=scheduled_for,
                emitted_count=emitted_count,
            )
            schedule.updated_at = datetime.now(timezone.utc)
            schedule.updated_by = actor_id
            schedule.version += 1
        if len(materialized) >= limit:
            break
    db.commit()
    for run in materialized:
        db.refresh(run)
    return materialized


def enqueue_event_runs(
    db: Session,
    *,
    payload: EnqueueEventJobRunsRequest,
    actor_id: str,
) -> list[JobRun]:
    occurred_at = _coerce_utc(payload.occurred_at or datetime.now(timezone.utc))
    records = list(
        db.execute(
            select(JobSchedule)
            .where(
                JobSchedule.status == "ACTIVE",
                JobSchedule.trigger_type == "EVENT",
                JobSchedule.event_source == payload.event_source,
                JobSchedule.event_type == payload.event_type,
            )
            .order_by(JobSchedule.id.asc())
            .limit(payload.limit)
        )
        .scalars()
        .all()
    )
    materialized: list[JobRun] = []
    for schedule in records:
        if not _event_filter_matches(schedule.event_filter or {}, payload.event_payload):
            continue
        run, created = _create_or_get_run(
            db,
            schedule=schedule,
            trigger_type="EVENT",
            scheduled_for=occurred_at,
            event_source=payload.event_source,
            event_type=payload.event_type,
            trigger_ref=payload.event_ref,
            event_payload=payload.event_payload,
            idempotency_key=_event_idempotency_key(schedule, payload, occurred_at=occurred_at),
            actor_id=actor_id,
        )
        if created:
            schedule.last_run_at = occurred_at
            schedule.updated_at = datetime.now(timezone.utc)
            schedule.updated_by = actor_id
            schedule.version += 1
        materialized.append(run)
        if len(materialized) >= payload.limit:
            break
    db.commit()
    for run in materialized:
        db.refresh(run)
    return materialized


def list_job_runs(
    db: Session,
    *,
    schedule_id: int | None,
    status: str | None,
    limit: int,
    offset: int,
) -> list[JobRun]:
    stmt = select(JobRun).order_by(JobRun.created_at.desc(), JobRun.id.desc()).limit(limit).offset(offset)
    if schedule_id is not None:
        stmt = stmt.where(JobRun.schedule_id == schedule_id)
    if status:
        stmt = stmt.where(JobRun.status == status)
    return list(db.execute(stmt).scalars().all())


def update_job_run_status(
    db: Session,
    *,
    run_id: int,
    status: str,
    actor_id: str,
    result: dict[str, object] | None = None,
    action_request_ids: list[int] | None = None,
    error_detail: str | None = None,
) -> JobRun:
    record = db.get(JobRun, run_id)
    if record is None:
        raise LookupError("Job run not found")

    now = datetime.now(timezone.utc)
    if status == "RUNNING" and record.status != "RUNNING":
        record.attempt_count += 1
        if record.started_at is None:
            record.started_at = now
    if status in TERMINAL_RUN_STATUSES:
        if record.started_at is None:
            record.started_at = now
        record.completed_at = now
    record.status = status
    record.result = result if result is not None else record.result
    record.action_request_ids = list(action_request_ids or record.action_request_ids or [])
    record.error_detail = error_detail if error_detail is not None else record.error_detail
    record.updated_at = now
    record.updated_by = actor_id
    db.commit()
    db.refresh(record)
    return record


def to_job_schedule_out(record: JobSchedule) -> JobScheduleOut:
    return JobScheduleOut(
        id=record.id,
        name=record.name,
        description=record.description,
        status=record.status,
        trigger_type=record.trigger_type,
        time_trigger=_time_trigger_from_record(record),
        event_trigger=_event_trigger_from_record(record),
        execution_plan=_execution_plan_from_record(record),
        next_run_at=_coerce_utc_optional(record.next_run_at),
        last_run_at=_coerce_utc_optional(record.last_run_at),
        is_user_enabled=record.is_user_enabled,
        created_at=_coerce_utc(record.created_at),
        created_by=record.created_by,
        updated_at=_coerce_utc(record.updated_at),
        updated_by=record.updated_by,
        version=record.version,
    )


def to_job_run_out(record: JobRun) -> JobRunOut:
    return JobRunOut(
        id=record.id,
        schedule_id=record.schedule_id,
        status=record.status,
        trigger_type=record.trigger_type,
        scheduled_for=_coerce_utc_optional(record.scheduled_for),
        event_source=record.event_source,
        event_type=record.event_type,
        trigger_ref=record.trigger_ref,
        event_payload=dict(record.event_payload) if isinstance(record.event_payload, dict) else None,
        idempotency_key=record.idempotency_key,
        execution_plan=JobExecutionPlan(
            mode=record.execution_mode,
            deterministic_task_key=record.deterministic_task_key,
            agent_id=record.agent_id,
            allowed_action_types=list(record.allowed_action_types or []),
            max_authority=record.max_authority,
            payload=dict(record.execution_payload or {}),
        ),
        schedule_version=record.schedule_version,
        attempt_count=record.attempt_count,
        started_at=_coerce_utc_optional(record.started_at),
        completed_at=_coerce_utc_optional(record.completed_at),
        action_request_ids=list(record.action_request_ids or []),
        result=dict(record.result) if isinstance(record.result, dict) else None,
        error_detail=record.error_detail,
        created_at=_coerce_utc(record.created_at),
        created_by=record.created_by,
        updated_at=_coerce_utc(record.updated_at),
        updated_by=record.updated_by,
    )


def calculate_next_run_at(
    schedule: JobSchedule,
    *,
    after: datetime | None,
    emitted_count: int,
) -> datetime | None:
    if schedule.trigger_type != "TIME" or schedule.starts_at is None or schedule.status != "ACTIVE":
        return None

    recurrence = _recurrence_from_record(schedule)
    if recurrence is not None and recurrence.count is not None and emitted_count >= recurrence.count:
        return None

    zone = _zone_for_schedule(schedule)
    start_local = _coerce_utc(schedule.starts_at).astimezone(zone)
    after_local = (_coerce_utc(after).astimezone(zone) if after is not None else start_local - timedelta(microseconds=1))

    if recurrence is None:
        candidate = start_local if start_local > after_local else None
    elif recurrence.frequency == "DAILY":
        candidate = _next_daily(start_local, after_local, recurrence.interval)
    elif recurrence.frequency == "WEEKLY":
        candidate = _next_weekly(start_local, after_local, recurrence, zone)
    elif recurrence.frequency == "MONTHLY":
        candidate = _next_monthly(start_local, after_local, recurrence.interval, zone)
    elif recurrence.frequency == "YEARLY":
        candidate = _next_monthly(start_local, after_local, 12 * recurrence.interval, zone)
    else:
        raise ValueError(f"Unsupported recurrence frequency '{recurrence.frequency}'")

    if candidate is None:
        return None
    if recurrence is not None and recurrence.until_at is not None:
        until_local = _coerce_utc(recurrence.until_at).astimezone(zone)
        if candidate > until_local:
            return None
    return candidate.astimezone(timezone.utc)


def _validate_execution_plan(db: Session, plan: JobExecutionPlan) -> None:
    if plan.deterministic_task_key and plan.deterministic_task_key not in DETERMINISTIC_JOB_KEYS:
        raise ValueError(f"Unknown deterministic_task_key '{plan.deterministic_task_key}'")
    if plan.agent_id:
        agent = db.get(AssistantAgent, plan.agent_id)
        if agent is None:
            raise ValueError(f"Agent '{plan.agent_id}' was not found")
        if agent.status != ACTIVE_AGENT_STATUS:
            raise ValueError(f"Agent '{plan.agent_id}' must be ACTIVE before it can be scheduled")
        if _scheduler_authority_rank(plan.max_authority) > _scheduler_authority_rank(agent.authority_ceiling or "DRAFT"):
            raise ValueError(
                f"Schedule authority {plan.max_authority} exceeds agent '{plan.agent_id}' authority ceiling "
                f"{agent.authority_ceiling or 'DRAFT'}"
            )
        if plan.allowed_action_types:
            agent_capabilities = {str(item).strip().upper() for item in list(agent.capabilities or [])}
            if "ACTION" not in agent_capabilities:
                raise ValueError(f"Agent '{plan.agent_id}' does not have ACTION capability for staged actions")
            agent_actions = {str(item).strip().lower() for item in list(agent.allowed_action_types or [])}
            disallowed_actions = [item for item in plan.allowed_action_types if item not in agent_actions]
            if disallowed_actions:
                raise ValueError(
                    f"Agent '{plan.agent_id}' does not allow scheduled action types: "
                    f"{', '.join(disallowed_actions)}"
                )
    unknown_actions = [item for item in plan.allowed_action_types if item not in ASSISTANT_ACTION_NAMES]
    if unknown_actions:
        raise ValueError(f"Unknown allowed_action_types: {', '.join(unknown_actions)}")


def _scheduler_authority_rank(value: str) -> int:
    return SCHEDULER_AUTHORITY_RANK.get(value.strip().upper(), 999)


def _require_job_schedule(db: Session, *, schedule_id: int) -> JobSchedule:
    record = db.get(JobSchedule, schedule_id)
    if record is None:
        raise LookupError("Job schedule not found")
    return record


def _apply_trigger(
    record: JobSchedule,
    *,
    time_trigger: TimeJobTrigger | None,
    event_trigger: EventJobTrigger | None,
) -> None:
    if record.trigger_type == "TIME":
        if time_trigger is None:
            raise ValueError("time_trigger is required")
        _apply_time_trigger(record, time_trigger)
        return
    if event_trigger is None:
        raise ValueError("event_trigger is required")
    _apply_event_trigger(record, event_trigger)


def _apply_time_trigger(record: JobSchedule, trigger: TimeJobTrigger) -> None:
    _ensure_valid_timezone(trigger.timezone)
    record.timezone = trigger.timezone
    record.starts_at = _coerce_utc(trigger.starts_at)
    record.recurrence_frequency = trigger.recurrence.frequency if trigger.recurrence is not None else None
    record.recurrence_interval = trigger.recurrence.interval if trigger.recurrence is not None else None
    record.recurrence_by_weekday = list(trigger.recurrence.by_weekday or []) if trigger.recurrence is not None else None
    record.recurrence_count = trigger.recurrence.count if trigger.recurrence is not None else None
    record.recurrence_until_at = (
        _coerce_utc(trigger.recurrence.until_at)
        if trigger.recurrence is not None and trigger.recurrence.until_at is not None
        else None
    )
    record.event_source = None
    record.event_type = None
    record.event_filter = None


def _apply_event_trigger(record: JobSchedule, trigger: EventJobTrigger) -> None:
    record.event_source = trigger.event_source
    record.event_type = trigger.event_type
    record.event_filter = dict(trigger.event_filter or {})
    record.timezone = None
    record.starts_at = None
    record.recurrence_frequency = None
    record.recurrence_interval = None
    record.recurrence_by_weekday = None
    record.recurrence_count = None
    record.recurrence_until_at = None
    record.next_run_at = None


def _apply_execution_plan(record: JobSchedule, plan: JobExecutionPlan) -> None:
    record.execution_mode = plan.mode
    record.deterministic_task_key = plan.deterministic_task_key
    record.agent_id = plan.agent_id
    record.allowed_action_types = list(plan.allowed_action_types)
    record.max_authority = plan.max_authority
    record.execution_payload = dict(plan.payload or {})


def _time_trigger_from_record(record: JobSchedule) -> TimeJobTrigger | None:
    if record.trigger_type != "TIME" or record.starts_at is None or record.timezone is None:
        return None
    return TimeJobTrigger(
        starts_at=_coerce_utc(record.starts_at),
        timezone=record.timezone,
        recurrence=_recurrence_from_record(record),
    )


def _event_trigger_from_record(record: JobSchedule) -> EventJobTrigger | None:
    if record.trigger_type != "EVENT" or record.event_source is None or record.event_type is None:
        return None
    return EventJobTrigger(
        event_source=record.event_source,
        event_type=record.event_type,
        event_filter=dict(record.event_filter or {}),
    )


def _execution_plan_from_record(record: JobSchedule) -> JobExecutionPlan:
    return JobExecutionPlan(
        mode=record.execution_mode,
        deterministic_task_key=record.deterministic_task_key,
        agent_id=record.agent_id,
        allowed_action_types=list(record.allowed_action_types or []),
        max_authority=record.max_authority,
        payload=dict(record.execution_payload or {}),
    )


def _recurrence_from_record(record: JobSchedule) -> JobRecurrence | None:
    if not record.recurrence_frequency:
        return None
    return JobRecurrence(
        frequency=record.recurrence_frequency,
        interval=record.recurrence_interval or 1,
        by_weekday=list(record.recurrence_by_weekday or []),
        until_at=_coerce_utc_optional(record.recurrence_until_at),
        count=record.recurrence_count,
    )


def _create_or_get_run(
    db: Session,
    *,
    schedule: JobSchedule,
    trigger_type: str,
    scheduled_for: datetime | None,
    event_source: str | None,
    event_type: str | None,
    trigger_ref: str | None,
    event_payload: dict[str, object] | None,
    idempotency_key: str,
    actor_id: str,
) -> tuple[JobRun, bool]:
    existing = db.execute(select(JobRun).where(JobRun.idempotency_key == idempotency_key)).scalars().first()
    if existing is not None:
        return existing, False
    now = datetime.now(timezone.utc)
    record = JobRun(
        schedule_id=schedule.id,
        status="QUEUED",
        trigger_type=trigger_type,
        scheduled_for=scheduled_for,
        event_source=event_source,
        event_type=event_type,
        trigger_ref=trigger_ref,
        event_payload=event_payload,
        idempotency_key=idempotency_key,
        execution_mode=schedule.execution_mode,
        deterministic_task_key=schedule.deterministic_task_key,
        agent_id=schedule.agent_id,
        allowed_action_types=list(schedule.allowed_action_types or []),
        max_authority=schedule.max_authority,
        execution_payload=dict(schedule.execution_payload or {}),
        schedule_version=schedule.version,
        attempt_count=0,
        action_request_ids=[],
        result=None,
        error_detail=None,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
    )
    db.add(record)
    db.flush()
    return record, True


def _time_idempotency_key(schedule: JobSchedule, scheduled_for: datetime) -> str:
    return f"job-schedule:{schedule.id}:time:{_coerce_utc(scheduled_for).isoformat()}"


def _event_idempotency_key(
    schedule: JobSchedule,
    payload: EnqueueEventJobRunsRequest,
    *,
    occurred_at: datetime,
) -> str:
    if payload.event_ref:
        event_token = payload.event_ref
    else:
        serialized = json.dumps(payload.event_payload, sort_keys=True, default=str, separators=(",", ":"))
        event_token = hashlib.sha256(f"{occurred_at.isoformat()}:{serialized}".encode("utf-8")).hexdigest()
    return f"job-schedule:{schedule.id}:event:{payload.event_source}:{payload.event_type}:{event_token}"


def _event_filter_matches(event_filter: dict[str, object], event_payload: dict[str, object]) -> bool:
    for key, expected in event_filter.items():
        actual = _resolve_payload_path(event_payload, key)
        if isinstance(expected, list):
            if actual not in expected:
                return False
        elif actual != expected:
            return False
    return True


def _resolve_payload_path(payload: dict[str, object], key: str) -> object | None:
    current: object = payload
    for part in key.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _count_time_runs(db: Session, schedule_id: int) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(JobRun).where(JobRun.schedule_id == schedule_id, JobRun.trigger_type == "TIME")
        ).scalar_one()
    )


def _zone_for_schedule(schedule: JobSchedule) -> ZoneInfo:
    timezone_name = schedule.timezone or "UTC"
    return _ensure_valid_timezone(timezone_name)


def _ensure_valid_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Unknown timezone '{timezone_name}'") from exc


def _next_daily(start_local: datetime, after_local: datetime, interval: int) -> datetime:
    candidate = start_local
    if candidate <= after_local:
        delta_days = max((after_local.date() - start_local.date()).days, 0)
        jumps = delta_days // interval
        candidate = start_local + timedelta(days=jumps * interval)
        while candidate <= after_local:
            candidate += timedelta(days=interval)
    return candidate


def _next_weekly(
    start_local: datetime,
    after_local: datetime,
    recurrence: JobRecurrence,
    zone: ZoneInfo,
) -> datetime | None:
    weekdays = sorted({WEEKDAY_INDEX[item] for item in (recurrence.by_weekday or [WEEKDAY_CODES[start_local.weekday()]])})
    anchor_week = start_local.date() - timedelta(days=start_local.weekday())
    search_date = max(start_local, after_local + timedelta(microseconds=1)).date()
    for day_offset in range(0, 366 * 10):
        candidate_date = search_date + timedelta(days=day_offset)
        week_index = (candidate_date - anchor_week).days // 7
        if week_index < 0 or week_index % recurrence.interval != 0:
            continue
        if candidate_date.weekday() not in weekdays:
            continue
        candidate = _build_local_datetime(candidate_date, start_local, zone)
        if candidate >= start_local and candidate > after_local:
            return candidate
    return None


def _next_monthly(start_local: datetime, after_local: datetime, months: int, zone: ZoneInfo) -> datetime | None:
    candidate = start_local
    for _ in range(5000):
        if candidate > after_local:
            return candidate
        candidate = _add_months(candidate, months, zone)
    return None


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


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coerce_utc_optional(value: datetime | None) -> datetime | None:
    return _coerce_utc(value) if value is not None else None
