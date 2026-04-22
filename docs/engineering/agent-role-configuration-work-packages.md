# Agent Role Configuration Work Packages

## Goal

Execute the hybrid agent model:

- predefined role archetypes are the default, trusted path
- configurable agent profiles let teams specialize agents for local work
- custom specialization can narrow authority freely, but cannot expand
  authority without explicit policy, ownership, and eval coverage

This package set builds on the existing managed-agent foundation instead of
replacing it. The current `AssistantAgent` record is already close to an agent
profile. The main missing piece is a first-class role archetype layer above it.

## Primary Design Inputs

- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [AI Workflow](./ai-workflow.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)

## Target Operating Model

| Concept | Meaning | Examples |
| --- | --- | --- |
| Role archetype | Governed job shape with mission, human owner, authority ceiling, work objects, tools, approval rules, stop conditions, and eval expectations. | Trade Ops Copilot, Settlement Copilot, Document Agent, Risk Sentinel. |
| Agent profile | Runtime configuration for a concrete agent. It inherits from a role and can specialize name, prompt, model, workspace scope, tools, and action types within policy. | Gulf Coast Trade Ops Copilot, Power Settlement Analyst. |
| Custom role request | Structured proposal for a new archetype when no existing role fits. It stays draft-only until reviewed. | Weather-driven Dispatch Analyst. |
| Run and outcome | Traceable execution record that shows prompt, tools, staged actions, approvals, failures, and measurable value. | Assistant run, action request, control tower metrics. |

## Delivery Order

### Wave 0: make the role/profile split explicit

1. WP-01 role archetype contract and catalog normalization
2. WP-02 agent profile schema and seed migration
3. WP-03 role-aware policy validator and safe defaults

### Wave 1: productize safe specialization

4. WP-04 admin role catalog and profile builder UX
5. WP-05 custom specialized agent request and activation workflow

### Wave 2: make trust measurable

6. WP-06 role eval matrix and promotion gates
7. WP-07 control tower metrics and auto-pause signals

### Wave 3: roll out and clean up

8. WP-08 pilot rollout and migration cleanup

## Shared Definition Of Done

Each work package is done only when:

- role and profile behavior is represented in server-owned contracts
- custom configuration cannot silently exceed the role authority ceiling
- action-capable agents have explicit allowed action types, approval ownership,
  and eval coverage
- admin users can understand whether an agent is curated, role-derived, or a
  custom specialization
- prompt preview, run tracing, action requests, and audit data preserve role
  and profile identity
- docs and tests are updated with the changed operating model

## WP-01: Role Archetype Contract And Catalog Normalization

### Priority

P0

### Outcome

The platform has a server-owned role archetype contract that turns the current
documentation catalog into enforceable product metadata.

### Why this matters

Predefined roles only create trust if they are more than prompt templates. The
role needs to define what the agent is for, who owns it, where it can operate,
which tools and actions it may use, and how it graduates to more authority.

### Scope

- define the role archetype fields:
  - `role_key`
  - name and description
  - status: curated, template, phase 1, phase 2+
  - mission
  - human owner role
  - allowed or recommended workspaces
  - canonical work objects
  - capability ceiling
  - default tool allowlist
  - maximum action-type allowlist
  - authority ceiling
  - approval rules
  - stop conditions
  - success metrics
  - required eval coverage
  - base prompt sections or prompt guidance
- choose the first storage shape:
  - code-owned registry if we want fast delivery and reviewable diffs
  - database-backed registry if admins need to manage roles themselves soon
- convert the existing role catalog into the new shape
- map current seeded and template agents to role archetype keys
- expose role metadata through an admin API for the web app

### Out of scope

- freeform custom role creation by non-admin users
- granting any new action authority
- replacing existing `AssistantAgent` CRUD

### Suggested owner profile

Backend/platform engineer paired with product-minded operator input.

### Dependencies

- Existing agent role catalog
- Existing assistant settings and agent management APIs

### Acceptance criteria

- role archetypes are available from a server-owned source
- every current seeded or template agent has a role archetype mapping
- the role contract includes authority ceiling, owner role, stop conditions,
  and eval expectations
- tests verify the role registry has unique keys and valid referenced tools,
  workspaces, capabilities, and action types
- related engineering docs point to the role contract as the product source of
  truth

### Implementation note

The initial implementation uses a code-owned registry at
`apps/api/app/domains/assistant/services/role_archetypes.py` and exposes it
through `GET /admin/assistant/role-archetypes`. This keeps role archetype
changes reviewable in normal code review while later packages add profile
specialization and activation workflows.

