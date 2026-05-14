# Agent Knowledge Base

## Purpose

This file is the shared memory surface for agents working in this repo. Use it
to preserve reusable lessons about autonomy, deterministic algorithms, action
governance, stop conditions, and implementation patterns.

The knowledge base should help future agents answer:

- Has this judgment already been turned into deterministic logic?
- Is there a known boundary where agents should draft, stage, or stop?
- What tests, services, or docs should be updated when this pattern appears
  again?
- Which lessons are still proposals, and which are accepted practice?

Keep entries short, cited to repo paths where possible, and safe to review in
source control. Do not store secrets, credentials, private counterparty content,
or raw production data.

## How Agents Should Use This

Before increasing autonomy or adding a new action type:

1. Read [Agent Autonomy Rubric](./agent-autonomy-rubric.md).
2. Search this file for related domains, action types, formulas, and stop
   conditions.
3. Prefer an existing deterministic algorithm or governance pattern when one
   applies.
4. If no pattern exists and the judgment is recurring, propose or implement a
   deterministic algorithm.
5. Add or update a lesson after the work, especially when future agents would
   otherwise have to rediscover the same boundary.

## Entry Types

Use one of these types:

| Type                  | Use when                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| `lesson`              | A reusable practice or boundary was learned.                                |
| `algorithm-candidate` | A recurring judgment should probably become deterministic logic.            |
| `algorithm-added`     | Deterministic logic was implemented or promoted.                            |
| `stop-condition`      | Future agents should pause, narrow authority, or ask for review.            |
| `promotion-signal`    | Evidence suggests an agent behavior may be safe to promote.                 |
| `retirement-signal`   | Evidence suggests an agent behavior should be paused, narrowed, or removed. |

## Entry Template

```md
### YYYY-MM-DD - Short Title

- Type: lesson | algorithm-candidate | algorithm-added | stop-condition | promotion-signal | retirement-signal
- Domain:
- Applies to:
- Status: proposed | accepted | implemented | retired
- Source:
- Lesson:
- Deterministic opportunity:
- Agent autonomy impact:
- Tests or evidence:
- Follow-up:
```

## Deterministic Algorithm Proposal Checklist

When an agent proposes a new deterministic algorithm, capture:

- the business question it answers
- the owner or reviewer role
- required inputs and source freshness assumptions
- row-level access or permission assumptions
- exact outputs and allowed states
- rule table, formula, threshold, or invariant set
- edge cases and stop conditions
- service, formula, policy, or projection layer where it belongs
- tests, evals, and fixture data needed
- audit, lineage, idempotency, and rollback expectations

If the proposal touches pricing, risk, settlement, credit, compliance,
permissions, reference data, policy, or external commitments, keep it in
proposal form until a human owner approves the domain rule.

## Lessons

### 2026-05-14 - Constrain Delivery Transport Modes Through Commodity Reference Data

- Type: algorithm-added
- Domain: operations scheduling, delivery controls, and commodity reference
  governance
- Applies to: reference commodity masters, delivery transport-mode edits,
  scheduling transport filters, and future product onboarding
- Status: implemented
- Source:
  `apps/api/app/models/reference_commodity.py`,
  `apps/api/app/routes/reference_data_routes/commodities.py`,
  `apps/api/app/domains/reference_data/services/commodity_transport_modes.py`,
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/web/src/workspaces/shipments/DeliveryDetailEditor.tsx`,
  `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`,
  `apps/api/tests/test_deliveries_api.py`,
  `apps/api/tests/test_reference_data.py`, and
  `apps/web/tests/transportModes.test.ts`
- Lesson: when product transport feasibility varies by commodity, keep the
  allowed mode list on the governed commodity master and enforce delivery edits
  against that typed list. Operators should not have to remember which products
  can move by pipeline, vessel, rail, truck, air, or power grid, and agents
  should not invent transport compatibility from prose.
- Deterministic opportunity: use the same commodity-owned transport list to
  drive scheduler filters, delivery-control dropdowns, and seeded defaults for
  newly onboarded products instead of duplicating the rule across prompts or
  screens.
- Agent autonomy impact: agents can explain which modes are available for a
  product, but they should not propose unsupported transport combinations that
  fall outside the commodity reference record.
- Tests or evidence:
  `apps/api/tests/test_deliveries_api.py`,
  `apps/api/tests/test_reference_data.py`,
  `apps/web/tests/schedulingWorkspace.test.ts`, and
  `apps/web/tests/transportModes.test.ts`
- Follow-up: review and refine the seeded mode sets commodity by commodity as
  more metals, coal, and other physical products are introduced.

### 2026-05-10 - Organization Prompt Context Should Come From Published Metadata Before Env Fallback

- Type: lesson
- Domain: assistant prompt governance and organization context management
- Applies to: company profile, operating model, glossary, guardrails, and
  future user-configurable context profiles
- Status: implemented
- Source:
  `apps/api/app/models/assistant_organization_context.py`,
  `apps/api/app/domains/assistant/services/organization_context_registry.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `docs/engineering/ai-workflow.md`
- Lesson: organization-facing prompt sections should not stay as a single
  env-backed prose block once they start carrying reusable company facts,
  glossary terms, and guardrails. Publish those inputs as versioned backend
  metadata first, let prompt assembly prefer the latest published definitions,
  and keep env-backed strings only as a visible bootstrap fallback.
- Deterministic opportunity: add admin publish workflows and later
  user/team/org-scoped context profiles on top of the same versioned metadata
  seam instead of introducing freeform prompt editing.
- Agent autonomy impact: this improves prompt explainability and future-safe
  configurability without widening agent authority, tool access, or mutation
  rights.
- Tests or evidence:
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_preview_includes_business_user_and_data_sections`
  and
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_preview_prefers_published_organization_registry_sections`
- Follow-up: keep organization-wide editing on the governed admin surface for
  now, then layer team or user configurability on top of the same versioned
  metadata seam instead of exposing freeform prompt editing.

### 2026-05-14 - Versioned Organization Context Should Use Draft Edit And Explicit Publish Semantics

- Type: lesson
- Domain: assistant prompt governance and admin lifecycle controls
- Applies to: organization context definitions, glossary terms, guardrails,
  and future team or user context profiles
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/organization_context_registry.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/api/app/schemas/assistant.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `docs/engineering/ai-workflow.md`
- Lesson: once organization context becomes versioned metadata, published
  records should stop being directly editable. Keep edits on drafts only,
  publish the latest version explicitly, and retire prior published versions
  automatically for the same `definition_key` so prompt provenance stays
  reviewable.
- Deterministic opportunity: reuse the same draft, publish, and retire
  lifecycle for future user or team context-profile objects instead of
  inventing prompt-specific editing rules later.
- Agent autonomy impact: this widens configuration governance and reviewability
  without widening agent runtime authority or allowing silent prompt mutation.
- Tests or evidence:
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_admin_organization_context_definition_crud_publish_and_retire_flow`
- Follow-up: add a web admin surface when the backend workflow stabilizes, then
  reuse the same lifecycle for scoped context profiles in WP-06.

### 2026-05-08 - Simple Arbitrage Detection Should Become A Deterministic Pre-Trade Service

- Type: algorithm-candidate
- Domain: pre-trade arbitrage detection and opportunity ranking
- Applies to: product or quality arbitrage, time arbitrage, geographic
  arbitrage, and trader-facing opportunity ranking
- Status: proposed
- Source: [Pre-Trade Design](./pre-trade-design.md),
  [Arbitrage Detection Design](./arbitrage-detection-design.md),
  [Business Use Case Roadmap](./business-use-case-roadmap.md), and
  [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- Lesson: when traders repeatedly compare `Product A` versus `Product B`,
  `Time A` versus `Time B`, or `Place A` versus `Place B`, the platform should
  not leave the economics inside prompt-only reasoning. The repeatable core is
  a deterministic graph search that normalizes tradable states, applies typed
  transformation edges, and prices executable opportunities using explicit
  bridge costs such as conversion price, storage price, or transportation
  price.
- Deterministic opportunity: create a typed arbitrage-detection service that
  generates candidate state pairs, finds the cheapest feasible path, prices
  buys at ask and sells at bid when available, calculates gross spread plus
  explicit cost stack, ranks net opportunity, and returns missing-evidence or
  stop-condition labels whenever the economics cannot be trusted.
- Agent autonomy impact: agents may explain, summarize, and draft pre-trade
  scenarios from the deterministic output, but they should not become the
  system of record for conversion, storage, transportation, or arbitrage
  ranking values.
- Tests or evidence: future implementation should add focused service tests for
  conversion, storage, transport, stale-source, and unsupported-mapping cases,
  plus assistant evals if managed agents consume the new typed outputs.
- Follow-up: define the first normalized arbitrage payload contract and decide
  whether the resulting opportunity remains recommendation output or becomes a
  first-class `Market opportunity` object.

### 2026-05-08 - External ChatGPT Access Should Start As A Governed Remote MCP Transport

- Type: lesson
- Domain: external ChatGPT integration, MCP transport, and assistant
  governance
- Applies to: personal ChatGPT account access, remote MCP app design, future
  ChatGPT app rollout, and any write-capable external tool exposure
- Status: accepted
- Source: [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md),
  [Agent Action Request Contract](./agent-action-request-contract.md),
  [Human-Agent Authority Matrix](./human-agent-authority-matrix.md), and
  [AI Workflow](./ai-workflow.md)
- Lesson: when ECTRM is exposed to a user's own ChatGPT account, treat the
  remote MCP server as a transport over governed ECTRM services rather than as
  a second assistant runtime with looser rules. Start with read-only
  `search` and `fetch` over curated, permission-aware read models, prove auth,
  provenance, and citation behavior first, and only then consider narrow
  write-capable tools that map to typed services or approval-gated action
  requests.
- Deterministic opportunity: centralize tool metadata such as read-only
  posture, schemas, ownership, and publication status so the internal
  assistant and external MCP surface do not drift into separate governance
  models.
- Agent autonomy impact: external ChatGPT access can broaden where users
  interact with ECTRM, but it should not broaden what an agent may do beyond
  the existing authority matrix or action-request contract.
- Tests or evidence: [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md)
  requires focused backend tests for schema and auth, explicit MCP verification
  coverage, and `make api-assistant-evals` updates whenever governed action
  behavior changes.
- Follow-up: implement Wave 0 before any public or write-capable rollout, and
  treat shared tool-catalog governance as a prerequisite for broader external
  exposure.

### 2026-05-08 - Prove The External MCP Seam With A Docs-Only Read Surface First

- Type: lesson
- Domain: MCP transport scaffolding, rollout sequencing, and local developer
  safety
- Applies to: first remote MCP implementation, ChatGPT developer-mode
  connection prep, and future expansion from docs retrieval into governed
  business tools
- Status: implemented
- Source:
  `apps/api/app/domains/mcp/services/server.py`,
  `apps/api/app/domains/mcp/services/docs_catalog.py`,
  `apps/api/app/domains/mcp/routes/http.py`,
  `apps/api/tests/test_mcp_api.py`, and
  `docs/engineering/chatgpt-mcp-work-packages.md`
- Lesson: when adding a brand-new external MCP transport to ECTRM, first prove
  transport reachability, tool discovery, and citation shape with a read-only
  docs catalog mounted behind a config flag in the existing FastAPI service.
  Starting with standard `search` and `fetch` over checked-in repo documents
  keeps the surface useful for local and developer-mode testing without opening
  protected business reads or creating a second write path.
- Deterministic opportunity: centralize document-catalog metadata and
  canonical citation URL construction so internal assistants and external MCP
  tools can share the same provenance rules.
- Agent autonomy impact: a no-auth docs-only MCP surface is acceptable as a
  local development shortcut, but it should not be mistaken for the hosted auth
  design needed for durable personal-account or team use.
- Tests or evidence: focused MCP startup, tool-discovery, and route-registry
  tests live in `apps/api/tests/test_mcp_api.py` and
  `apps/api/tests/test_http_router_registry.py`.
- Follow-up: land WP-03 before exposing protected business reads through the
  external MCP surface, then replace repo-doc retrieval with curated,
  permission-aware ECTRM read models.

### 2026-05-08 - MCP OAuth Should Resolve To Existing User Sessions, Not A Parallel Identity Model

- Type: lesson
- Domain: external MCP auth, identity mapping, and governed transport reuse
- Applies to: ChatGPT developer-mode OAuth, other OAuth-capable MCP clients,
  and future business-data tools exposed through the remote MCP surface
- Status: implemented
- Source:
  `apps/api/app/domains/mcp/services/oauth.py`,
  `apps/api/app/core/auth.py`,
  `apps/api/app/main.py`,
  `apps/api/tests/test_mcp_oauth.py`, and
  `docs/engineering/chatgpt-mcp-work-packages.md`
- Lesson: the MCP OAuth bridge should terminate in the same ECTRM `UserAccount`
  and `UserSession` concepts the rest of the product already trusts. OAuth
  access and refresh tokens can be MCP-specific, but they should still anchor
  to revocable ECTRM sessions and project the resulting actor into request
  context so future tool handlers can reuse the same permission and audit seams
  as the web app and internal assistant.
- Deterministic opportunity: centralize token-to-actor resolution so external
  MCP calls, internal assistant tools, and future background automations all
  share one actor-projection path into request context.
- Agent autonomy impact: external transport changes where a request originates,
  but not who it is acting as; every MCP tool call should still run as an
  explicit ECTRM principal or not at all.
- Tests or evidence: `apps/api/tests/test_mcp_oauth.py` covers dynamic client
  registration, browser authorization, token exchange, identity resolution, and
  authenticated MCP tool discovery over mounted HTTP.
- Follow-up: reuse the same actor projection when MCP handlers start calling
  governed business read services, then extend the pattern into approval-gated
  write tools instead of introducing separate auth plumbing there.

### 2026-05-08 - Expose Managed-Agent Construction Through Read-Only Roster Tools

- Type: lesson
- Domain: assistant roster introspection and managed-agent explainability
- Applies to: chat questions about agent construction, specialization,
  hierarchy, and managed-agent relationships
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/assistant/services/registry.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when users ask the assistant how managed agents are built or how
  they relate to each other, expose that information through explicit read-only
  live tools instead of relying on hidden prompt knowledge or stale docs. The
  roster tool surface should return the managed-agent build recipe, role and
  skill metadata, workspace and tool policy, and parent or subordinate
  relationships in a form the assistant can cite back safely.
- Deterministic opportunity: keep the managed-agent graph and build recipe in a
  single typed payload contract so future admin UI, control-tower summaries,
  and chat explanations all read from the same server-owned structure.
- Agent autonomy impact: read-capable agents can explain the managed-agent
  roster and hierarchy without widening mutation authority or bypassing action
  governance.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_api
  apps.api.tests.test_assistant_tooling` and `make api-assistant-evals`
- Follow-up: if users start asking for graphical org-chart or dependency views,
  publish a dedicated roster summary service instead of expanding prompt-only
  formatting instructions.

### 2026-05-08 - Publish Whole-App Read Access Through Explicit Introspection Tools

- Type: lesson
- Domain: assistant platform introspection, schema explainability, and codebase
  grounding
- Applies to: chat questions about app topology, routes, workspaces, database
  schema, source code, engineering docs, and read-capable managed-agent
  visibility
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/app_context_catalog.py`,
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `docs/engineering/ai-workflow.md`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when users ask how ECTRM is built or where logic lives, expose
  application topology, schema metadata, and published repo code through
  explicit read-only tools instead of relying on stale prompt memory. The core
  surface should include an application catalog, a schema catalog, code search,
  and bounded file reads, and the prompt foundation should advertise those
  surfaces as governed context rather than hidden prompt prose.
- Deterministic opportunity: keep route registration, workspace inventory,
  schema metadata, and published code roots in one server-owned catalog so
  assistant chat, managed agents, and future remote MCP transports share the
  same explainability contract.
- Agent autonomy impact: `READ` agents can inspect more of the platform without
  widening mutation authority. Keep writes behind typed services and
  approval-gated action paths even when the assistant can now inspect the whole
  app.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_tooling
  apps.api.tests.test_assistant_agent_admin_service
  apps.api.tests.test_assistant_api
  apps.api.tests.test_assistant_evals` and `make api-assistant-evals`
- Follow-up: if these same introspection payloads need to power admin UI
  diagrams or external MCP discovery, publish the shared catalog directly
  rather than duplicating route or schema summaries in separate prompt text.

### 2026-05-08 - Keep Raw Gmail Inbox Reads As Explicit Assistant Live Tools

