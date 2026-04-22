# User Extensibility Initiative

## Purpose

ECTRM should let users shape how they work without needing engineering changes
for every dashboard, view, report, or low-risk data attribute.

That does not mean "make everything editable." The product is event-led,
projection-backed, and audit-sensitive. Extensibility should make the platform
more adaptable while preserving validation, explainability, and operational
control.

This document defines the principles, guardrails, and delivery path for doing
that in a repo-native way.

## Problem Statement

Today many choices are still code-owned:

- workspace labels and navigation structure
- dashboard and workspace layout composition
- visible columns and saved operating views
- report shape and derived metrics
- customer-specific low-risk fields
- fast multi-record editing patterns

Users already want capabilities such as:

- drag-and-drop tiles
- renaming views
- adding reports
- adding new columns
- adding calculated columns
- updating data in an Excel-like way

If we implement those ad hoc, we will either:

- keep hardcoding every variation, or
- drift into unsafe "editable everything" behavior that breaks the event and
  reference-data model

## North Star

Users can configure presentation, shared operating views, reporting, and
selected low-risk domain extensions through governed metadata.

Core business invariants remain protected:

- events stay the write history
- projections stay derived read models
- reference data stays authoritative for controlled vocabularies
- permissions, validation, and audit stay in the application service layer

## Principles

### 1. Preserve the source of truth

- Events, reference data, and core relational models stay authoritative.
- Users never edit projections directly.
- "Excel-like" UX must still execute through normal validated write paths.

### 2. Separate presentation extensibility from data-model extensibility

- Moving a tile is not the same as adding a trade attribute.
- Renaming a view is not the same as changing a route or API contract.
- A calculated column is not the same as a schema field.

### 3. Prefer the smallest viable extension surface

Use the least invasive mechanism that solves the request:

1. personal preference
2. shared view/layout
3. report definition
4. formula definition
5. custom field definition
6. core schema change

### 4. Use governed metadata, not scattered hardcoding

Extensibility objects should be first-class metadata with:

- clear type
- owner
- scope
- status
- version
- audit fields

This aligns with the repo direction already described for layout, view, report,
formula, and custom-field definitions.

### 5. Do not replace core relational design with generic EAV

Customizability is necessary. Schema chaos is not.

- Core, analytics-critical, control-critical, and integration-critical fields
  still deserve real schema.
- Custom fields are for lower-risk, additive variation.
- Extensibility should reduce hardcoding without erasing domain structure.

### 6. All writes go through typed application services

The same rule should hold for:

- forms
- grid edits
- imports
- assistant actions
- bulk update tools

If a write bypasses validation, permissioning, version checks, or audit
capture, it is not an acceptable extensibility path.

### 7. Shared change requires governance

- Personal customization can be self-serve.
- Team and org-wide definitions need ownership and publish controls.
- Sensitive bulk edits should support maker-checker review later.

### 8. Explainability is part of the feature

The platform should be able to answer:

- who defined this view or formula
- which version is active
- which source fields feed this report column
- why a bulk edit changed a given row

### 9. Reversible beats magical

Every extensibility object should support a controlled lifecycle:

- draft
- published
- retired
- restored or reset to default where appropriate

### 10. Promote proven customizations into the core model

If a user-defined field or formula becomes:

- cross-workspace
- required for validation
- needed for pricing, risk, settlement, or compliance
- part of official reporting or integrations

it should graduate into engineering-owned schema and services.

## Extensibility Layers

### 1. Personal Preferences

Scope: one user

Examples:

- tile order and size
- column order, pinning, and width
- saved filters and sorts
- default tabs
- local display aliases

Recommended primitive:

- `layout_definitions`
- `view_preferences`

Rules:

- safe for self-service
- resettable without migration work
- should not affect other users unless explicitly shared

### 2. Shared Operating Views

Scope: team or organization

Examples:

- named dashboard views
- shared table layouts
- saved filters for a desk or operations group
- business-language aliases for product views

Recommended primitive:

- `view_definitions`
- published `layout_definitions`

Rules:

- canonical internal ids stay stable
- renaming is an alias/display-name layer, not a rewrite of route keys
- every shared definition needs owner, status, and version

### 3. Reports and Derived Analytics

Scope: team or organization

Examples:

- custom reports
- calculated columns
- derived KPIs
- scheduled export definitions later

Recommended primitive:

- `report_definitions`
- `formula_definitions`

Rules:

- build on approved semantic fields, not arbitrary SQL in v1
- formulas must be deterministic, typed, and side-effect free
- row-level access still applies
- report lineage must be inspectable

### 4. Low-Risk Data Model Extensions

Scope: organization

Examples:

- customer-specific optional attributes
- extra reference-data descriptors
- enrichment fields that do not change core trade semantics

Recommended primitive:

