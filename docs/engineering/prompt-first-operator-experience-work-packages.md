# Prompt-First Operator Experience Work Packages

## Goal

Make the prompt the first operating surface for ECTRM while preserving every
existing workspace, report, form, and manual path as durable destinations.

The target experience is:

- users start by describing the job they came to do
- the assistant can answer, clarify, summarize, and route the user
- old-school workspaces remain available from navigation, direct URLs, and
  assistant handoffs
- business writes continue to flow through typed services, permissions,
  approval requests, audit, and deterministic policy

This is a product experience shift, not a replacement of the existing console.

## Primary Design Inputs

- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- The app currently defaults to the dashboard route when no view is provided.
- The Start Here overlay is task-card driven and routes to existing
  workspaces.
- The Assistant workspace already has provider selection, managed agents,
  live tools, run traces, conversations, feedback, and approval-gated action
  requests.
- Assistant live tools can read trades, events, positions, reference data,
  workflow items, confirmations, settlement records, deliveries, documents,
  market context, and workspace summaries.
- The route layer already supports view navigation, selected trade state, and
  limited handoff metadata.
- The governance docs are clear that freeform model output must not directly
  mutate business records.

## Experience Principles

1. Prompt first, screens still canonical.
   The prompt is the front door. The workspaces remain the place where humans
   inspect, approve, correct, and complete operational work.

2. Navigation is not business execution.
   Assistant-driven route changes, workspace focus, filters, and suggested
   next steps are low-risk UI intents. Trade events, workflow changes,
   invoices, payments, reference-data edits, and external commitments must
   continue through governed action paths.

3. Keep manual fallback obvious.
   The side navigation, direct URLs, reports, and forms stay available. A user
   should never need the model to complete standard work.

4. Make handoffs inspectable.
   When the assistant opens a workspace, the destination should show why it was
   opened, what context was carried, and how to widen back to the full view.

5. Treat repeated routing judgment as product behavior.
   If users repeatedly ask the assistant to choose the same workspace for a
   stable intent, encode that as deterministic intent routing rather than
   hiding it in prompt wording.

## Delivery Order

### Wave 0: Define And Prove The Front Door

1. PFO-01 Prompt Home MVP
2. PFO-02 Navigation Intent Contract
3. PFO-03 Assistant Workspace Split

### Wave 1: Make Handoffs Useful

4. PFO-04 Workspace Handoff Expansion
5. PFO-05 Prompt-to-Old-UX Destination Polish
6. PFO-06 Signed-Out And Session-Resume Prompt Flow

### Wave 2: Govern Prompt-Led Work

7. PFO-07 Prompt-Led Action Review Experience
8. PFO-08 Intent Routing Evals And Browser Smoke
9. PFO-09 Prompt Outcome And Feedback Loop

## Shared Definition Of Done

Each work package is done only when:

- existing workspace navigation and direct URLs still work
- new prompt-led behavior has manual fallback
- navigation or focus intents cannot mutate business records
- business writes still use typed services, action requests, permissions,
  stale-state checks, audit, and approval where required
- prompt, route, and action behavior is covered by focused tests, assistant
  evals, or browser smoke checks appropriate to the risk
- docs are updated when the operating model or user workflow changes

## PFO-01: Prompt Home MVP

### Priority

P0

### Outcome

The default signed-in landing experience is a prompt-first operator home, not
the dashboard or a task-card overlay.

### Why this matters

The product should feel like users can start from intent: "What needs my
attention?", "Book this trade", "Why is this invoice overdue?", or "Show me
the work queue." The old workspaces should become destinations the prompt can
open when they are the right tool for the job.

### Scope

- add a prompt-first landing surface for authenticated users
- preserve the dashboard, reports, forms, and workspace navigation
- make the prompt composer the primary visual focus
- show a compact set of recent or suggested jobs without turning the surface
  into another dashboard
- include safe quick actions that submit prompts or open existing workspaces
- keep provider and agent configuration out of the first-time operator path
  unless the runtime is unavailable

### Out of scope

- removing the dashboard
- removing the existing Assistant workspace
- adding new business mutation authority
- replacing admin prompt-management controls

### Suggested owner profile

Frontend engineer with enough assistant context to reuse the existing
conversation and runtime APIs without weakening governance.

### Dependencies

- current Assistant workspace runtime APIs
- current route state and workspace registry

### Acceptance criteria

- signed-in users without an explicit route land on the prompt-first surface
- direct links to every old workspace still open that workspace
- the user can reach the dashboard and all existing workspaces from the nav
- prompt submission creates normal assistant runs with run tracing
- runtime-unavailable states route clearly to settings or prompt management

## PFO-02: Navigation Intent Contract

### Priority

P0

### Outcome

The app has a typed client-side contract for assistant-suggested navigation,
workspace focus, and filters.

### Why this matters

Prompt-led UX needs the assistant to say "open this workspace with this focus"
without confusing that with business execution. A typed navigation contract
keeps UI movement safe, testable, and auditable enough for the product layer.

