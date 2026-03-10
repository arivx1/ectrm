# EIA Data Download Spec

## Purpose

Define the first implementation slice for downloading market data from the U.S.
Energy Information Administration (EIA) into the ECTRM platform.

This spec is intentionally narrow. It starts with one external source, one
ingestion pattern, and a small set of downstream expectations so the project can
establish a durable external-data workflow before adding more providers.

## Problem Statement

The platform already models reference price indices, but it does not yet have a
repeatable way to fetch external benchmark data and load it into application
storage. Without that capability:

- reference price indices remain static metadata
- reports and valuation workflows cannot rely on current benchmark values
- every future data source will force a one-off ingestion design

The first target is EIA because it is public, stable, and relevant for U.S.
energy markets.

## Goals

- Establish a standard ingestion workflow for external market data.
- Support scheduled and ad hoc downloads from EIA.
- Preserve source lineage so operators can trace every stored value back to an
  EIA series and download run.
- Keep provider-specific logic isolated so other market-data adapters can follow
  the same pattern later.
- Reuse the existing reference-data model where possible, especially
  `reference_price_indices`.

## Non-Goals

- Full market-data normalization across all providers.
- Intraday or streaming data ingestion.
- User-facing charting or analytics UX.
- Automatic backfill for every historical EIA series on day one.
- A generalized orchestration platform.

## Initial Scope

The first release should support:

1. Downloading a curated set of EIA time series through the EIA API.
2. Mapping each EIA series to an internal price index code.
3. Storing raw download metadata and normalized observations.
4. Running manually from a script first, with a clean path to scheduled runs.

Recommended first dataset shape:

- daily or weekly petroleum series
- series with clear units and publication cadence
- benchmarks that can map cleanly to an internal commodity, unit, and currency

Examples of likely candidates:

- U.S. retail diesel prices
- U.S. regular gasoline prices
- WTI-linked published series if available through EIA in a usable cadence

The exact first series list should be configured in code, not discovered
dynamically at runtime.

## Core Assumptions

- EIA access will require an API key stored in application configuration.
- EIA responses are authoritative for source values but may be revised after
  publication.
- A single internal price index may map to exactly one external EIA series in
  the first version.
- The current backend stack remains FastAPI + SQLAlchemy + Alembic + PostgreSQL.

## Functional Requirements

### 1. Source configuration

The system must define a registry of supported EIA series with:

- internal `price_index_code`
- external `eia_series_id`
- expected frequency
- source unit
- optional transform rules
- activation flag

This registry can begin as code or seed data. It does not need an admin UI in
the first iteration.

### 2. Download execution

The system must support a download command that:

- accepts one or more configured series
- fetches observations from EIA
- supports full backfill and incremental refresh modes
- records run start, finish, status, and error details

The first implementation can be a script under `apps/api/scripts`.

### 3. Normalization

Downloaded observations must be normalized into a common shape:

- `price_index_code`
- `observation_date`
- `value`
- `unit_code`
- `currency_code` when applicable
- `source_published_at` when available
- `source_revision_id` or equivalent version marker when available
- `as_of_downloaded_at`

Normalization rules must be explicit. If a series requires unit conversion, the
conversion rule must be defined in code and covered by tests.

### 4. Persistence

The platform must persist:

- ingestion run metadata
- raw source payloads or raw observation fragments sufficient for audit/debug
- normalized market data observations

Writes must be idempotent for the same source series and observation date.

### 5. Traceability

Operators and developers must be able to answer:

- which EIA series produced this stored value
- when it was downloaded
- whether it replaced an earlier value
- which run failed and why

## Proposed Data Model

Add two new tables first.

### `external_data_runs`

Purpose: track each ingestion attempt.

Suggested fields:

- `id`
- `provider` (`EIA`)
- `job_name`
- `status`
- `started_at`
- `finished_at`
- `requested_by`
- `series_count`
- `observation_count`
- `error_summary`
- `created_at`

### `price_index_observations`

Purpose: store normalized time-series values for internal price indices.

Suggested fields:

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

- unique on `price_index_code`, `observation_date`, and `source_series_id`
- foreign key from `price_index_code` to `reference_price_indices.code`
- foreign key from `run_id` to `external_data_runs.id`

## Integration With Existing Reference Data

`reference_price_indices` already captures the metadata needed to define a
benchmark series. The EIA download flow should treat that table as the canonical
internal index registry, not create a parallel concept.

Recommended additions to price-index metadata, either on the existing table or a
new mapping table:

- `source_provider`
- `source_series_id`
- `source_frequency`
- `source_dataset`

If provider-specific mapping fields feel too narrow for the base table, add a
new mapping table such as `reference_price_index_sources`.

## Application Design

Place implementation under a new service area such as:

```text
apps/api/app/domains/reference_data/
  services/
    external_data/
      eia_client.py
      eia_mapper.py
      eia_sync.py
```

Responsibilities:

- `eia_client.py`: HTTP client and response parsing
- `eia_mapper.py`: map EIA payloads to internal observation records
- `eia_sync.py`: orchestration, idempotent upsert behavior, and run tracking

The HTTP client should be provider-specific. The orchestration pattern should be
generic enough that other providers can follow it later.

## Execution Flow

1. Create an ingestion run record with `status = running`.
2. Load configured active EIA mappings.
3. For each mapping, request data from EIA.
4. Validate the payload shape and required fields.
5. Normalize observations into internal records.
6. Upsert normalized observations.
7. Store raw payload metadata needed for audit/debug.
8. Mark the run `succeeded` or `failed`.

Failure policy for v1:

- fail one series without aborting the whole run only if run metadata captures
  per-series errors
- otherwise fail the run fast and keep the behavior simple

The simpler choice is acceptable for the first implementation.

## Configuration

Add application settings for:

- `EIA_API_KEY`
- `EIA_BASE_URL`
- `EIA_TIMEOUT_SECONDS`

Optional later settings:

- default lookback window
- retry count
- schedule enablement flag

## API and Operator Surface

No end-user API is required in the first slice beyond the script or internal
service entrypoint.

Useful near-term additions after the script works:

- `POST /admin/external-data/eia/sync`
- `GET /admin/external-data/runs`
- `GET /admin/external-data/runs/{id}`

## Testing Requirements

Add tests for:

- EIA response parsing
- mapping from EIA series to `price_index_code`
- idempotent upsert behavior
- handling revised values for an existing observation date
- configuration validation when API key or mappings are missing

Avoid tests that depend on live EIA connectivity.

## Open Questions

- Which exact EIA dataset and series IDs should be the first supported set?
- Should price observations be stored only as normalized rows, or also as raw
  JSON blobs per run and series?
- Do revised EIA values overwrite prior observations, or do we preserve value
  history per observation date?
- Should external-series mapping live on `reference_price_indices` or in a
  separate source-mapping table?
- Does the first run need scheduling, or is a manual script sufficient?

## Recommended Phase Plan

### Phase 1: Thin vertical slice

- add config for EIA API access
- add source mapping for a small fixed list of series
- add run tracking table
- add normalized observation table
- add manual sync script
- cover parser and upsert logic with tests

### Phase 2: Admin visibility

- expose run history and latest status through admin endpoints
- expose latest observation lookup by price index
- add better error reporting and per-series run details

### Phase 3: Scheduling and expansion

- add scheduled execution
- support more EIA series families
- establish the provider adapter pattern for additional external sources

## Immediate Next Step

Before implementation, choose the first 3-5 EIA series IDs and confirm whether
the system should introduce a dedicated `reference_price_index_sources` mapping
table or extend `reference_price_indices` directly.