- Type: lesson
- Domain: assistant live tools and document intake integrations
- Applies to: Gmail inbox browsing, inbox summarization in chat, and document
  intake workflows that already import Gmail attachments
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/integrations/services/gmail_inbox.py`,
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: when chat needs access to a configured external inbox, expose
  read-only mailbox browse and detail operations as explicit assistant live
  tools that reuse the existing integration service. Do not treat raw inbox
  mail as prompt context, and do not conflate it with already imported
  document-ingestion records.
- Deterministic opportunity: centralize future mailbox-tool provenance and
  runtime-availability phrasing so new inbox connectors consistently
  distinguish raw messages from imported documents.
- Agent autonomy impact: agents can search and summarize Gmail messages when
  live tools are enabled, but inbox access remains read-only and distinct from
  document import or outbound email actions.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Follow-up: if specific managed roles should browse inbox content by default,
  update their allowlists deliberately instead of assuming all existing
  managed-agent profiles inherit newly published tools.

### 2026-05-08 - Keep Multi-Agent Control Shallow And Supervisor-Led

- Type: lesson
- Domain: managed agent hierarchy and inter-agent consultation
- Applies to: control-tower supervision, domain-manager agents, specialist
  agent consultation, and future multi-agent routing work
- Status: implemented
- Source:
  [Agent Hierarchy Contract](./agent-hierarchy-contract.md),
  `apps/api/app/models/assistant_agent.py`,
  `apps/api/app/domains/assistant/services/role_archetypes.py`, and
  `apps/api/app/domains/assistant/services/tools.py`
- Lesson: when ECTRM needs agents that manage other agents, default to a
  shallow supervisor or manager tree with explicit parent and subordinate
  metadata instead of peer-to-peer swarms. One manager should own final
  synthesis, specialist consultations should stay advisory-only, and runtime
  consultation should fail closed to configured subordinate agents when a
  manager declares them.
- Deterministic opportunity: if the same manager repeatedly routes the same
  request types to the same specialists, promote that routing rule into typed
  workflow or intent logic instead of keeping it as prompt-only delegation.
- Agent autonomy impact: managers can coordinate bounded specialist help
  without widening mutation authority or bypassing the approval-gated action
  contract.
- Tests or evidence:
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `make api-assistant-evals` for future consultation or hierarchy behavior
  changes.
- Follow-up: add outcome metrics for consultation frequency, failed
  consultations, and manager-to-specialist routing quality before promoting any
  hierarchy toward broader autonomous execution.

### 2026-05-08 - Keep Managed-Agent Delegated Execution Inside The Existing Action Gateway

- Type: lesson
- Domain: managed agent delegation, action governance, and autonomous
  execution
- Applies to: manager agents enlisting specialist agents to help execute
  bounded operational tasks
- Status: implemented
- Source:
  [Agent Hierarchy Contract](./agent-hierarchy-contract.md),
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/domains/assistant/services/policies.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when one managed agent needs another agent to help complete work,
  use an explicit delegation tool instead of hiding a second task inside prompt
  prose or widening the manager's own authority. The enlisted agent should run
  as its own managed-agent execution, inherit the original user context, and
  remain constrained by its own skills, tool allowlist, action types, and
  authority ceiling.
- Deterministic opportunity: if the same manager repeatedly enlists the same
  subordinate for the same intent pattern, promote that routing into typed
  workflow or intent logic rather than keeping it as open-ended prompt
  delegation.
- Agent autonomy impact: managers can coordinate bounded subordinate execution
  without gaining blanket write access, because any resulting mutation still
  becomes a typed action request and only self-executes when the enlisted
  profile is already approved for bounded execution.
- Tests or evidence:
  `./.venv/bin/python -m unittest
  apps.api.tests.test_assistant_tooling.AssistantToolingTests.test_enlist_managed_agent_records_delegated_run_and_executes_governed_action`,
  `apps.api.tests.test_assistant_evals`, and
  `make api-assistant-evals`
- Follow-up: add runtime metrics for delegation depth, enlistment frequency,
  and repeated manager-to-specialist routing so product owners can decide which
  flows should graduate into deterministic orchestration.

### 2026-05-08 - Treat Agent Context As Governed Metadata, Not Hidden Prompt State

- Type: lesson
- Domain: assistant prompt foundation and user-configurable context
- Applies to: organization context, user preferences, workspace context,
  managed-agent context, and future team or organization context profiles
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md),
  [User Extensibility Initiative](./user-extensibility-initiative.md), and
  [Agent Context And Configuration Work Packages](./agent-context-work-packages.md)
- Lesson: when the assistant needs richer context, add it through server-owned
  typed context definitions with scope, lifecycle, provenance, and policy
  boundaries instead of appending more hidden prompt prose or letting users edit
  unrestricted system prompts. Identity, authority, workspace focus,
  organization glossary, and user preferences should be separable context
  layers with explicit ownership.
- Deterministic opportunity: promote repeated routing, alias, or context-focus
  behavior into typed context providers, glossaries, or published context
  profiles instead of repeatedly compensating in prompt wording.
- Agent autonomy impact: agents can receive richer context and safer
  personalization without widening authority, bypassing policy, or hiding why a
  given answer was shaped a certain way.
- Tests or evidence: [AI Workflow](./ai-workflow.md),
  [Agent Context And Configuration Work Packages](./agent-context-work-packages.md),
  and `make api-assistant-evals` as the required verification lane when these
  packages become implementation work.
- Follow-up: implement the context contract and preview or diff packages before
  exposing end-user context configuration or shared profile publishing.

### 2026-05-08 - Make Rail Scheduling Readiness Route-Bound And Deterministic

- Type: algorithm-added
- Domain: operations rail scheduling and delivery-readiness projection
- Applies to: rail delivery obligations, scheduling blocker derivation,
  scheduling workspace filters, and any future rail-focused agent drafting
- Status: implemented
- Source:
  `docs/engineering/rail-delivery-schema.md`,
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/api/app/models/reference_rail_line.py`,
  `apps/api/app/models/reference_rail_route.py`, and
  `apps/api/app/models/delivery_rail_detail.py`,
  `apps/api/tests/test_deliveries_api.py`, and
  `apps/api/tests/test_shipments_api.py`
- Lesson: rail reference data only becomes scheduler-grade when each rail
  delivery binds to a curated route and the shared delivery projection derives
  readiness and blocker reasons from typed rail completeness checks. Freeform
  notes can explain context, but they should not be the only place route
  choice, station consistency, or waybill/release readiness exists.
- Deterministic opportunity: add delivery-bound `rail_route_code`, keep line
  membership derived through the reference hierarchy, and evaluate reason-coded
  blockers such as route-not-selected, station-missing, route-station-mismatch,
  and post-submission waybill or release gaps inside the shipment scheduling
  projection.
- Agent autonomy impact: agents can summarize what is missing for rail
  scheduling and propose next actions from typed blocker results, but they
  should not infer a route, clear a blocker, or claim a movement is ready from
  prose alone.
- Tests or evidence:
  `apps/api/tests/test_deliveries_api.py` and
  `apps/api/tests/test_shipments_api.py`
- Follow-up: use the derived `rail_route_code`, `rail_line_code`, and
  `railroad_code` fields when the scheduling workspace adds route-aware queue
  filters or rail-specific readiness views.

### 2026-05-08 - Store Rail Operating Clocks On Curated Routes Before Adding Demurrage Logic

- Type: lesson
- Domain: operations rail scheduling, reference data ownership, and delivery
  projection design
- Applies to: rail route master data, delivery scheduling views, future
  cutoff-aware blockers, and demurrage-risk heuristics
- Status: implemented
- Source:
  `docs/engineering/rail-delivery-schema.md`,
  `apps/api/app/models/reference_rail_route.py`,
  `apps/api/app/routes/reference_data_routes/rail_routes.py`,
  `apps/api/app/domains/admin/services/seed_reference_data.py`, and
  `apps/api/app/domains/operations/services/shipments.py`
- Lesson: the first useful rail service-window slice should live on the
  curated route, not on each delivery. Service calendar selection, local
  placement or release cutoffs, and starter free-time assumptions are reusable
  lane metadata. They should be maintained once in reference data and then
  projected onto each route-bound delivery as derived scheduling context.
- Deterministic opportunity: use the projected route clock for calendar-aware
  cutoff checks, free-time countdowns, and demurrage-risk warnings before
  introducing facility-specific overrides or richer rail milestone economics.
- Agent autonomy impact: agents can explain why a route's operating clock
  matters and summarize missing scheduling context from typed fields, but they
  should not invent service calendars, cutoff times, or free-time assumptions
  from notes alone.
- Tests or evidence:
  `apps/api/tests/test_reference_data.py`,
  `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_deliveries_api.py`, and
  `apps/api/tests/test_shipments_api.py`
- Follow-up: once operators are using these fields, promote missing or expired
  route-clock data into explicit readiness blockers and add calendar-aware
  milestone and demurrage projections.

### 2026-05-07 - Make Agent Specialization Explicit Through Skills And A Build Recipe

- Type: lesson
- Domain: managed agent construction, operator trust, and governed
  specialization
- Applies to: managed agent profiles, role-derived agent setup, agent builder
  UX, self-update drafts, and prompt context rendering
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/skills.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/domains/assistant/services/registry.py`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: users should not have to infer what an agent is from a hidden system
  prompt alone. A managed agent is now expressed as an explicit recipe:
  `role + skills + capabilities + workspaces + live tools + governed actions +
  system prompt`. Skills are first-class metadata that describe the agent's
  specialty, and inter-agent consultation is only available when the profile
  explicitly carries the `inter_agent_consultation` skill.
- Deterministic opportunity: when the same skill bundle keeps appearing for a
  role, preserve it in the governed role archetype and builder defaults rather
  than re-explaining specialization through freeform prompt text each time.
- Agent autonomy impact: agents become easier to review and safer to narrow
  because users, reviewers, and the runtime can all see the same explicit
  specialization contract before an agent reads, consults, stages, or acts.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_api apps.api.tests.test_assistant_tooling`
  and `npm --prefix apps/web test -- --run assistantAgentBuilder.test.ts
  assistantApi.test.ts`
- Follow-up: if consultation routing patterns stabilize, promote them into
  typed manager or workflow rules instead of expanding skill lists or prompt
  prose ad hoc.

### 2026-05-07 - Treat Trading EOD Readiness As A Deterministic Governed Decision

- Type: algorithm-candidate
- Domain: trading EOD governance and close-readiness classification
- Applies to: trading close runs, desk close packs, sign-off gates, waivers,
  and any future reporting or reconciliation agent that explains whether the
  desk is closed
- Status: proposed
- Source:
  `docs/engineering/trading-eod-work-packages.md`,
  `apps/api/app/domains/reports/routes/http.py`,
  `apps/api/app/domains/reports/services/trading_eod.py`,
  `apps/api/app/domains/operations/routes/operations.py`, and
  `apps/api/app/domains/admin/services/projection_monitoring.py`
- Lesson: whether the trading day is `READY`, `WARNING`, or `BLOCKED` should
  come from typed close checks over report basis, freshness, projection
  integrity, workflow backlog, settlement posture, and accrual coverage rather
  than from freeform assistant prose. Humans may sign off or waive specific
  checks under policy, but the platform should own the rule table and stale
  state semantics.
- Deterministic opportunity: add an EOD run service that records one close
  basis for the business date, evaluates check families into reason-coded
  results, rolls them into a run-level status, and preserves waiver and
  sign-off audit data behind typed services.
- Agent autonomy impact: agents can draft desk packs, summarize blockers, and
  explain carry-forward work from typed EOD results, but they should not
  declare the official trading day closed or waive blockers through prompt-only
  reasoning.
- Tests or evidence: the repo now has a first read-only implementation in
  `apps/api/app/domains/reports/services/trading_eod.py` with focused API
  coverage in `apps/api/tests/test_reports_api.py`; future promotion beyond
  the v0 read surface should still add broader service tests, web coverage for
  close rendering and sign-off state, and `make api-assistant-evals` coverage
  for no-overclaim behavior.
- Follow-up: implement `TEOD-01` through `TEOD-04` first so the close workflow
  has a stable basis, rule set, and summary surface before adding automation or
  agent drafting.

### 2026-05-07 - Agent-Created Filter Presets Must Use Typed Server-Owned Services

- Type: lesson
- Domain: assistant action governance and saved report filters
- Applies to: settlement report presets, future chat-created saved views, and
  any agent-authored filter preset that should be reusable across sessions or
  users
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/settlement_presets.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when a user asks the assistant to save a named filter preset, keep
  the durable write behind a typed domain service plus an approval-governed
  assistant action. Agents may read filter options and visible presets, and
  they may translate natural language into typed filter payloads, but the
  assistant should not write presets through browser-local storage or pass
  freeform model output straight into business state mutation.
- Deterministic opportunity: centralize future preset translation logic around
  typed option catalogs, conflict checks, scope rules, idempotency keys, and
  stale-state rechecks so new preset actions reuse one governed pattern instead
  of inventing prompt-only save behavior.
- Agent autonomy impact: agents can help users create reusable settlement
  lenses with low-risk autonomy while preserving review, visibility scope, and
  audit expectations for durable saved state.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`
- Follow-up: if users need the same workflow for other filter-heavy surfaces
  such as asset maps, first move those presets into a server-owned typed
  service before exposing a chat-driven create or update action.

### 2026-05-05 - Keep Loaded Market Data And Live News As Separate Tool Surfaces

- Type: lesson
- Domain: assistant live tools and external data provenance
- Applies to: market briefings, pre-trade research, risk summaries, and any
  future "latest" assistant tool
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/reference_data/services/external_data/market_context.py`,
  and
  `apps/api/app/domains/reference_data/services/external_data/market_news.py`
- Lesson: when the assistant needs "latest" market context, keep synced
  commodity prices and live headline fetches in separate read-only tools. That
  preserves provenance so the model can distinguish data already loaded into
  ECTRM from headlines fetched at response time.
- Deterministic opportunity: centralize future freshness and provenance labels
  for any live external read so new tools can reuse one typed contract instead
  of inventing ad hoc wording.
- Agent autonomy impact: agents can cite fresher market context without
  implying that live headlines mutated platform data or silently backfilled the
  external-data store.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py` and
  `apps/api/tests/test_market_news_service.py`
- Follow-up: if desk usage converges on a smaller approved news-provider set,
  promote that provider selection into typed configuration instead of prompt
  convention.

### 2026-05-05 - Surface Local-First External Delivery Fallbacks In Runtime Settings

- Type: lesson
- Domain: integrations and admin runtime visibility
- Applies to: projection-monitoring email delivery, future webhook or inbox
  transports, and Settings/Admin runtime surfaces
- Status: implemented
- Source:
  `apps/api/app/main.py`,
  `apps/api/app/domains/admin/services/projection_monitoring.py`, and
  `apps/web/src/workspaces/settings/SettingsWorkspace.tsx`
- Lesson: when an integration has a safe local archive fallback, expose that
  fallback explicitly through a server-owned runtime contract and UI instead of
  leaving operators to infer behavior from missing environment variables. The
  product should make it obvious whether a delivery path is still local-only or
  actually pointed at an external transport such as Gmail SMTP.
- Deterministic opportunity: centralize future integration readiness summaries
  as typed runtime metadata so Admin and Settings surfaces can stay consistent
  across email, chat, webhook, and inbox connectors.
- Agent autonomy impact: agents stay out of transport configuration changes,
  but they can now cite visible product state instead of guessing whether an
  external delivery path is active.
- Tests or evidence:
  `apps/api/tests/test_auth_http.py` and
  `apps/web/tests/projectionMonitoringEmailRuntime.test.ts`
- Follow-up: whenever a new external channel lands, add the same explicit
  runtime readiness surface before relying on that channel operationally.

### 2026-05-05 - Guided Home Prompt Kits Should Stay Visible and Deterministic

- Type: lesson
- Domain: prompt-first UX
- Applies to: Home prompt kits, information gathering asks, trade construction
  interview flows
- Status: implemented
- Source:
  [`promptHomePromptKits.ts`](../../apps/web/src/workspaces/prompt/promptHomePromptKits.ts)
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: when users repeatedly start the same research or trade-drafting
  conversations, expose a visible product-managed starter prompt instead of
  relying on hidden model instructions. Trade-construction kits should stay in
  draft mode, ask one gating question at a time, and confirm intent like real
  versus simulated or user-supplied versus assistant-built before proposing a
  structure.
- Deterministic opportunity: if prompt kits become role-specific, ordered by
  policy, or admin-managed, move them into typed configuration instead of
  leaving them as inline component literals.
- Agent autonomy impact: prompt kits improve explanation and drafting
  consistency without granting trade write authority or bypassing governed
  capture and review paths.
- Tests or evidence:
  [`promptHomePromptKits.test.ts`](../../apps/web/tests/promptHomePromptKits.test.ts)
  and
  [`promptHomeWorkspace.test.ts`](../../apps/web/tests/promptHomeWorkspace.test.ts)
- Follow-up: add future reusable prompt openings through the same visible Home
  prompt-kit surface so operators can inspect the opening question flow before
  sending.

### 2026-04-29 - Treat Movement Corrections as Reversals and Voids, Not Deletes

- Type: lesson
- Domain: assistant movement and logistics execution
- Applies to: `record_delivery_event`, `reverse_delivery_event`,
  `record_trade_actualization`, `void_trade_actualization`, execute-capable
  operations roles, and shipment correction previews
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/api/app/domains/operations/services/actualizations.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/tests/test_shipments_api.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when movement reality changes, preserve the operational audit trail
  by correcting through explicit domain verbs instead of deleting history.
  Delivery-event correction now appends an `EVENT_REVERSED` row that points at
  the mistaken event and recomputes live execution status from the remaining
  active business events, while actualization correction stamps `voided_at`,
  `voided_by`, and `void_reason` on the original actualization row and clears
  it from live projection state.
- Deterministic opportunity: keep delivery-event activity filtering,
  status recomputation, duplicate-reversal prevention, and actualization-void
  projection logic inside the typed shipment and actualization services so
  assistant planners only assemble evidence-backed payloads.
- Agent autonomy impact: execute-capable operations roles can now reverse
  mistaken movement events and void mistaken actualizations without per-action
  approval, but only through previewable typed contracts with stale-state
  rechecks, idempotency, provenance, and delegated-ability override logging.
- Tests or evidence: focused shipment service coverage in
  `apps/api/tests/test_shipments_api.py`; autonomous assistant execution
  coverage in `apps/api/tests/test_assistant_api.py`.
- Follow-up: apply the same non-destructive correction pattern to future
  logistics scheduling or movement-side ledger seams instead of adding delete
  shortcuts.

### 2026-04-27 - Treat Settlement Corrections as Voids and Reversals, Not Deletes

- Type: lesson
- Domain: assistant settlement execution
- Applies to: `issue_trade_invoice`, `void_trade_invoice`,
  `create_trade_payment`, `reverse_trade_payment`, execute-capable settlement
  roles, and settlement preview gates
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/tests/test_settlement_invoices_api.py`,
  `apps/api/tests/test_settlement_payments_api.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when settlement reality changes, preserve auditability by correcting
  through explicit domain verbs instead of deleting rows. Invoice correction
  now voids the invoice by marking it `NOT_REQUIRED` with `voided_at`,
  `voided_by`, and `void_reason`, while payment correction appends an
  offsetting negative payment with `reversal_of_payment_id` instead of
  overwriting the original receipt.
- Deterministic opportunity: keep payment-balance math, duplicate-reversal
  prevention, payment-state drift tokens, invoice-relief unwinds, and preview
  blockers inside the typed settlement services so assistant planners only
  stage or execute evidence-backed payloads.
- Agent autonomy impact: execute-capable settlement roles can now issue, void,
  record, and reverse settlement records to reflect asserted real-world state
  without per-action approval, but only through previewable typed contracts
  with stale-state rechecks, idempotency, provenance, and explicit override
  logging.
- Tests or evidence: focused settlement API coverage for invoice void and
  payment reversal flows, plus autonomous and approval-path assistant coverage
  in `apps/api/tests/test_assistant_api.py`.
- Follow-up: extend the same correction pattern to future logistics or movement
  correction seams instead of introducing hard-delete side doors.

### 2026-04-27 - Promote Accrual and Accounting Autonomy Through Immutable Ledgers

- Type: lesson
- Domain: assistant accrual and accounting execution
- Applies to: `create_manual_accrual_entry`, `reverse_accrual_entry`,
  `create_accounting_entry`, `reverse_accounting_entry`, seeded execute-capable
  controller roles, and assistant eval fixtures
- Status: implemented
- Source:
  `apps/api/app/domains/accruals/services/manual_entries.py`,
  `apps/api/app/domains/accounting/services/postings.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when an agent needs to correct accrual or accounting state to reflect
  reality, the mutation seam should be immutable and ledger-shaped rather than
  an in-place overwrite. Manual accrual changes now append `MANUAL_ADJUSTMENT`
  or `MANUAL_REVERSAL` entries on open lots and refresh lot rollups from the
  ledger, while accounting changes create balanced posting headers plus lines
  and reverse through offsetting entries that mark the original reversed.
- Deterministic opportunity: keep rollup recomputation, balanced-line
  validation, reversal-duplication checks, and trade-linkage validation inside
  the typed domain services so agent planners only assemble evidence-backed
  payloads instead of re-implementing finance rules in prompts.
- Agent autonomy impact: the accrual-controller and accounting-posting agents
  can now execute bounded internal corrections without per-action human
  approval, but only for immutable manual adjustments or reversals with
  stale-state rechecks, idempotency, provenance, and explicit override logging
  intact.
