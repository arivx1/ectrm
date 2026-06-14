# Agent Context And Configuration Work Packages

## Goal

Turn the current managed prompt foundation into a governed context platform
that:

- makes user, organization, workspace, and agent context explicit
- keeps authority, policy, and business truth server-owned
- gives users a safe future path to configure low-risk context and preferences
- makes prompt context explainable, testable, and promotable into product
  behavior

This package set assumes we want richer agent context without drifting into a
hidden-prompt model or unrestricted end-user prompt editing.

## Primary Design Inputs

- [AI Workflow](./ai-workflow.md)
- [User Extensibility Initiative](./user-extensibility-initiative.md)
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- `/assistant/respond` already assembles a server-owned prompt envelope with
  named sections for system mission, organization context, authenticated user,
  business operating model, data landscape, live inventory, world and time,
  managed agent profile, workspace, and application context.
- `POST /assistant/context` already exposes a stable prompt-preview surface
  that can become the main explainability and review path for richer context.
- organization and business context still rely heavily on env-backed prose,
  which is simple but thin and not versioned like other governed platform
  objects
- user context is currently mostly operational identity: `user_id`,
  `display_name`, `email`, `role`, and session metadata
- workspace or application context can still arrive as freeform text instead
  of typed context contracts
- managed agents already have role/profile metadata, tool and action
  governance, and system-prompt layering that can anchor safe specialization

## Delivery Order

### Wave 0: make context explicit

1. WP-01 context contract and source registry
2. WP-02 organization context, glossary, and guardrail registry
3. WP-03 user context identity and preference model

### Wave 1: structure runtime context

4. WP-04 typed workspace and application context providers
5. WP-05 context preview, explainability, and drift warnings

### Wave 2: productize safe configurability

6. WP-06 user-, team-, and org-configurable context profiles
7. WP-07 promotion and governance path for context rules

## Shared Definition Of Done

Each work package is done only when:

- every new context layer is represented in a server-owned contract, not only
  in hidden prompt prose
- no user, profile, or workspace configuration can widen agent authority,
  tools, action types, or permission boundaries
- scope and lifecycle are explicit where configuration is introduced:
  `user`, `team`, `global` and `draft`, `published`, `retired`
- prompt preview and run tracing preserve context provenance, version, and
  fallback warnings where relevant
- assistant evals, focused backend tests, and web tests are updated where
  context behavior changes materially affect agent output or reviewability
- docs stay aligned on what context is configurable, what remains
  developer-owned, and what must graduate into deterministic product logic

## Sequencing Rules

- Do not start with end-user prompt editing.
- Do not let preference or context configuration expand authority, tools,
  action types, or row-level access.
- Do not treat freeform application context as a durable contract once a typed
  workspace context provider exists for that surface.
- Ship explainability and preview alongside context configurability so admins
  and users can inspect the effective result before relying on it.
- Start user-configurable context with personal preferences and aliases before
  shared organization-wide profiles.
- Promote repeated context-routing or glossary behavior into typed product
  metadata instead of repeatedly compensating in prompt prose.

## WP-01: Context Contract And Source Registry

### Priority

P0

### Outcome

Every prompt section becomes an explicit, typed context object with known
ownership, provenance, and merge behavior.

### Why this matters

The current prompt foundation is conceptually strong, but parts of it still act
like assembled prose. The platform needs a first-class contract for what each
section is, who owns it, how fresh it should be, and whether it is generated,
configured, or fallback-only.

### Scope

- define a context-section contract with fields such as:
  - `section_key`
  - title and display order
  - source type
  - scope
  - owner role or owner object
  - sensitivity classification
  - freshness expectation
  - merge strategy
  - version and status
- create a server-owned registry for the current prompt layers
- document which sections are:
  - immutable system sections
  - generated runtime sections
  - configurable metadata-backed sections
  - fallback sections
- expose section metadata through prompt preview and internal runtime helpers
- define which section types may be omitted, downgraded to warning, or treated
  as required for certain agents or workspaces

### Out of scope

- end-user configuration UI
- new authority or tool behavior
- replacing the current prompt rendering format in one pass

### Suggested owner profile

Backend or platform engineer with assistant-runtime and contract-design context.

### Dependencies

- current assistant prompt assembly
- current prompt-preview surface

### Acceptance criteria

- the current prompt layers are represented in a registry or equivalent
  server-owned contract
- prompt preview can show section identity and source metadata, not only raw
  section text
- the team can tell which sections are generated, configurable, or fallback
- tests verify unique section keys, valid ordering, and valid source metadata

## WP-02: Organization Context, Glossary, And Guardrail Registry

### Priority

P0

### Outcome

Company context, operating-model notes, glossary terms, and hard guardrails are
managed as versioned product metadata instead of mostly env-backed prose.

### Why this matters

Organization context is one of the most important prompt layers, but it is
currently thin and difficult to govern. Moving it into metadata makes it
reviewable, publishable, and eventually configurable through approved admin
workflows.