- `custom_field_definitions`
- extension tables or constrained metadata JSON

Rules:

- additive and nullable by default
- typed: text, number, boolean, date, enum, or approved reference
- deliberately indexed only when needed
- not the first home for lifecycle fields, keys, or control logic

### 5. Governed Bulk Editing

Scope: permitted users

Examples:

- updating many reference records in one grid
- mass-assignment of portfolio or counterparty
- correcting non-critical attributes in batch

Recommended primitive:

- bulk edit drafts or jobs that emit normal write commands or events

Rules:

- preview before apply
- validate every row and cell
- check for concurrency and version conflicts
- capture actor, timestamp, and before/after summary
- never patch projection tables directly

### 6. Core Model Evolution

Scope: engineering-owned

Examples:

- new trade lifecycle fields
- fields that drive pricing, exposure, settlement, limits, approvals, or
  external interfaces
- keys and relationship-defining fields

Implementation path:

- schema migration
- API schema change
- projection change
- explicit rollout and backfill plan

Rules:

- required whenever a field becomes control-critical or cross-workflow

## Decision Framework

When a new extensibility request appears, answer these questions in order:

1. Is this only about presentation?
   - Use preferences, layouts, or saved/shared views.
2. Is this a reusable business lens over existing data?
   - Use a shared view or report definition.
3. Is this a derived value from approved existing fields?
   - Use a formula definition.
4. Is this a new optional attribute that does not change validation or
   downstream controls?
   - Use a custom field definition.
5. Does it affect trade semantics, risk, settlement, compliance, or external
   integrations?
   - Promote it to core schema and engineering delivery.
6. Does it write or update records?
   - Route it through typed commands or bulk-edit jobs, never direct table
     edits.

## Hard Guardrails

- No arbitrary SQL, DDL, or direct database-column creation from the UI.
- No unrestricted user-authored code execution on the server or client.
- No direct editing of projection tables such as `trades` or `positions`.
- No custom field may bypass required reference-data validation.
- No custom field may become a primary identifier, status field, or permission
  gate without promotion to core schema.
- No published report or formula may ignore row-level access rules.
- No layout or view definition may assume unstable field names without version
  compatibility handling.
- No bulk edit may apply without validation, preview, and audit capture.
- No destructive schema action should be triggered by a user customization
  flow.

## Rules By Capability

### Drag And Drop Tiles

Allowed:

- reordering, resizing, hiding, and pinning approved widgets
- personal first, publish/share second

Not allowed:

- arbitrary third-party widget execution in the first phase
- widget access to data outside the user's entitlements

Implementation note:

- layouts should reference stable widget ids and widget parameters, not raw
  component names

### Renaming Views

Allowed:

- user or team aliases for view labels
- business-language names for saved views or reports

Not allowed:

- changing canonical route ids or API resource names

Implementation note:

- keep internal ids stable such as `dashboard`, `trades`, and `reference`;
  layer aliases on top

### Adding Reports

Allowed:

- reports built from approved datasets and measures
- filters, grouping, totals, and export formats

Not allowed:

- arbitrary joins across internal tables in v1
- broadening access to protected admin data through report sharing

Implementation note:

- introduce curated semantic datasets before a freeform report builder

### Adding New Database Columns

Allowed:

- custom field definitions for low-risk optional attributes
- engineering-owned schema promotion when a field proves durable and
  cross-workflow

Not allowed:

- literal `ALTER TABLE` behavior initiated by end users
- using custom fields as a dumping ground for core trading concepts

Implementation note:

- the platform should offer "add field" as governed metadata, not raw physical
  schema editing

### Adding Calculated Columns

Allowed:

- deterministic formulas over approved fields and helper functions
- typed outputs with validation

Not allowed:

- formulas with side effects
- formulas that call external services in the first phase
- circular dependencies between calculated fields

Implementation note:

- formulas belong in a governed semantic layer; widely adopted formulas can be
  promoted into projections later

### Updating Data Like Excel

Allowed:

- bulk grid editing for selected entities and fields
- paste-from-spreadsheet into a staging layer
- diff review, error highlighting, and partial-row rejection rules

Not allowed:

- unrestricted spreadsheet semantics over every table
- silent overwrite of concurrent changes
- direct update of audit or system-managed fields

Implementation note:

- "Excel-like" should mean fast interaction, not bypassing application rules

## Suggested Metadata Objects

The first extensibility subsystem should standardize these definition types:

### 1. `layout_definitions`

- scope: user, team, or global
- workspace id
- widget placements
- widget parameters
- status and version

### 2. `view_definitions`

- scope: user, team, or global
- base dataset or workspace
- visible columns
- aliases
- sort, filter, and grouping rules
- status and version

### 3. `report_definitions`

- shared scope
- dataset id
- selected measures and dimensions
- formatting and export options
- status and version

