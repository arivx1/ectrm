from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.job_scheduling.schemas import (
    DeterministicJobCatalogEntryOut,
    EnqueueEventJobRunsRequest,
    JobRunBatchOut,
    JobRunOut,
    JobRunStatusUpdate,
    JobScheduleCreate,
    JobScheduleOut,
    JobScheduleUpdate,
    MaterializeDueJobRunsRequest,
)
from apps.api.app.domains.job_scheduling.services import (
    create_job_schedule,
    enqueue_event_runs,
    get_job_schedule,
    list_deterministic_job_catalog,
    list_job_runs,
    list_job_schedules,
    materialize_due_time_runs,
    to_job_run_out,
    to_job_schedule_out,
    update_job_run_status,
    update_job_schedule,
)

router = APIRouter(prefix="/admin/job-scheduling", tags=["job-scheduling-admin"])


@router.get("/catalog/deterministic-jobs", response_model=list[DeterministicJobCatalogEntryOut])
def get_deterministic_job_catalog() -> list[DeterministicJobCatalogEntryOut]:
    return list_deterministic_job_catalog()


@router.get("/schedules", response_model=list[JobScheduleOut])
def get_job_schedules(
    status: str | None = Query(default=None),
    trigger_type: str | None = Query(default=None),
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[JobScheduleOut]:
    normalized_status = status.strip().upper() if status else None
    normalized_trigger = trigger_type.strip().upper() if trigger_type else None
    return [
        to_job_schedule_out(record)
        for record in list_job_schedules(
            db,
            status=normalized_status,
            trigger_type=normalized_trigger,
            limit=limit,
            offset=offset,
        )
    ]


@router.post("/schedules", response_model=JobScheduleOut, status_code=status.HTTP_201_CREATED)
def post_job_schedule(
    payload: JobScheduleCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> JobScheduleOut:
    try:
        record = create_job_schedule(db, payload=payload, actor_id=_actor_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_job_schedule_out(record)


@router.get("/schedules/{schedule_id}", response_model=JobScheduleOut)
def get_job_schedule_by_id(schedule_id: int, db: Session = Depends(get_db)) -> JobScheduleOut:
    record = get_job_schedule(db, schedule_id=schedule_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job schedule not found")
    return to_job_schedule_out(record)


@router.patch("/schedules/{schedule_id}", response_model=JobScheduleOut)
def patch_job_schedule(
    schedule_id: int,
    payload: JobScheduleUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> JobScheduleOut:
    try:
        record = update_job_schedule(
            db,
            schedule_id=schedule_id,
            payload=payload,
            actor_id=_actor_id(request),
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_job_schedule_out(record)


@router.post("/runs/materialize-due", response_model=JobRunBatchOut)
def post_materialize_due_job_runs(
    payload: MaterializeDueJobRunsRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JobRunBatchOut:
    runs = materialize_due_time_runs(
        db,
        as_of=payload.as_of or datetime.now(timezone.utc),
        limit=payload.limit,
        actor_id=_actor_id(request),
    )
    return JobRunBatchOut(count=len(runs), items=[to_job_run_out(record) for record in runs])


@router.post("/runs/enqueue-event", response_model=JobRunBatchOut)
def post_enqueue_event_job_runs(
    payload: EnqueueEventJobRunsRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JobRunBatchOut:
    runs = enqueue_event_runs(db, payload=payload, actor_id=_actor_id(request))
    return JobRunBatchOut(count=len(runs), items=[to_job_run_out(record) for record in runs])


@router.get("/runs", response_model=list[JobRunOut])
def get_job_runs(
    schedule_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[JobRunOut]:
    normalized_status = status.strip().upper() if status else None
    return [
        to_job_run_out(record)
        for record in list_job_runs(
            db,
            schedule_id=schedule_id,
            status=normalized_status,
            limit=limit,
            offset=offset,
        )
    ]


@router.patch("/runs/{run_id}/status", response_model=JobRunOut)
def patch_job_run_status(
    run_id: int,
    payload: JobRunStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> JobRunOut:
    try:
        record = update_job_run_status(
            db,
            run_id=run_id,
            status=payload.status,
            actor_id=_actor_id(request),
            result=payload.result,
            action_request_ids=payload.action_request_ids,
            error_detail=payload.error_detail,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_job_run_out(record)


def _actor_id(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return str(actor_id)