- Tests or evidence: focused service coverage in
  `apps/api/tests/test_trade_accruals_service.py` and
  `apps/api/tests/test_trade_accounting_service.py`; autonomous assistant
  execution coverage in `apps/api/tests/test_assistant_api.py`; builder
  coverage in `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: extend the same immutable pattern to future fee-recognition or
  official reporting posting seams instead of adding mutable side doors.

### 2026-04-27 - Promote New Mutation Seams Only Through Canonical Identifiers and Typed Services

- Type: lesson
- Domain: assistant trade capture and movement execution
- Applies to: `create_trade`, `amend_trade`, `record_delivery_event`, seeded
  execute-capable role scopes, and assistant eval fixtures
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/trading/services/event_writes.py`,
  `apps/api/app/domains/operations/services/shipments.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when a new governed mutation seam is promoted for autonomous agent
  execution, the assistant layer should call the canonical typed domain service
  instead of inventing a parallel write path. Trade creation and amendment now
  go through the event-write service, while delivery-event logging goes through
  the shipment service. Delivery actions should use the same canonical
  `build_delivery_obligation_id(...)` identifier shape that the operational
  resource layer derives, otherwise staged actions can look valid while the
  downstream execution projection cannot resolve the target record.
- Deterministic opportunity: keep planner payload resolution and seeded test
  fixtures aligned to the same ID builders and reference-data preconditions that
  the typed service expects, so new action seams fail fast at plan time instead
  of only during execution.
- Agent autonomy impact: execute-capable agents can now reflect reality for new
  trade bookings, trade amendments, and delivery event logging without a
  separate approval hop, but only through the published typed contract with
  stale-state checks, idempotency, and audit metadata intact.
- Tests or evidence: focused API coverage for autonomous trade create, amend,
  and delivery-event execution plus seeded-role catalog checks in
  `apps/api/tests/test_assistant_api.py` and
  `apps/api/tests/test_admin_seed_api.py`; builder coverage in
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: extend the same pattern to future governed operational seams only
  after the canonical domain service and identifier model are already stable.

### 2026-04-25 - Seed New Domain Agents With Truthful Mutation Scope

- Type: lesson
- Domain: assistant role activation and autonomy governance
- Applies to: seeded managed-agent profiles for trade capture, movement,
  accrual, accounting, and counterparty-state workflows
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/admin/services/seed_assistant_agents.py`, and
  `apps/web/src/workspaces/admin/assistantAgentBuilder.ts`
- Lesson: new domain-facing agents can be activated before every desired write
  seam exists, but their role contract, prompt, and seeded profile must name
  the live typed action surface honestly. In this pass, movement and
  counterparty-state roles were allowed to execute existing governed actions,
  trade capture was limited to the currently published cancellation action, and
  accrual plus accounting roles stayed draft-only until typed mutation
  contracts exist.
- Deterministic opportunity: when new trade-create, trade-amend, accrual, or
  accounting-entry actions are introduced, expand the role catalog through the
  typed action registry first, then promote the affected seeded roles and eval
  coverage together.
- Agent autonomy impact: agents may stay active and useful while broader write
  authority is still being built, but they should never imply an execution path
  that the governed action registry cannot actually perform.
- Tests or evidence: `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: add explicit typed actions for trade create or amend, accrual
  adjustments, and accounting postings before promoting those seeded roles
  beyond their current bounded scope.

### 2026-04-25 - Prefer Narrow Controller Agents Once Action Seams Stabilize

- Type: lesson
- Domain: managed-agent role design
- Applies to: confirmation, workflow, invoice, outreach, and supervision
  agent specialization
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/admin/services/seed_assistant_agents.py`, and
  `apps/web/src/workspaces/admin/assistantAgentBuilder.ts`
- Lesson: once a governed action seam is stable, it is useful to seed narrower
  controller agents around that seam instead of relying only on broader
  copilot roles. The narrower role should have a tighter mission, a smaller
  tool set, and stop conditions that push adjacent work back to the right
  business record or human owner.
- Deterministic opportunity: if multiple narrow agents repeatedly hit the same
  stop condition, that gap is a good candidate for a new typed action contract
  or a shared deterministic routing helper.
- Agent autonomy impact: narrower agents can be activated earlier and audited
  more easily because their allowed mutations and override rationales are
  easier to reason about.
- Tests or evidence: `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: keep specialized controller agents aligned to the same action
  registry and policy notes as the broader copilot roles so they do not drift
  into parallel mutation rules.

### 2026-04-25 - Agent Learning Must Produce Reviewable Self-Update Drafts

- Type: lesson
- Domain: assistant agent governance and prompt management
- Applies to: managed-agent prompt changes, feedback-driven tuning, eval-driven
  revisions, admin review surfaces
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/agent_revisions.py`,
  `apps/api/app/domains/assistant/services/agent_self_updates.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/routes/assistant.py`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: when an agent learns from recent mistakes, the platform should turn
  that evidence into a constrained self-update draft instead of silently
  mutating the active prompt. The draft is built from recent needs-work
  feedback, failing evals, autonomy-review reasons, and matched knowledge-base
  lessons, then stored as an unpublished agent revision with a visible diff
  against the published snapshot. Admins can load that revision into the editor
  for refinement, but the live agent changes only after an explicit publish
  step. The draft preserves identity and governance metadata and may only
  preserve or narrow workspaces, capabilities, live tools, or governed action
  types.
- Deterministic opportunity: repeated failure patterns that point to stable
  business rules should still graduate into typed policy, service logic, or
  eval coverage instead of staying prompt-only.
- Agent autonomy impact: agents can now improve their own draft configuration
  under human review, but they still may not self-publish broader authority or
  silently rewrite production behavior.
- Tests or evidence: `apps/api/tests/test_assistant_api.py` and
  `apps/web/tests/assistantApi.test.ts`.
- Follow-up: when the same self-update theme recurs, add or tighten eval cases
  so future learning remains measurable and promotion decisions stay grounded.

### 2026-04-24 - Pre-Trade Booking Must Recheck Approval Drift

- Type: algorithm-added
- Domain: pre-trade review governance and trade capture
- Applies to: pre-trade approval drift checks, trade booking guards, capture UI
  alignment banners, review audit reconstruction
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_review_drift.py`,
  `apps/api/app/domains/trading/services/trade_event_application.py`,
  `apps/api/app/routes/pretrade.py`, and
  `apps/web/src/features/trades/TradeCaptureForm.tsx`
- Lesson: booking an approved pre-trade review now requires a deterministic
  drift comparison against the approval-time baseline before the trade can be
  created. The shared drift service compares the approval activity and
  immutable approval snapshot against the current attached recommendation, any
  newer related recommendation run, newly impaired evidence sources, and the
  current override context. The trade capture UI can surface that state early,
  but the booking guard in the server remains the authority that blocks stale
  approvals with a `409`.
- Deterministic opportunity: keep future drift dimensions inside the shared
  drift evaluator so approval checks, booking guards, exports, and UI banners
  reuse the same reason codes and do not fork into prompt-side heuristics.
- Agent autonomy impact: agents and UI flows may explain drift, but they should
  not waive or bypass the server-side re-approval requirement when approved
  evidence has changed.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py` and
  `apps/web/tests/preTradeApi.test.ts`.
- Follow-up: if risk or compliance wants additional drift dimensions, add them
  to the typed drift contract and regression tests before surfacing them in the
  assistant or workspace copy.

### 2026-04-24 - Candidate Queues Need Deterministic Priority Order

- Type: algorithm-added
- Domain: operations and settlement candidate reads
- Applies to: trade attention candidate lists, invoice issue candidate lists,
  dashboard attention drilldowns, settlement candidate drilldowns, assistant
  live candidate tools
- Status: implemented
- Source:
  [`trade_attention_candidates.py`](../../apps/api/app/domains/operations/services/trade_attention_candidates.py),
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py),
  [`test_operations_workflow_items_api.py`](../../apps/api/tests/test_operations_workflow_items_api.py),
  and
  [`test_settlement_invoices_api.py`](../../apps/api/tests/test_settlement_invoices_api.py)
- Lesson: candidate reads now sort by an explicit queue policy instead of
  whichever trade happened to be oldest in the raw projection. The current
  policy is: oldest unconfirmed trade first for confirmation backlog,
  delivery-near trades first for nomination and allocation backlog, disputed
  settlement before overdue cash and overdue cash before due cash for
  settlement-oriented queues, ready invoice previews before blocked invoice
  previews, and oldest age first as the fallback within a queue. The backend
  candidate payload now also carries a typed `priority_reason` so the UI and
  assistant can explain the ordering without reimplementing queue policy in a
  second place. Assistant tool summaries and workspace-summary prefetch sections
  should surface that same reason text so chat traces, prompt context, and UI
  drilldowns stay aligned on why the first candidate surfaced. Prompt Home
  starters that ask which item to handle first should carry the same queue
  policy in category-level copy, but they should not invent row-specific
  reasons before a candidate read runs.
- Deterministic opportunity: queue order should stay a typed service rule that
  reuses existing workspace-native heuristics where possible and adds focused
  tests whenever a new candidate category gets a different priority rule.
- Agent autonomy impact: this improves read, explain, and handoff quality
  without expanding mutation authority. Approval-gated invoice, payment, and
  confirmation actions still rely on the same governed action paths after a
  human reviews the proposed step.
- Tests or evidence:
  `apps/api/tests/test_operations_workflow_items_api.py`,
  `apps/api/tests/test_settlement_invoices_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `make api-assistant-evals`.
- Follow-up: if owners want a different queue order, change the named service
  policy and its regression tests together rather than compensating in prompts
  or one-off UI sorting.

### 2026-04-23 - Pre-Trade Draft Analysis Owns Live Source Collection

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: pre-trade editor draft analysis, saved recommendation runs,
  agent draft-analysis tools, review handoff provenance
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_recommendations.py`,
  `apps/api/app/routes/pretrade.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx`
- Lesson: live pre-trade source snapshots now come from a shared server-side
  collector for desk exposure, counterparty credit, latest marks, market
  context, weather intelligence, and option exposure. The editor no longer
  needs to invent its own browser-side evidence package before draft analysis
  or review handoff; it can reuse the typed draft-analysis contract and pass
  those returned snapshots into saved runs when the analysis is current.
- Deterministic opportunity: future source adapters or pre-trade evidence
  enrichments should be added to the shared collector first, then surfaced to
  UI and agent tools through the same typed snapshot contract.
- Agent autonomy impact: human users and allowed read-only agents now inspect
  the same live evidence sections before review handoff without expanding
  booking, approval, or hedge-execution authority.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/web/tests/preTradeApi.test.ts`.
- Follow-up: the old browser-only recommendation helper and its unit test have
  now been retired. Keep save or submit flows reusing current draft-analysis
  snapshots only when the analysis is fresh for the latest draft state, and add
  future evidence enrichments to the shared server-owned collector first.

### 2026-04-23 - Summary-Driven Assistant Reads Need Explicit Targets

- Type: lesson
- Domain: assistant runtime routing and prompt-first operator UX
- Applies to: workspace summary asks, candidate read prefetch, prompt-home starter flows, sign-in resume handoff
- Status: implemented
- Source: `apps/api/app/schemas/assistant.py`,
  `apps/api/app/domains/assistant/services/execution.py`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/src/workspaces/prompt/promptHomeStarters.ts`
- Lesson: when a prompt is triggered from a known workspace summary surface,
  pass explicit summary count keys through the request contract instead of
  relying on phrase matching inside freeform prompt text. The assistant runtime
  can then prefetch the aligned deterministic candidate reads even when the
  user message is short or ambiguous, and the sign-in resume path can preserve
  that same routing intent.
- Deterministic opportunity: future summary cards, prompt starters, or guided
  asks should attach typed `summary_targets` whenever they are meant to route
  through workspace-summary candidate reads.
- Agent autonomy impact: this improves read accuracy and explainability without
  increasing write authority or bypassing staged action governance.
- Tests or evidence: `apps/api/tests/test_assistant_api.py`,
  `apps/web/tests/promptHomeStarters.test.ts`,
  `apps/web/tests/promptResumeIntent.test.ts`, and
  `make api-assistant-evals`.
- Follow-up: when more summary surfaces are added, wire them to explicit
  targets first and keep phrase matching only as a fallback for freeform asks.

### 2026-04-23 - Action Specs Own Approval Preconditions

- Type: lesson
- Domain: assistant action governance
- Applies to: approval-gated action requests, action preview requirements, stale-state and idempotency execution checks
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/action_specs.py` and
  `apps/api/app/domains/assistant/services/action_requests.py`
- Lesson: per-action execution requirements should be declared in the typed
  action spec registry instead of scattered through approval helpers. The
  deterministic executor remains the source of business mutation behavior, but
  reusable governance metadata such as `requires_ready_preview` belongs beside
  the published catalog entry and handler.
- Deterministic opportunity: add new approval preconditions as typed spec
  fields when they apply to a named action type, then enforce them through the
  shared approval gateway.
- Agent autonomy impact: action-specific gates stay reviewable and testable
  without granting broader autonomy or allowing freeform model output to bypass
  policy checks.
- Tests or evidence: registry coverage in `apps/api/tests/test_assistant_api.py`
  and assistant eval coverage through `make api-assistant-evals`.
- Follow-up: promote future repeated approval checks into action spec fields
  before adding one-off conditional logic.

### 2026-04-23 - Pre-Trade Recommendation Runs Power Agent Reads

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: pre-trade recommendation runs, structured residual exposure
  triage, hedge-draft explanation, agent read tools
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_recommendations.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/api/app/domains/assistant/services/role_archetypes.py`
- Lesson: saved pre-trade recommendation runs are now the shared typed contract
  for both UI and agent reads. The deterministic service owns normalization,
  opportunity summary, residual exposure, netting candidates, hedge draft,
  rejected alternatives, and missing evidence. Assistant roles consume the same
  saved contract through a governed read tool instead of recreating the logic
  in prompt-only reasoning.
- Deterministic opportunity: future unsaved-scenario analysis or staged
  pre-trade actions should build on the explicit
  `prepare_pretrade_recommendation_evaluation` service boundary and preserve
  the same machine-readable evidence sections.
- Agent autonomy impact: Market Research, Pre-Trade Structuring, and Risk
  Sentinel can observe and explain saved recommendation evidence, but they
  still cannot book trades, approve reviews, or execute hedges.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py`,
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_assistant_api.py`.
- Follow-up: add a staged pre-trade review-item action only after an explicit
  action type, reviewer policy, stale-state checks, and outcome metrics exist.

### 2026-04-22 - Persona Stories Need Productized Algorithms

- Type: algorithm-candidate
- Domain: trading, risk, operations, settlement, accruals
- Applies to: market opportunity detection, freight and fee economics,
  long/short matching, hedge instrument recommendations, checklist automation,
  invoice/payment follow-through, accrual and reconciliation exception detection
