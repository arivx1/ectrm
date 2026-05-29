# Job Scheduling Architecture

## Purpose

Job scheduling gives ECTRM a governed way to turn time-based and event-based
triggers into durable job run intents. A schedule can describe deterministic
work, agentic work, or a hybrid flow, but the scheduler itself is only a
control-plane primitive. Business writes still have to flow through typed
domain services, deterministic policies, assistant action requests, and audit.

## Current Slice

The first implementation lives in:

- `apps/api/app/domains/job_scheduling`
- `apps/api/app/models/job_schedule.py`
- `apps/api/alembic/versions/o6p7q8r9s0t1_create_job_scheduling_tables.py`
- `apps/web/src/workspaces/admin/JobSchedulingPanel.tsx`
- `apps/web/src/entities/app/adminApi.ts`

Admin APIs are exposed under `/admin/job-scheduling`:

- `GET /catalog/deterministic-jobs`
- `POST /schedules`
- `GET /schedules`
- `GET /schedules/{schedule_id}`
- `PATCH /schedules/{schedule_id}`
- `POST /runs/materialize-due`
- `POST /runs/enqueue-event`
- `GET /runs`
- `PATCH /runs/{run_id}/status`

This slice persists schedules and materializes queued runs. It does not include
a long-running daemon, execution-node leasing, or autonomous business
execution.

The Admin Console exposes the schedule creation and run visibility surface in
the `Job Scheduling` panel. Admins can create time or event driven schedules,
choose deterministic, agentic, or hybrid execution plans, pause/resume/archive
schedules, materialize due time triggers, and enqueue a matching event for
event-driven schedules.

## Record Model

`job_schedules` owns the durable definition:

- trigger type: `TIME` or `EVENT`
- time trigger: start time, timezone, optional recurrence
- event trigger: source, type, and a small exact-match filter
- execution mode: `DETERMINISTIC`, `AGENTIC`, or `HYBRID`
- deterministic task key from the scheduler catalog
- active assistant agent when agentic work is involved
- allowed staged action types and maximum scheduler authority
- next and last run timestamps

`job_runs` owns each materialized intent:

- source schedule and schedule version
- trigger evidence and idempotency key
- copied execution plan at enqueue time
- queue/run status and attempt count
- result, error, and action-request references reported by a future runner

Runs copy the execution plan so later schedule edits do not silently change the
contract of an already queued run.

## Trigger Semantics

Time-driven schedules support one-time runs or daily, weekly, monthly, and
yearly recurrence. `materialize-due` can be called by a cron, worker, or future
execution-node supervisor and creates idempotent queued runs for due
occurrences.

Event-driven schedules are materialized by `enqueue-event`. The caller supplies
an event source, event type, optional event ref, occurrence time, and event
payload. The scheduler matches active event schedules by exact source/type and
then applies a small exact-match filter over payload fields. Event refs become
part of the idempotency key so replay is safe.

## Execution Modes

Deterministic schedules require a cataloged `deterministic_task_key`.
The current catalog is intentionally small:

- `external_data_sync`
- `projection_rebuild`
- `trading_eod_readiness`
- `control_tower_digest`
- `document_reprocessing_scan`

Agentic schedules require an active managed agent. Hybrid schedules require
both a deterministic task key and an active managed agent. This lets the
platform represent "run a deterministic scan, then ask an agent to explain or
stage follow-up" without letting freeform model output mutate records.

## Authority Rules

The scheduler supports `OBSERVE`, `EXPLAIN`, `DRAFT`, and `STAGE` authority.
It does not grant bounded execution or external commitment authority. If a
schedule may stage actions, `allowed_action_types` must name published
assistant action catalog entries and `max_authority` must be `STAGE`.

Scheduled jobs that change business state must still:

- execute through typed deterministic services
- preserve stale-state and idempotency evidence
- create or execute governed action requests when agentic mutation is involved
- keep reviewer visibility, manual fallback, and audit

## Future Work

The next slices should connect this control-plane primitive to the execution
node platform:

1. Add a runner/lease contract that can claim queued `job_runs`.
2. Map each deterministic catalog key to one typed executor.
3. Add an agentic runner that calls the governed assistant runtime and persists
   run traces plus staged action-request IDs.
4. Extend the admin UX with retry and failure triage after runner leasing is in
   place.
5. Promote any bounded execution only after evals, policy checks, failure
   monitoring, and human owner approval.
