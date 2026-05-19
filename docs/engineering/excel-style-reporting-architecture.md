# Excel-Style Reporting Architecture

## Purpose

This document defines the first architecture pass for building Excel-style
reports in ECTRM. The goal is to support workbook-like analysis and reporting
while preserving the platform's event-led, projection-backed, audit-sensitive
operating model.

The architecture should support both:

- standalone workbooks with manual input sheets and formulas
- system-backed workbooks that consume curated platform datasets, existing
  reports, or prior workbook/report runs

This is a planning document only. It does not implement the runtime, database
schema, frontend builder, or export engine.

## Current State

ECTRM already has useful reporting primitives:

- typed report services under `apps/api/app/domains/reports/services`
- report HTTP routes under `apps/api/app/domains/reports/routes/http.py`
- Pydantic report response models in `apps/api/app/schemas/report.py`
- saved settlement report filter presets through `report_presets`
- a React Reports workspace under `apps/web/src/workspaces/reports`
- user-extensibility guidance that already names `report_definitions` and
  `formula_definitions` as future metadata objects

The current model is service-first: each report is a typed Python function that
returns a shaped response. That should remain the source of trusted report
values while workbook-style authoring is introduced around it.

## Non-Goals

- no arbitrary SQL report builder in v1
- no unrestricted user-authored code execution
- no direct editing of projection tables such as `trades` or `positions`
- no Excel macro support
- no formulas that call external services in the first phase
- no direct model-generated mutation of business records
- no official financial reporting publication before run immutability,
  permissions, lineage, and approval rules are in place

## Design Principles

### Reports Are Surfaces, Not Domains Of Truth

Reports can assemble, summarize, and export governed values. Durable business
rules still belong in the owning domain services, policies, projections, or
approved formula definitions.

### Curated Datasets Come Before Builders

Workbook authors should choose from approved semantic datasets and existing
typed reports. They should not browse raw tables or write arbitrary joins.

### Formulas Are Deterministic Product Logic

Formulas must be typed, side-effect free, replayable, inspectable, and built
from approved fields, cells, ranges, and helper functions. If a formula becomes
control-critical, it should graduate into a domain service, projection, or core
schema field.

### Runs Are Immutable Evidence

A report or workbook definition is reusable metadata. A report or workbook run
is immutable evidence: it pins the definition version, inputs, parameters,
source freshness, calculated values, warnings, and artifacts.

### Lineage Must Be First-Class

The platform should be able to answer which source records, report outputs,
prior runs, formulas, and parameters produced a visible value.

### Excel-Like Does Not Mean Rule-Free

The user experience can feel familiar to spreadsheet users, but reads and
writes must still honor typed services, permissions, validation, stale-state
checks, and audit.

## Core Concepts

| Concept | Purpose |
| --- | --- |
| Semantic dataset | Approved tabular source exposed to reports and workbooks. |
| Report definition | Reusable tabular or pivot-style report metadata over one or more curated datasets. |
| Workbook definition | Versioned workbook metadata containing sheets, parameters, formulas, and export settings. |
| Sheet definition | One worksheet inside a workbook. It may be manual, dataset-backed, report-backed, run-backed, or formula-backed. |
| Formula definition | Parsed, typed expression with dependency metadata and validation state. |
| Report run | Immutable execution of one report definition with pinned inputs and output rows. |
| Workbook run | Immutable execution of one workbook definition with pinned sheets, cells, lineage, warnings, and artifacts. |
| Artifact | Generated JSON, CSV, XLSX, or PDF-like output tied to a run. |
| Dependency edge | Explicit graph edge from a report/workbook/sheet/formula to its input dataset, report, workbook run, or source field. |

## Target Backend Shape

The reporting domain should grow a workbook sub-layer around the existing typed
report services.

```text
apps/api/app/domains/reports/
  models/
  routes/
    http.py
    workbook_http.py
  schemas/
    report_definition.py
    workbook.py
    formula.py
  services/
    semantic_datasets.py
    report_definitions.py
    workbook_definitions.py
    workbook_runtime.py
    formula_parser.py
    formula_validator.py
    formula_evaluator.py
    report_artifacts.py
```

Physical SQLAlchemy models can continue living under `apps/api/app/models`
until the repo's model layout is migrated more fully into domain packages.