- Status: proposed
- Source: [Business Use Case Roadmap](./business-use-case-roadmap.md) and
  [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: broad persona requests such as "find opportunities," "flatten my
  book," "tell me how to hedge," "automate reconciliations," and "identify
  accrual issues" should be decomposed into durable work objects and
  deterministic services before any agent receives write or execution
  authority. Agents can explain, compare, draft, and stage reviewable work, but
  official prices, exposure, hedge deltas, cost stacks, accruals, payments, and
  business mutations need typed service ownership.
- Deterministic opportunity: create explicit algorithms for opportunity
  classification, physical movement cost stacks, long/short netting sets,
  hedge instrument decision tables, workflow checklist policy, and accrual or
  reconciliation exception detection.
- Agent autonomy impact: keep trade booking, hedge execution, freight trades,
  payment release, external communication, policy changes, and official
  financial records human-owned or approval-gated until service rules, stale
  checks, idempotency, audit, evals, and outcome evidence are in place.
- Tests or evidence: each promoted algorithm should add focused service tests,
  relevant assistant evals for prompt/tool behavior, and browser smoke coverage
  when a new cross-workspace operator journey is introduced.
- Follow-up: when a workstream starts, create or update the owning design doc
  with owner, inputs, outputs, rule set, stop conditions, audit, rollback, and
  verification expectations.

### 2026-04-22 - Trader/Risk MVP Starts As Draft Authority

- Type: stop-condition
- Domain: trader and risk decision support
- Applies to: opportunity notes, residual exposure triage, long/short netting
  sets, hedge recommendations, pre-trade scenario handoffs
- Status: proposed
- Source: [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md),
  [Human-Agent Authority Matrix](./human-agent-authority-matrix.md), and
  [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: trader/risk recommendations can feel close to execution, so the first
  MVP must preserve the difference between recommendation and commitment.
  Agents and deterministic services may draft opportunity, netting, and hedge
  analysis with source evidence, but humans continue to own trade capture,
  hedge execution, bilateral commitments, and freight commitments.
- Deterministic opportunity: build recommendation contracts, source freshness,
  residual exposure triage, netting rules, and hedge decision tables as typed
  services before considering any staged action type.
- Agent autonomy impact: keep Market Research, Pre-Trade Structuring, and Risk
  Sentinel roles at read/explain/draft for this slice. Add assistant evals that
  fail if an agent claims it booked a trade, executed a hedge, guaranteed a
  hedge choice, or ignored stale evidence.
- Tests or evidence: TRMVP work packages require focused service tests for
  recommendation rules, `make api-assistant-evals` for prompt/tool authority,
  and browser smoke for the review-to-capture handoff when implemented.
- Follow-up: only consider approval-gated action requests after typed work
  objects, stale-state checks, idempotency, policy ownership, and outcome
  metrics exist.

### 2026-04-22 - Human Workflows Need Agent Tooling Counterparts

- Type: lesson
- Domain: agent toolkit and product workflow design
- Applies to: trader/risk MVP, operations automation, settlement automation,
  accruals, reconciliation, future persona-driven workflows
- Status: proposed
- Source: [Business Use Case Roadmap](./business-use-case-roadmap.md) and
  [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- Lesson: persona stories are requirements for both human operators and AI
  agents. When a human workspace gains a capability, the implementation should
  identify the matching agent toolkit surface: read tools, deterministic
  recommendation tools, typed action-request payloads, source freshness,
  provenance, and machine-readable stop conditions.
- Deterministic opportunity: design service outputs once, then let both UI
  components and assistant tools consume the same typed contract instead of
  creating separate prompt-only reasoning paths.
- Agent autonomy impact: adding tools does not grant execution authority. New
  read or recommendation tools should arrive before action tools; action tools
  require published action types, stale-state checks, idempotency, reviewer
  roles, expected effects, and eval coverage.
- Tests or evidence: each new agent toolkit capability should include focused
  service tests plus assistant evals for tool selection, missing/stale evidence,
  and no-overclaim behavior.
- Follow-up: future work packages should include an "Agent Toolkit
  Implications" section whenever a feature is expected to serve agents as well
  as humans.

### 2026-04-22 - Prompt Navigation Is A UI Intent

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: assistant landing surfaces, workspace routing, route handoffs,
  prompt-led old-UX navigation, action governance
- Status: proposed
- Source: [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: prompt-led navigation should be modeled as a non-mutating UI intent,
  separate from assistant action requests. The assistant may recommend opening,
  focusing, or filtering a workspace, but business writes must continue through
  typed services, permission checks, audit, and approval-gated action requests
  where required.
- Deterministic opportunity: repeated accepted routing decisions should become
  deterministic intent rules with typed inputs, allowed destinations, rejection
  reasons, and focused browser or assistant-eval coverage.
- Agent autonomy impact: navigation intent can make the assistant feel more
  capable without increasing mutation authority. If the request changes
  records, emits events, or creates external commitments, reduce authority back
  to staged action or manual workflow.
- Tests or evidence: initial proof should cover default prompt landing,
  accepted workspace navigation, focused trade handoff, invalid intent
  rejection, and unsupported mutation fallback.
- Follow-up: implement the prompt-first work packages before considering any
  broader prompt-led execution authority.

### 2026-04-22 - Assistant Feedback Belongs On Runs

- Type: lesson
- Domain: assistant outcome tracking
- Applies to: assistant responses, run tracing, eval inputs, prompt review
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: user feedback on an assistant answer should be captured as a durable
  run-level record with user/session provenance, not as loose chat text or a
  hidden prompt adjustment.
- Deterministic opportunity: recurring feedback comments that identify stable
  product behavior, missing evidence rules, or repeatable answer-quality checks
  should feed the deterministic algorithm loop instead of remaining prompt-only.
- Agent autonomy impact: feedback improves promotion and retirement signals,
  but it does not grant mutation authority or change business records directly.
- Tests or evidence: focused API coverage verifies feedback creation, update,
  access scoping, conversation reload serialization, and admin aggregation by
  agent, workspace, recent feedback, and helpful vs. needs-work totals.
- Follow-up: connect recurring needs-work comments to eval cases and agent
  health reviews.

### 2026-04-22 - Deterministic Algorithms Are An Agent Promotion Path

- Type: lesson
- Domain: agent governance
- Applies to: autonomy reviews, repeated recommendations, action-governance
  design, formula and policy promotion
- Status: accepted
- Source: [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: agents should not only choose between current deterministic logic and
  open-ended reasoning. When an agent finds a recurring judgment that can be
  expressed as rules, formulas, thresholds, decision tables, or typed service
  behavior, it should propose or implement deterministic logic through the
  normal engineering path.
- Deterministic opportunity: repeated accepted recommendations, prompt
  instructions that compensate for missing product behavior, and stable review
  decisions should be promoted into formulas, policy rules, projection checks,
  or domain services.
- Agent autonomy impact: creating deterministic logic can increase safe autonomy
  because future agents can rely on inspectable rules instead of restating the
  same judgment in prompts.
- Tests or evidence: algorithm proposals should identify required tests, evals,
  fixtures, audit expectations, and reviewer ownership before promotion.
- Follow-up: when a future agent proposes or adds a deterministic algorithm,
  append a focused `algorithm-candidate` or `algorithm-added` entry here.

### 2026-04-22 - Accepted Work Packages Are The Autonomy Handoff

- Type: algorithm-added
- Domain: agent governance, deterministic algorithm promotion
- Applies to: generated health-review work packages, recurring deterministic
  candidates, policy/service/eval/knowledge-base backlog items
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/agent_work_packages.py`
  and `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: generated health-review work packages become actionable only after an
  admin accepts them into the durable work-package backlog. Acceptance preserves
  the candidate, source agents, recommended owner, checks, lifecycle status,
  actor, timestamps, and notes so the work can move from autonomy review into
  implementation without relying on an ephemeral generated snapshot.
- Deterministic opportunity: lifecycle transitions should turn accepted policy,
  service, eval, or knowledge-base packages into concrete PRs, eval cases, or
  docs entries, then mark the package implemented only with verification
  evidence.
- Agent autonomy impact: agents may propose and group deterministic candidates,
  but accepted backlog records are the review gate before changing product
  behavior or agent authority.
- Tests or evidence: service and API coverage verifies candidate acceptance,
  idempotent persistence, valid and invalid lifecycle transitions, admin auth,
  structured implementation evidence, and frontend API ownership.
- Follow-up: when a package is marked implemented, add or update the focused
  `algorithm-added`, eval, or policy lesson that explains the actual shipped
  behavior.

### 2026-04-23 - Implemented Work Packages Need Audit Evidence

- Type: algorithm-added
- Domain: agent governance, implementation audit
- Applies to: assistant agent work packages marked `IMPLEMENTED`
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/agent_work_packages.py`,
  `apps/api/app/schemas/assistant.py`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: a work package should reach `IMPLEMENTED` only after it points to at
  least one shipped artifact such as a PR, commit, eval, test, or doc update.
  The durable work-package record now keeps those artifacts plus an optional
  implementation owner so later agents and human reviewers can see what
  actually shipped instead of inferring it from a freeform note.
- Deterministic opportunity: typed evidence fields make it possible to build
  backlog filters, control-tower counts, and promotion checks from audit data
  instead of parsing prose. Control-tower stale signals should drill straight
  into a filtered backlog view for the affected source agent so supervisors can
  review the actual stuck packages instead of working from summary text alone.
- Agent autonomy impact: agents can propose and draft implementation work, but
  the record of what shipped stays explicit, reviewable, and separable from
  the generated recommendation itself.
- Tests or evidence: service and API coverage verifies the evidence gate,
  normalization, lifecycle persistence, implemented actor/timestamp capture,
  evidence-aware backlog filters, control-tower implementation counts, and
  stale-package trust signals after 72 hours without shipped proof; frontend
  API tests verify evidence payload ownership, and the admin control-tower UI
  now links stale signals into the filtered work-package backlog.
- Follow-up: if stale-package reminders generate too much noise, split the
  threshold or severity by `ACCEPTED` versus `IN_PROGRESS` status instead of
  weakening the requirement for shipped evidence.

### 2026-04-22 - Freeform Output Must Not Mutate Records

- Type: stop-condition
- Domain: action governance
- Applies to: assistant actions, automation, bulk work, record mutations
- Status: accepted
- Source: [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: no agent should directly mutate business records from freeform model
  output. Proposed changes must become typed payloads and flow through the same
  application services, permissions, policy checks, audit capture, and review
  paths as manual UI actions.
- Deterministic opportunity: repeated action patterns should become published
  action types with deterministic validation, stale-state checks, idempotency,
  reviewer metadata, and domain-service execution.
- Agent autonomy impact: an agent can draft or stage a mutation only after a
  typed action contract exists. Without that contract, keep the agent at explain
  or draft.
- Tests or evidence: add service tests for validation, permission failure,
  stale-state handling, idempotency, and audit capture; add assistant evals for
  action-governance prompt behavior.
- Follow-up: when a new mutation pattern appears, create or update the action
  gateway contract before increasing autonomy.

### 2026-04-22 - Durable Work Objects Beat Chat State

- Type: lesson
- Domain: work-object governance
- Applies to: staged actions, handoffs, reports, agent-generated work
- Status: accepted
- Source: [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
  and [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents and humans should operate on durable records, not loose chat
  state. If future users need to inspect, approve, correct, or take over work,
  the work needs ownership, lifecycle, provenance, permissions, and action
  history.
- Deterministic opportunity: recurring agent outputs should graduate into
  canonical work objects, report definitions, action requests, review items, or
  domain records with typed lifecycle states.
- Agent autonomy impact: do not stage or execute agent work that has no owning
  work object. Draft first, then propose the durable object if the pattern
  repeats.
- Tests or evidence: verify created work objects carry stable identifiers,
  lifecycle status, actor attribution, policy status, and source links.
- Follow-up: when an agent proposes side-channel work, map it to an existing
  object or add an `algorithm-candidate` entry for a new object/lifecycle.

### 2026-04-22 - External Commitments Stay Human-Only In Phase 1

- Type: stop-condition
- Domain: external commitment governance
- Applies to: trade booking, trade amendment, counterparty communication,
  scheduling commitment, payment release, bank instructions
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: Phase 1 agents may not externally commit the firm. They can draft or
  stage approved internal requests, but humans remain responsible for booking
  trades, sending counterparty communications, committing logistics externally,
  and releasing cash.
- Deterministic opportunity: before any narrow external-commit case is
  considered, the platform needs deterministic policy checks, legal/compliance
  approval, replay, monitoring, and a kill switch.
- Agent autonomy impact: if the request can bind the firm externally, reduce
  autonomy to draft or human-only review.
- Tests or evidence: evals should catch over-claims of authority, direct booking
  attempts, payment-release attempts, and external communication send attempts.
- Follow-up: keep external-commitment proposals in governance docs until a
  separate control model exists.

### 2026-04-22 - Operational Values Need Deterministic Formulas

- Type: lesson
- Domain: extensibility and reporting
- Applies to: formulas, calculated columns, report values, derived KPIs
- Status: accepted
- Source: [User Extensibility Initiative](./user-extensibility-initiative.md)
  and [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- Lesson: formulas and derived values must be deterministic, typed,
  side-effect-free, inspectable, and built on approved semantic fields. Agents
  can explain or propose formulas, but they must not become the source of truth
  for operational values.
- Deterministic opportunity: repeated calculations should become formula
  definitions, report definitions, domain services, or promoted schema fields
  when they affect validation, workflow branching, official reporting, or
  integrations.
- Agent autonomy impact: agents may draft a formula proposal and explain lineage,
  but trusted values must be produced by deterministic logic.
- Tests or evidence: formula validation should cover type safety, allowed
  functions, dependency cycles, row-level access, lineage, and rollback.
- Follow-up: when an agent notices a recurring calculation in prompts or reports,
  add an `algorithm-candidate` entry and propose the semantic field inputs.

### 2026-04-22 - Workflow Item Updates Are The First Bounded-Execute Candidate

- Type: promotion-signal
- Domain: operations workflow
- Applies to: workflow owner, due date, status, notes, blocker triage
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: workflow item updates are a strong first candidate for bounded
  autonomous execution because they are internal, inspectable, reversible through
  normal workflow correction, and already represented as durable work objects.
- Deterministic opportunity: encode allowed status transitions, required owner
  roles, stale-state checks, idempotency, due-date rules, and blocker escalation
  as deterministic policy before execution.
- Agent autonomy impact: agents should start at draft or stage. Promotion to
  bounded execute needs high approval rate, low correction rate, deterministic
  policy, eval coverage, audit, and owner sign-off.
- Tests or evidence: service tests should cover status transition policy,
  unauthorized owner changes, stale items, repeated requests, and audit trail.
- Follow-up: implement [AP1-19](./agent-platform-phase-1-tickets.md) to turn
  this promotion signal into deterministic workflow item update policy.

### 2026-04-22 - Workflow Item Update Policy Belongs In The Service Layer

- Type: algorithm-added
- Domain: operations workflow
- Applies to: `update_trade_workflow_item`, assistant-staged workflow updates,
  manual workflow item patches, future workflow automation
- Status: implemented
- Source:
  [`workflow_items.py`](../../apps/api/app/domains/operations/services/workflow_items.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  and [AP1-19](./agent-platform-phase-1-tickets.md)
- Lesson: workflow item update authority must be evaluated by a shared,
  side-effect-free policy before any route, assistant action, or future
  automation mutates the item. Route-only guards are insufficient because
  assistant approvals can execute through service paths that bypass route
  helpers.
- Deterministic opportunity: use observed approval outcomes, reviewer
  corrections, and policy-failure rates to define promotion thresholds before
  any workflow update moves from staged approval to bounded execution.
- Agent autonomy impact: agents may stage workflow updates only after the policy
  normalizes changes, checks deterministic blockers, and emits reviewer role,
  old/new preview values, stale-state basis, and idempotency key. This does not
  grant bounded autonomous execution yet.
- Tests or evidence: `apps.api.tests.test_operations_workflow_items_api` covers
  the policy review context, terminal transition blocking, due-date windows,
  stale-version failure, idempotent retry handling, assistant execution
  blockers, rollup behavior, and credit constraints;
  `apps.api.tests.test_assistant_evals` covers the assistant governance path.
- Follow-up: use the outcome-metrics endpoint to collect enough workflow-update
  history before proposing any bounded-execution policy expansion.

### 2026-04-22 - Outcome Metrics Can Recommend Autonomy Changes, Not Apply Them

- Type: algorithm-added
- Domain: assistant governance
- Applies to: admin outcome reporting, action request review burden, bounded
  execution promotion review, pause recommendations
- Status: implemented
- Source:
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py), and
  [AP1-17](./agent-platform-phase-1-tickets.md)
- Lesson: autonomy promotion needs deterministic observed-outcome thresholds,
  but threshold results should remain advisory until a human owner explicitly
  changes policy. Metrics can identify candidates and noisy agents; they should
  not silently alter authority.
- Deterministic rule: compute action outcome rates from decided action
  requests, stale-action outcomes from stale failures or idempotent stale
  retries, and pause signals from rejection, failed-execution, stale-action, and
  aged-pending thresholds. Promotion requires enough decided outcomes, no
  pending backlog, and rates below conservative limits.
- Agent autonomy impact: agents can be flagged as
  `ELIGIBLE_FOR_BOUNDED_REVIEW` or `RECOMMEND_PAUSE`, but both states require a
  human admin decision before capabilities, action policy, or status changes.
- Tests or evidence: `apps.api.tests.test_assistant_api` seeds contrasting
  high-confidence and noisy agents, then verifies by-agent and by-action-type
  recommendation behavior from the Admin metrics endpoint. The Admin workspace
  now renders the advisory endpoint through a read-only outcome metrics panel.
- Follow-up: add correction capture so reviewer edits, not only
  approve/reject/failed outcomes, can inform promotion thresholds.

### 2026-04-22 - Document Execution Needs Matching And Ambiguity Policy

- Type: algorithm-candidate
- Domain: document workflow
- Applies to: document routing, linkage, reprocessing, document-created records
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md),
  [Agent Role Catalog](./agent-role-catalog.md), and
  [Document Taxonomy](./document-taxonomy-trading-shipping.md)
- Lesson: document agents are valuable for classification, explanation, and
  ambiguity surfacing, but document linkage and document-created records need
  explicit confidence, matching, ambiguity, and approval policy before they
  become more autonomous.
- Deterministic opportunity: create decision tables for document kind support,
  candidate-record matching, minimum evidence, conflicting evidence, reprocess
  eligibility, and manual-review escalation.
- Agent autonomy impact: reprocessing is a safer first staged action. Linkage
  and record creation should remain draft or approval-gated until deterministic
  matching policy exists.
- Tests or evidence: fixture documents should cover confident match, multiple
  candidates, missing keys, unsupported document kind, stale target record, and
  permission denial.
- Follow-up: when document reviewers repeatedly resolve the same ambiguity,
  promote that decision into matching or routing logic.

### 2026-04-22 - Prompt And Tool Changes Need Evals

- Type: lesson
- Domain: assistant evals
- Applies to: prompts, managed agents, tool allowlists, approval behavior,
  over-claiming certainty
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: managed-agent changes should land with eval coverage, not just ad hoc
  prompt spot checks. This is especially important when a change affects tool
  access, action governance, approval boundaries, or claims of certainty without
  a live read.
- Deterministic opportunity: encode expected prompt sections, tool filters,
  warnings, action-staging behavior, and permission boundaries as fixture evals.
- Agent autonomy impact: do not promote an agent role or action type without eval
  cases that cover the new authority boundary.
- Tests or evidence: run or update `make api-assistant-evals` for assistant or
  automation changes that affect provider selection, tools, prompts, approvals,
  or over-claiming certainty.
- Follow-up: add a knowledge-base entry when an eval reveals a new stop
  condition or promotion signal.

### 2026-04-22 - Pause Thresholds Should Become Deterministic Policy

- Type: algorithm-candidate
- Domain: control tower governance
- Applies to: agent pause, narrow, retire, intervention, outcome review
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents that create noisy drafts, rejected staged actions, failed
  executions, stale-data claims, or repeated corrections should be paused,
  narrowed, or retired based on explicit thresholds instead of subjective vibes.
- Deterministic opportunity: define pause thresholds for rejection rate,
  correction rate, failed-action rate, stale-data warnings, policy failures,
  repeated unsupported requests, and reviewer override frequency.
- Agent autonomy impact: outcome metrics should control promotion and demotion.
  An agent should not gain authority while its value and failure signals are
  unmeasured.
- Tests or evidence: control tower reports should show run count, staged actions,
  approvals, rejections, failures, corrections, pauses, and reviewer overrides.
- Follow-up: once metrics exist, add `promotion-signal` or `retirement-signal`
  entries based on observed thresholds.

### 2026-04-22 - Projection Integrity Is Deterministic Control Logic

- Type: algorithm-added
- Domain: projection monitoring
- Applies to: projection audit, repair, alert delivery, operational controls
- Status: accepted
- Source: [ADR 0003](../adr/0003-operational-framework-and-projection-monitoring.md)
- Lesson: projection integrity monitoring should use deterministic audit checks
  and deterministic repair paths where safe. Agents may summarize failures or
  draft interventions, but the control itself should remain inspectable and
  repeatable.
- Deterministic opportunity: projection checks and safe repairs are a pattern for
  future control-plane algorithms: define invariants, run state, alert history,
  repair eligibility, and operator-visible outcomes.
- Agent autonomy impact: agents can explain projection issues and recommend
  repair actions, but autonomous repair needs deterministic eligibility,
  persisted run state, audit, and admin-facing controls.
- Tests or evidence: tests should cover clean runs, detected drift, safe repair,
  unsafe repair escalation, alert delivery, and persisted run history.
- Follow-up: use this pattern when designing other operational integrity checks.

### 2026-04-22 - Policy And Reference Data Are Not Prompt Problems

- Type: stop-condition
- Domain: policy and reference data
- Applies to: permissions, limits, reference data, approval thresholds, tool
  access, agent configuration
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [User Extensibility Initiative](./user-extensibility-initiative.md)
- Lesson: agents may recommend policy or reference-data changes, but they should
  not mutate policy, permissions, reference data, limits, or agent configuration
  directly. These are versioned, owned, auditable product controls.
- Deterministic opportunity: repeated policy decisions should become versioned
  policy rules, typed configuration, admin workflows, or reference-data services
  with ownership and publish controls.
- Agent autonomy impact: keep these requests at draft recommendation unless a
  human owner explicitly approves a governed workflow.
- Tests or evidence: verify permission checks, ownership metadata, publish or
  retire lifecycle, audit attribution, and rollback path.
- Follow-up: when a prompt contains policy-like instructions, propose moving that
  rule into versioned configuration or typed service logic.

### 2026-04-22 - Internal Reports Can Be Early Autonomy With Source Links

- Type: promotion-signal
- Domain: reporting and reconciliation
- Applies to: desk briefings, exception summaries, settlement packs, sourced
  internal reports
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Role Catalog](./agent-role-catalog.md)
- Lesson: internal report generation is a reasonable early autonomy candidate
  when the output is clearly sourced, not an official external commitment, and
  review burden is lower than manual drafting.
- Deterministic opportunity: repeated report shapes should become report
  definitions over approved semantic fields, with deterministic filters,
  sections, lineage, and freshness checks.
- Agent autonomy impact: agents may generate internal draft reports earlier than
  they may mutate records. Official publication, shared presets, or external use
  should stay draft or stage until publication policy exists.
- Tests or evidence: report evals should verify source links, freshness labels,
  row-level access, no hidden data leakage, and clear uncertainty language.
- Follow-up: promote commonly accepted report formats into governed report
  definitions.

### 2026-04-22 - Codex Dispatch Is An Admin Engineering Workflow

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, repository-changing agent work, admin
  workflow automation
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: kicking off Codex from inside ECTRM should be treated as an
  admin-owned engineering workflow, not as a normal business assistant action.
  The app may record a task and dispatch a configured repository workflow, but
  Codex results should still land as reviewable code artifacts such as branches,
  pull requests, or workflow output.
- Deterministic opportunity: keep dispatch configuration in typed backend
  settings and task state in durable `codex_task_requests` records with explicit
  statuses.
- Agent autonomy impact: assistants may draft Codex task prompts, but starting
  repository-mutating work should remain behind admin authentication and
  server-side credentials.
- Tests or evidence: focused API coverage should verify disabled/config-missing
  behavior, successful dispatch recording, and failed dispatch audit state.
- Follow-up: if assistants later stage Codex tasks, add a typed action request
  and approval path instead of letting chat text dispatch directly.

### 2026-04-22 - Long-Running Codex Needs Explicit Stop Conditions

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, long-running repository agents,
  recommendation loops
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: letting Codex continue from one completed task into the next should be
  modeled as a bounded loop, not as open-ended autonomy. The request must carry
  a run mode, iteration cap, continuation question, and stop conditions so the
  repository workflow has a deterministic contract to follow.
- Deterministic opportunity: store loop controls on `codex_task_requests` and
  render the continuation contract into the dispatch prompt rather than relying
  on freeform operator wording. Track execution through a token-authenticated
  callback that writes workflow run, branch, pull request, artifact, summary,
  and stop-reason metadata back to the original task record.
- Agent autonomy impact: long-running Codex may choose the next repository task
  only when it is concrete, high-confidence, repository-local, and within the
  original request. It must stop for protected business domains, production data
  mutation, external commitments, or verification failures requiring human
  review.
- Tests or evidence: API coverage should verify loop metadata persistence,
  prompt contract rendering, configured iteration caps, callback token
  enforcement, and execution-state updates.

### 2026-04-22 - Autonomy Reviews Need A Generated Brief

- Type: algorithm-added
- Domain: assistant governance
- Applies to: managed agent promotion, pause review, narrowing decisions,
  deterministic algorithm discovery
- Status: implemented
- Source:
  [`autonomy_review.py`](../../apps/api/app/domains/assistant/services/autonomy_review.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: before increasing or narrowing a managed agent's authority, generate
  an autonomy review brief instead of relying on the agent profile alone. The
  brief combines current profile authority, observed outcomes, role/profile eval
  expectations, stop conditions, and relevant knowledge-base lessons.
- Deterministic opportunity: recurring brief recommendations should become
  explicit promotion, pause, or narrowing policy once the thresholds are stable
  enough for product enforcement.
- Agent autonomy impact: agents should use the brief as the review handoff when
  asking for more autonomy. A brief can recommend bounded-review eligibility,
  but only a human owner should apply the authority change.
- Tests or evidence: focused API coverage verifies admin-only access, missing
  agent handling, outcome metrics inclusion, eval signal projection, checklist
  output, and knowledge-base entry selection.
- Follow-up: use generated brief recommendations and deterministic candidates
  during agent health review, then promote repeated candidates into governed
  policy or service work packages.

### 2026-04-22 - Codex Dispatch Smoke Tests Stay Two-Stage

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, GitHub workflow callbacks, long-running
  repository agents
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md) and
  [`run_codex_task_smoke.py`](../../apps/api/scripts/run_codex_task_smoke.py)
- Lesson: verify Codex dispatch in two stages. First run the local smoke path
  to prove the workflow contract, admin task creation, callback updates, and
  callback-token rejection without mutating GitHub. Then run a live dispatch
  only after the remote workflow, API environment, and GitHub secrets are
  configured.
- Deterministic opportunity: keep smoke readiness checks explicit so missing
  secrets or unregistered workflows fail as setup gaps, not ambiguous task
  failures.
- Agent autonomy impact: local smoke coverage can validate plumbing, but it
  does not prove repository-mutating autonomy. Live Codex runs remain
  admin-owned and should land as reviewable branches, pull requests, or
  artifacts.
- Tests or evidence: `make api-codex-smoke` creates a local long-running Codex
  task, posts running and completed callbacks, rejects a bad callback token,
  and reports missing live prerequisites.
- Follow-up: once the Codex workflow is present on GitHub and secrets are
  configured, dispatch a tiny no-op admin task to exercise the full GitHub
  Actions path.

### 2026-04-22 - Corrected Approvals Still Mean Human Cleanup

- Type: algorithm-added
- Domain: assistant governance
- Applies to: action request approvals, outcome metrics, bounded-execution
  promotion review, deterministic algorithm candidates
- Status: implemented
- Source:
  [`action_requests.py`](../../apps/api/app/domains/assistant/services/action_requests.py),
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  and [Agent Action Request Contract](./agent-action-request-contract.md)
- Lesson: an approved action is not always an autonomy win. If the reviewer
  approved only after correcting the agent's evidence, payload framing, or
  assumptions, preserve that distinction as `APPROVED_WITH_CORRECTIONS` with a
  summary or corrected field names.
- Deterministic opportunity: repeated corrected fields are candidates for typed
  validation, policy checks, formula logic, stale-state enrichment, or prompt
  evals. When the same correction recurs, propose the deterministic rule instead
  of relying on future reviewers to catch it.
- Agent autonomy impact: corrected approvals count against bounded-execution
  promotion. Future agents should treat a high correction rate as evidence to
  keep the action staged, narrow authority, or create a deterministic algorithm
  before asking for more autonomy.
- Tests or evidence: API coverage verifies corrected-approval persistence,
  correction-detail validation, rejection notes, audit-trace serialization, and
  outcome-metric correction rates and promotion blockers. Web tests verify that
  approval and rejection calls send structured decision metadata.
- Follow-up: review recurring `correction_fields` during autonomy reviews and
  append `algorithm-candidate` entries when a stable rule emerges.

### 2026-04-22 - Health Reviews Promote Brief Candidates Into Work Packages

- Type: algorithm-added
- Domain: assistant governance
- Applies to: agent health review, deterministic algorithm candidates, policy
  work packages, service work packages
- Status: implemented
- Source:
  [`autonomy_review.py`](../../apps/api/app/domains/assistant/services/autonomy_review.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: autonomy briefs should feed a cross-agent health review. When
  multiple agents surface the same deterministic candidate, group it into a
  stable work package with source agents, owner role, priority, rationale, and
  acceptance checks.
- Deterministic opportunity: repeated review judgments should graduate into
  typed policy, service, or eval work packages instead of staying as prompt
  guidance or one-off review notes.
- Agent autonomy impact: a health-review work package is not extra autonomy by
  itself. It is evidence that the deterministic guard should be implemented
  before expanding authority or reducing reviewer involvement.
- Tests or evidence: API coverage verifies admin-only health review access,
  cross-agent candidate grouping, stable package IDs, priority assignment, owner
  projection, and agent-to-package references. Web API coverage verifies the
  typed Admin health-review URL and auth headers.
- Follow-up: persist accepted work packages when the team needs lifecycle state
  beyond generated candidate snapshots.

### 2026-04-22 - Sensitive Actions Need Deterministic Preview Gates

- Type: algorithm-added
- Domain: assistant action governance
- Applies to: settlement preview-backed actions, action request approval,
  execute-capable settlement roles, reviewer surfaces, future sensitive action
  previews
- Status: implemented
- Source:
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py),
  [`action_requests.py`](../../apps/api/app/domains/assistant/services/action_requests.py),
  and [Agent Action Request Contract](./agent-action-request-contract.md)
- Lesson: a sensitive staged action should expose a deterministic dry-run
  preview before approval or bounded execution. For settlement mutations such
  as `issue_trade_invoice`, `void_trade_invoice`, and
  `reverse_trade_payment`, the preview resolves the same normalization and
  validation path as execution, lists affected records and expected side
  effects, and marks the request blocked when the proposed mutation is not safe
  to execute.
- Deterministic opportunity: each future high-risk action preview should reuse
  its domain service normalization and stop conditions instead of summarizing
  model intent. Preview failures should block approval without creating side
  effects.
- Agent autonomy impact: preview gates make staged agent work easier to review
  and bounded execution safer. Execute-capable settlement roles may self-execute
  only when the preview is ready, while blocked previews must still stop the
  mutation path before any side effect runs.
- Tests or evidence: focused assistant API tests cover ready preview output,
  blocked duplicate invoice previews, missing-preview approval failure, and
  no-side-effect guarantees. Web tests cover ready and blocked preview rendering
  in the action request list.
- Follow-up: extend this pattern to the next sensitive action only after its
  domain owner can define deterministic affected-records, field-change, blocker,
  and side-effect semantics.

### 2026-04-22 - Control Tower Summaries Are Read-Only Governance Snapshots

- Type: algorithm-added
- Domain: control tower governance
- Applies to: assistant agent roster, run monitoring, action request posture,
  eval coverage, policy review signals
- Status: implemented
- Source:
  [`control_tower.py`](../../apps/api/app/domains/assistant/services/control_tower.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: a control tower summary should aggregate deterministic governance
  posture without changing agent authority. Roster counts, run warnings,
  pending or failed actions, blocked previews, policy warnings, and eval gaps
  are supervisory signals, not auto-pause commands.
- Deterministic opportunity: repeated trust signals should feed typed policy,
  service, eval, or knowledge-base work before increasing autonomy. The summary
  should stay a compact read model until domain owners approve enforcement.
- Agent autonomy impact: humans can use the summary to prioritize nudges,
  narrowing, pausing, or profile edits while preserving manual fallback and
  reviewable action requests.
- Tests or evidence: API tests verify admin-only access, seeded roster/run/action
  counts, oldest pending action, blocked preview counts, and trust-signal
  serialization. Web API tests verify the typed URL and admin auth headers.
- Follow-up: AP1-11 should render this summary in Admin without adding
  auto-enforcement or hidden mutations.

### 2026-04-22 - Signed-Out Prompt Drafts Resume Through Auth

- Type: lesson
- Domain: prompt-first UX
- Applies to: Prompt Home, authentication gate, assistant prompt submission,
  old-console navigation handoff
- Status: implemented
- Source:
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  [`App.tsx`](../../apps/web/src/App.tsx), and
  [`promptResumeIntent.ts`](../../apps/web/src/shared/promptResumeIntent.ts)
- Lesson: Prompt Home may be visible while signed out, but protected prompt
  execution must wait for authentication. Store a typed local resume intent for
  signed-out drafts, show the pending action in the auth gate, and return to
  Prompt Home after sign-in before sending or restoring the draft.
- Deterministic opportunity: prompt resume state is a browser-owned navigation
  contract, not model output. Keep it normalized, length-limited, cached for
  React external-store subscriptions, and cleared once Prompt Home consumes it.
- Agent autonomy impact: the assistant can guide the user into the old console
  after sign-in, but the resume flow still preserves manual fallback and never
  lets a freeform prompt mutate business records.
- Tests or evidence: focused web unit tests cover prompt resume normalization,
  stable subscription snapshots, and sign-in return intent storage. Browser
  smoke covers signed-out draft submission, post-auth prompt sending, recent
  thread resume, and old-console handoffs into operations, settlement, and
  trade capture.
- Follow-up: if prompt resume grows beyond browser-local state, promote it to a
  typed server-side session continuation contract with expiry and audit fields.

### 2026-04-22 - Prompt Starters Are Deterministic UI Intents

- Type: lesson
- Domain: prompt-first UX
- Applies to: Prompt Home, contextual starters, old-console navigation handoff,
  assistant prompt submission
- Status: implemented
- Source:
  [`promptHomeStarters.ts`](../../apps/web/src/workspaces/prompt/promptHomeStarters.ts)
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: contextual Prompt Home starters should be typed UI intents derived
  from deterministic workspace summary counts. They may seed or submit a prompt,
  or open the traditional workspace directly, but they should not rely on model
  output to decide the initial destination.
- Deterministic opportunity: starter cards are a stable mapping from work
  context to prompt draft and `PromptNavigationIntent`. If the mapping becomes
  role-specific or threshold-driven, move the rule into a typed service or
  configuration contract rather than embedding prompt instructions.
- Agent autonomy impact: starter prompts can ask the assistant to explain and
  route work, while direct workspace actions preserve manual fallback. Neither
  path grants the assistant write authority.
- Tests or evidence: web unit tests cover starter count projection and unknown
  metrics. Browser smoke covers asking from a starter, receiving an assistant
  handoff, and opening an old workspace directly from a starter.
- Follow-up: future starters should declare source counts, destination intent,
  prompt text, and stop conditions before being exposed as first-screen actions.

### 2026-04-22 - Control Tower UI Separates Watching From Enforcement

- Type: lesson
- Domain: control tower governance
- Applies to: Admin control tower, agent registry, approval inbox, outcome
  metrics, trust signal display
- Status: implemented
- Source:
  [`AssistantControlTowerPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantControlTowerPanel.tsx)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: the human watch surface should make agent posture easy to inspect
  without silently changing authority. The control tower can highlight eval
  gaps, policy warnings, failed actions, pending backlogs, and blocked previews,
  but pausing, narrowing, approval, or profile edits must remain explicit human
  actions in the existing governed panels.
- Deterministic opportunity: trust-signal presentation should link to durable
  remediation surfaces rather than inventing new hidden workflows. If repeated
  signals need automatic enforcement, promote that rule through policy,
  service, eval, and approval design first.
- Agent autonomy impact: supervisors can watch and nudge agents faster, but
  Phase 1 authority remains observe, explain, draft, or stage unless the
  autonomy rubric and outcome evidence justify more.
- Tests or evidence: web rendering tests cover seeded control tower posture and
  non-admin gating. The panel links to agent management, outcome metrics, and
  approval inbox sections while preserving the Phase 1 autonomy statement.
- Follow-up: AP1-12 should add explicit pause or narrowing workflows without
  turning summary signals into automatic mutations.

### 2026-04-22 - Unissued Invoices Are Candidate Trades

- Type: algorithm-added
- Domain: settlement assistant tooling
- Applies to: pending invoice summaries, settlement copilots, invoice action
  staging, workspace handoffs
- Status: implemented
- Source:
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py)
  and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: `settlement.invoice_pending_count` counts active trades that still
  need their first invoice record, not persisted invoice rows. Settlement
  agents should use the invoice issue candidate read model for unissued invoice
  work and use the invoice ledger only for records that already exist.
- Deterministic opportunity: candidate detection belongs in settlement service
  logic with the same open-settlement and no-existing-invoice criteria as the
  workspace summary, plus deterministic invoice-issue preview blockers before
  any action is staged.
- Agent autonomy impact: surfacing candidates improves read/explain quality and
  powers either staged review or bounded execution. Execute-capable settlement
  roles may issue directly when the readiness preview is ready, and blocked
  previews should stop both staging and self-execution until missing evidence
  is resolved.
- Tests or evidence: assistant tooling coverage verifies candidate payloads and
  recommended governed actions; assistant eval coverage verifies a settlement
  read agent can call the candidate tool for pending invoices.
- Follow-up: if finance users need sorting or prioritization beyond oldest open
  execution, promote that rule as a named settlement queue policy.

### 2026-04-22 - Action Specs Own Staging Planner Order

- Type: algorithm-added
- Domain: assistant action governance
- Applies to: action request staging, policy simulation, action catalog,
  assistant agent work packages
- Status: implemented
- Source:
  [`action_specs.py`](../../apps/api/app/domains/assistant/services/action_specs.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  and
  [`agent_work_packages.py`](../../apps/api/app/domains/assistant/services/agent_work_packages.py)
- Lesson: every approval-gated action must bind its catalog entry, execution
  handler, and deterministic planner in one typed action spec. Prompt staging
  and policy simulation should evaluate plans by catalog `planner_priority`
  instead of relying on a separate freeform planner list.
- Deterministic opportunity: action catalog metadata is the durable source for
  planner order, policy ownership, preview requirements, and coverage checks.
  When a new action is added, the spec registry should fail fast until the
  catalog, planner, handler, policy, and tests all agree.
- Agent autonomy impact: the model can still explain and draft action intent,
  but staging remains deterministic and policy-gated. Agent work packages move
  through explicit lifecycle states, and implementation requires evidence notes
  before a package can be marked implemented.
- Tests or evidence: API tests cover planner/spec coverage, policy simulation
  staging, admin work-package transition errors, and the implementation
  evidence gate. Web API tests cover the lifecycle PATCH client contract.
- Follow-up: wire the admin work-package lifecycle controls into the control
  tower once the UX can show transition history without obscuring manual
  approval responsibility.

### 2026-04-23 - Attention Counts Need Candidate Reads

- Type: algorithm-added
- Domain: assistant workflow and operations summaries
- Applies to: dashboard attention counts, settlement counts, confirmation
  backlogs, nomination and allocation backlogs, payment due work, pending
  settlement, exception summaries
- Status: implemented
- Source:
  [`trade_attention_candidates.py`](../../apps/api/app/domains/operations/services/trade_attention_candidates.py),
  [`workspace_bootstrap_summary.py`](../../apps/api/app/domains/operations/services/workspace_bootstrap_summary.py),
  and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: workspace counts often represent trade-state work, not persisted
  child records. Agents should use deterministic trade attention candidates to
  explain summary counts before assuming ledger, delivery, confirmation,
  invoice, or payment rows already exist.
- Deterministic opportunity: the same typed candidate conditions should power
  both summary counts and assistant candidate reads. Candidate payloads should
  include supporting child-record counts, suggested read tools, blockers, and
  only recommended governed actions where the durable record link exists.
- Agent autonomy impact: candidate reads improve triage and explanation while
  preserving manual fallback. Missing ledger records remain blockers rather
  than hidden mutations, while execute-capable roles may only use the
  published typed action path once the durable record link and previewable
  evidence are both available.
- Tests or evidence: assistant tooling tests cover child-row gaps and payment
  due candidates; assistant eval coverage verifies a managed read agent uses
  the candidate tool for trade-state counts.
- Follow-up: promote prioritization rules for these candidate categories only
  after operations or settlement owners approve queue policy.

### 2026-04-23 - Supervision Drafts Should Reuse Agent Save Paths

- Type: lesson
- Domain: assistant admin control tower
- Applies to: control tower trust signals, agent registry edits, pause and
  narrowing workflows
- Status: implemented
- Source:
  [`AssistantControlTowerPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantControlTowerPanel.tsx),
  [`AgentManagementPanel.tsx`](../../apps/web/src/workspaces/admin/AgentManagementPanel.tsx),
  and
  [`assistantSupervisionDraft.ts`](../../apps/web/src/workspaces/admin/assistantSupervisionDraft.ts)
- Lesson: control-tower interventions should prepare a supervised draft inside
  the existing typed agent edit form, not create a second config mutation path.
  Humans still own the save, but the watch floor can hand off a pause or
  narrowing intent with audit-note scaffolding and policy-fit warnings already
  visible.
- Deterministic opportunity: reuse role-fit validation and typed status fields
  to keep pause and narrowing guidance consistent across the control tower and
  registry editor. If future workflows add richer interventions, they should
  still land in the same typed agent update boundary.
- Agent autonomy impact: supervisors can react faster to warning signals
  without granting automatic pause or scope enforcement. Manual fallback and
  review authority stay intact.
- Tests or evidence: focused web tests cover supervision draft note generation
  and control-tower quick-action rendering; build verification confirms the
  admin workspace wiring.
- Follow-up: add inline history or reviewer attribution for supervision drafts
  if admins need a richer audit trail than activation notes alone.

### 2026-04-23 - Prompt Home Reuses Governed Review Cards

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: Prompt Home staged actions, approval routing, manual fallback
- Status: implemented
- Source:
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  [`AssistantActionRequestList.tsx`](../../apps/web/src/entities/assistant/AssistantActionRequestList.tsx),
  and
  [`smokeHarness.spec.ts`](../../apps/web/tests/browser/smokeHarness.spec.ts)
- Lesson: Prompt Home should not invent a second lightweight approval UI for
  governed writes. When the assistant stages a business action, the prompt
  surface should reuse the same reviewer metadata, evidence blocks, stale-state
  basis, and decision controls already trusted in the assistant/admin approval
  path, then offer a clear handoff into the old console for the full inbox.
- Deterministic opportunity: keep governed action truth in the typed action
  request contract and render it consistently across prompt-first and old
  console surfaces. Queue summaries may be specialized for the prompt landing
  experience, but approval state and reviewer evidence should stay sourced from
  the shared action-request model.
- Agent autonomy impact: prompt-first UX can feel direct without implying that
  a business write already ran. The model still stages requests, reviewers keep
  approval authority, and unsupported writes remain a visible manual fallback.
- Tests or evidence: focused Prompt Home browser smoke now stages a governed
  cancel-trade request, shows inline review context, approves it, and verifies
  status sync; static Prompt Home markup coverage verifies the approval-path
  guidance remains present on first render.
- Follow-up: if Prompt Home later gains run-specific review deep links, keep
  them as navigation-only handoffs into the existing assistant traces rather
  than adding a prompt-only execution route.

### 2026-04-23 - Invalid Prompt Handoffs Must Fail Closed

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: Prompt Home routing intents, browser smoke coverage, prompt-first
  verification lanes
- Status: implemented
- Source:
  [`promptNavigationIntent.ts`](../../apps/web/src/entities/app/promptNavigationIntent.ts),
  [`smokeHarness.spec.ts`](../../apps/web/tests/browser/smokeHarness.spec.ts),
  and [Local Development](./local-development.md)
- Lesson: malformed `navigation_intent` payloads should never leak raw control
  JSON into the prompt transcript or silently navigate anyway. Strip the bad
  handoff, surface a user-visible warning, and keep the operator anchored in
  Prompt Home until a valid typed route exists.
- Deterministic opportunity: treat prompt-first verification as a three-lane
  contract. Assistant evals guard authority and no-overclaim behavior, web
  tests guard typed parsing and fail-closed rendering, and browser smoke guards
  landing, resume, and handoff flows.
- Agent autonomy impact: prompt-led routing can remain expressive without
  increasing mutation authority or letting malformed control output become a UI
  behavior. Unsupported mutation requests stay as explanation plus manual
  fallback unless a typed governed action exists.
- Tests or evidence: prompt navigation unit coverage verifies invalid
  `navigation_intent` blocks produce warnings; Prompt Home smoke verifies the
  broken handoff stays on Prompt Home; assistant eval coverage adds one routing
  recommendation case and one unsupported mutation fallback case.
- Follow-up: if prompt-first routing starts using richer filters or deep-link
  semantics, extend the typed parser and fail-closed tests before shipping the
  new intent fields.

### 2026-04-23 - Unsaved Pre-Trade Drafts Reuse Recommendation Run Logic

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: unsaved pre-trade scenario drafts, deterministic draft analysis,
  assistant draft-read tools, review handoff preparation
- Status: implemented
- Source:
  [`pretrade_recommendations.py`](../../apps/api/app/domains/reports/services/pretrade_recommendations.py),
  [`pretrade.py`](../../apps/api/app/routes/pretrade.py), and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: transient pre-trade draft analysis should reuse the same typed
  evaluator, structured opportunity surface, and saved-run comparison logic as
  persisted recommendation runs. Unsaved edits can be analyzed and compared to
  the latest visible saved run without creating a new record.
- Deterministic opportunity: keep pre-trade recommendation behavior in one
  deterministic contract that both the UI and read-only agents can call. New
  pre-trade draft workflows should extend this service instead of rebuilding
  recommendation summaries in prompts or route-local logic.
- Agent autonomy impact: agents can explain the latest draft stance, residual
  exposure, hedge suggestion, and evidence gaps while remaining unable to
  persist recommendation runs, book trades, approve reviews, or execute hedges.
- Tests or evidence: focused API tests cover the non-persisting draft-analysis
  endpoint; assistant tooling tests cover actor-aware draft analysis; assistant
  eval coverage verifies that agents analyze drafts without claiming
  persistence or execution authority.
- Follow-up: route live source-adapter collection from the pre-trade editor
  into this contract before promoting any higher-trust draft-to-review
  automation.

### 2026-04-23 - Seeded Defaults Should Follow Role Status

- Type: lesson
- Domain: assistant pilot rollout
- Applies to: role archetype registry, Admin seed action, Admin blueprint
  catalog, pilot-lineup messaging
- Status: implemented
- Source:
  [`role_archetypes.py`](../../apps/api/app/domains/assistant/services/role_archetypes.py),
  [`seed_assistant_agents.py`](../../apps/api/app/domains/admin/services/seed_assistant_agents.py),
  and
  [`assistantAgentBuilder.ts`](../../apps/web/src/workspaces/admin/assistantAgentBuilder.ts)
- Lesson: only roles marked `SEEDED` in the server catalog should be
  synchronized automatically into the managed-agent roster. Phase 1 pilots that
  still need dedicated product workflows should show up as template-only
  blueprints in Admin rather than draft profiles that blur the line between a
  synchronized default and a human-created specialization.
- Deterministic opportunity: derive the synchronized-default list from the role
  catalog status instead of letting seed definitions drift separately from the
  documented rollout posture. Admin should label seeded defaults and
  template-only blueprints explicitly so humans understand what exists already
  versus what still needs deliberate creation.
- Agent autonomy impact: this keeps the Phase 1 rollout conservative without
  removing manual flexibility. Operators can still create pilot drafts for
  market, pre-trade, and document work, but the platform no longer implies that
  those profiles are already part of the synchronized trusted default set.
- Tests or evidence: focused API seed and role-catalog tests cover seeded
  counts and `current_profile_ids`; web builder tests cover the Phase 1
  blueprint catalog; browser smoke seed messaging reflects seeded-default
  counts.
- Follow-up: once AP1-14 or AP1-15 graduates a pilot into a stable product
  flow, revisit whether that role should remain template-only or become a new
  synchronized default.

### 2026-04-23 - Stage Deterministic Draft Packets Before Adding Booking Authority

- Type: lesson
- Domain: pre-trade structuring and human review handoff
- Applies to: review-ready draft workflows, assistant-to-workspace handoffs,
  pre-trade review queue staging
- Status: implemented
- Source:
  [`preTradeStructuringDraft.ts`](../../apps/web/src/workspaces/pretrade/preTradeStructuringDraft.ts),
  [`PreTradeWorkspace.tsx`](../../apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx),
  and
  [`test_assistant_evals.py`](../../apps/api/tests/test_assistant_evals.py)
- Lesson: when a pilot role needs to create useful work before it has booking
  or execution authority, productize a deterministic draft packet instead of
  relying on prompt-only prose. The packet should preserve the exact fields a
  human reviewer and downstream workspace need.
- Deterministic opportunity: generate review-ready packets from typed draft and
  recommendation records so humans can compare, refine, and approve the same
  structure every time. If reviewers repeatedly edit the same sections, move
  those edits into deterministic packet-generation rules rather than prompt
  advice.
- Agent autonomy impact: the Pre-Trade Structuring Agent can now produce a
  review-ready packet with thesis, assumptions, source context, reviewer
  focus, trade-capture handoff fields, and explicit no-booking guardrails
  while remaining unable to book a trade or persist capture.
- Tests or evidence: focused web tests cover packet construction and fallback
  behavior; assistant eval coverage verifies review-ready draft language plus
  explicit refusal to book trades or persist capture.
- Follow-up: once the review packet and reviewer edits stabilize, consider
  whether a later ticket should add approval-gated staging beyond `review_notes`
  or keep the review queue handoff as the durable Phase 1 boundary.

### 2026-04-23 - Track Prompt Handoff Outcomes Separately From Answer Feedback

- Type: lesson
- Domain: prompt-first operator experience and assistant telemetry
- Applies to: Prompt Home handoffs, admin outcome metrics, deterministic
  routing promotion
- Status: implemented
- Source:
  [`prompt_navigation_outcomes.py`](../../apps/api/app/domains/assistant/services/prompt_navigation_outcomes.py),
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`AssistantOutcomeMetricsPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantOutcomeMetricsPanel.tsx)
- Lesson: prompt-first workspace handoffs need their own outcome telemetry,
  separate from answer thumbs-up or thumbs-down signals. Accepted, dismissed,
  and failed handoffs describe whether the suggested route was useful, not
  whether the narrative answer sounded good.
- Deterministic opportunity: aggregate handoff outcomes by destination and
  focus so repeated accepted routes become candidates for deterministic routing
  rules, while repeated dismissals or failures become narrowing or retirement
  signals. Promote routing behavior from prompt instructions into product logic
  only after these outcome patterns stabilize.
- Agent autonomy impact: assistants can keep proposing contextual handoffs from
  Prompt Home without gaining authority to change the underlying routing rules.
  Humans still approve durable routing behavior by reviewing the measured
  outcome patterns in admin metrics.
- Tests or evidence: focused API tests cover recording and scoping prompt
  handoff outcomes plus aggregated admin metrics; web unit tests cover shared
  telemetry helpers and admin display rows; browser smoke covers accepted,
  dismissed, and failed handoff flows from Prompt Home.
- Follow-up: when a route keeps winning for the same target and focus, add a
  deterministic routing rule or starter instead of relying on prompt-only
  suggestion text.

### 2026-04-24 - Promote Stable Prompt Routes Through Product UI, Not Prompt Text

- Type: lesson
- Domain: prompt-first operator experience and deterministic routing
- Applies to: Prompt Home landing surface, prompt-route recommendation APIs,
  telemetry-driven route promotion
- Status: implemented
- Source:
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py),
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: once Prompt Home handoff telemetry shows a destination winning
  repeatedly for a role, promote that destination into deterministic product UI
  rather than leaving it as a model-only suggestion. Prompt Home should surface
  those routes as explicit quick destinations before the user has to ask again.
- Deterministic opportunity: derive role-scoped promoted routes from accepted
  prompt handoff outcomes over a bounded lookback window, and keep the
  promotion threshold in code instead of in prompt instructions. The UI can
  still keep the broader manual route list as fallback.
- Agent autonomy impact: assistants can keep suggesting destinations in free
  text, but repeated success no longer depends on the model remembering the
  same route each time. Product logic owns the promoted route once the outcome
  evidence is strong enough.
- Tests or evidence: focused API coverage verifies role-scoped prompt-route
  recommendations; web helper tests cover the current-user recommendation API;
  browser smoke verifies Prompt Home opens a promoted deterministic route
  directly while keeping legacy destinations available.
- Follow-up: when promoted routes start needing richer branching or
  object-specific focus, move from workspace-level recommendations to typed
  deterministic route contracts rather than adding more prompt heuristics.

### 2026-04-24 - Enrich Promoted Prompt Routes With Deterministic Object Handoffs

- Type: lesson
- Domain: prompt-first operator experience and handoff focus
- Applies to: Prompt Home promoted routes, trade attention candidates, invoice
  issue candidates, workspace handoff focus banners
- Status: implemented
- Source:
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts),
  [`candidateWorkflowHandoffs.ts`](../../apps/web/src/entities/app/candidateWorkflowHandoffs.ts),
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: once a workspace route is promoted from repeated Prompt Home
  outcomes, prefer opening it with a live deterministic object handoff when a
  current candidate record can supply focus, filter, or inspector-tab context.
  That turns "open Operations" into "open confirmation for trade T-AMEND-100"
  without asking the model to restate the route every time.
- Deterministic opportunity: keep telemetry-based route promotion and
  object-resolution separate. Let route outcomes decide which workspace is
  worth promoting, then let existing deterministic candidate-read services pick
  the current best object to focus inside that workspace.
- Agent autonomy impact: the assistant still does not own route truth. Prompt
  Home promotes the workspace from measured outcomes, and the product resolves
  the live object focus through typed candidate data that the human can inspect
  and clear.
- Tests or evidence: focused web tests cover promoted-route resolution against
  trade-attention and invoice candidate data; browser smoke verifies a promoted
  route lands in the old workspace with focused handoff context and banner
  state intact.
- Follow-up: if multiple candidate objects compete for the same promoted
  workspace, add a deterministic chooser or small disambiguation surface rather
  than falling back to prompt-generated object picks.

### 2026-04-25 - Choose Promoted Prompt Handoffs By Cue Match, Then Urgency

- Type: lesson
- Domain: prompt-first operator experience and deterministic route selection
- Applies to: Prompt Home promoted routes, candidate handoff resolution,
  object-aware workspace opens
- Status: implemented
- Source:
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts)
  and
  [`promptPromotedRoutes.test.ts`](../../apps/web/tests/promptPromotedRoutes.test.ts)
- Lesson: when multiple live candidate objects can satisfy the same promoted
  workspace route, the chooser should not take the first matching record.
  Resolve the route by scoring recommendation-text cues first, then
  workspace-specific urgency, then handoff specificity, and finally stable list
  order.
- Deterministic opportunity: keep the chooser transparent and typed. Let the
  promoted route signal decide which workspace deserves a shortcut, but let the
  chooser use candidate metadata such as label, rationale, candidate type, and
  priority reason to select the focused object inside that workspace.
- Agent autonomy impact: Prompt Home can now open the right legacy surface with
  a concrete live object in focus more reliably, without asking the model to
  arbitrate between multiple invoices, workflow items, or trade exceptions.
- Tests or evidence: focused web tests cover settlement payment vs invoice
  issuance conflicts, invoice-specific recommendation cues, and pricing vs
  incomplete-data trade conflicts.
- Follow-up: if score ties remain common for a workspace, add a small
  disambiguation row that shows the top deterministic candidates instead of
  hiding the choice inside prompt text.

### 2026-04-25 - Record Prompt Home Promoted Route Accepts As First-Class Outcome Events

- Type: lesson
- Domain: prompt-first operator experience, routing telemetry, and promotion
  provenance
- Applies to: Prompt Home promoted routes, prompt-navigation outcomes,
  prompt-route recommendations, and admin routing metrics
- Status: implemented
- Source:
  [`prompt_navigation_outcomes.py`](../../apps/api/app/domains/assistant/services/prompt_navigation_outcomes.py),
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts)
- Lesson: when Prompt Home opens a promoted route card, that accept is still a
  real routing outcome even though there is no assistant run behind it. Record
  it as a first-class Prompt Home event instead of pretending it came from an
  unrelated run. Then group promoted-route recommendations by route identity
  such as workspace, route label, and focus type rather than collapsing
  everything back to the workspace name.
