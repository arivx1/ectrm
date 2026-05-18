# AI Workflow

## Purpose

The assistant should not rely on a single hidden prompt string. It should build
responses from a managed prompt foundation that combines:

- stable system behavior instructions
- company and operating-model context
- authenticated user context
- the platform's data taxonomy
- live application and workspace context
- optional managed agent instructions

This keeps prompts explainable, reviewable, and ready for future governance.

Related governance:

- [Agent Context And Configuration Work Packages](./agent-context-work-packages.md)
- [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Platform Phase 1 Tickets](./agent-platform-phase-1-tickets.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)

## Current Prompt Layers

When `/assistant/respond` is called, the API now assembles a server-owned prompt
envelope with these sections:

1. `System Mission`
2. `Organization Context`
3. `Authenticated User`
4. `Business Operating Model`
5. `Organization Glossary` when published definitions are active
6. `Organization Guardrails` when published definitions are active
7. `Data Landscape`
8. `Live Data Inventory`
9. `Application Access Surface`
10. `Desk Wiki Knowledge`
11. `World And Time`
12. `Managed Agent Profile` when an agent is selected
13. `Current Workspace` when provided
14. `Application Context` when provided

Organization and operating-model sections now prefer published organization
context definitions from the backend registry when they exist. Until those
records are populated, the assistant still falls back to the env-backed
bootstrap values and marks that fallback explicitly in prompt preview metadata.

Admin-managed organization context now has a first backend workflow:

- list or inspect definitions:
  `GET /admin/assistant/organization-context/definitions`
- create or update draft definitions:
  `POST` or `PUT /admin/assistant/organization-context/definitions/*`
- publish or retire definitions explicitly:
  `POST /admin/assistant/organization-context/definitions/{definition_id}/publish`
  and
  `POST /admin/assistant/organization-context/definitions/{definition_id}/retire`

Published definitions are immutable. To supersede a published organization
entry, create a new draft with the same `definition_key`, let the backend bump
the version, and publish the latest draft explicitly.

The rendered system prompt is then passed to the configured model provider.

When `use_live_tools` is enabled on `/assistant/respond`, the API can expose
read-only data tools to the model runtime. If the provider requests those
tools, the API executes them server-side and returns a tool-call trace so the
UI can show which live data lookups were actually used.

The published read-only tool catalog now covers more than business data. The
assistant can also inspect:

- application topology, route groups, workspaces, and documentation anchors
- database table, column, and relationship metadata
- managed-agent construction and hierarchy
- published repo code and docs under the app-owned source roots

Use these explicit tools instead of hiding platform knowledge in prompt prose
or expecting the model to remember stale code layout details.

Keep live-tool provenance explicit. When a tool answers with platform-loaded
market data, the response should cite the synced records and freshness state
already stored in ECTRM. When a tool answers with latest external headlines,
the response should identify that the headlines were fetched live at response
time instead of implying they are persisted platform records.

## Live Data Inventory Reference

The runtime `Live Data Inventory` prompt section is generated from database
counts in
`apps/api/app/domains/assistant/services/prompt_context.py`.

Treat the snapshot below as the maintained reference for the current database
shape. Update it whenever schema changes, seed data changes, or sync changes
alter the persisted inventory or expected record counts.

Reference and master data:

- Books: 6 active / 6 total
- Commodities: 41 active / 41 total
- Counterparties: 16 active / 16 total
- Portfolios: 7 active / 7 total
- Price indices: 8 active / 8 total
- Currencies: 4 active / 4 total
- Units: 6 active / 6 total
- Locations: 14 active / 14 total

Transactional and projection data:

- Events: 8
- Trades: 6 total / 5 active / 1 cancelled
- Positions: 4

External and world data:

- Price observations: 17649
- External data runs: 10
- Weather locations: 6
- Weather observations: 511
- Weather forecast periods: 2032

Governance and knowledge data:

- Users: 3 active / 3 total
- Trading sources: 48
- Wiki pages: active pages are included as read-only assistant grounding when
  present. `/assistant/respond` ranks active wiki pages against the latest user
  message and request context before injecting excerpts, page IDs, and link
  metadata. Prompt preview falls back to recent active pages when no request
  text is available.
- Roadmap documents: 0

## Managed Prompt Profiles

Assistant agents are the first prompt-management surface.

- Public list: `GET /assistant/agents`
- Admin list: `GET /admin/assistant/agents`
- Admin create: `POST /admin/assistant/agents`
- Admin update: `PUT /admin/assistant/agents/{agent_id}`
- Admin unsaved draft preview:
  `POST /admin/assistant/agents/{agent_id}/context-preview`

Each agent carries:

- identity and description
- role mapping, specialization summary, and explicit skills
- scope and allowed workspaces
- capability tags and authority ceiling
- explicit `allowed_tools` governance for live read and inter-agent
  coordination access
- explicit `allowed_action_types` governance for typed business mutations
- optional hierarchy metadata such as `orchestration_pattern`,
  `parent_agent_id`, `managed_agent_ids`, and `delegation_guidance`