### Scope

- define a `navigation_intent` shape for non-mutating UI actions
- support target workspace, optional focused object, optional filter text,
  optional inspector tab, rationale, and source run ID
- distinguish navigation intents from assistant action requests
- render navigation intent chips or buttons in assistant responses
- apply accepted navigation intents through the existing route layer
- reject unsupported workspaces or invalid focus targets deterministically

### Out of scope

- model-generated direct calls to `window.location`
- business mutations
- changing action-request approval semantics

### Suggested owner profile

Frontend engineer with TypeScript routing ownership, paired with a backend or
assistant engineer if the intent should be returned from the API.

### Dependencies

- PFO-01 for where the intents appear first
- existing route state helpers

### Acceptance criteria

- navigation intents are typed and validated before use
- accepting an intent can open an old workspace without executing a business
  action
- invalid intent payloads fail closed with a user-visible explanation
- tests cover at least one workspace route, one focused trade route, and one
  rejected invalid route

## PFO-03: Assistant Workspace Split

### Priority

P0

### Outcome

Operators get a clean prompt surface, while power users and admins keep the
current prompt-management, provider, trace, and debugging controls.

### Why this matters

The current Assistant workspace is valuable, but it reads like a runtime
management console. Making it the landing page as-is would expose too much
configuration before the user has done any work.

### Scope

- separate "operator prompt" from "assistant runtime/prompt management"
- keep provider, agent, tool, budget, prompt preview, run trace, and feedback
  controls available from a secondary surface
- choose sensible defaults for the operator prompt path
- keep saved conversations accessible from both surfaces where appropriate
- preserve existing feedback and pending approval affordances

### Out of scope

- removing prompt preview
- removing run traces
- hiding governance from admin users

### Suggested owner profile

Frontend engineer comfortable moving large React workspace sections without
changing API contracts.

### Dependencies

- PFO-01
- current Assistant workspace component

### Acceptance criteria

- the operator prompt surface can send a prompt without exposing full runtime
  configuration
- the management/debug surface still exposes prompt preview and run traces
- existing assistant tests continue to pass or are intentionally updated
- users can move from an operator answer into its trace when needed

## PFO-04: Workspace Handoff Expansion

### Priority

P0

### Outcome

Assistant-driven handoffs can open old-school workspaces with the right focus,
context banner, and reset path.

### Why this matters

The prompt should not just say "go to Operations." It should take the user to
Operations focused on the trade, workflow item, document, invoice, or
settlement question that matters.

### Scope

- expand route handoff metadata beyond the current activity-feed trade handoff
- support source types such as assistant run, conversation, action request, and
  old workspace
- support focus objects such as trade, workflow item, document, invoice,
  payment, reference record, and report
- show destination banners with assistant rationale and source trace link
- provide a clear way to clear focus and return to the full workspace

### Out of scope

- deep-linking every panel in every workspace in one pass
- adding new backend domain objects by itself

### Suggested owner profile

Frontend engineer with workspace state experience and enough product judgment
to keep focus behavior consistent.

### Dependencies

- PFO-02
- existing workspace route state

### Acceptance criteria

- at least three destination workspaces support assistant handoff context
- handoff state survives refresh where route parameters allow it
- users can clear the handoff filter without losing normal workspace state
- browser smoke covers one prompt-to-workspace handoff

## PFO-05: Prompt-To-Old-UX Destination Polish

### Priority

P1

### Outcome

The old screens feel intentionally opened by the prompt rather than merely
linked from a chat response.

### Why this matters

If the assistant lands users in a dense table with no carried context, the
experience will feel broken. The destination needs to explain why it opened
and put the relevant record or workflow within reach.

### Scope

- add focused empty/loading/error states for prompt-opened destinations
- align workspace local filters with handoff focus
- add "related actions" at the destination when the next step is manual
- ensure mobile handoffs do not bury the user behind the side navigation
- polish labels so the old UX reads as a continuation of the conversation

### Out of scope

- redesigning every workspace
- replacing tables and forms with chat-only interactions

### Suggested owner profile

Frontend product engineer with design sensitivity for dense operational tools.

### Dependencies

- PFO-04

### Acceptance criteria

- prompt-opened destinations clearly show source, focus, and reset controls
- no destination requires the user to manually re-enter the same filter the
  prompt already resolved
- desktop and mobile layouts remain usable

## PFO-06: Signed-Out And Session-Resume Prompt Flow

### Priority

P1

### Outcome

Users who arrive signed out can still start from intent and resume the
intended prompt or destination after authentication.

### Why this matters

The current Start Here flow already stores simple return intent. A prompt-first
front door needs the same continuity for a natural-language job request.

### Scope

- allow signed-out users to express a non-sensitive initial intent
- route protected work through the auth gate
- preserve the intended destination or prompt draft through sign-in
- avoid sending protected prompts before authentication
- keep the guide available without sign-in