- Deterministic opportunity: use the accepted promoted-route events to let
  specific patterns like `Open confirmation` or `Open payment queue` graduate
  into deterministic Prompt Home routes. Keep those route-specific promotions
  hidden unless a current live candidate can supply the focused handoff they
  promise.
- Agent autonomy impact: this keeps routing truth in product telemetry and
  typed candidate services, not in freeform assistant memory. The model can
  still suggest destinations, but Prompt Home promotion now learns from both
  assistant-suggested handoffs and direct product-route accepts without losing
  provenance.
- Tests or evidence: focused API coverage verifies prompt-home route events
  without run ids and role-scoped route-specific promotions; focused web tests
  cover prompt-route API helpers, route-specific chooser behavior, and admin
  outcome display rows; browser smoke verifies promoted routes post the
  top-level Prompt Home outcome event while the legacy workspace handoff flow
  still works.
- Follow-up: if route-specific promotions remain useful but no live candidate
  is available, add a small “not ready right now” state instead of silently
  dropping the card.

### 2026-04-25 - Keep Route-Specific Prompt Promotions Visible With Honest Readiness States

- Type: lesson
- Domain: prompt-first operator experience and promoted-route lifecycle
- Applies to: Prompt Home promoted routes, route-specific workspace handoffs,
  live candidate availability, and telemetry-driven promotion retirement
