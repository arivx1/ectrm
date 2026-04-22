# EIA Implementation Plan

## Recommended First Decision

Use a separate mapping table instead of extending `reference_price_indices`
directly.

Reason:

- `reference_price_indices` is the internal canonical definition.
- external source mappings are provider-specific integration concerns.
- a separate table keeps the base reference-data model clean when additional
  providers arrive.

Recommended new table:

- `reference_price_index_sources`

## Phase 1 Deliverable

Deliver a manual sync path that can download a fixed set of EIA series and
upsert normalized observations tied to existing price indices.

The first release should include:

- database schema for source mappings, run tracking, and observations
- EIA settings in application config
- provider client and sync service
- manual script entrypoint
- unit tests around parsing and idempotent writes

## Concrete Schema Plan

### 1. `reference_price_index_sources`

Purpose: map one internal price index to one or more external provider series.

Suggested columns:

- `id`
- `price_index_code`
- `provider`
- `dataset_code`
- `series_id`
- `frequency`
- `source_unit`
- `source_currency_code`
- `transform_rule`
- `is_active`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `version`

Constraints:

- foreign key to `reference_price_indices.code`
- unique on `provider`, `series_id`
- unique on `price_index_code`, `provider`

The second unique constraint enforces the v1 rule that a price index maps to at
most one EIA series.

### 2. `external_data_runs`

Suggested columns:

- `id`
- `provider`
- `job_name`
- `status`
- `started_at`
- `finished_at`
- `requested_by`
- `series_count`
- `observation_count`
- `error_summary`
- `created_at`

Status values can begin as plain strings:

- `RUNNING`
- `SUCCEEDED`
- `FAILED`

### 3. `price_index_observations`

Suggested columns:

- `id`
- `price_index_code`
- `observation_date`
- `value`
- `unit_code`
- `currency_code`
- `source_provider`
- `source_series_id`
- `source_frequency`
- `source_published_at`
- `source_revision`
- `downloaded_at`
- `run_id`
- `raw_payload`
- `created_at`
- `updated_at`

Constraints:

- foreign key to `reference_price_indices.code`
- foreign key to `external_data_runs.id`
- unique on `price_index_code`, `observation_date`, `source_provider`,
  `source_series_id`

## Repo Changes

### Models

Add:

- `apps/api/app/models/reference_price_index_source.py`
- `apps/api/app/models/external_data_run.py`
- `apps/api/app/models/price_index_observation.py`

Update:

- `apps/api/app/models/__init__.py`

Keep these models near the existing SQLAlchemy style:

- explicit `mapped_column(...)`
- audit timestamps managed in service code
- string status fields for now

### Services

Add:

- `apps/api/app/domains/reference_data/services/external_data/__init__.py`
- `apps/api/app/domains/reference_data/services/external_data/eia_client.py`
- `apps/api/app/domains/reference_data/services/external_data/eia_mapper.py`
- `apps/api/app/domains/reference_data/services/external_data/eia_sync.py`

Responsibilities:

- `eia_client.py`
  - build requests
  - attach API key
  - validate response envelope
- `eia_mapper.py`
  - convert EIA observations into normalized write payloads
  - parse dates by frequency
  - normalize decimal values
- `eia_sync.py`
  - create run records
  - load active source mappings
  - fetch data per mapping
  - upsert observations
  - finalize run status

### Script

Add:

- `apps/api/scripts/sync_eia_price_data.py`

Behavior:

- default to syncing all active EIA mappings
- optional `--series-id`
- optional `--price-index-code`
- optional `--lookback-days`
- optional `--requested-by`

The script should use the same app config and SQLAlchemy session machinery as
the main API app.

### Config

Update:

- `apps/api/app/config.py`
- `apps/api/.env.example`

Add settings:

- `EIA_API_KEY`
- `EIA_BASE_URL`
- `EIA_TIMEOUT_SECONDS`

Defaults:

- base URL should point to the current EIA API root
- timeout should be conservative, such as 30 seconds

### Migrations

Add one Alembic revision that creates:

- `reference_price_index_sources`
- `external_data_runs`
- `price_index_observations`

If seed data is included in the same delivery, add a second migration for a
small fixed list of `reference_price_index_sources` rows.

## Write Path Design

### Run lifecycle

1. Insert `external_data_runs` with `RUNNING`.
2. Query active `reference_price_index_sources` for provider `EIA`.
3. Fetch series data from EIA.
4. Map source observations into normalized rows.
5. Upsert into `price_index_observations`.
6. Update the run to `SUCCEEDED` or `FAILED`.

### Upsert rule

For the same unique key:

- if the observation does not exist, insert it
- if the observation exists and the incoming value or metadata differs, update
  it and replace `run_id`, `downloaded_at`, `raw_payload`, and revision fields
- if the observation exists and is identical, leave it unchanged

This keeps the table current without creating duplicate revisions in v1.

## Testing Plan

Add tests under a new area such as:

- `apps/api/tests/reference_data/test_eia_mapper.py`
- `apps/api/tests/reference_data/test_eia_sync.py`

Test cases:

- mapping a valid EIA response into one normalized observation
- parsing daily and weekly date formats if both are supported
- rejecting missing series identifiers or malformed observations
- creating a run row and marking success
- marking failure when the client raises
- idempotent upsert on repeated sync
- updating an existing observation when EIA revises a value

If the repo does not yet have a backend test harness, add the smallest useful
pytest setup rather than building a broad framework first.

## File Order

Implement in this order:

1. models
2. Alembic migration
3. config
4. EIA client
5. mapper
6. sync service
7. script
8. tests

This order keeps the database contract stable before service code depends on it.

## Explicit Deferrals

Do not include these in the first pass:

- admin endpoints
- UI for run history
- scheduling/orchestration
- multiple providers
- historical revision ledger for the same observation date

## First Coding Task

The first coding task should be:

Create the three SQLAlchemy models and the Alembic migration for
`reference_price_index_sources`, `external_data_runs`, and
`price_index_observations`.

That is the best next code step because every later service and script decision
depends on those table contracts.
