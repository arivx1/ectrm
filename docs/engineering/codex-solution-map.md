# Codex Top-Down Solution Map

## Purpose

This is a context-efficient helper for Codex and other coding agents working in
ECTRM. Use it to get oriented before opening a large stack of implementation
docs.

This file is a routing map, not a replacement for source code, tests, ADRs, or
governance docs. When this helper conflicts with a narrower source document or
the current code, trust the narrower source and update this helper if the drift
matters.

## Fast Load Order

1. Read [AGENTS.md](../../AGENTS.md).
2. Read this helper.
3. Open only the deeper docs that match the task.
4. Inspect the owning code and focused tests before editing.

For assistant, agent, automation, action-request, policy, or deterministic
algorithm work, still read the agent governance docs listed in
[AGENTS.md](../../AGENTS.md). This helper only helps choose where to go next.

## One-Screen Summary

ECTRM is a modular-monolith commodity trading and risk prototype:

- `apps/api` is the system of record. It owns authenticated routes, typed
  application services, events, projections, reference data, assistant
  governance, admin controls, and integrations.
- `apps/web` is the operator console. It is organized around workspaces,
  reusable entities, workflow features, shared models, and shell state.
- `docs` defines the operating model, architecture direction, autonomy
  boundaries, and work-package sequencing.
- `specs` holds focused implementation notes.
- `packages` is reserved for future shared code.

The durable product spine is:

```text
capture -> validation/policy -> event or typed record -> projection/read model
  -> workflow/settlement/risk impact -> audit/explanation
```

The current strategic posture is governed core first. The repo has many
surfaces, but new work should strengthen the typed trade, reference-data,
policy, projection, settlement, workflow, audit, and assistant-governance spine
instead of adding unrelated breadth.

## Non-Negotiable Invariants

- Deterministic services, formulas, and policies own durable business truth.
- Freeform model output must not directly mutate business records.
- Business writes go through typed application services, policy checks,
  permission checks, stale-state checks, idempotency where needed, and audit.
- Agents may read, explain, draft, triage, and stage reviewable actions unless
  the authority rubric and typed action contract prove a narrower execution
  lane is safe.
- `admin`, `reports`, `assistant`, `mcp`, and `codex` are surfaces. They should
  not be the only home for business rules.
- Manual fallback, provenance, reviewer visibility, and rollback or correction
  paths must remain available.
- Repeated accepted judgment should graduate out of prompts into deterministic
  product logic and be recorded in the knowledge base.

## Top-Down Architecture

### Backend Runtime

Primary entry points:

- [apps/api/app/main.py](../../apps/api/app/main.py): FastAPI app, CORS,
  request correlation, session auth middleware, protected route rules, public
  runtime settings, error handling, and MCP mounting.
- [apps/api/app/domains/http.py](../../apps/api/app/domains/http.py): central
  HTTP route registration map.
- [apps/api/app/db](../../apps/api/app/db): SQLAlchemy engine and sessions.
- [apps/api/app/models](../../apps/api/app/models): SQLAlchemy record shapes.
- [apps/api/alembic/versions](../../apps/api/alembic/versions): schema
  migration history.
- [apps/api/app/schemas](../../apps/api/app/schemas): API payload schemas.
- [apps/api/scripts](../../apps/api/scripts): projection rebuilds, syncs,
  smoke checks, exports, and eval runners.

The backend is mid-migration from route-first prototype modules toward
domain-first packages. New business logic should normally live under
`apps/api/app/domains/*/services`, with routes acting as adapters.

### Backend Domain Map

