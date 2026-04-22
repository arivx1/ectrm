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

## Current Prompt Layers

When `/assistant/respond` is called, the API now assembles a server-owned prompt
envelope with these sections:

1. `System Mission`
2. `Organization Context`
3. `Authenticated User`
4. `Business Operating Model`
5. `Data Landscape`
6. `Live Data Inventory`
7. `World And Time`
8. `Managed Agent Profile` when an agent is selected
9. `Current Workspace` when provided
10. `Application Context` when provided

The rendered system prompt is then passed to the configured model provider.

When `use_live_tools` is enabled on `/assistant/respond`, the API can expose
read-only data tools to the model runtime. If the provider requests those
tools, the API executes them server-side and returns a tool-call trace so the
UI can show which live data lookups were actually used.

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
- Roadmap documents: 0

## Managed Prompt Profiles

Assistant agents are the first prompt-management surface.

- Public list: `GET /assistant/agents`
- Admin list: `GET /admin/assistant/agents`
- Admin create: `POST /admin/assistant/agents`
- Admin update: `PUT /admin/assistant/agents/{agent_id}`

Each agent carries:

- identity and description
- scope and allowed workspaces
- capability tags
- explicit `allowed_tools` governance for live read-only tool access
- optional provider and model defaults
- an agent-specific `system_prompt`

Agents layer on top of the global prompt foundation instead of replacing it.

When an agent is tagged with `READ`, the admin surface can now pin that agent
to a subset of the published live tools. This prevents newly added or
unreviewed tools from becoming available to every managed agent by default.

## Prompt Preview

Use `POST /assistant/context` to inspect the effective prompt before sending a
message to a model. The response includes:

- resolved provider and model
- the generated prompt sections
- the final rendered system prompt

This is the main debugging and prompt-review surface for now.

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

## Assistant Evals

Managed-agent changes should land with eval coverage, not just ad hoc prompt
spot checks. The backend now includes a fixture-style API eval harness in:

- `apps/api/tests/assistant_eval_harness.py`
- `apps/api/tests/test_assistant_evals.py`

The harness seeds realistic users, trades, and managed agents, runs
`/assistant/respond` through the real route stack, captures mocked provider
requests, and verifies:

- resolved agent, provider, and model metadata
- expected warnings
- expected live-tool traces and filtered tool catalogs
- approval-gated action-request staging
- persisted run traces and prompt sections

Run it with:

```bash
PYTHONPATH=/Users/anthonyrivich/Documents/GitHub/ectrm ./.venv/bin/python -m unittest \
  apps.api.tests.test_assistant_evals
```

## Configuration

The assistant foundation can be tuned through backend settings:

- `ASSISTANT_SYSTEM_PROMPT`
- `ASSISTANT_COMPANY_NAME`
- `ASSISTANT_COMPANY_CONTEXT`
- `ASSISTANT_BUSINESS_CONTEXT`
- `ASSISTANT_MAX_TOOL_ROUNDS`

These settings define the stable business framing. Managed agents refine that
for specific workflows without duplicating the whole platform description.
