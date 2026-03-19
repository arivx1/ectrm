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
latest message and the model's runtime decisions.

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

## Configuration

The assistant foundation can be tuned through backend settings:

- `ASSISTANT_SYSTEM_PROMPT`
- `ASSISTANT_COMPANY_NAME`
- `ASSISTANT_COMPANY_CONTEXT`
- `ASSISTANT_BUSINESS_CONTEXT`
- `ASSISTANT_MAX_TOOL_ROUNDS`

These settings define the stable business framing. Managed agents refine that
for specific workflows without duplicating the whole platform description.