| Area | Current home | What it should own |
| --- | --- | --- |
| Trade lifecycle | `domains/trading`, `routes/events.py`, `routes/trades.py` | Trade commands, lifecycle validation, event append semantics, trade projection application, stale-state checks. |
| Reference data | `domains/reference_data`, `routes/reference_data.py`, `routes/reference_data_routes` | Master data validity, active/inactive eligibility, standards, dependency-safe changes, seed/import helpers. |
| Risk | `domains/risk`, `routes/positions.py`, `routes/option_exposures.py` | Exposure views, option exposure logic, risk-oriented projections and exceptions. |
| Operations | `domains/operations` | Confirmations, deliveries, shipments, workflow items, actualization, operational resources, tracking. |
| Settlement and accruals | `domains/settlement`, `domains/accruals`, settlement-adjacent operations services | Invoice/payment state, settlement posture, accrual lots and entries, settlement exceptions. |
| Documents | `domains/documents`, `routes/documents.py` | Ingestion, classification, extraction review, deterministic facets, linkage, document action planning. |
| Reports | `domains/reports` | Aggregation, report definitions, presets, exports, and summaries over governed domain outputs. |
| Home view instances | `domains/home_views`, `routes/home_view_definitions.py` | System Home template metadata, personal and shared Home definitions, card registry and card configuration value validation, shared lifecycle/admin inventory, scope/audit fields, and reset behavior. Not live business data truth. |
| Assistant and AI gateway | `domains/assistant`, `routes/assistant.py` | Prompt assembly, live tools, managed agents, run traces, evals, action planning, action governance. |
| MCP | `domains/mcp` | External read transport and identity bridge. Future writes must map to typed services or action requests. |
| Codex | `domains/codex`, `routes/codex.py` | Admin-owned engineering task dispatch, task state, callbacks, and smoke checks. Not business-record truth. |
| Admin | `domains/admin`, admin routes | Supervision, seed jobs, provenance, external sync visibility, projection monitoring, configuration surfaces. |
| Weather and market data | `domains/weather`, external-data routes, integration services | Weather intelligence, external sync status, observations, source freshness, market-data ingestion. |
| Wiki and docs | `domains/wiki`, docs workspace | Managed internal knowledge pages and checked-in documentation surfaces. |

### Frontend Runtime

Primary entry points:

- [apps/web/src/App.tsx](../../apps/web/src/App.tsx): shell composition,
  top-level route and state orchestration.
- [apps/web/src/entities/app/workspaceRendererRegistry.tsx](../../apps/web/src/entities/app/workspaceRendererRegistry.tsx):
  workspace descriptors, lazy renderers, data groups, mutation refresh plans,
  and window notices.
- [apps/web/src/entities/app/useAppWorkspaceBootstrap.ts](../../apps/web/src/entities/app/useAppWorkspaceBootstrap.ts):
  authenticated bootstrap loading, workspace data groups, collection windows,
  auth interruption, and refresh orchestration.
- [apps/web/src/entities/app/api.ts](../../apps/web/src/entities/app/api.ts):
  workspace bootstrap and app-level API adapters.
- [apps/web/src/shared/models.ts](../../apps/web/src/shared/models.ts):
  shared frontend record types and workspace keys.

Frontend layering:

- `workspaces`: top-level product areas such as Home, Live Desk, Pre-Trade,
  Trade Capture, Activity Feed, Exposure, Net Positions, Deliveries,
  Scheduling, Work Queue, Settlement, Messages, Reports, Library, Map,
  Reference Data, Admin Console, Settings, and Assistant Console.
- `entities`: API adapters, shared business-object types, and reusable
  presentation helpers.
- `features`: workflow-specific UI logic that composes entities, widgets, and
  shared infrastructure.
- `shared`: cross-cutting models, formatting, config, auth, mutation, routing,
  and UI primitives.
- `widgets`: reusable product widgets.

## Request Flow Maps

### Workspace Read Flow

```text
App shell
  -> workspace descriptor data groups
  -> useAppWorkspaceBootstrap
  -> entities/app/api.ts
  -> FastAPI route
  -> domain/query service
  -> SQLAlchemy model or projection
```

If a workspace shows stale or missing data, start with the descriptor data
groups and bootstrap loader before changing the route.

### Trade Write Flow

```text
Trade workspace form
  -> useAppTradeActions
  -> entities/trade/api.ts
  -> /events compatibility route
  -> build_trade_write_command_from_event
  -> append_trade_write_command
  -> append_domain_event
  -> apply_trade_event
  -> trade/position/option projection refresh
  -> mutation provenance
```

The target direction is command-owned writes: commands are the public intent,
events are the durable business record. See
[Governed Core Trade Command Model](./core-platform-trade-command-model.md).

### Assistant Response Flow

```text
/assistant/respond
  -> prompt_context builds server-owned sections
  -> managed-agent profile and tool policy resolve
  -> optional read-only live tool rounds run server-side
  -> action_runtime may plan typed action requests
  -> provider response plus traces, run audit, feedback hooks
```