### 4. `formula_definitions`

- output type
- expression
- allowed inputs
- dependency metadata
- validation state

### 5. `custom_field_definitions`

- entity type
- field code
- field label
- data type
- optional validation rules
- placement metadata
- status and version

All of them should follow the repo's existing governance pattern:

- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `version`
- explicit lifecycle status

## What Must Remain Developer-Owned

- event types and write contracts
- projection rebuild logic
- permission model
- core reference-data dependencies
- pricing and risk critical calculations
- external integration contracts
- schema migrations for core tables
- audit fields and system provenance

## Mapping The Current Example Requests

- Drag and drop tiles -> `layout_definitions`
- Rename views -> `view_definitions` alias layer
- Add reports -> `report_definitions`
- Add new database columns -> `custom_field_definitions` first, then core
  schema promotion when warranted
- Add calculated columns -> `formula_definitions`
- Update data like Excel -> governed bulk-edit jobs over typed services

## Repo-First Delivery Path

This should be treated as a sequence plan, not a request to build every
capability in parallel. Each phase should leave behind a usable product slice
and reusable platform primitives for the next one.

### Phase 0: Foundation And Boundary Setting

Goal:

- define the operating model before building end-user builders

Key decisions:

- choose the API namespace for extensibility metadata
- lock the scope model: `user`, `team`, `global`
- lock the lifecycle model: `draft`, `published`, `retired`
- choose the first supported product surfaces
- choose the first entity whitelist for safe bulk editing

Recommended first surfaces:

- `dashboard`
- `trades`
- `reference-data`

Recommended first bulk-edit entities:

- books
- commodities
- currencies
- units

Backend deliverables:

- metadata domain skeleton under `apps/api/app`
- canonical definition schemas for layouts, views, reports, formulas, and
  custom fields
- common validation and audit rules shared by all definition types

Frontend deliverables:

- stable internal workspace and widget ids where needed
- initial runtime contracts for loading a user-scoped definition set

Admin and governance deliverables:

- define who can publish, retire, or promote definitions
- define which changes are self-serve versus controlled

Exit criteria:

- the team agrees on definition types, lifecycle, scope model, and first
  rollout surface area

### Phase 1: User Layouts And Saved Views

Goal:

- let one user personalize their workspace safely without affecting others

Backend deliverables:

- persist `layout_definitions` for user scope
- persist `view_definitions` for user scope
- add create, update, list, and reset endpoints
- validate against known workspace ids, widget ids, and allowed column keys

Frontend deliverables:

- allow tile reorder, resize, hide, and reset on the first target workspace
- allow saved filters, sorts, column order, and local aliases
- load user definitions on startup without changing canonical route ids

Recommended first UI targets:

- dashboard layout
- trading table and inspector view state

Admin and governance deliverables:

- capture audit metadata for definition changes even before shared publishing

Exit criteria:

- a user can personalize layout and view state on at least one workspace
- defaults can be restored without manual cleanup
- invalid definition payloads are rejected cleanly

### Phase 2: Shared Views And Published Layouts

Goal:

- support team or org-wide views without turning internal ids into mutable
  product contracts

Backend deliverables:

- add `team` and `global` scope handling
- add owner, publish, retire, and restore actions
- enforce permission checks for shared publication
- keep version history for published definitions

Frontend deliverables:

- let users switch between default, personal, and shared definitions
- add publish or share flows for authorized users
- surface ownership and version information when a shared definition is active

Admin and governance deliverables:

- add definition inventory to Admin
- show active shared layouts and views by owner and status

Exit criteria:

- a team can publish a named shared view or layout
- canonical workspace ids remain unchanged
- users can fall back to default or personal variants at any time

### Phase 3: Reporting And Formula Definitions

Goal:

- let users define reusable reports and calculated outputs on curated datasets

Backend deliverables:

- define approved semantic datasets backed by current projections and
  reference-data APIs
- add `report_definitions`
- add `formula_definitions`
- validate formulas for type safety, allowed functions, and dependency cycles
- expose lineage metadata for report columns and calculated fields

Recommended first datasets:

- current trades
- current positions
- core reference-data entities

Frontend deliverables:

- add a lightweight report builder on approved datasets
- allow calculated columns on curated fields
- support export for approved report outputs

Admin and governance deliverables:

- expose formula validation status and dependency details
- surface which shared reports are active and who owns them

Exit criteria:

- a shared report can be created without code
- a calculated column can be defined without bypassing type or access checks
- report lineage is visible enough to support explainability

### Phase 4: Custom Fields

Goal:

- support low-risk customer-specific attributes without defaulting to schema
  sprawl

Backend deliverables:

- add `custom_field_definitions`
- choose the first persistence strategy for field values:
  - constrained metadata JSON for low-risk entities, or
  - extension tables where indexing or stricter validation is needed
