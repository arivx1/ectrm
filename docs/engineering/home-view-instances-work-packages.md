# Home View Instances Work Packages

## Goal

Turn Prompt Home into a configurable operating surface where users can arrange,
filter, hide, and save named Home view instances while preserving an immutable
system default.

The target experience is:

- every user can return to the immutable ECTRM Home at any time
- users can save named personal Home instances such as `HH NG Watch`,
  `Imminent Shipments`, or `US Gas Desk`
- authorized users can publish shared team or organization Home instances
- assistant-created views are persona-aware and useful, but still persist
  through typed services, validation, permissions, and audit
- card placement and visibility stay presentation metadata, not hidden business
  truth or ungoverned model output

## Primary Design Inputs

- [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
- [User Extensibility Initiative](./user-extensibility-initiative.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx` is already the
  prompt-first Home surface.
- `apps/web/src/workspaces/prompt/promptHomeCardVisibility.ts` already supports
  browser-local card order and card visibility for the current Home cards.
- Prompt Home already has a DnD card shell, card visibility controls, price,
  map, document, communication, time, and prompt cards.
- saved settlement report presets already use a typed backend service through
  `apps/api/app/domains/reports/services/settlement_presets.py`.
- the assistant can already stage `create_settlement_report_preset` through a
  typed action request instead of writing browser-local state directly.
- [Agent Knowledge Base](./agent-knowledge-base.md) already records that
  agent-created filter presets must use typed server-owned services.
- [User Extensibility Initiative](./user-extensibility-initiative.md) already
  identifies `layout_definitions` and `view_definitions` as the right metadata
  primitives for presentation and reusable operating views.
- assistant personas are interpretation context only. Persona can shape which
  cards and filters are suggested, but it must not widen permissions, tools,
  action types, or row access.

## Product Definitions

### System Home Template

An immutable, app-owned Home definition that ships with ECTRM. It defines the
default cards, placement, visibility, card parameters, and fallback behavior.
Users can reset to it, but they cannot edit it directly.

### Home View Instance

A named, persisted Home configuration derived from a system template or another
visible instance. It stores card placement, visibility, filters, sort rules,
card parameters, and selected data bindings. It does not store live business
data snapshots.

### Home Card Registry

A typed registry of supported Home card kinds, stable card ids, allowed
parameters, allowed filter fields, supported data bindings, default dimensions,
and required data entitlements.

### Assistant-Created View Draft

A typed proposed Home view instance assembled from a natural-language request,
the authenticated user's persona, available card registry entries, visible
reference data, and deterministic recipe rules.

## Experience And Governance Principles

1. Keep the immutable default obvious.
   The user should always be able to switch back to `System Home` and reset a
   personal instance without support or database cleanup.

2. Store definitions, not data snapshots.
   Home view instances should hold configuration over approved data surfaces.
   The latest prices, shipments, workflow items, and positions should still
   come from their existing typed APIs and projections.

3. Use stable card ids and typed parameters.
   Layouts should reference approved card ids, semantic data bindings, and
   validated filter keys, not React component names, arbitrary SQL, or
   freeform model JSON.

4. Let persona guide composition, not authority.
   A trader persona may bias `HH NG` toward prices, basis, exposure, and
   pre-trade context. A risk persona may bias it toward stale marks, exposure,
   concentration, and exceptions. Neither persona may change what the user is
   allowed to see or save.

5. Treat assistant saves as governed low-risk actions.
   Personal view creation is low risk, but still durable. Agents can draft or
   stage typed view definitions first. Bounded execution can come later after
   evals, validation, and outcome review.

6. Promote repeated view-building judgment into recipes.
   Requests such as `most imminent shipment`, `HH NG`, or `US natural gas`
   should become deterministic recipe candidates once reviewers consistently
   accept the same card mix and filter logic.

## Delivery Order

### Wave 0: Define The Contract

1. HVI-01 Home card registry and system template contract
2. HVI-02 Home view definition service
3. HVI-03 Prompt Home migration from local preferences to personal instances

### Wave 1: Make Saved Views Usable

4. HVI-04 Home instance switcher and save/reset UX
5. HVI-05 Card-level filters, parameters, and data-binding validation
6. HVI-06 Shared Home instances and admin explainability

### Wave 2: Make Prompt-Created Views Real

7. HVI-07 Assistant tools for Home templates, cards, and visible instances
8. HVI-08 Governed `create_home_view_instance` action
9. HVI-09 Persona-aware deterministic view recipes

### Wave 3: Harden And Promote

10. HVI-10 Evals, browser smoke, and recipe outcome review

## Shared Definition Of Done

Each work package is done only when:

- the immutable system Home remains available and resettable
- saved view instances use typed backend services or explicit local fallback
  only where the package says so
- card ids, filters, and data bindings are validated against a registry
- persona changes do not widen permission, row access, tool, or action scope
- no assistant freeform output directly persists a Home view definition
- shared definitions have owner, scope, status, version, and audit metadata
- invalid or stale definitions fail closed with a user-visible explanation
- focused backend tests, web tests, assistant evals, or browser smoke coverage
  match the behavioral risk
- docs and the knowledge base are updated when a reusable recipe, action
  boundary, or deterministic pattern changes

## Sequencing Rules

- Do not start with shared publishing before personal definitions are stable.
- Do not allow assistant-created views to save raw model JSON.
- Do not let card configuration reference unknown cards, unsupported filters,
  or data fields outside approved semantic surfaces.
- Do not make Home instances the source of prices, positions, shipments,
  workflow status, settlement state, policy, or permission truth.
- Start with current Prompt Home cards before adding a generic widget builder.
- Promote accepted assistant composition patterns into deterministic recipes
  instead of burying them in prompt instructions.

## HVI-01: Home Card Registry And System Template Contract

### Priority

P0

### Size

M

### Outcome

Prompt Home has a typed registry of supported cards and an immutable system
template that defines the default Home experience.

### Why this matters

The current Home card behavior is useful, but card order and visibility are
stored as local preference keys. Before named instances or assistant-created
views exist, the platform needs stable card ids, allowed parameters, and a
default template contract that can be validated and reset.

### Scope

- define a Home card registry with:
  - stable `card_id`
  - card kind or renderer key
  - display label
  - default visibility
  - default placement and dimensions
  - allowed card parameters
  - allowed filter fields
  - allowed data bindings
  - required workspace or data entitlement hints
- define the immutable `system_home` template contract
- map current Prompt Home cards into the registry:
  - desk time
  - market prices
  - asset map
  - upload documents
  - communication center
  - ask the desk assistant
- choose a contract versioning strategy for cards and templates
- add normalization logic for unknown, retired, or newly added card ids

### Out Of Scope

- database persistence for user instances
- shared publishing
- assistant-generated views
- arbitrary third-party cards

### Suggested Owner Profile

Frontend engineer with TypeScript model ownership, paired with a backend
engineer if the registry is server-owned from the first slice.

### Dependencies

- current Prompt Home card components
- User Extensibility Initiative layout/view definition guidance

### Acceptance Criteria

- current Prompt Home renders from a registry-backed system template
- unknown card ids are ignored or downgraded without breaking Home rendering
- newly added registry cards can appear in default order without invalidating
  older saved definitions
- tests cover registry normalization, default template construction, and
  unknown-card behavior

## HVI-02: Home View Definition Service

### Priority

P0

### Size

L

### Outcome

Home view instances can be persisted as typed, audited backend definitions for
personal scope.

### Why this matters

Named Home instances must survive browser changes, support signed-in users, and
create a foundation for shared views and assistant-created views. Local storage
is not enough for durable named operating views.

### Scope

- choose whether Home instances use generalized `layout_definitions` and
  `view_definitions`, or a first dedicated `home_view_definitions` table that
  can be folded into the broader extensibility model later
- define a schema with:
  - `id`
  - `definition_key`
  - `name`
  - `name_key`
  - `scope`
  - `scope_owner_key`
  - `base_template_key`
  - `base_template_version`
  - `persona_hint`
  - `layout_json`
  - `filters_json`
  - `status`
  - `created_at`
  - `created_by`
  - `updated_at`
  - `updated_by`
  - `version`
- add typed create, update, list, read, delete or retire, and reset endpoints
  for personal instances
- validate card ids, card placement, card visibility, card filters, and data
  bindings against the registry
- enforce unique names per owner and scope
- preserve audit fields and version increments
- return `can_edit` and source template metadata for the UI

### Out Of Scope

- team or organization publishing
- assistant action requests
- formulas or calculated fields
- cross-workspace generic view builders

### Suggested Owner Profile

Backend engineer with SQLAlchemy, Pydantic, and typed service boundary
experience.

### Dependencies

- HVI-01 card registry and template contract
- current authentication helpers and role utilities

### Acceptance Criteria

- signed-in users can create, list, update, and reset personal Home instances
- invalid cards, filters, placements, or data bindings are rejected with clear
  4xx errors
- duplicate names in the same personal scope are rejected
- audit fields and version increments are covered by focused API tests
- docs identify whether this service is a dedicated Home slice or the first
  implementation of generalized layout/view definitions

### Implementation Note

HVI-02 is implemented as a dedicated `home_view_definitions` backend slice under
`apps/api/app/domains/home_views`. The service persists Home-specific
definition metadata now, while keeping the schema compatible with the broader
layout/view-definition direction described in the User Extensibility Initiative.

## HVI-03: Prompt Home Migration From Local Preferences To Personal Instances

### Priority

P0

### Size

M

### Outcome

Current card visibility and order behavior moves from browser-local preference
keys into a signed-in personal Home instance path while preserving a graceful
local fallback.

### Why this matters

The existing card customization behavior is the right seed, but users need
their Home configuration to follow their account and become nameable. This
package turns the prototype preference mechanism into the first real instance
experience.

### Scope

- load the user's active personal Home instance on Prompt Home startup
- apply registry normalization before rendering
- migrate existing local card order and hidden-card keys into a default
  personal instance when the user signs in and has no saved instance
- preserve local storage fallback for signed-out or API-unavailable states
- keep DnD reordering and visibility toggles working through the active
  instance
- add a user-visible reset path to restore the immutable system Home layout
- avoid losing current local preferences during rollout

### Out Of Scope

- named instance switcher
- shared instances
- assistant-created instances
- resizing cards unless already supported by HVI-01/HVI-02

### Suggested Owner Profile

Frontend engineer comfortable with Prompt Home state and persistence fallback
behavior.

### Dependencies

- HVI-01
- HVI-02
- current `promptHomeCardVisibility.ts` behavior

### Acceptance Criteria

- signed-in card reorder and hide/show changes persist across refresh and
  browser sessions
- signed-out behavior remains usable with local fallback
- existing local card order/visibility can seed the first personal instance
  exactly once
- users can reset their active Home to the immutable system default
- web tests cover signed-in persistence, signed-out fallback, and reset

## HVI-04: Home Instance Switcher And Save/Reset UX

### Priority

P0

### Size

M

### Outcome

Users can switch between System Home and their named personal Home instances,
save the current Home as a named instance, rename or delete editable instances,
and clearly see which instance is active.

### Why this matters

Without an instance switcher, saved configuration is invisible state. Users
need confidence that they are editing `HH NG Watch` rather than the system
default or another view.

### Scope

- add a compact Home instance switcher to Prompt Home
- show at minimum:
  - System Home
  - active personal instance
  - other personal instances
- support:
  - save current layout as new instance
  - rename editable instance
  - delete or retire editable instance
  - duplicate from System Home
  - reset active instance to its base template
- distinguish immutable system template from editable instances
- show owner, scope, updated timestamp, and version where useful
- preserve current route and prompt context when switching instances

### Out Of Scope

- shared publishing workflow
- assistant-generated instance creation
- admin inventory

### Suggested Owner Profile

Frontend product engineer with dense operational UI sensibility.

### Dependencies

- HVI-02
- HVI-03

### Acceptance Criteria

- a user can create a named instance from the current Home configuration
- switching instances updates visible cards, order, and filters without full
  app reload
- System Home is visibly immutable and resettable
- deleting an active instance falls back to System Home or a chosen remaining
  instance
- tests cover save, switch, rename, delete, and reset behavior

## HVI-05: Card-Level Filters, Parameters, And Data-Binding Validation

### Priority

P0

### Size

L

### Outcome

Home cards can store validated parameters and filters so a saved instance can
represent business lenses such as `HH NG`, `US natural gas`, or `Most imminent
shipments`.

### Why this matters

Card placement alone is not enough. A useful named instance needs cards to
know which price indices, locations, commodities, shipments, portfolios,
severity levels, or route handoffs they should show.

### Scope

- define supported filters and parameters for the first card set:
  - price card: price index codes, quote type, provider, region, commodity,
    sort field, stale-mark handling
  - map card: asset type, geography, commodity, record limit, weather overlay
  - communication card: message/workflow categories and attention filters
  - document card: accepted document kinds or review statuses
  - timeframe card: timezone and calendar display settings
  - prompt card: persona hint, starter kit, or summary target defaults
- validate filters against current reference-data catalogs where possible
- define what happens when referenced codes are retired or no longer visible
- add UI controls for the highest-value filters first instead of exposing raw
  JSON editing
- ensure card filters are included in instance save, load, duplicate, and reset
  flows
- preserve clear empty states when filters produce no records

### Out Of Scope

- arbitrary user-authored formulas
- arbitrary SQL or cross-table joins
- card types outside the first registry

### Suggested Owner Profile

Frontend engineer and backend engineer pairing across UI controls, schema
validation, and reference-data option loading.

### Dependencies

- HVI-01
- HVI-02
- existing reference-data and market-data APIs

### Acceptance Criteria

- at least price and map cards persist validated filters through saved
  instances
- invalid reference-data codes fail closed on save or load with clear recovery
  behavior
- selecting `HH NG`-style filters can be represented without custom code in the
  instance payload
- tests cover filter validation, retired-code handling, and empty-state
  rendering

## HVI-06: Shared Home Instances And Admin Explainability

### Priority

P1

### Size

L

### Outcome

Authorized users can publish shared team or organization Home instances with
owner, lifecycle, version, and audit visibility.

### Why this matters

Personal configuration is the safe starting point, but desks will want common
views for roles and workflows. Shared Home instances need governance so they do
not become mutable hidden defaults.

### Scope

- add `TEAM` and `ORGANIZATION` or repo-standard shared scopes
- add publish, retire, restore, and duplicate-to-personal flows
- enforce permission checks for shared publishing and retirement
- keep published versions immutable, or make edits create new draft versions
  before publish
- expose shared instances in the Home switcher with owner and status metadata
- add Admin inventory for active, draft, and retired Home definitions
- show validation status and compatibility warnings for shared definitions
- preserve fallback to System Home or personal instances

### Out Of Scope

- row-level access changes
- making shared instances mandatory for users
- assistant autonomous publication

### Suggested Owner Profile

Full-stack engineer with admin/governance workflow experience.

### Dependencies

- HVI-02
- HVI-04
- existing admin role checks

### Acceptance Criteria

- authorized users can publish a shared Home instance
- non-authorized users can view but not edit shared instances
- users can duplicate a shared instance into a personal editable copy
- retired shared instances no longer appear as selectable defaults
- Admin can inspect owner, scope, status, version, and validation warnings

### Implementation Note

HVI-06 is implemented through typed Home view definition lifecycle operations:
admins can publish personal views into shared organization/team scopes, retire
or restore shared definitions, and inspect the full inventory with validation
warnings. Active shared definitions appear in Prompt Home as read-only options
and can be duplicated back into personal editable views.

## HVI-07: Assistant Tools For Home Templates, Cards, And Visible Instances

### Priority

P1

### Size

M

### Outcome

The assistant can inspect the Home card registry, system template, and visible
Home instances through read-only tools before drafting or staging a saved view.

### Why this matters

The assistant should not guess which cards, filters, and existing instances
exist. It needs the same typed catalog the UI uses so prompt-created views stay
inside product constraints.

### Scope

- add read-only assistant tools for:
  - Home card registry
  - system Home template
  - visible Home instances
  - supported card filter options where safe
- include scope, owner, status, version, and validation metadata in tool output
- keep tool output concise enough for prompt use
- expose provenance in assistant run traces
- update managed-agent tool policies for roles that can draft or stage Home
  instances

### Out Of Scope

- writes or action execution
- broadening row-level data access
- exposing admin-only draft definitions to non-admin users

### Suggested Owner Profile

Backend assistant/platform engineer.

### Dependencies

- HVI-01
- HVI-02
- assistant live tool registry

### Acceptance Criteria

- the assistant can list supported Home cards and visible instances through
  read-only tools
- tools respect user visibility and do not expose unauthorized shared drafts
- tool traces appear in assistant run metadata
- tests cover allowed and disallowed visibility paths

### Implementation Note

HVI-07 is implemented through read-only assistant tools for the Home card
registry, immutable System Home template, safe filter/parameter option
metadata, and active visible Home instances. The tools reuse the typed Home
view definition services, preserve user visibility boundaries, add concise
trace previews/evidence, and are included in the default tool policy for
market, pre-trade, desk briefing, and reporting roles that can draft
Home-view recommendations.

## HVI-08: Governed `create_home_view_instance` Action

### Priority

P1

### Size

L

### Outcome

The assistant can stage a typed action request to create a personal Home view
instance from natural language or current Home context.

### Why this matters

The user-facing magic is asking for `Make me a view to see HH NG` and getting a
useful saved instance. The safe architecture is a governed action that
persists a validated definition through the same service the UI uses.

### Scope

- add `create_home_view_instance` to the assistant action catalog
- define a typed action payload with:
  - name
  - scope
  - base template
  - persona hint
  - card definitions
  - filters and card parameters
  - review context
- add an action planner that can detect save/create Home view requests
- support explicit names and safe fallback names such as `HH NG Watch`
- require at least one supported card/filter signal before staging
- validate payloads against the Home definition service before staging where
  possible
- include action request review metadata:
  - owning work object
  - proposed mutation
  - business rationale
  - supporting tool records
  - assumptions
  - missing evidence
  - expected downstream effects
  - stale-state basis
  - idempotency key
- execute through the Home definition service after approval

### Out Of Scope

- shared publication by assistant
- business-record mutations
- autonomous execution before eval and outcome proof

### Suggested Owner Profile

Backend assistant engineer with action-request and typed service experience.

### Dependencies

- HVI-02
- HVI-05
- HVI-07
- Agent Action Request Contract

### Acceptance Criteria

- an action-capable assistant can stage a `create_home_view_instance` request
  with a typed payload and review context
- execution creates a persisted personal Home instance through the same service
  as manual save
- duplicate name and invalid-card cases fail safely
- assistant evals cover at least one successful `HH NG` request, one missing
  name or ambiguous request, and one invalid filter stop
- approval surfaces show enough metadata to review the proposed Home instance
  without opening the original chat

### Implementation Notes

HVI-08 is implemented through the governed `create_home_view_instance`
assistant action. The action stages personal Home view definitions only,
validates card and filter payloads through the Home definition service, records
review context and stale-state basis, and executes through the same typed
service used by manual Home view saves after approval.

## HVI-09: Persona-Aware Deterministic View Recipes

### Priority

P1

### Size

L

### Outcome

Common view requests resolve through deterministic recipes that choose
validated card mixes and filters based on domain intent and persona.

### Why this matters

Assistant-created views should be smart without being arbitrary. Repeated
accepted patterns, such as `HH NG`, should become product recipes over typed
catalogs instead of living only in prompt wording.

### Scope

- add a recipe registry for common Home view intents, starting with:
  - `commodity_market_watch`
  - `hub_basis_watch`
  - `imminent_shipments`
  - `settlement_exception_watch`
  - `document_review_queue`
- define recipe inputs:
  - commodity
  - price index
  - geography
  - book or portfolio
  - workflow status
  - persona
- define recipe outputs:
  - card set
  - card order
  - default filters
  - assumptions
  - stop conditions
  - missing evidence
- implement initial `HH NG` / Henry Hub natural gas recipe behavior:
  - prefer Henry Hub natural gas price card when available
  - include basis or related gas index context where available
  - include US gas exposure or position cards once those cards exist
  - include shipment or workflow cards only if current data supports them
  - vary emphasis for trader, risk, operations, and settlement personas
- add stop conditions for ambiguous commodity/index/location resolution
- record recipe decisions in action request review context

### Out Of Scope

- official pricing, risk, settlement, or compliance calculations
- formulas outside approved deterministic services
- creating new card types merely to satisfy one prompt

### Suggested Owner Profile

Backend or full-stack engineer with domain modeling and assistant planner
experience.

### Dependencies

- HVI-05
- HVI-08
- reference data and price-index catalogs

### Acceptance Criteria

- `Make me a view to see HH NG` resolves to a deterministic recipe when Henry
  Hub natural gas reference data is available
- ambiguous requests ask for clarification or stage a draft with explicit
  missing evidence instead of guessing
- persona changes alter card emphasis but not access or authority
- recipe outputs are covered by focused tests and assistant evals
- accepted/rejected recipe outcomes can be reviewed for future promotion or
  retirement

### Implementation Notes

HVI-09 is implemented for the first deterministic recipe layer in
`domains/home_views/services/recipes.py`. The registry declares
`commodity_market_watch`, `hub_basis_watch`, `imminent_shipments`,
`settlement_exception_watch`, and `document_review_queue`; the assistant action
planner now consumes recipe outputs instead of composing HH natural-gas Home
views inline. The initial functional market recipes resolve HH NG/Henry Hub
natural gas, include related active gas indices for basis context when present,
vary visible-card order for trader, risk, operations, and settlement personas,
and record recipe metadata in the action request review preview. Shipment and
settlement-exception recipes are registered but stop until dedicated Home cards
exist.

## HVI-10: Evals, Browser Smoke, And Recipe Outcome Review

### Priority

P1

### Size

M

### Outcome

Home view instances and prompt-created views have enough verification and
outcome review to safely expand beyond the first recipes.

### Why this matters

This feature crosses UI state, backend metadata, assistant planning, and
governed action requests. It needs more than happy-path component tests before
becoming a primary workflow.

### Scope

- add backend tests for:
  - Home definition validation
  - scope and owner rules
  - version and audit behavior
  - reset behavior
  - assistant action execution
- add web tests for:
  - instance switching
  - save as instance
  - reset to System Home
  - card filters persisting through reload
- add assistant evals for:
  - `HH NG` personal Home view creation
  - `most imminent shipment` view creation
  - ambiguous request stop conditions
  - persona-specific composition without authority widening
- add browser smoke for:
  - prompt-created Home view request
  - approval or execution path when supported
  - opening the saved instance in Prompt Home
- define outcome metrics:
  - staged view approvals
  - approvals with corrections
  - rejected recipes
  - duplicate or invalid definition failures
  - reset or delete shortly after creation

### Out Of Scope

- broad recipe auto-promotion
- autonomous shared publication
- replacing all workspaces with Home cards

### Suggested Owner Profile

Full-stack engineer with assistant eval and Playwright smoke coverage
experience.

### Dependencies

- HVI-03 through HVI-09 as applicable
- existing `make api-assistant-evals`, `make web-test`, and
  `make web-smoke-test` lanes

### Acceptance Criteria

- docs identify the narrow verification lane for each Home instance change
- assistant evals prove no-overclaim and no-authority-widening behavior
- browser smoke covers at least one end-to-end saved Home instance path
- outcome metrics can distinguish approved-as-is, corrected, and rejected
  assistant-created views
- the team has enough evidence to decide whether personal Home view creation
  can move from staged action to bounded execution

## First Implementation Slice

The smallest useful delivery slice is:

1. HVI-01 card registry and immutable system template.
2. HVI-02 personal Home view definition service.
3. HVI-03 migration of current local card order and visibility into the active
   personal instance.
4. HVI-04 basic instance switcher with save, switch, and reset.

That slice gives users real saved Home instances without introducing assistant
write behavior yet. HVI-05 through HVI-09 can then make instances
business-specific and prompt-created without changing the foundation.