Action proposals must use the governed action request contract. They may not
use chat text as a hidden mutation path.

### Action Request Flow

```text
assistant action planner
  -> action spec and policy check
  -> payload with review_context
  -> persisted assistant_action_request
  -> human review or execute-capable governed runtime
  -> typed action handler
  -> owning domain service
  -> result, policy evidence, stale-state evidence, audit
```

Before adding or widening an action type, read
[Agent Action Request Contract](./agent-action-request-contract.md),
[Human-Agent Authority Matrix](./human-agent-authority-matrix.md), and
[Agent Autonomy Rubric](./agent-autonomy-rubric.md).

### Document Ingestion Flow

```text
/documents upload or reprocess
  -> uploaded-file storage, page records, and logical-document page ranges
  -> deterministic classification/facet scoring
  -> threshold-gated AI processor for low-confidence pages using system config
     or the Library session override
  -> packet split provenance and logical-document review serialization
  -> routing/linkage/action planning at the logical-document boundary
  -> optional governed action request
```

Document AI output can help extract or normalize, but deterministic scoring,
packet boundaries, review state, linkage, and business-record mutations must
remain explicit and testable.

### Codex Task Flow

```text
Admin Codex panel
  -> /admin/codex/tasks
  -> codex_task_requests row
  -> configured GitHub Actions workflow
  -> Codex runs repository work
  -> callback to /codex/tasks/{task_id}/callback
  -> task status, branch, PR, artifact, summary, stop reason
```

Codex task dispatch is admin-owned engineering automation. It should land as
reviewable repository artifacts and must stop for protected business authority,
production data mutation, external commitments, or verification failures that
need human review.

## Top-Down Review Snapshot

Strong current anchors:

- Event-led trade history and projection rebuild patterns already exist.
- Route registration is centralized enough to inspect the API surface quickly.
- Domain packages exist for the main product areas, even though legacy route
  modules still coexist during migration.
- Assistant governance is unusually explicit: prompt preview, run tracing,
  managed agents, action contracts, evals, outcome metrics, and a knowledge
  base are all present.
- Verification lanes are named by risk area: contract, MCP, assistant evals,
  document classification evals, backend tests, web tests, and browser smoke.

Current risks to keep in view:

- The product surface is broad relative to the maturity of the governed core.
- `admin`, `reports`, and `assistant` are useful surfaces, but business rules
  can drift there if reviewers are not careful.
- Trade writes still have a compatibility event-shaped route while the command
  model hardens.
- Some work objects are emerging or derived rather than fully first-class.
- Context docs are numerous. Use this helper to route, then inspect only the
  docs and code needed for the change.

## Where To Work

| Change type | Start here | Usual verification |
| --- | --- | --- |
| Backend route registration | `apps/api/app/domains/http.py`, owning route module | Focused API tests, `make api-test` when broad. |
| New business mutation | Owning `domains/*/services`, typed schemas, action contract if assistant-driven | Focused API tests, action governance tests, provenance/stale-state checks. |
| Trade lifecycle write | `domains/trading/services/trade_commands.py`, `event_writes.py`, `trade_event_application.py` | Trade command/projection tests, `make api-contract-check` if metadata changes. |
| Trade metadata contract | `domains/trading/services/trade_metadata.py`, `apps/api/contracts` | `make api-contract-check`; refresh only with `make api-contract-refresh` when intentional. |
| Reference data | `domains/reference_data`, `routes/reference_data_routes`, `features/reference-data` | `apps/api/tests/test_reference_data.py`, focused web tests if UI changes. |
| Web workspace behavior | `workspaceRendererRegistry.tsx`, `useAppWorkspaceBootstrap.ts`, owning workspace | `make web-test`, `make web-lint`, browser smoke for high-visibility flows. |
| Home view instances | `domains/home_views`, `routes/home_view_definitions.py`, Prompt Home workspace | `apps.api.tests.test_home_view_definitions_api`; focused web tests when Prompt Home rendering changes. |
| Assistant prompt context | `domains/assistant/services/prompt_context.py`, managed-agent services | `make api-assistant-evals`, focused assistant API tests. |
| Assistant action type | `action_specs.py`, `action_planners.py`, `action_handlers.py`, `action_runtime.py`, docs | Action request tests plus `make api-assistant-evals`. |
| Managed agent config/governance | `agent_admin.py`, `policies.py`, `eval_gates.py`, admin UI | Assistant evals and focused admin API/web tests. |
| Document classification or facets | `domains/documents/services/document_classification_scoring.py`, `document_facets.py`, fixtures | `make api-document-classification-evals`, focused document tests. |
| Document action planning | `document_action_planning.py`, approval/execution/governance services | Document action tests and assistant/action eval coverage when relevant. |
| Operations/delivery workflow | `domains/operations`, shipment/delivery workspaces | Focused operations/delivery API tests and web tests. |
| Settlement or accrual state | `domains/settlement`, `domains/accruals`, settlement workspace | Settlement/accrual API tests; ensure immutable correction patterns. |
| Reports | `domains/reports`, reports workspace | Report API tests; verify rules come from governed services where applicable. |
| MCP surface | `domains/mcp`, `apps/api/app/main.py`, MCP docs | `make api-mcp-test`. |
| Codex task dispatch | `domains/codex/services/tasks.py`, `routes/codex.py`, Admin Codex panel | `make api-codex-smoke` plus focused API tests. |
| Docs-only change | Owning doc plus inbound links | Check links, headings, and references with `rg`. |