## WP-02: Agent Profile Schema And Seed Migration

### Priority

P0

### Outcome

Managed agents become concrete profiles derived from role archetypes, with
enough metadata to distinguish curated defaults from local specializations.

### Why this matters

The current `AssistantAgent` model already stores most runtime configuration.
Without role/profile metadata, the system cannot explain whether an agent is a
governed default, a narrowed team variant, or an unreviewed custom prompt.

### Scope

- extend the assistant agent model and API schemas with profile metadata:
  - `role_key`
  - profile kind such as curated, role-derived, or custom
  - specialization summary
  - human owner role or owner user where appropriate
  - inherited authority ceiling
  - activation or review notes if needed
- add an Alembic migration and backfill current seeded agents
- update seed definitions to assign role keys
- update web types and admin API helpers
- preserve current agent IDs and versions
- ensure prompt context and run traces include both role and profile identity

### Out of scope

- full policy workflow UI
- historical reconstruction of role metadata for old runs before the migration

### Suggested owner profile

Backend engineer comfortable with migrations and API contract changes.

### Dependencies

- WP-01 role archetype contract

### Acceptance criteria

- existing seeded agents still seed and update successfully
- admin and public agent listings expose role/profile metadata
- prompt preview includes the role/profile context needed for review
- assistant runs record enough information to answer which role and profile
  produced the response
- tests cover migration backfill, CRUD, listing, and prompt context behavior

### Implementation note

The profile layer is now represented on `AssistantAgent` with `role_key`,
`profile_kind`, specialization, owner, authority ceiling, and activation notes.
Seeded defaults are curated profiles mapped through the role catalog, while
template-created drafts preserve role-derived metadata. Prompt preview,
assistant responses, and run records carry role/profile identity for review.

## WP-03: Role-Aware Policy Validator And Safe Defaults

### Priority

P0

### Outcome

Agent configuration is validated against its role archetype before it can
become active.

### Why this matters

Custom profiles are valuable only if they cannot accidentally become broader
than the role they inherit from. The highest-risk behavior is implicit
authority, especially around `READ` and `ACTION` defaults.

### Scope

- add a profile policy validator used by create and update flows
- enforce that profile capabilities do not exceed the role capability ceiling
- enforce that allowed workspaces, tools, and action types are subsets of the
  role defaults or maximums unless an explicit extension path exists
- remove or replace implicit broad defaults for role-derived profiles:
  - empty `allowed_tools` should mean explicit no tools or inherited role
    defaults, not accidental access to all new tools
  - empty `allowed_action_types` should not expand to all action types
- require `ACTION` agents to have non-empty, explicit action allowlists
- require approval metadata and eval expectations for every action-capable role
- return actionable validation errors to the admin UI

### Out of scope

- autonomous execution promotion
- complex policy language beyond role/profile subset checks

### Suggested owner profile

Backend/platform engineer with assistant governance context.

### Dependencies

- WP-01 role contract
- WP-02 profile metadata
- Existing assistant eval harness

### Acceptance criteria

- active profiles cannot exceed role authority through API calls
- action-capable profiles require explicit allowed action types
- tests cover denied tool expansion, denied action expansion, missing owner
  metadata, and successful narrowed specializations
- existing curated seeded agents pass validation without weakening policy
- evals cover at least one attempted overreach by a custom profile

### Implementation note

WP-03 now routes create and update requests through a shared profile policy
resolver and validator. Empty custom tool/action allowlists remain empty, empty
role-derived tool allowlists inherit only role default tools, and `ACTION`
profiles must declare explicit allowed action types before save.

## WP-04: Admin Role Catalog And Profile Builder UX

### Priority

P1

### Outcome

Admins can browse role archetypes, create specialized profiles from them, and
understand policy warnings before activating an agent.

### Why this matters

The admin builder should guide users into safe defaults. A role catalog makes
the product feel intentional; a profile builder makes specialization practical.

### Scope

- add an Admin role catalog view or panel
- show role mission, owner, workspaces, tools, actions, authority ceiling, stop
  conditions, and eval status
- update the agent builder so users start from a role archetype
- show which profile fields are inherited, narrowed, or customized
- prevent save or activation when policy validation fails
- keep prompt preview close to the builder
- distinguish curated profiles from team specializations and custom drafts
- add UI tests for template selection, specialization, validation, and preview

### Out of scope

- non-admin self-service agent creation
- visual workflow builder for policies

### Suggested owner profile

Frontend engineer with admin workspace context, paired with backend support for
contract gaps.

### Dependencies

- WP-01 role metadata API
- WP-02 profile metadata
- WP-03 policy validation errors