## Metadata Objects

### `semantic_dataset_definitions`

Defines approved data sources for reports and workbook sheets.

Recommended fields:

- `dataset_id`
- `name`
- `description`
- `owning_domain`
- `source_kind`: `projection`, `reference_data`, `report_service`,
  `external_series`, or `manual`
- `field_schema_json`
- `default_sort_json`
- `freshness_policy_json`
- `access_policy_key`
- `status`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Initial datasets should be backed by existing typed services and projections:

- current trades
- current positions
- active reference books, commodities, counterparties, portfolios, currencies,
  units, and price indices
- PnL history output
- PnL comparison output
- settlement aging output
- cash forecast output
- settlement exceptions output
- trading EOD output

### `report_definitions`

Defines reusable reports over approved datasets.

Recommended fields:

- `report_key`
- `name`
- `description`
- `scope`: `personal`, `team`, or `global`
- `owner_user_id`
- `dataset_id`
- `parameter_schema_json`
- `filter_json`
- `columns_json`
- `grouping_json`
- `sort_json`
- `formatting_json`
- `export_options_json`
- `status`: `draft`, `published`, or `retired`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

### `workbook_definitions`

Defines a reusable workbook shell.

Recommended fields:

- `workbook_key`
- `name`
- `description`
- `scope`: `personal`, `team`, or `global`
- `owner_user_id`
- `parameter_schema_json`
- `default_parameter_values_json`
- `export_options_json`
- `status`: `draft`, `published`, or `retired`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

### `workbook_sheet_definitions`

Defines each sheet inside a workbook.

Recommended fields:

- `workbook_definition_id`
- `sheet_key`
- `sheet_name`
- `sheet_kind`: `manual`, `dataset`, `report`, `workbook_run`, or `formula`
- `source_ref_json`
- `layout_json`
- `cell_values_json`
- `named_ranges_json`
- `column_schema_json`
- `formatting_json`
- `depends_on_json`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Sheet kinds:

- `manual`: standalone user-entered grid values; useful for ad hoc assumptions
  and offline-style workbooks.
- `dataset`: materialized from an approved semantic dataset.
- `report`: materialized from a typed report definition or existing report
  service output.
- `workbook_run`: materialized from a prior immutable workbook run.
- `formula`: calculated cells or tables that reference other sheets, ranges,
  report outputs, or parameters.

### `formula_definitions`

Stores parsed expressions and validation metadata. A formula may belong to a
report column, workbook cell, named range, or calculated table.

Recommended fields:

- `formula_key`
- `owner_kind`: `report_column`, `workbook_cell`, `named_range`, or
  `calculated_table`
- `owner_ref`
- `expression`
- `parsed_ast_json`
- `output_type`
- `dependency_json`
- `validation_status`
- `validation_errors_json`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

### `report_runs` And `workbook_runs`

Persist immutable execution snapshots.

Recommended fields:

- `run_id`
- `definition_kind`: `report` or `workbook`
- `definition_key`
- `definition_version`
- `requested_by`
- `requested_at`
- `parameter_values_json`
- `input_snapshot_json`
- `output_snapshot_json`
- `dependency_graph_json`
- `freshness_json`
- `warning_json`
- `status`: `succeeded`, `failed`, or `superseded`
- `created_at`

For large outputs, use companion row/cell tables or blob/object storage later.
The first implementation can keep bounded snapshots in JSON while tests enforce
size limits.

### `report_run_artifacts`

Tracks generated outputs.

Recommended fields:

- `artifact_id`
- `run_id`
- `artifact_kind`: `json`, `csv`, `xlsx`
- `content_type`
- `storage_ref`
- `checksum`
- `created_at`
- `created_by`

### `report_dependency_edges`

Stores inspectable lineage.

Recommended fields:

- `edge_id`
- `from_kind`
- `from_ref`
- `to_kind`
- `to_ref`
- `field_ref`
- `dependency_role`: `source`, `lookup`, `formula_input`, `parameter`, or
  `prior_run`
- `created_at`

## Formula Model

### Supported V1 Formula Shape

Start with a small, deterministic subset:

- arithmetic: `+`, `-`, `*`, `/`, parentheses
- comparisons: `=`, `<>`, `<`, `<=`, `>`, `>=`
- boolean functions: `AND`, `OR`, `NOT`
- conditional: `IF`
- aggregates: `SUM`, `MIN`, `MAX`, `AVERAGE`, `COUNT`, `COUNTBLANK`
- numeric helpers: `ABS`, `ROUND`
- null helper: `COALESCE`
- cross-sheet references: `Sheet1!A1`, `Sheet1!A1:B20`
- named ranges
- structured table references for dataset/report-backed sheets

### Explicitly Unsupported In V1

- macros
- arbitrary Python, JavaScript, SQL, or shell execution
- external HTTP calls
- volatile functions such as `RAND` and `NOW` as formula logic
- circular references
- formulas that mutate business records
- formulas that change row-level access outcomes
- formulas over raw tables outside approved semantic datasets

### Validation Requirements

Formula validation must cover:

- parse success
- known functions only
- type compatibility
- output type
- dependency extraction
- dependency-cycle detection
- source dataset and field permissions
- bounded range sizes
- unsupported function reporting
- stable replay with the same inputs

## Runtime Flow

1. Resolve the report or workbook definition and version.
2. Authenticate the actor and check report/workbook access.
3. Validate parameter values against the definition schema.
4. Resolve all sheet sources and dependency edges.
5. Load dataset and report inputs through typed adapters.
6. Load prior run inputs only through immutable run IDs or approved "latest
   published run" pointers.
7. Build a dependency graph across sheets, cells, ranges, and report inputs.
8. Reject cycles, missing inputs, unsupported formulas, or unauthorized fields.
9. Evaluate sheets in dependency order.
10. Record output snapshots, freshness, warnings, and lineage.
11. Generate requested artifacts.
12. Return a typed run summary to the UI.

## Input Patterns

### Standalone Workbook

A standalone workbook uses manual sheets and formula sheets only. It is useful
for what-if analysis, desk calculators, and temporary assumptions. It can be
saved and rerun, but it is not business truth.

Manual sheets should store values with cell coordinates, typed values, display
formatting, and optional named ranges. They should not mutate business records.

### System-Backed Workbook

A system-backed workbook can consume approved datasets and existing report
services. Each dataset adapter should return:

- typed columns
- rows
- source freshness
- row-level access metadata
- source record references where practical
- warnings for partial coverage

### Workbook Consuming Other Reports

When a workbook consumes another report, it should reference either:

- a report definition plus parameter values, evaluated during the current run,
  or
- an immutable `report_run_id`

Official or shared packs should prefer immutable run IDs where reproducibility
matters.

### Workbook Consuming Other Workbooks

When a workbook consumes another workbook, it should reference a specific
`workbook_run_id` unless the user explicitly chooses a governed latest-published
pointer. The run output becomes an input snapshot with lineage back to the
source run.

### Uploaded Excel Or CSV Input

Imported files should land as draft manual sheets or candidate workbook
definitions. Native formulas can be preserved as text first, then translated
only if they fit the supported formula subset.

Unsupported formulas should remain visible but unevaluated with validation
errors. The platform should not silently evaluate unsupported spreadsheet logic.

## API Surface

Suggested future endpoints:

```text
GET    /reports/datasets
GET    /reports/datasets/{dataset_id}/schema

GET    /reports/definitions
POST   /reports/definitions
GET    /reports/definitions/{report_key}
PUT    /reports/definitions/{report_key}
POST   /reports/definitions/{report_key}/publish
POST   /reports/definitions/{report_key}/retire
POST   /reports/definitions/{report_key}/run

GET    /reports/workbooks
POST   /reports/workbooks
GET    /reports/workbooks/{workbook_key}
PUT    /reports/workbooks/{workbook_key}
POST   /reports/workbooks/{workbook_key}/validate
POST   /reports/workbooks/{workbook_key}/publish
POST   /reports/workbooks/{workbook_key}/retire
POST   /reports/workbooks/{workbook_key}/run

GET    /reports/runs/{run_id}
GET    /reports/runs/{run_id}/lineage
POST   /reports/runs/{run_id}/artifacts
GET    /reports/runs/{run_id}/artifacts/{artifact_id}
```