### Scope

- define organization-context objects such as:
  - company profile
  - operating-model summary
  - glossary or alias definitions
  - principles and guardrails
  - optional product-surface descriptors
- choose the first persistence and publication model
- define global-only ownership and publish controls for sensitive guardrail
  content
- preserve env-backed fallback values where bootstrap safety still matters
- separate factual company descriptors from normative guardrails and policy
  boundaries
- feed the active published definitions into prompt assembly and preview

### Out of scope

- end-user editing of organization-wide guardrails
- broad document-ingestion or RAG knowledge-base expansion
- policy changes that should remain deterministic service logic

### Suggested owner profile

Full-stack engineer with product or operations input on terminology and
governance.

### Dependencies

- WP-01 context contract and source registry

### Acceptance criteria

- at least one published organization context record can replace or augment the
  current env-backed company prose
- prompt preview exposes which published organization definitions are active
- glossary and guardrail content are versioned and auditable
- fallback-to-env behavior is explicit and visibly warned when used

## WP-03: User Context Identity And Preference Model

### Priority

P0

### Outcome

User context is split into authority-relevant identity and low-risk personal
preferences so the assistant can personalize safely without confusing
preferences with permissions.

### Why this matters

Today user context is mostly authentication identity. That is a good baseline,
but richer context needs a clearer separation between:

- who the user is in the workflow
- what they are allowed to do
- how they prefer context and answers to be shaped

### Scope

- define a first-class user-context model with separate lanes for:
  - identity and role context
  - optional team, desk, or operating-group context when available
  - low-risk user preferences such as timezone, unit preferences, default
    workspace, watch areas, and response format
- define reset and fallback behavior for user preferences
- explicitly document which personal data should not be captured by default for
  assistant context, such as residence, home address, or private biography
- make sure preference changes affect personalization but do not alter
  authority, approvals, or allowed actions
- expose effective user context in prompt preview in a way that distinguishes
  identity-derived and preference-derived inputs

### Out of scope

- end-user-managed permission changes
- storing arbitrary private notes for prompt injection
- introducing a full HR-style profile system

### Suggested owner profile

Backend engineer with frontend or settings-surface support.

### Dependencies

- WP-01 context contract and source registry
- benefits from WP-02 where organization defaults feed user fallback behavior

### Acceptance criteria

- prompt preview distinguishes identity and preference context
- a preference update can change effective prompt context without widening
  authority
- users can reset low-risk preferences to inherited defaults
- tests verify that preference changes do not alter action scope, tool scope,
  or reviewer rules

## WP-04: Typed Workspace And Application Context Providers

### Priority

P1

### Outcome

Workspace and application context become structured runtime contracts instead of
relying mainly on freeform context strings.

### Why this matters

The current `Application Context` section is flexible, but flexibility alone
becomes brittle as more workspaces and handoffs depend on it. Typed context
providers make context safer, more composable, and easier to inspect.

### Scope

- define typed workspace-context contracts for the first target surfaces, such
  as:
  - dashboard
  - trades
  - operations
  - settlement
  - reports
- include fields such as selected object IDs, active filters, inspector focus,
  summary targets, time windows, and source route or handoff metadata
- add a provider interface that can emit context payloads plus provenance and
  freshness metadata
- progressively replace raw freeform `context` payloads with typed providers
  where stable product seams exist
- preserve a narrow supplemental freeform note lane only where structured
  fields are intentionally insufficient

### Out of scope

- forcing every workspace into full typed context before the first slice ships
- changing business mutation contracts
- full prompt-routing redesign

### Suggested owner profile

Full-stack engineer comfortable with both route state and assistant runtime.

### Dependencies

- WP-01 context contract and source registry
- WP-03 user context model for user-aware workspace defaults

### Acceptance criteria

- at least two workspaces provide typed context to the assistant
- prompt preview and run traces show structured workspace context with source
  metadata
- invalid or unsupported workspace context fails closed with a visible warning
- tests cover one normal typed handoff and one rejected invalid payload

## WP-05: Context Preview, Explainability, And Drift Warnings

### Priority

P1

### Outcome

Users, admins, and engineers can inspect why a context section exists, where it
came from, how fresh it is, and how it changed between runs or profiles.

### Why this matters

Context is only trustworthy if it is explainable. The existing prompt-preview
surface is the right anchor, but it needs richer metadata, drift warnings, and
comparison tools before context configuration becomes a product feature.

### Scope

- expand prompt preview with section-level metadata such as:
  - source labels
  - version IDs
  - status
  - sensitivity and freshness
  - fallback usage
  - structured versus unstructured context flags
- add context diffing between:
  - two runs
  - two agents
  - two profiles
  - current versus prior published context definitions
- surface warnings for missing, stale, fallback-only, or unstructured sections
- ensure assistant runs record enough context metadata to support replay and
  supervision
- define which warnings are informational versus blocking for high-trust flows

### Out of scope

- a full admin control-tower redesign
- automated self-repair of stale context sources