- optional provider and model defaults
- an agent-specific `system_prompt`

Agents layer on top of the global prompt foundation instead of replacing it.

When an agent is tagged with `READ`, the admin surface can now pin that agent
to a subset of the published live tools. This prevents newly added or
unreviewed tools from becoming available to every managed agent by default.

Some read-only introspection tools are always added for `READ` agents even when
the admin-selected tool subset is narrow. This keeps core explainability
surfaces consistently available for app topology, schema, code, and
managed-agent roster questions without forcing every role definition to repeat
them manually.

When an agent includes the `inter_agent_consultation` skill and the matching
tool policy, it can coordinate other managed agents through two explicit
runtime tools:

- `consult_managed_agent` for advisory-only specialist help
- `enlist_managed_agent` for bounded delegated execution that still stays
  inside the enlisted agent's own tools, action types, authority ceiling, and
  typed action-request or autonomous-execution lanes

This makes the build recipe explainable to users: a managed agent is assembled
from role, skills, capabilities, workspaces, live tools, governed action
types, hierarchy metadata, and system prompt instead of a single hidden prompt
string.

## Prompt Preview

Use `POST /assistant/context` to inspect the effective prompt before sending a
message to a model. The response includes:

- resolved provider and model
- the generated prompt sections
- section metadata such as source ownership, contract version, owner reference,
  and fallback usage
- the final rendered system prompt

This is the main debugging and prompt-review surface for now.

Admin agent edits can also be previewed before save through
`POST /admin/assistant/agents/{agent_id}/context-preview`. That endpoint accepts
the same proposed update payload as the save route, runs the agent hierarchy,
profile-policy, and activation validation path without persisting, and returns
the server-built prompt context for the unsaved draft.

Note that prompt preview shows the stable server-built foundation. Tool calls
only happen during `/assistant/respond`, because they depend on the user's
latest message and the model's runtime decisions. `/assistant/context` does
not execute tools or inject tool results into the rendered prompt.

## Run Tracing

Each `/assistant/respond` call now records an `assistant_run` audit row with:

- authenticated user and session metadata
- resolved agent, provider, model, and workspace
- prompt sections and the final rendered system prompt
- warnings, tool-call traces, and token usage
- the latest user message, assistant response, and any provider error detail

The API returns `run_id` on successful responses, exposes current-user run
lookup on `/assistant/runs/*`, and exposes recent admin run listings on
`/admin/assistant/runs`.

## Run Feedback

Assistant answers can receive user feedback directly from the response surface.
The feedback is stored as an `assistant_run_feedback` record tied to the run,
conversation, user, session, rating, optional comment, and timestamps. Use
`POST /assistant/runs/{run_id}/feedback` to create or update the current user's
feedback for a run.

Feedback is an outcome signal for review, tuning, and future evaluation work.
It should not directly mutate business records or silently alter deterministic
services. Recurring comments that point to stable product behavior should be
promoted through the deterministic algorithm loop.

Admin outcome metrics include feedback totals, helpful vs. needs-work rates,
workspace-level feedback rows, and recent run feedback notes so reviewers can
spot agent or workspace patterns without turning comments into automatic
authority changes.

## Assistant Evals

Managed-agent changes should land with eval coverage, not just ad hoc prompt
spot checks. The backend now includes a fixture-style API eval harness in:

- `apps/api/tests/assistant_eval_harness.py`
- `apps/api/tests/test_assistant_evals.py`

The harness seeds realistic users, trades, and managed agents, runs
`/assistant/respond` through the real route stack, captures mocked provider
requests, and verifies:

- default-provider fallback when the preferred default is unavailable
- resolved agent, provider, and model metadata
- expected warnings
- expected live-tool traces and filtered tool catalogs
- context-only fallback when live tools are unavailable on the current worker
- approval-gated action-request staging
- approval execution outcomes and cross-user permission boundaries
- persisted run traces and prompt sections

Run it with:

```bash
make api-assistant-evals
```

`make verify` and the GitHub `Backend` workflow now run this eval lane before
the broader backend suite, so assistant regressions fail under an explicit
named gate instead of only appearing inside general test discovery.

### Eval Entry Rule

Add or update an assistant eval whenever a change affects any of these:

- provider or model selection behavior, including fallback semantics
- tool allowlists, tool-round limits, or live-read availability handling
- approval-gated action requests or action-governance prompt behavior
- assistant approval access control, especially cross-user review boundaries
- prompt section composition, managed-agent instructions, or explainability
  warnings
- automation or assistant behavior that could over-claim certainty without a
  live read

At minimum:

- run `make api-assistant-evals` locally for assistant or automation changes
- add a new fixture case or update an existing one when behavior changes
- note the eval case added, updated, or intentionally not needed in the change
  notes or PR description

For prompt-first UX work, pair this lane with the matching web lane from
[Local Development](./local-development.md): use `make web-test` for prompt
parsing or component behavior, and `make web-smoke-test` for landing, auth
resume, prompt submission, or workspace handoff flows.