- Status: implemented
- Source:
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`promptPromotedRoutes.test.ts`](../../apps/web/tests/promptPromotedRoutes.test.ts)
- Lesson: route-specific Prompt Home promotions should not silently disappear
  when the live object they need is temporarily missing. Keep the promoted card
  visible with an explicit readiness state such as `Ready`, `Not ready right
now`, or `Cooling off`, show when it last succeeded, and offer the generic
  legacy workspace as fallback when no focused handoff is currently honest.
- Deterministic opportunity: treat promotion readiness as a typed product rule,
  not prompt behavior. The route recommendation service should expose recency
  metadata, while the Prompt Home chooser decides whether a route is ready,
  waiting on live context, or cooling off after a bounded stale window.
- Agent autonomy impact: this keeps the assistant out of the loop for route
  retirement or suspense decisions. Product logic owns when to present, pause,
  or decay a promoted shortcut, and the human can still reach the old-school
  workspace directly.
- Tests or evidence: focused API coverage verifies promoted-route recency;
  focused web tests cover ready, waiting, cooling-off, and ordering behavior;
  browser smoke keeps the promoted-route and legacy-workspace handoff flows
  green together.
- Follow-up: if cooling-off routes remain useful for discovery, consider a
  lightweight dismissal or pinning rule before promoting them back to `Ready`.

### 2026-04-25 - Execute-Capable Agents Must Still Use Typed Services and Log Boundary Overrides

- Type: lesson
- Domain: assistant autonomy and governed business mutations
- Applies to: managed assistant execution, assistant action requests,
  role-derived agent seeds, autonomous system-of-record updates