### Suggested owner profile

Backend or full-stack engineer with strong explainability and audit instincts.

### Dependencies

- WP-01 through WP-04

### Acceptance criteria

- prompt preview can explain the source and status of every active section
- at least one context diff workflow exists for review or debugging
- stale or fallback-only context is visibly flagged before users rely on it
- assistant evals cover at least one changed-context and one stale-context case

## WP-06: User-, Team-, And Org-Configurable Context Profiles

### Priority

P1

### Outcome

Users gain a governed way to configure low-risk context and defaults through
metadata-backed profiles, without editing unrestricted system prompts.

### Why this matters

User configurability is valuable, but letting people edit the raw prompt would
quickly blur authority, policy, and product behavior. Context profiles give the
product a safer extensibility surface aligned with the existing
`user`/`team`/`global` and `draft`/`published`/`retired` model.

### Scope

- define a context-profile object or equivalent metadata primitive with:
  - scope
  - lifecycle status
  - owner
  - inherited base profile
  - allowed setting categories
  - audit and version fields
- support safe configurable fields such as:
  - preferred default agent
  - glossary aliases
  - response structure preferences
  - watched books, commodities, or queues
  - default workspace or summary focus
  - enabled low-risk context modules
- support inheritance from organization to team to user with deterministic
  merge behavior
- require publish controls for team and global profiles
- add preview-before-save and validation-before-publish paths
- explicitly prevent context profiles from changing:
  - authority ceilings
  - allowed tools
  - allowed action types
  - permission rules
  - deterministic policy behavior

### Out of scope

- arbitrary user editing of the system prompt
- policy or workflow-rule editing
- changing reference-data or business writes through context profiles

### Suggested owner profile

Full-stack engineer with assistant governance context and settings-surface
experience.

### Dependencies

- WP-01 through WP-05
- [User Extensibility Initiative](./user-extensibility-initiative.md) scope and
  lifecycle model

### Acceptance criteria

- a user can save a personal context profile that changes low-risk effective
  context
- an authorized owner can publish a team or global profile
- prompt preview shows the resolved effective profile and inheritance chain
- invalid or out-of-bounds configuration is rejected with actionable errors

## WP-07: Promotion And Governance Path For Context Rules

### Priority

P1

### Outcome

The platform has a visible path for promoting repeated context customizations
into stronger product behavior and for retiring weak or stale context
definitions before they accumulate.

### Why this matters

User-configurable context will create pressure to keep growing metadata. The
repo already prefers moving durable, repeated judgment into deterministic
product behavior. Context rules need the same graduation path.

### Scope

- define promotion triggers for context definitions and profiles, such as:
  - repeated cross-team adoption
  - stable routing or alias behavior
  - workflow branching dependence
  - required reporting or integration semantics
  - recurring reviewer expectations
- define owner roles and review cadence for promoted context behavior
- define retirement and reset criteria for stale, unused, or conflicting
  context profiles
- connect recurring context behavior to the agent knowledge base and
  deterministic algorithm loop where appropriate
- define which context behavior should become:
  - product metadata
  - deterministic provider logic
  - policy rules
  - core schema

### Out of scope

- immediate automation of promotion decisions
- turning all context behavior into rigid global policy

### Suggested owner profile

Product-minded architect or full-stack engineer with governance and
platform-shape responsibility.

### Dependencies

- WP-06 user-, team-, and org-configurable context profiles
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)

### Acceptance criteria

- the repo has documented promotion criteria for context rules and profiles
- stale or unowned context definitions can be retired cleanly
- repeated prompt-only behavior has a named path into metadata, provider logic,
  or deterministic product behavior
- docs are explicit about what remains configurable versus what must graduate

## Likely Repo Touchpoints

The first implementation wave will likely touch these areas:

- `apps/api/app/domains/assistant/services/prompt_context.py`
  - section registry, prompt assembly, context metadata, and preview enrichment
- `apps/api/app/routes/assistant.py`
  - context preview and assistant-response contracts
- `apps/api/app/config.py`
  - fallback defaults for organization context while metadata-backed context
    lands
- `apps/api/app/models/user_account.py`
  - or adjacent new models for user preferences and effective context metadata
- `apps/api/app/domains/assistant/services/policies.py`
  - enforcement that configuration never widens role, tool, or action scope
- `apps/api/tests/test_assistant_evals.py`
  - context composition, fallback, drift-warning, and profile-boundary cases
- `apps/web/src/workspaces/settings`
  - user preferences and future context-profile controls
- `apps/web/src/workspaces/admin`
  - organization context, published profiles, and explainability surfaces

## Success Measures

- users and admins can answer what context an agent used and why
- organization context, glossary, and guardrails stop depending on one hidden
  prose string
- richer personalization lands without changing authority boundaries
- repeated context behavior moves into metadata or deterministic product logic
  instead of accumulating as prompt-only instructions
- user-configurable context reduces one-off engineering requests without
  weakening auditability, explainability, or policy control