### Acceptance criteria

- admin users can create a narrowed specialized profile from an existing role
- the UI clearly shows inherited versus customized configuration
- invalid expansions are blocked before activation
- prompt preview includes role/profile context
- tests cover the primary builder path and at least one validation failure

### Implementation note

WP-04 now loads the server-owned role archetype catalog in the Admin managed
agent panel, supports creating role-derived draft profiles from a selected
archetype, exposes profile metadata controls, and shows a local policy-fit
summary before save. The builder preview includes role/profile context, and
client-side validation blocks role boundary expansions and missing explicit
actions before the admin save request is sent.

## WP-05: Custom Specialized Agent Request And Activation Workflow

### Priority

P1

### Outcome

Teams can request specialized agents when existing roles do not fit, while the
platform keeps activation gated by owner, authority, and eval requirements.

### Why this matters

Real workflows will not fit a fixed catalog forever. The custom path should
capture useful local knowledge without turning the platform into unmanaged
prompt sprawl.

### Scope

- define the custom agent request shape:
  - business problem
  - proposed mission
  - human owner
  - workspaces and work objects
  - requested inputs and tools
  - expected outputs
  - requested authority ceiling
  - stop conditions
  - success metrics
  - proposed eval cases
- support a draft-only custom profile before activation
- add activation checks:
  - role mapping exists or a new role archetype is approved
  - owner is named
  - tools and actions are explicitly reviewed
  - action-capable profiles have eval coverage
  - prompt preview has been reviewed
- record audit events for request, approval, activation, pause, and retirement

### Out of scope

- automatic approval of custom roles
- custom action types
- policy mutation by the agent being configured

### Suggested owner profile

Full-stack engineer with governance input from operations or platform owner.

### Dependencies

- WP-03 policy validator
- WP-04 admin builder UX
- Existing audit/event conventions

### Acceptance criteria

- custom profiles can be drafted without becoming active
- activation is blocked until required governance fields are complete
- action-capable custom profiles cannot activate without explicit eval and
  approval metadata
- audit history shows who requested, reviewed, activated, paused, or retired
  the profile
- docs describe when to create a specialized profile versus a new role
  archetype

### Implementation notes

- Added `assistant_agent_profile_requests` as the governance intake record for
  business problem, proposed mission, owner, workspaces, work objects, requested
  tools, expected outputs, authority ceiling, stop conditions, success metrics,
  and eval cases.
- Custom agents can remain `DRAFT` without a completed request, but `ACTIVE`
  custom profiles require a named owner, authority ceiling, activation notes,
  and either a role mapping or an approved profile request. `ACTION` custom
  profiles additionally require an approved request with eval and approval
  metadata.
- Admin UI now has a specialized profile request queue. Requested profiles can
  be approved or rejected with reviewer notes, and approved requests can seed a
  draft-only custom agent with the approved request ID attached.
- Mutation provenance records request, approval, activation, pause, and
  retirement events so profile lifecycle history is reviewable from audit data.
- Use a specialized profile when the role mission is still local to a team,
  workflow, or narrow exception path. Create or extend a role archetype when the
  mission should become reusable across teams, define shared authority defaults,
  or carry platform-level eval and policy expectations.

## WP-06: Role Eval Matrix And Promotion Gates

### Priority

P1

### Outcome

Every role archetype has a minimum eval matrix, and every profile promotion
must satisfy the role's gates before authority expands.

### Why this matters

Roles are product surfaces. Changes to prompts, tools, actions, or authority
need regression protection just like API contracts.

### Scope

- define baseline eval requirements by authority level:
  - read/explain
  - draft
  - stage
  - bounded execute later
- create a role eval matrix covering:
  - correct tool allowlist behavior
  - workspace scope enforcement
  - refusal or escalation on stop conditions
  - grounded explanations
  - action staging only when allowed
  - stale or ambiguous action denial
- add eval fixtures for new Phase 1 role archetypes
- require custom profiles to inherit role evals and add at least one
  specialization-specific case before activation when authority is more than
  draft-only
- surface eval status in Admin

### Out of scope

- exhaustive model-quality benchmarking
- production online learning

### Suggested owner profile

Backend/test engineer with assistant eval harness familiarity.

### Dependencies

- WP-01 role contract
- WP-03 policy validator
- Existing assistant eval harness

### Acceptance criteria

- each active action-capable role has eval cases for allowed and denied action
  behavior
- custom profiles have a documented eval path before activation or authority
  expansion
- `make api-assistant-evals` remains the canonical local gate for assistant
  behavior
- admin output can show eval coverage status for a role/profile