- add typed validation rules for supported field types
- expose form and grid placement metadata

Recommended first entity targets:

- reference data entities
- selected low-risk trade enrichment fields only after reference-data success

Frontend deliverables:

- render custom fields in forms and grids from metadata
- support field grouping, labels, help text, and basic validation
- keep search and filtering intentionally narrow in the first release

Admin and governance deliverables:

- show where custom fields are used
- identify stale or unused definitions

Exit criteria:

- an admin can add an optional field to a supported entity without code
- that field appears in the UI with validation and audit behavior
- the field does not bypass existing reference-data or permission rules

### Phase 5: Bulk Editing

Goal:

- make high-volume maintenance fast without breaking the application model

Backend deliverables:

- add a bulk-edit draft or job model
- support stage, validate, preview, apply, and audit flows
- enforce per-row validation, field whitelists, and version conflict checks
- add partial-failure reporting so one bad row does not hide all errors

Recommended first entity targets:

- reference-data records, not trade events or projections

Frontend deliverables:

- add paste-from-spreadsheet support into a staging grid
- show row and cell errors before apply
- show before and after diffs and conflict warnings

Admin and governance deliverables:

- expose bulk-edit history
- preserve actor, timestamp, and change-summary visibility

Exit criteria:

- a user can paste a small batch of supported reference-data updates
- invalid rows are explained before apply
- successful rows are written through normal validated paths with full audit

### Phase 6: Promotion Path

Goal:

- prevent long-term metadata sprawl by moving proven concepts into the core
  model when warranted

Deliverables:

- define a recurring review for promoted fields, formulas, and reports
- document promotion triggers and migration criteria
- migrate high-value durable definitions into schema, APIs, and projections
- add stronger governance for sensitive publishing and bulk-edit operations

Exit criteria:

- there is a visible promotion path from "custom" to "core"
- the team can retire weak or unused definitions instead of carrying them
  forever

## Sequencing Rules

- Do not start with shared publishing before personal definitions work well.
- Do not allow formulas on arbitrary sources before curated datasets exist.
- Do not start custom fields on the trade write model before they succeed on
  lower-risk reference-data entities.
- Do not start bulk editing on events, trades, or positions.
- Ship Admin explainability alongside shared definitions, reports, and bulk
  edits so governance does not lag behind power.

## Program Workstreams

This initiative will move faster if it is treated as a small platform program
with explicit workstreams:

### 1. Metadata Platform

- common tables and schemas for extensibility definitions
- lifecycle, scope, validation, and audit rules

### 2. Runtime Application

- loading and applying definitions in the web app
- keeping canonical ids stable while layering aliases and layout state

### 3. Reporting And Semantic Layer

- curated datasets
- formula validation
- lineage and export rules

### 4. Custom Field Infrastructure

- field definition model
- persistence strategy
- dynamic form and grid rendering

### 5. Bulk Edit Engine

- staging model
- validation and preview
- apply and conflict handling

### 6. Governance And Explainability

- Admin visibility
- ownership and publish rules
- promotion reviews

## Likely Repo Touchpoints

The first implementation package will likely touch these areas:

- `apps/api/app`
  - new metadata or extensibility routes and services
  - persistence for layout, view, report, formula, and custom-field
    definitions
  - validation for bulk-edit jobs and definition publishing
- `apps/web/src/App.tsx` and navigation/workspace composition
  - loading user-scoped and shared layout definitions
  - applying aliases and saved-view behavior without changing canonical ids
- `apps/web/src/workspaces`
  - dashboard and trading as the first layout-driven surfaces
  - reference data as the first bulk-edit candidate
- `apps/web/src/entities` and `apps/web/src/shared`
  - typed API helpers and models for extensibility metadata
- `apps/web/src/workspaces/admin`
  - explainability for active definitions, versioning, and publish state

## Promotion Criteria

Promote a custom field or formula into the core model when it:

- appears in multiple workspaces
- drives validation or workflow branching
- is required for integrations or official reporting
- needs strong performance guarantees
- must be reference-validated as a first-class dependency
- becomes mandatory for most records

## Success Measures

- fewer code changes for presentation and reporting requests
- no increase in audit or control exceptions
- materially faster turnaround for common view and report needs
- clear lineage from displayed values back to source data and formulas
- reduced pressure to hardcode one-off customer-specific fields

## Decision Summary

Build extensibility as a governed metadata layer on top of a stable core.

Let users shape:

- layouts
- views
- reports
- formulas
- selected low-risk fields
- fast bulk-edit workflows

Keep protected:

- events
- core schema
- permissions
- critical calculations
- audit and provenance

The right mental model is not "users can edit the database." It is "users can
adapt the product safely through governed definitions and validated write
paths."