Assistant-created report/workbook drafts should still flow through typed
definition routes or approval-gated action requests when shared publication is
involved.

## Frontend Surface

The first UI should extend the Reports workspace rather than introduce a
separate product island.

Recommended components:

- report/workbook definition list
- parameter panel
- sheet tabs
- dense grid/table renderer
- formula bar
- named range inspector
- validation and warning panel
- lineage inspector
- artifact/export controls
- draft/publish/retire controls for authorized users

The initial builder should feel familiar to spreadsheet users, but it should
surface platform concepts clearly: source dataset, run freshness, definition
version, validation state, and lineage.

## Assistant Role

Agents may help with:

- drafting a report or workbook definition
- suggesting formulas
- explaining lineage and freshness
- summarizing a completed run
- preparing an internal report narrative from sourced outputs

Agents must not:

- become the source of trusted formula values
- publish shared reports without governed permission
- bypass formula validation
- mutate business records through workbook cells
- claim a report was executed or published unless the typed service reports
  that state

Repeated accepted agent-authored formulas should enter the deterministic
algorithm loop and become governed formula definitions or domain services.

## First Vertical Slice

Build a "Settlement Pack" workbook after the documentation pass:

1. Sheet: settlement aging output from the existing report service.
2. Sheet: cash forecast output from the existing report service.
3. Sheet: settlement exceptions output from the existing report service.
4. Sheet: summary formulas that reference the first three sheets.
5. Output: immutable workbook run with JSON snapshot and CSV/XLSX export.
6. Lineage: dependencies back to the three source reports and requested
   parameters.

This slice exercises system data inputs, existing reports as inputs,
cross-sheet formulas, artifact generation, permissions, freshness, and lineage
without opening arbitrary SQL or broad spreadsheet import.

## Delivery Phases

### Phase 0: Documentation And Contract Alignment

- add this architecture note
- update the user-extensibility initiative to point here for reporting formulas
- capture the reporting/workbook autonomy boundary in the knowledge base
- decide whether shared report publication needs an action request or direct
  admin permission path

### Phase 1: Semantic Dataset Registry

- define dataset contracts for current trades, positions, reference data, and
  existing report outputs
- expose schema and freshness metadata
- add row-level access assumptions even if the first implementation uses broad
  authenticated access

### Phase 2: Report And Workbook Definitions

- add draft/published/retired lifecycle
- add versioning and audit metadata
- validate sheet source references and parameters
- keep personal definitions self-serve; gate shared/global publication

### Phase 3: Formula Validation And Evaluation

- implement the formula parser and AST
- validate allowed functions, types, dependencies, and cycles
- evaluate formulas over manual sheets, dataset sheets, and report sheets
- add focused tests for formula behavior and replay

### Phase 4: Immutable Runs And Artifacts

- persist report/workbook runs
- persist dependency graphs and freshness warnings
- generate JSON and CSV first, XLSX next
- expose run lineage and artifact retrieval

### Phase 5: Builder UI

- add workbook definition list and sheet grid preview
- add formula bar and validation feedback
- add run history, lineage, and export controls
- add publish/retire controls for authorized users

### Phase 6: Assistant And Scheduling

- let agents draft report/workbook definitions without direct publication
- add report-generation evals for source links and freshness labels
- consider scheduled runs only after immutable manual runs are stable

## Verification Strategy

Docs-only changes should check links and formatting.

Implementation phases should add:

- backend service tests for dataset contracts, definition validation, formula
  parsing, cycle detection, runtime evaluation, and run immutability
- API tests for permissions, validation errors, and artifact retrieval
- frontend tests for builder state, validation feedback, and export actions
- assistant evals if agents can draft or stage report/workbook definitions
- browser smoke coverage once the builder becomes a primary workflow

## Open Decisions

- Should shared/global report publication use admin-only direct actions or the
  assistant action-request review contract?
- Which row-level access model should semantic datasets enforce first?
- Should XLSX files be stored as generated artifacts only, or can imported XLSX
  workbooks become long-lived draft workbook definitions?
- What size limits should apply to manual sheets, report outputs, and run
  snapshots?
- Which formula functions are necessary for the first real user workflow beyond
  the settlement pack?
- When should a widely used formula be promoted from metadata into a domain
  service or projection?
