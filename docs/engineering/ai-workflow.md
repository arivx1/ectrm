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
- optional provider and model defaults
- an agent-specific `system_prompt`

Agents layer on top of the global prompt foundation instead of replacing it.

## Prompt Preview

Use `POST /assistant/context` to inspect the effective prompt before sending a
message to a model. The response includes:

- resolved provider and model
- the generated prompt sections
- the final rendered system prompt

This is the main debugging and prompt-review surface for now.

## Configuration

The assistant foundation can be tuned through backend settings:

- `ASSISTANT_SYSTEM_PROMPT`
- `ASSISTANT_COMPANY_NAME`
- `ASSISTANT_COMPANY_CONTEXT`
- `ASSISTANT_BUSINESS_CONTEXT`

These settings define the stable business framing. Managed agents refine that
for specific workflows without duplicating the whole platform description.