## WP-07: Control Tower Metrics And Auto-Pause Signals

### Priority

P2

### Outcome

Admins can compare role and profile behavior by value, risk, and review burden,
with initial automatic pause signals for unsafe or noisy agents.

### Why this matters

The team should promote, narrow, pause, or retire agents based on evidence,
not anecdotes.

### Implementation note

The first deterministic metrics slice is available through
`GET /admin/assistant/outcome-metrics` and the Admin workspace outcome metrics
panel. It reports by-agent, by-role, by-profile, and by-action-type outcomes,
including advisory promotion and pause recommendations. The endpoint and panel
do not auto-pause or grant additional authority.

The Admin approval inbox accepts `role_key` and `profile_kind` filters for
action requests, and the admin run history endpoint accepts the same filters
for recent runs. The outcome metrics endpoint also accepts these filters so an
admin can isolate a noisy role/profile before opening the related action
requests or run audit traces.

Initial pause signals are advisory only. The system calculates repeated failed
actions, high rejection rate, stale pending backlog, stale-action rate,
unsupported tool/action attempts, and policy validation drift after role or
permission changes. A recommended pause should trigger investigation of recent
run warnings, tool errors, rejected/failed actions, and policy simulation
results. Reactivation or authority expansion remains a human-governed change:
clear or reject stale pending actions, repair role/profile policy, rerun evals,
and only then update the agent/profile status or authority through the admin
governance flow.

### Scope

- add role/profile filters to control tower run and action views
- calculate outcome metrics:
  - run count
  - staged actions
  - approval hit rate
  - rejection rate
  - failed execution rate
  - stale-action rate
  - oldest pending action
  - average decision time
  - warning and tool-error rate
- define initial pause signals:
  - repeated failed actions
  - high rejection rate
  - unsupported tool/action attempts
  - stale pending action backlog
  - policy validation drift after role changes
- start with recommend-pause warnings before enabling automatic pausing
- document how an admin investigates and reactivates a paused profile

### Out of scope

- autonomous remediation
- model-provider cost optimization

### Suggested owner profile

Full-stack engineer with reporting and admin workspace context.

### Dependencies

- WP-02 run trace role/profile metadata
- WP-06 eval and promotion model
- Existing admin action request summary API

### Acceptance criteria

- admins can filter recent runs and action requests by role and profile
- role/profile metric summaries are visible in Admin
- at least three pause signals are calculated and shown
- pause recommendations do not execute irreversible changes
- tests cover metric calculations and filter behavior

## WP-08: Pilot Rollout And Migration Cleanup

### Priority

P2

### Outcome

The hybrid model is applied to the first production-quality agent lineup, and
old template-only assumptions are removed.

### Why this matters

The model is only useful once real agents use it. This package turns the
architecture into an operating habit.

### Scope

- migrate current seeded agents:
  - Trade Ops Copilot
  - Settlement Copilot
  - Trade Governor
- migrate current admin templates:
  - Trade Explainer
  - Ops Coordinator
  - Settlement Analyst
  - Document Triage
  - Desk Briefing
- add role archetypes and draft profiles for Phase 1 candidates:
  - Market Research Agent
  - Pre-Trade Structuring Agent
  - Document Agent
  - Risk Sentinel
  - Reporting and Reconciliation Agent
- remove or update UI language that treats templates and agents as the same
  thing
- update docs, demo data, and smoke coverage around the new lifecycle
- run an outcome review before granting any role new action authority

### Out of scope

- full autonomous execution
- external counterparty communication
- direct trade booking by agents

### Suggested owner profile

Product engineer coordinating backend, frontend, and eval follow-through.

### Dependencies

- WP-01 through WP-06
- WP-07 if control tower metrics are part of the pilot exit review

### Acceptance criteria

- all current seeded and template agents are represented as role-derived
  profiles
- Phase 1 pilot roles are visible in Admin with clear status
- no active profile lacks a role key, owner, authority ceiling, and policy
  validation result
- docs describe the pilot lineup, customization path, and promotion rules
- rollout review can identify which agents to promote, narrow, pause, or retire

## Sequencing Notes

- WP-01 through WP-03 should land before broad custom-agent UX. That keeps the
  foundation policy-led instead of prompt-led.
- WP-04 and WP-05 can overlap once backend validation responses are stable.
- WP-06 should start early for action-capable roles, even if custom profile
  activation arrives later.
- WP-07 can be incremental. The first useful version is role/profile filtering
  plus approval and failure rates.
- WP-08 should not expand authority. It is a migration and pilot-hardening
  package, not an autonomy package.