## Agent Self-Update Drafts

Agents can now turn recent mistakes into a reviewable self-update draft from
the admin surface through:

- `POST /admin/assistant/agents/{agent_id}/self-update-draft`
- `GET /admin/assistant/agents/{agent_id}/revisions`
- `POST /admin/assistant/agents/{agent_id}/revisions/{revision_id}/publish`

This is a supervised learning loop, not silent self-modification. The server
builds the draft from current agent configuration plus:

- recent `NEEDS_WORK` feedback comments
- latest failing eval cases
- autonomy-review recommendation reasons
- matched knowledge-base lessons and stop conditions

The generated draft is intentionally constrained and now lands as an
unpublished stored revision:

- it preserves identity and governance metadata such as `agent_id`, provider,
  model, scope, role mapping, owner role, authority ceiling, and token budget
- it may preserve or narrow allowed workspaces, capabilities, live tools, and
  governed action types
- it may not widen authority from observed mistakes
- it does not mutate the live agent until an admin explicitly publishes the
  stored revision

Admins can review the returned draft evidence, inspect the field-level diff
against the published snapshot, load the revision into the editor if they want
to refine it further, and then publish it explicitly. If the learning signal
points to durable product behavior instead of a prompt boundary, prefer the
deterministic algorithm loop and knowledge-base update instead of relying on
prompt-only correction.

## Codex Task Dispatch

The admin workspace can now record and dispatch Codex engineering tasks through
a configured GitHub Actions workflow. This is separate from `/assistant/respond`:
it starts repository work, not ECTRM business-record mutations.

Admin API:

- `GET /admin/codex/settings`
- `GET /admin/codex/tasks`
- `POST /admin/codex/tasks`

Backend configuration:

- `CODEX_TASKS_ENABLED`
- `CODEX_GITHUB_REPOSITORY`
- `CODEX_GITHUB_WORKFLOW_ID`
- `CODEX_GITHUB_REF`
- `CODEX_GITHUB_PROMPT_INPUT`
- `CODEX_GITHUB_TOKEN`
- `CODEX_REQUEST_TIMEOUT_SECONDS`
- `CODEX_CALLBACK_BASE_URL`
- `CODEX_CALLBACK_TOKEN`
- `CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS`
- `CODEX_LONG_RUNNING_MAX_ITERATIONS`

The dispatcher stores a `codex_task_requests` row before calling GitHub. A
successful workflow dispatch marks the task `DISPATCHED`; provider or ref
errors mark it `FAILED` so the attempt remains visible to admins.

The checked-in `.github/workflows/codex.yml` workflow accepts `prompt`,
`task_id`, `callback_url`, `run_mode`, and `max_iterations` workflow-dispatch
inputs. It runs Codex, opens a draft pull request when repository files change,
uploads the raw Codex output as a workflow artifact, and posts execution updates
back to `POST /codex/tasks/{task_id}/callback`.

GitHub must provide these secrets:

- `OPENAI_API_KEY`: used by Codex CLI inside the workflow.
- `ECTRM_CODEX_CALLBACK_TOKEN`: must match the API's `CODEX_CALLBACK_TOKEN`.

Use `make api-codex-smoke` before a live dispatch. The smoke script checks the
local workflow contract, reports missing live GitHub/API prerequisites, creates
a local long-running task through the admin route, posts running and completed
callbacks, and verifies that an invalid callback token is rejected. It does not
dispatch a GitHub workflow; a live run still requires the workflow to exist on
GitHub and the secrets above to be configured.

Callback statuses update the same task record through the token-authenticated
non-admin callback route. `RUNNING` records workflow/branch metadata;
`COMPLETED`, `STOPPED`, or `FAILED` records terminal summary, stop reason,
artifact, workflow run, and pull request links when available.

Codex tasks support two run modes:

- `SINGLE_TASK`: Codex should complete only the requested task and may list
  follow-up recommendations without executing them.
- `LONG_RUNNING`: Codex should complete the requested task, ask "What is the
  next recommended task?", execute only concrete repository-local
  recommendations that stay inside the original request, and continue until no
  recommendation remains or the configured iteration cap is reached.

Long-running mode is still reviewable engineering automation, not autonomous
business execution. Stop conditions are part of the dispatched prompt: stop
when the next task needs human judgment, protected business authority,
production data mutation, external commitments, or failed verification before
more work can safely continue.

Keep this surface admin-owned. Codex task prompts may ask a coding agent to
modify the repository, so credentials stay server-side and the result should
land as reviewable repository work such as a branch, pull request, or workflow
artifact.

## Configuration

The assistant foundation can be tuned through backend settings:

- `ASSISTANT_SYSTEM_PROMPT`
- `ASSISTANT_COMPANY_NAME`
- `ASSISTANT_COMPANY_CONTEXT`
- `ASSISTANT_BUSINESS_CONTEXT`
- `ASSISTANT_MAX_TOOL_ROUNDS`

These settings define the stable business framing. Managed agents refine that
for specific workflows without duplicating the whole platform description.