### Out of scope

- anonymous access to protected business data
- unauthenticated assistant runs against live data

### Suggested owner profile

Frontend engineer with auth flow context.

### Dependencies

- PFO-01
- current Start Here return-intent storage

### Acceptance criteria

- signed-out prompt intent routes to sign-in when protected data is needed
- after sign-in, the user resumes the intended prompt or workspace
- protected context is not sent to the assistant while signed out
- tests cover signed-out resume behavior

## PFO-07: Prompt-Led Action Review Experience

### Priority

P1

### Outcome

When the assistant proposes a governed business action, the prompt-first
surface makes the review path clear without implying the action already ran.

### Why this matters

A prompt-led product will naturally invite users to say "cancel this trade" or
"mark this invoice paid." The answer must preserve the existing approval and
typed execution model.

### Scope

- render staged action requests prominently in the prompt-first flow
- make review context, supporting records, missing evidence, and stale-state
  basis visible before approval
- route reviewers to the existing approval inbox or inline approval surface
- keep action status synchronized after approval, rejection, execution, or
  failure
- make manual fallback visible when no supported action type exists

### Out of scope

- new autonomous execution authority
- external commitments
- new high-risk action types

### Suggested owner profile

Assistant/frontend engineer with action-request governance context.

### Dependencies

- existing assistant action request contract
- PFO-01 or PFO-03

### Acceptance criteria

- prompt-led action requests show the same reviewer metadata as admin approval
  surfaces
- action approvals still execute through existing deterministic services
- the assistant never claims a staged action executed before it does
- assistant evals cover at least one prompt-led staged action case

## PFO-08: Intent Routing Evals And Browser Smoke

### Priority

P0

### Outcome

Prompt-led routing and handoff behavior becomes a tested product surface.

### Why this matters

Once the prompt is the front door, routing mistakes become first-impression
bugs. Evals and smoke tests need to protect the expected split between
navigation, explanation, staging, and manual fallback.

### Scope

- add assistant eval cases for navigation recommendations and unsupported
  mutation requests
- add browser smoke for first landing, prompt submission, and at least one
  assistant handoff into an old workspace
- test that invalid navigation intents fail closed
- test that business actions still use action requests
- document which changes require `make api-assistant-evals`,
  `make web-test`, or `make web-smoke-test`

### Out of scope

- exhaustive natural-language test coverage
- visual regression testing for every prompt state

### Suggested owner profile

Engineer comfortable across assistant evals, React tests, and browser smoke.

### Dependencies

- PFO-01
- PFO-02
- PFO-04

### Acceptance criteria

- the prompt-first route has focused web coverage
- at least one prompt-to-workspace browser smoke flow exists
- assistant evals guard against over-claiming mutation authority
- docs identify the verification lane for prompt-led UX changes

## PFO-09: Prompt Outcome And Feedback Loop

### Priority

P1

### Outcome

The team can learn whether prompt-first UX is routing users well, reducing
screen hunting, and preserving trust.

### Why this matters

Changing the landing experience should be measured. The right signals are not
just model ratings, but whether users accept handoffs, correct them, fall back
to manual navigation, and approve or reject staged actions.

### Scope

- track accepted, dismissed, and failed navigation intents
- connect prompt feedback with run IDs and destination handoffs
- identify repeated accepted routing patterns that should become deterministic
  intent rules
- expose a lightweight admin or report view of prompt-first outcomes
- document promotion, narrowing, or retirement signals

### Out of scope

- invasive user analytics
- hidden personalization that changes business authority

### Suggested owner profile

Full-stack engineer with assistant run tracing and product analytics context.

### Dependencies

- PFO-02
- PFO-04
- existing assistant run feedback model

### Acceptance criteria

- prompt navigation outcomes are stored with run or session provenance
- the team can distinguish answer feedback from route-handoff feedback
- repeated routing patterns are candidates for deterministic product rules
- no feedback signal directly mutates business records or agent authority

## Recommended First Slice

Start with a narrow vertical slice:

1. Make authenticated default route land on an operator prompt home.
2. Reuse existing assistant runtime APIs with sensible defaults.
3. Add one typed navigation intent: open a workspace by `ViewKey`.
4. Add one focused handoff: open Trade Capture for a resolved trade.
5. Add tests for default landing, manual nav fallback, and invalid intent
   rejection.

This proves the product shape without touching business mutation authority.

## Open Product Decisions

- Should the unauthenticated default route show prompt home, guide, or auth
  gate first?
- Should the prompt home use the platform foundation agent by default, or a new
  curated "Operator Concierge" agent?
- Which workspaces should support first-class assistant handoffs in the first
  release: Trade Capture, Work Queue, Settlement, Reports, or Exposure?
- Should navigation intents be generated by the model and validated by the
  client, or produced by deterministic intent routing on the server?
- What level of prompt history should appear on the landing surface versus the
  management/debug surface?