- Status: implemented
- Source:
  [`execution.py`](../../apps/api/app/domains/assistant/services/execution.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  [`policies.py`](../../apps/api/app/domains/assistant/services/policies.py),
  [`role_archetypes.py`](../../apps/api/app/domains/assistant/services/role_archetypes.py),
  [`seed_assistant_agents.py`](../../apps/api/app/domains/admin/services/seed_assistant_agents.py),
  and
  [`action_handlers.py`](../../apps/api/app/domains/assistant/services/action_handlers.py)
- Lesson: when a managed agent has `EXECUTE` authority, it can self-execute a
  governed action in the same request instead of leaving a pending approval
  item, but the mutation still has to run through the typed action-handler path
  with stale-state rechecks, idempotency checks, and audit context intact.
- Deterministic opportunity: keep autonomous execution metadata inside
  `review_context` so the same contract works for both review-gated and
  self-executed actions. Record `execution_mode`,
  `autonomous_execution_reason`, and
  `delegated_ability_override_reason` there instead of inventing a separate
  write path.
- Agent autonomy impact: delegated tool and action scopes remain the default
  lane, but an execute-capable agent can widen beyond that lane only by logging
  an explicit override reason that says why the platform record needed to catch
  up to asserted real-world state. Autonomy increases, but freeform model
  output still does not write business records directly.
- Tests or evidence: focused API coverage verifies expanded seeded profiles,
  role-catalog exposure, stage-only review metadata, execute-capable
  autonomous cancellation, and action registry/catalog parity; focused web unit
  coverage verifies the seeded builder and admin seed helper contracts.
- Follow-up: add the next typed write seams through the same pattern before
  expanding autonomy further, especially trade capture, delivery-event logging,
  manual accrual adjustments, and accounting postings.

### 2026-04-25 - Prove One Governed Core Slice Before Expanding Agent Breadth

- Type: lesson
- Domain: platform sequencing, assistant authority boundaries, and core
  product planning
- Applies to: roadmap scoping, work-package prioritization, action-request
  design, and assistant/runtime expansion
- Status: accepted
- Source: [Governed Core Platform Roadmap](./core-platform-roadmap.md) and
  [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- Lesson: when trade lifecycle, reference data, policy, projection freshness,
  and settlement semantics are still hardening, roadmap work should prioritize
  one governed end-to-end slice over wider workspace or agent expansion. The
  assistant runtime should stay a subordinate read, explain, draft, and stage
  boundary while deterministic services and shared action-request workflows
  define the platform's mutation truth.
- Deterministic opportunity: promote recurring "should we build this now?"
  judgment into explicit roadmap gates: does the work strengthen the chosen
  governed slice, reduce hidden business logic, or harden deterministic truth,
  replay safety, or reviewability? If not, defer it.
- Agent autonomy impact: this keeps action requests as a shared workflow
  primitive rather than an assistant-only escape hatch, and it blocks freeform
  model output from becoming a parallel mutation path while the core platform
  is still stabilizing.
- Tests or evidence: the governed-core planning package now defines phased work
  order, package-level acceptance criteria, and verification expectations for
  API tests, assistant evals, web tests, and browser smoke coverage.
- Follow-up: when a new workspace, agent, or workflow proposal appears, map it
  to the chosen governed slice first. If it cannot strengthen that slice or a
  clearly named core boundary, keep it deferred.

### 2026-04-25 - Lock The First Governed Slice To Fixed-Price Physical Gas

- Type: lesson
- Domain: platform scoping, deterministic trade semantics, and workflow
  sequencing
- Applies to: roadmap prioritization, reference-data hardening, trade command
  design, settlement preview work, and assistant pilot selection
- Status: accepted
- Source: [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- Lesson: the first governed core slice is now explicitly locked to
  single-leg, fixed-price, physical natural gas trade capture and lifecycle
  review with deterministic reference-data validation, projection-backed
  position impact, settlement preview, and audit or explanation support. This
  is the narrowest serious commodity workflow the repo already proves through
  browser smoke, server-owned trade metadata, and seeded settlement candidate
  seams.
- Deterministic opportunity: use the locked slice as the default planning gate
  for future work. If a new feature does not strengthen this gas trade path's
  trade truth, policy, projection freshness, settlement readiness, or governed
  AI boundary, defer it until the slice is trusted end to end.
- Agent autonomy impact: AI work should stay inside explanation, drafting, and
  staged action support for this slice first. Do not widen agent authority or
  product-family breadth until the deterministic seams for trade capture,
  reference data, policy, and settlement preview are stronger.
- Tests or evidence: the current browser smoke harness captures a deterministic
  single-leg fixed-price trade path, the trade metadata contract defaults to
  `PHYSICAL`, `SINGLE`, and `FIXED`, and seeded fixtures already expose
  invoice and payment candidate follow-through for the same workflow family.
- Follow-up: align GCP-02 through GCP-14 work against this locked slice before
  introducing broader product-family, pricing, or autonomy scope.

### 2026-04-25 - Treat Admin, Reports, And Assistant As Surfaces, Not Domains Of Truth

- Type: lesson
- Domain: architecture boundaries, rule placement, and governed-core review
- Applies to: new service placement, report queries, admin APIs, assistant
  tools, and workflow or action-request orchestration
- Status: accepted
- Source: [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- Lesson: during the governed-core phase, durable business truth should trend
  toward authority-first seams such as trade lifecycle, reference data,
  market data, risk, settlement, operations, workflow, policy, documents,
  integrations, AI gateway, and audit. `admin`, `reports`, and `assistant`
  remain important product surfaces, but they should orchestrate or summarize
  governed outputs instead of becoming the only home of business rules.
- Deterministic opportunity: use the boundary-reset checklist as a code-review
  rule. If a change would make an admin panel, report query, prompt profile,
  assistant helper, or frontend component the sole owner of a business rule,
  move that rule into the owning domain or policy seam first.
- Agent autonomy impact: this keeps the assistant runtime subordinate to typed
  read and stage seams and prevents agent surfaces from growing into a parallel
  mutation or policy architecture.
- Tests or evidence: the governed-core planning package now includes an
  explicit seam map, allowed and disallowed dependency examples, and review
  anti-patterns for domain rule placement.
- Follow-up: when implementing GCP-03 and later packages, prefer moving rule
  ownership first, even if the file-system or route migration happens
  incrementally afterward.

### 2026-04-25 - Trade Writes Should Be Command-Owned, Event-Recorded

- Type: lesson
- Domain: trade lifecycle architecture, write-path governance, and stale-state
  enforcement
- Applies to: trade capture, amend and cancel flows, future correction paths,
  assistant-staged trade actions, and route or service refactors around
  `/events`
- Status: accepted
- Source: [Governed Core Trade Command Model](./core-platform-trade-command-model.md)
- Lesson: the public contract for governed trade writes should be explicit
  business commands such as `BookTrade`, `AmendTradeTerms`, and `CancelTrade`,
  while `TradeCreated`, `TradeAmended`, and `TradeCancelled` remain the
  internal durable events emitted after validation succeeds. The current event
  route can stay as a compatibility adapter during migration, but it should not
  remain the source of truth for write intent.
- Deterministic opportunity: centralize reference-data validation, policy
  checks, pricing and measurement rules, and expected `last_event_id`
  stale-state guards in command handlers so the UI, scripts, assistants, and
  future automation reuse the same write semantics.
- Agent autonomy impact: assistants may stage typed action requests against the
  same command-owned seam, but they should not be allowed to append raw trade
  lifecycle events directly or bypass stale-state and policy checks through a
  chat-specific path.
- Tests or evidence: the current repo already routes create, amend, and cancel
  writes through `/events` and `apply_trade_event`, which makes the migration
  boundary visible; the command model now defines the target catalog,
  envelope, compatibility mapping, and stale-state expectations for the locked
  fixed-price physical gas slice.
- Follow-up: wire the first trade command application service above raw event
  append calls, then migrate the web app away from direct event-type write
  semantics without losing the event store and projection architecture.

### 2026-04-27 - Trade Create, Amend, and Cancel Now Enter Through a Command Adapter

- Type: algorithm-added
- Domain: trade lifecycle write-path governance and mutation provenance
- Applies to: `/events`, web trade capture, trade amendments, trade
  cancellations, and future assistant-staged trade commands
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py`,
  `apps/api/app/routes/events.py`,
  `apps/api/app/domains/trading/services/event_writes.py`,
  `apps/web/src/entities/trade/api.ts`, and
  `apps/web/src/entities/app/useAppTradeActions.ts`
- Lesson: the first governed trade command seam now exists in code. The
  compatibility `/events` route recognizes `TradeCreated`, `TradeAmended`, and
  `TradeCancelled` writes for the locked slice, maps them to typed trade
  commands, and records command-aware provenance before the existing event and
  projection flow runs. The web app no longer submits create, amend, and cancel
  writes from raw event names at the call site; it calls explicit trade command
  helpers that still use `/events` as an adapter during migration.
- Deterministic opportunity: the next safe promotion step is to move expected
  `last_event_id` stale-state enforcement and later policy/reference-data
  prechecks into the command layer, because the route and web callers now carry
  the command metadata needed to do that without inventing a new transport.
- Agent autonomy impact: assistants and future automation should target the
  same command-owned seam, either through action requests or later typed
  command services, instead of appending trade lifecycle events directly.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`,
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`,
  `cd apps/web && npx eslint src/entities/trade/api.ts src/entities/app/useAppTradeActions.ts`,
  and `cd apps/web && npm run build`.
- Follow-up: enforce stale-state checks in the command service, then move more
  callers and future action-request execution onto the same typed command path.

### 2026-04-27 - Trade Commands Now Reject Stale last_event_id Bases Before Event Append

- Type: algorithm-added
- Domain: trade lifecycle stale-state enforcement and fail-closed mutation
  safety
- Applies to: trade amendments, trade cancellations, compatibility writes
  through `/events`, and future action-request execution against the same seam
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py` and
  `apps/api/tests/test_trade_commands_service.py`
- Lesson: the trade command seam now treats `expected_last_event_id` as the
  canonical stale-state anchor for amend and cancel operations. When the caller
  supplies that basis and the current trade projection has moved on, the
  command service raises `409` before any new lifecycle event is appended.
- Deterministic opportunity: the same seam can now absorb more deterministic
  prechecks, especially policy and reference-data validation, because drift
  detection already happens before the event store is touched.
- Agent autonomy impact: assistants and future automation should carry the same
  `last_event_id` basis in action requests and execution calls, so approval-time
  stale-state rechecks and execution-time stale-state guards stay aligned.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`
  and `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: require and expose this stale-state basis consistently across more
  callers as the raw `/events` compatibility path is retired.

### 2026-04-28 - Trade Commands Now Own First-Pass Authorization, Reference Checks, And Lifecycle Policy

- Type: algorithm-added
- Domain: trade lifecycle command validation and fail-fast governance
- Applies to: create, amend, and cancel trade writes entering through the
  governed command seam or the `/events` compatibility adapter
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py`,
  `apps/api/tests/test_trade_commands_service.py`, and
  `apps/api/tests/test_auth_http.py`
- Lesson: the trade command seam now performs a first-pass policy and
  reference-data screen before any event append. It blocks read-only viewer
  sessions, catches invalid reference selections and duplicate creates on new
  trades, and rejects amend or cancel requests that violate current lifecycle
  policy such as closed-trade cancellation, credit-hold blocked fields, or
  managed projection override rules.
- Deterministic opportunity: keep promoting prechecks into the command layer
  when they are read-only and deterministic, so the event store remains a
  record of accepted business facts rather than a place where avoidable invalid
  writes are attempted and then rolled back.
- Agent autonomy impact: assistants and future automation now have a clearer
  target contract. If they stage or execute trade changes, they must satisfy
  the same actor-role, stale-state, reference-data, and lifecycle-policy
  contract as the manual web path.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`,
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`,
  and `.venv/bin/python -m unittest
apps.api.tests.test_auth_http.AuthHttpTests.test_trade_writes_require_session_and_use_session_actor
apps.api.tests.test_auth_http.AuthHttpTests.test_trade_http_rejects_duplicate_create_and_missing_amend`.
- Follow-up: move the remaining deterministic trade validations that are still
  buried inside projection application into reusable command-layer helpers, and
  then decide whether command-specific role rules should tighten beyond the
  initial governed-write allowlist.

### 2026-04-29 - Trade Write Validation Now Lives In One Shared Deterministic Path

- Type: algorithm-added
- Domain: trade lifecycle normalization and validation reuse across command
  prechecks and projection application
- Applies to: `TradeCreated`, `TradeAmended`, and `TradeCancelled` handling in
  the governed command seam and the event-application projection path
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_write_validation.py`,
  `apps/api/app/domains/trading/services/trade_commands.py`, and
  `apps/api/app/domains/trading/services/trade_event_application.py`
- Lesson: trade write validation is now shared instead of duplicated. Create,
  amend, and cancel normalization and deterministic business checks run through
  `trade_write_validation.py`, so the command seam and projection application
  consume the same reference-data, lifecycle, option, credit, and pretrade
  alignment rules instead of carrying parallel copies that can drift.
- Deterministic opportunity: keep moving more trade-write invariants into
  reusable helpers that return normalized write plans, so future action-request
  execution can reuse the exact same contract instead of rebuilding field-level
  rules again.
- Agent autonomy impact: assistants and future automation now have a more
  stable target for staged trade changes because the validation behavior they
  meet at command time is the same behavior that projection application uses to
  accept and materialize the event.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service` and
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: route more mutation entry points through explicit command services,
  then decide whether the shared validator should start returning richer write
  plans for settlement and workflow side effects as those seams move under the
  same governed contract.

### 2026-04-30 - Assistant Trade Actions Now Execute Through Trade Commands

- Type: algorithm-added
- Domain: governed assistant execution and trade mutation authority
- Applies to: assistant `create_trade`, `amend_trade`, and `cancel_trade`
  action requests in both review-approved and autonomous execution modes
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/trading/services/trade_commands.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: assistant trade actions no longer append raw trade events or mutate
  projections directly inside the assistant runtime. They now construct typed
  `TradeWriteCommand` records with assistant-specific command IDs,
  source-surface metadata, and review-context `last_event_id` basis, then
  execute through `append_trade_write_command(...)`.
- Deterministic opportunity: any future assistant, automation, or workflow
  path that changes trades should reuse the same command seam instead of
  building a parallel event-write shortcut, so stale-state, reference-data,
  lifecycle, and provenance rules stay aligned.
- Agent autonomy impact: autonomous agents remain subordinate to deterministic
  trade services. Even execute-capable agents now use the exact same governed
  trade write seam as manual and approval-driven trade changes, with distinct
  `source_surface` values for reviewer-approved vs autonomous execution.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_trade_cancellation
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_create_trade_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_amend_trade_action`
  and `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: move non-trade governed assistant mutations toward the same
  pattern of typed application services with explicit source-surface and stale
  basis propagation, then measure autonomous execution outcomes by command seam
  instead of raw action type alone.

### 2026-05-01 - Assistant Settlement And Actualization Writes Preserve Service-Owned Provenance

- Type: lesson
- Domain: governed assistant execution, settlement workflows, and operational
  actualization auditability
- Applies to: assistant `issue_trade_invoice`, `void_trade_invoice`,
  `create_trade_payment`, `reverse_trade_payment`, `record_trade_actualization`,
  and `void_trade_actualization` execution paths
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/audit_events.py`,
  `apps/api/app/domains/operations/services/actualizations.py`,
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`, and
  `apps/api/app/domains/assistant/services/action_handlers.py`
- Lesson: non-trade assistant mutations should keep their business writes in
  typed operational services, but they should not lose assistant execution
  provenance at the handoff. Settlement and actualization services now accept a
  governed audit mutation context so their trade audit events record the
  originating assistant `source_surface`, assistant action-request identifiers,
  and service-owned operation keys such as `settlement.issue_trade_invoice`
  instead of collapsing everything into a generic `events` write.
- Deterministic opportunity: when more high-trust domains move under governed
  assistant execution, add execution metadata through service-owned mutation
  contexts rather than letting assistant handlers create one-off provenance
  shortcuts. The service should still own the operation key and audit event
  semantics.
- Agent autonomy impact: execute-capable agents remain subordinate to the same
  settlement and actualization services as human-triggered flows. Autonomous
  and reviewer-approved assistant actions now remain distinguishable in
  mutation provenance without adding assistant-only write paths.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_void_trade_actualization_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_void_trade_invoice_handler_records_assistant_mutation_context
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_reverse_trade_payment_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_invoice_issue
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_payment_creation
apps.api.tests.test_settlement_invoices_api.SettlementInvoicesApiTests.test_void_invoice_marks_not_required_and_clears_unpaid_payment_rows
apps.api.tests.test_settlement_payments_api.SettlementPaymentsApiTests.test_reverse_paid_payment_creates_offsetting_entry_and_reopens_invoice_balance`
  and `make api-assistant-evals`.
- Follow-up: extend the same governed mutation-context pattern to remaining
  high-trust assistant domains like confirmations, workflow mutations, delivery
  events, manual accruals, and accounting entries so action-request execution
  can be traced by service seam across the full platform.

### 2026-05-01 - Reference Asset Spatial Enrichment Uses Source-Owned Ordering Before Fallback Geography

- Type: algorithm-added
- Domain: reference data stewardship and governed asset spatial hydration
- Applies to: imported reference assets that carry upstream source URLs for
  WRI and HIFLD energy infrastructure catalogs
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/asset_spatial_enrichment.py`,
  `apps/api/scripts/enrich_reference_asset_spatial_fields.py`, and
  `apps/api/tests/test_asset_spatial_enrichment.py`
- Lesson: when a large imported asset catalog omits direct coordinates but
  preserves deterministic upstream identifiers, enrich spatial fields from the
  upstream source order instead of inventing fallback points. WRI assets map by
  CKAN row id, while HIFLD assets map by the original `resultOffset` ordered by
  upstream `OBJECTID`, then store the source geometry as GeoJSON and derive a
  representative point from that geometry for map centering.
- Deterministic opportunity: keep future bulk spatial loaders behind explicit
  source adapters that define how records are matched, how geometry is
  converted, and how representative points are derived. Reuse linked
  `location_code` only when no source-backed asset geometry or coordinates are
  available.
- Agent autonomy impact: agents can run repeatable spatial hydration against
  reference assets without freeform judgment about route shapes or manual point
  placement. The deterministic adapter owns matching rules and geometry
  conversion.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_asset_spatial_enrichment
apps.api.tests.test_asset_catalog_import
apps.api.tests.test_asset_reference_normalization
apps.api.tests.test_reference_data
apps.api.tests.test_admin_seed_api` and repeated live runs of
  `PYTHONPATH=. ./.venv/bin/python apps/api/scripts/enrich_reference_asset_spatial_fields.py --requested-by codex`
  with the second run returning `updated_asset_count = 0`.
- Follow-up: replace public-clone HIFLD adapters with the exact archived source
  packages when those downloads are available from this environment, then add
  more source adapters for the remaining non-point GEM and refinery catalogs.

### 2026-05-01 - Location-Backed Asset Map Readiness Depends On Hydrated Reference Geography And Full Location Bootstrap

- Type: lesson
- Domain: reference data stewardship, spatial fallback behavior, and map
  workspace reliability
- Applies to: asset map readiness when assets rely on `location_code` instead
  of direct coordinates or source geometry
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/location_spatial_enrichment.py`,
  `apps/api/scripts/enrich_reference_location_spatial_fields.py`,
  `apps/api/tests/test_location_spatial_enrichment.py`,
  `apps/web/src/entities/app/api.ts`, and
  `apps/web/tests/appBootstrapLoaders.test.ts`
- Lesson: once source-backed asset geometry and point enrichment are in place,
  the next spatial bottleneck is usually the governed location catalog, not the
  asset rows. Asset map readiness should fall back to linked `location_code`
  coordinates, so reference locations need deterministic centroid hydration
  from maintained geography catalogs, and the reference workspace bootstrap
  must always load the full location catalog instead of inheriting a smaller
  generic row limit.
- Deterministic opportunity: keep location centroid enrichment behind a
  repeatable service that hydrates countries and subdivisions from Natural
  Earth, derives corridor and region centroids from governed member locations,
  and reruns idempotently. Treat client bootstrap coverage for location
  references as part of the deterministic map-readiness contract.
- Agent autonomy impact: agents can improve asset map coverage through
  repeatable location-reference enrichment without inventing points for assets
  that lack source geometry. The deterministic location service owns fallback
  geography, while the client consistently loads the linked reference rows that
  the asset map logic depends on.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_location_spatial_enrichment
apps.api.tests.test_asset_spatial_enrichment
apps.api.tests.test_asset_catalog_import
apps.api.tests.test_asset_reference_normalization
apps.api.tests.test_reference_data
apps.api.tests.test_admin_seed_api`,
  `cd apps/web && npm test -- --run appBootstrapLoaders.test.ts referenceDataAssetsTab.test.ts referenceDataCharacterization.test.ts`,
  and repeated live runs of
  `PYTHONPATH=. ./.venv/bin/python apps/api/scripts/enrich_reference_location_spatial_fields.py --requested-by codex`
  with the second run returning `updated_location_count = 0`.
- Follow-up: add targeted adapters or curated overrides for the remaining
  unsupported subdivisions and politically special geographies that Natural
  Earth does not resolve cleanly, then refresh the small residual set of assets
  still blocked on those locations.

### 2026-05-05 - Asset Map Category Filters Collapse Raw Asset Taxonomy Into Operator Buckets

- Type: algorithm-added
- Domain: prompt-first map UX and governed reference asset presentation
- Applies to: the second-row asset visibility filters on Prompt Home and the
  full Map workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: raw `asset_type` values are too granular for quick map scanning, so
  the shared asset-map controls now collapse the governed asset taxonomy into a
  stable operator-facing bucket list: `Upstream Oil & Gas`, `Pipeline`,
  `Refinery`, `NG Processing`, `Petrochem`, `Storage`, `Power Generation`, and
  `Other`.
- Deterministic opportunity: keep future asset-map filtering anchored to a
  single classifier that maps `asset_class` plus selected `asset_type`
  exceptions into these display buckets. The current split treats
  `PROCESSING/PETROCHEMICAL` as `Petrochem`, other `PROCESSING` rows as
  `NG Processing`, `TERMINAL/LNG` as `NG Processing`, `TERMINAL/PIPELINE` as
  `Pipeline`, and remaining unmatched classes as `Other`.
- Agent autonomy impact: agents no longer need to infer ad hoc label groups or
  expose long raw subtype lists when adjusting the asset map. The deterministic
  classifier owns the display taxonomy and keeps Home and Map consistent.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts` and
  `cd apps/web && npm run test:smoke -- --grep "prompt home keeps the
simplified map visible while desk time cards collapse independently"`.
- Follow-up: if operators want different commercial groupings later, change the
  shared classifier and test expectations together instead of adding one-off UI
  overrides in individual map surfaces.

### 2026-05-05 - Asset Map Geography Filters Use Shared Broad-Region Classification

- Type: algorithm-added
- Domain: prompt-first map UX, weather overlay filtering, and governed spatial
  review
- Applies to: the geography filter row on Prompt Home and the full Map
  workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: the shared map now exposes a stable broad-region filter with four
  operator-facing buckets: `North America`, `South America`, `EMEA`, and
  `APAC`. The classifier prefers governed location metadata when present,
  using `region`, then `country_code`, then `continent_code`, and finally
  falls back to deterministic latitude/longitude bands so Home and Map do not
  drift on geography labeling.
- Deterministic opportunity: keep future map-region filtering anchored to the
  shared classifier instead of letting individual workspaces infer geography
  ad hoc from labels, overlays, or view state. The current rule special-cases
  Middle East country codes into `EMEA`, treats `NA` and `SA` continent codes
  as the two Americas buckets, maps `EU` and `AF` to `EMEA`, maps remaining
  `AS` and `OC` to `APAC`, and then falls back to fixed longitude/latitude
  bands for coordinates-only records and weather points.
- Agent autonomy impact: agents can safely add or refine map filtering without
  inventing new geography buckets in each surface. The deterministic classifier
  owns the broad-region taxonomy and keeps asset markers, weather markers, and
  map-record summaries aligned.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts` and
  `cd apps/web && npm run test:smoke -- --grep "prompt home keeps the
simplified map visible while desk time cards collapse independently"`.
- Follow-up: if operators later want more precise commercial splits, extend the
  shared geography classifier and its tests together rather than adding
  workspace-specific exceptions.

### 2026-05-07 - Asset Map Activity Filters Use Shared Operational Buckets

- Type: algorithm-added
- Domain: prompt-first map UX and governed reference asset presentation
- Applies to: the Activity filter row on Prompt Home and the full Map
  workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: the shared map now exposes a stable activity filter with three
  operator-facing buckets: `Positions`, `Shipments`, and `Inventory`. The map
  does not yet receive direct activity-tagged asset metadata, so both Home and
  the full Map workspace rely on one deterministic classifier instead of
  inferring activity relevance ad hoc in each surface.
- Deterministic opportunity: keep future activity filtering anchored to the
  shared classifier until governed activity metadata exists on asset records.
  The current rule maps `UPSTREAM_PRODUCTION` and `REFINERY` to `Positions`
  plus `Inventory`; `PIPELINE` to `Positions` plus `Shipments`; `PROCESSING`
  and `STORAGE` to all three buckets; `TERMINAL/LNG` to all three buckets;
  `TERMINAL/PIPELINE` to `Positions` plus `Shipments`; remaining `TERMINAL`
  rows to `Shipments` plus `Inventory`; and `GENERATION`, `CONSUMPTION`, plus
  unmatched classes to `Positions`.
- Agent autonomy impact: agents can add or refine map filtering without
  inventing new activity semantics in Prompt Home, the Map workspace, or saved
  presets. The deterministic classifier owns the first-pass operational bucket
  mapping until the product introduces explicit activity metadata.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts
assetMapFilterPresets.test.ts` and `cd apps/web && npm run test:smoke -- --grep
"prompt home keeps the simplified map visible while desk time cards collapse
independently"`.
- Follow-up: if users want activity buckets driven by live positions,
  deliveries, or future inventory objects instead of asset-class heuristics,
  replace this classifier with governed activity metadata rather than layering
  workspace-specific overrides on top.

### 2026-05-07 - Gmail Inbox Intake Should Stage Attachments Through Document Ingestion

- Type: lesson
- Domain: document ingestion and external inbox integrations
- Applies to: Gmail inbox imports, email attachment intake, and future inbound
  mailbox automations
- Status: accepted
- Source:
  `apps/api/app/domains/integrations/services/gmail_inbox.py`,
  `apps/api/app/routes/documents.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: inbound mailbox integrations should not write business records
  directly. The first Gmail inbox slice reads Gmail in a bounded way, imports
  PDF attachments into `document_ingestion`, and lets the existing review,
  routing, action-plan, and approval seams govern any downstream mutations.
  Read-only inbox browsing can live in the product, but it should stay
  observational and reuse the same staged import seam when users decide a
  message needs operational follow-through.
- Deterministic opportunity: keep mailbox intake centered on typed runtime
  settings, explicit message-level dedupe receipts, and the existing document
  pipeline so future inbox sources reuse one governed import contract instead
  of inventing new email-specific write paths.
- Agent autonomy impact: agents can propose or trigger inbox imports when the
  runtime is configured, but durable operational changes still flow through the
  deterministic document workflow and its approval boundaries.
- Tests or evidence: run
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api -q`
  and `npm --prefix apps/web run test -- documentIngestionSelectors.test.ts`.
- Follow-up: if operators need auto-polling later, add a scheduler or admin
  control that calls the same import service and preserves the receipt-based
  dedupe contract.

### 2026-05-07 - Calendar Business-Day Logic Should Stay Data-Driven Through Rules And Overlays

- Type: algorithm-added
- Domain: reference data, settlement calendars, and deterministic date math
- Applies to: holiday calendars, payment-system calendars, exchange calendars,
  port calendars, and any future workflow that needs governed business-day
  calculations
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/calendar_business_days.py`,
  `apps/api/app/routes/reference_data_routes/calendars.py`,
  `apps/api/app/domains/admin/services/seed_reference_data.py`, and
  `apps/api/tests/test_calendar_seed_catalog.py`
- Lesson: business-day calculations should not be hidden in prompts or
  duplicated ad hoc across workflows. The calendar subsystem now evaluates
  business days deterministically from governed reference data: explicit holiday
  rows, reusable recurring rule rows, and overlay relationships that let one
  calendar inherit another without copying every holiday definition.
- Deterministic opportunity: keep future weekend profiles, observed-holiday
  rules, exchange early-close handling, and provisional announcement logic in
  the same typed calendar services rather than scattering date math across
  settlement, pricing, logistics, or assistant prompts.
- Agent autonomy impact: agents can read, explain, and seed calendar behavior,
  but durable holiday truth remains reference data owned by reviewed rows and
  services instead of freeform model output.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_calendar_seed_catalog`
- Follow-up: before using any newly seeded calendar for externally committed
  settlement or market timing, confirm the specific rule pack with the relevant
  operations or market owner and extend the data model when short-day or
  provisional logic becomes operationally material.

### 2026-05-08 - Settlement Due Dates Should Only Roll Through Explicit Calendar Instructions

- Type: algorithm-added
- Domain: settlement timing, invoice due dates, payment due dates, and
  reference calendars
- Applies to: settlement invoice issuance, settlement payment creation or
  updates, assistant-gated settlement actions, and bulk calendar exception
  stewardship
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/settlement_due_dates.py`,
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`,
  `apps/api/app/domains/reference_data/services/calendar_imports.py`, and
  `apps/api/tests/test_settlement_invoices_api.py`
- Lesson: settlement workflows should not guess a bank calendar from currency,
  counterparty, or geography. The deterministic path now rolls invoice and
  payment due dates to the next open business day only when a caller supplies
  an explicit `due_calendar_code`, which keeps the timing rule governed and
  auditable without introducing speculative market mappings.
- Deterministic opportunity: keep future settlement terms, cash cutoffs, and
  market-specific grace periods behind typed settlement timing helpers that
  consume governed calendar codes instead of encoding assumptions in prompts or
  route handlers.
- Agent autonomy impact: agents can pass an explicit settlement calendar when
  staging or executing governed invoice and payment actions, but they should
  not infer one on their own for production commitments without human-owned
  product rules.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_settlement_invoices_api apps.api.tests.test_settlement_payments_api`
- Follow-up: if domain owners want default settlement calendars by book,
  currency, or counterparty, add that mapping as reviewed reference data or a
  typed policy layer before enabling implicit due-date normalization.

### 2026-05-08 - Keep Rail Map Geometry In Spatial Features, Not On The Route Header

- Type: lesson
- Domain: rail reference data, map overlays, and shared workspace rendering
- Applies to: rail route visualization, future corridor overlays, and any
  reference entity that needs both business semantics and renderable geometry
- Status: implemented
- Source:
  `apps/api/app/domains/admin/services/seed_reference_data.py`,
  `apps/api/app/routes/reference_data_routes/spatial_features.py`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`, and
  `docs/engineering/rail-delivery-schema.md`
- Lesson: rail routes should remain the governed business record, while the map
  should render linked `reference_spatial_features` rows. This keeps route
  scheduling metadata and drawable geometry decoupled, lets the UI toggle rail
  corridors independently, and gives us a clean place to improve geometry
  fidelity later without turning route headers into GeoJSON blobs.
- Deterministic opportunity: when another reference entity needs a map
  footprint, prefer a typed entity link from `reference_spatial_features`
  rather than embedding presentation geometry onto the operational record
  itself.
- Agent autonomy impact: agents can seed or propose overlay geometry, but the
  durable pattern stays governed by typed reference rows and existing map
  services rather than ad hoc frontend-only shapes.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_admin_seed_api.AdminSeedApiTests.test_reference_seed_populates_master_data apps.api.tests.test_calendar_seed_catalog`
  and
  `./node_modules/.bin/vitest run tests/appBootstrapLoaders.test.ts tests/assetMapFilterPresets.test.ts tests/mapWorkspace.test.ts tests/referenceDataSpatialFeaturesTab.test.ts`
- Follow-up: if operations wants true track geometry, interchange branches, or
  embargo detours, add higher-fidelity spatial feature sources while keeping
  the route header as the business anchor.

### 2026-05-09 - External MCP Usage Should Reuse Request-Context Source Surface Tags

- Type: lesson
- Domain: ChatGPT MCP transport, audit logs, and verification workflow
- Applies to: `/mcp` transport work, MCP OAuth, external tool publication, and
  any future write-capable MCP bridge
- Status: implemented
- Source: `apps/api/app/core/request_context.py`,
  `apps/api/app/core/logging.py`,
  `apps/api/app/domains/mcp/services/server.py`, `apps/api/app/main.py`,
  `apps/api/tests/test_mcp_oauth.py`, and `Makefile`
- Lesson: external MCP traffic should not invent a parallel audit system just
  to become visible. The shared request context now carries a `source_surface`
  tag, normal HTTP requests default to `http`, mounted MCP requests default to
  `mcp.http`, and tool execution overrides that tag with the concrete MCP tool
  surface such as `mcp.search`. That keeps existing log enrichment, actor and
  session identity, and correlation ids useful for ChatGPT-originated traffic
  without duplicating provenance plumbing.
- Deterministic opportunity: when future MCP tools graduate from docs-only
  reads into governed business reads or approval-gated writes, preserve this
  one tagging vocabulary so request logs, mutation provenance, and audit-event
  source surfaces stay comparable across internal and external transports.
- Agent autonomy impact: agents can rely on the explicit MCP verification lane
  and source-surface logs to prove what external tool was called and under
  which ECTRM identity, but they should still route durable writes through the
  existing typed service and action-request seams.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_mcp_api apps.api.tests.test_mcp_oauth apps.api.tests.test_http_router_registry`
  and `make api-mcp-test`
- Follow-up: if the hosted MCP surface grows beyond docs retrieval, consider a
  first-class admin view over these tagged logs or a dedicated persisted audit
  ledger before broad rollout.

### 2026-05-09 - Surface Assistant Grounding As Structured Evidence, Not Raw Trace Blobs

- Type: lesson
- Domain: assistant transparency, app introspection, managed-agent hierarchy,
  and operator review
- Applies to: assistant chat, prompt preview, run traces, code/schema/app
  introspection tools, and managed-agent supervision
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/schemas/assistant.py`,
  `apps/web/src/workspaces/assistant/AssistantWorkspace.tsx`, and
  `apps/web/src/entities/assistant/AssistantToolCallList.tsx`
- Lesson: when the assistant inspects code, schema, app topology, or managed
  agent relationships, the user-facing surface should render structured
  evidence cards and prompt-section metadata instead of forcing operators to
  infer context from raw JSON traces. That keeps answers auditable, makes
  hierarchy and schema access visible inside chat, and turns repeated prompt
  transparency work into stable product behavior.
- Deterministic opportunity: keep future source-card generation attached to the
  typed tool contract so new introspection tools can publish reusable evidence
  without every frontend surface inventing one-off parsing logic.
- Agent autonomy impact: agents can inspect broad read-only platform context,
  but the UI must expose which governed surfaces they used so humans can verify
  app, schema, and hierarchy claims before acting on them.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_tooling`
  and
  `./node_modules/.bin/vitest run tests/assistantToolCallList.test.tsx tests/assistantPromptSectionList.test.tsx`
- Follow-up: if we expand broad data exploration beyond curated tools, keep the
  same evidence contract for row browsing and record-level citations so the
  assistant never gains opaque “trust me” visibility into governed data.

### 2026-05-09 - Carry Map Corridor Focus As Typed Workspace Handoff, Not Ad Hoc Search Text

- Type: lesson
- Domain: rail map workflow, cross-workspace navigation, and route-focused
  operational boards
- Applies to: map-to-workspace routing, reference-record focus, and any future
  corridor or region selection that should narrow an operational board
- Status: implemented
- Source:
  `apps/web/src/shared/appRouteHandoff.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/map/MapWorkspace.tsx`,
  `apps/web/src/workspaces/shipments/ShipmentWorkspace.tsx`,
  `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`, and
  `apps/web/src/entities/app/workspaceRendererRegistry.tsx`
- Lesson: when a user selects a governed rail corridor from the map, the next
  workspace should receive that selection as a typed handoff plus a
  deterministic lane filter, not as a best-effort text search. The map now
  opens Deliveries with a `reference_record` handoff for the selected
  `rail_route_code`, the Deliveries board applies an explicit
  `delivery.rail_route_code` filter before any local text filter, the
  Scheduling board applies the same typed route focus before saved views and
  mode lenses, the Scheduling board also exposes a governed native route
  picker for the same deterministic lane filter, and the same route selection
  can jump directly into the rail-route reference editor or launch Scheduling
  from that reference record.
- Deterministic opportunity: reuse this pattern for other governed map
  entities where the selected geometry should narrow an execution or review
  board by stable code rather than by fuzzy UI copy.
- Agent autonomy impact: agents can propose or wire map-driven operational
  routing when the target board has a stable typed key, but they should avoid
  shipping cross-workspace search hacks when a deterministic handoff contract
  is available.
- Tests or evidence:
  `./node_modules/.bin/vitest run tests/appRouteHandoff.test.ts tests/workspaceHandoffFocusBanner.test.ts tests/mapWorkspace.test.ts tests/shipmentsWorkspace.test.ts tests/schedulingWorkspaceRender.test.ts tests/referenceDataRailRoutesTab.test.ts`
- Follow-up: if operations, settlement, or future corridor-aware boards need
  the same lane focus, extend the same typed handoff contract instead of
  inventing workspace-specific search conventions, and prefer governed pickers
  when the workspace should support that focus without a map entrypoint.