## Stop Signs

Pause, narrow scope, or keep the work as a proposal when:

- the change affects pricing, risk, settlement, credit, compliance,
  permissions, policy, reference data, or external commitments and no human
  domain owner has approved the rule
- the proposed logic would make `admin`, `reports`, `assistant`, or frontend UI
  the only place a business rule exists
- model output would directly create, update, delete, approve, or externally
  commit a business record
- the owning work object is unclear
- stale-state basis, idempotency, reviewer role, or correction path is missing
  for a staged action
- the action would bind a counterparty, send bank/payment instructions, or
  otherwise externally commit the firm
- a repeated judgment appears in prompts or reviewer comments and should be
  promoted into deterministic product logic

## Verification Matrix

Use the narrowest check that proves the change:

| Area touched | Preferred check |
| --- | --- |
| Assistant or automation behavior | `make api-assistant-evals` |
| MCP transport or auth | `make api-mcp-test` |
| Document classification/scoring | `make api-document-classification-evals` |
| Codex dispatch plumbing | `make api-codex-smoke` |
| Backend service or route behavior | focused `unittest`, then `make api-test` for broader risk |
| Trade metadata contract | `make api-contract-check` |
| Frontend component/workspace behavior | focused `npm --prefix apps/web run test`, then `make web-test` |
| Frontend type/build/lint risk | `make web-build` and `make web-lint` |
| End-to-end high-trust browser flow | `make web-smoke-test` |
| Docs only | inspect links and references with `rg` |

If you cannot run the relevant verification, say that in the final response.

## Open Next By Task

For general architecture:

- [Platform Blueprint](./platform-blueprint.md)
- [ADR 0002](../adr/0002-v2-application-architecture.md)
- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)

For trade lifecycle and the governed core:

- [Governed Core Trade Command Model](./core-platform-trade-command-model.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)

For assistant, agents, automation, and actions:

- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Agent Role Catalog](./agent-role-catalog.md)

For work objects and queue-led design:

- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)

For external AI access:

- [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md)

For Codex engineering automation:

- [AI Workflow: Codex Task Dispatch](./ai-workflow.md#codex-task-dispatch)
- [Execution Node Platform Work Packages](./execution-node-platform-work-packages.md)
- [ADR 0004](../adr/0004-control-plane-and-execution-nodes.md)

For local commands and verification:

- [Local Development Workflow](./local-development.md)
- [API README](../../apps/api/README.md)
- [Web README](../../apps/web/README.md)

## Maintenance Rule

Review this helper on every Codex run. At the end of the run, decide whether
the work changed the system map or exposed drift in the map. Update this helper
when any of these change:

- the backend route registry gains or loses a major surface
- the frontend workspace list or data-group model changes materially
- a new domain package becomes the owner of durable business truth
- assistant action governance, Codex dispatch, or MCP authority changes
- a repeated Codex navigation mistake shows this map is misleading

Do not edit this file just to record that it was reviewed. Keep updates short.
This file should remain a fast orientation surface.
