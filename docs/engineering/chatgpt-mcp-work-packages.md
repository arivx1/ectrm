# ChatGPT MCP Work Packages

## Goal

Turn ECTRM's internal assistant and governed domain services into a remote MCP
app surface that a user can access from their own ChatGPT account without
bypassing typed services, permission checks, audit, or approval-gated action
flows.

This package set assumes:

- the first target is private use from a personal ChatGPT account through
  ChatGPT developer mode, not public app-directory launch
- remote MCP is a new transport over existing ECTRM business services, not a
  parallel business-logic stack
- data-only read access should land before any write-capable tools
- any future write-capable MCP tool must map to typed services or the existing
  governed action-request contract

## Primary Design Inputs

- [Building MCP servers for ChatGPT Apps and API integrations](https://developers.openai.com/api/docs/mcp)
- [ChatGPT Developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
- [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in)
- [AI Workflow](./ai-workflow.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [User Extensibility Initiative](./user-extensibility-initiative.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- ECTRM already has a backend-owned assistant runtime exposed through
  `/assistant/*`, with prompt preview, run tracing, policy-aware live tools,
  and governed action requests.
- The repo already enforces the right authority direction for external AI use:
  no freeform model output should directly mutate business records.
- The backend already knows how to proxy model calls and execute read-only tool
  rounds, but that machinery is internal to ECTRM's own assistant transport.
- The repo does not yet expose a remote MCP server, Apps SDK resources, or a
  ChatGPT-facing tool catalog.
- Current protected reads rely on ECTRM session auth, which is not yet the same
  thing as ChatGPT app authentication.

## Current External Constraints

These assumptions were verified against OpenAI docs on 2026-05-08.

- ChatGPT developer mode is currently available in beta to Pro, Plus,
  Business, Enterprise, and Education accounts on the web.
- Remote MCP servers currently support SSE and streaming HTTP.
- ChatGPT developer mode supports OAuth, no authentication, and mixed
  authentication for remote MCP apps.
- Data-only ChatGPT apps for deep research and company knowledge should expose
  `search` and `fetch`.
- Developer mode can expose arbitrary tools, including write-capable tools, but
  write actions require confirmation by default and `readOnlyHint` matters.

## Delivery Order

### Wave 0: personal-account read access

1. WP-01 integration architecture and threat model
2. WP-02 remote MCP server scaffold and deployment seam
3. WP-03 ChatGPT auth and identity bridge
4. WP-04 first read-only ECTRM tool slice with `search` and `fetch`

Status on 2026-05-08:
The first implementation slice is underway. `apps/api` now has an optional
read-only MCP scaffold mounted at `/mcp` behind `MCP_ENABLED`, plus a public
`/mcp-status` route and the starter `search` and `fetch` tools over checked-in
repo docs only. OAuth-backed ChatGPT identity has now landed for the same
surface through `/mcp/login`, `/mcp/token`, and `/mcp/whoami`, backed by ECTRM
user accounts and expiring session records. Governed business-data reads and
any write-capable tools remain deferred to later Wave 0 and Wave 1 work.

### Wave 1: governed write access

5. WP-05 shared tool catalog and governance metadata
6. WP-06 approval-gated MCP write bridge
7. WP-07 evals, audit, and red-team coverage for external ChatGPT use

### Wave 2: richer app productization

8. WP-08 Apps SDK packaging and optional UI resources
9. WP-09 rollout, admin controls, and submission readiness

## Milestone Recommendation

Treat Wave 0 as the first real success condition. After WP-01 through WP-04
land, a user should be able to connect ECTRM to their own ChatGPT account and
use it for governed, read-only retrieval without needing the ECTRM web
assistant UI.

Do not start Wave 1 until Wave 0 proves that:

- auth and user mapping are correct
- search and fetch results are useful enough to justify the surface
- provenance and citation behavior are understandable
- prompt-injection and data-leak risks are bounded for the first read corpus

## Shared Definition Of Done

Each work package is done only when:

- no MCP-exposed path directly mutates business records outside typed
  application services or the governed action-request contract
- authenticated ChatGPT users resolve to explicit ECTRM identities with the
  same row-level access and permission checks the product already expects
- each published MCP tool has a server-owned schema, description, and explicit
  read or write posture
- audit, provenance, and failure diagnostics remain visible enough to explain
  what ChatGPT asked for and what ECTRM returned
- docs and local run instructions are updated wherever the new transport
  changes engineering or operator workflow
- automated tests, assistant evals, or targeted smoke coverage prove the new
  seam at the narrowest level that matches the risk

## Sequencing Rules

- Start with remote MCP for ChatGPT developer mode, not a public app-directory
  launch.
- Start with data-only tools before any write-capable tool family.
- Do not expose raw database reads just because MCP makes tools easy to publish;
  build curated, permission-aware read models.
- Do not expose a write-capable MCP tool until it is backed by a typed service
  or approval-gated action flow with stale-state and idempotency controls.
- Reuse the repo's existing authority matrix and action-request contract rather
  than inventing a second governance model for ChatGPT.
- Treat no-auth MCP only as a local development shortcut. Any durable hosted
  environment should use explicit authentication.

## WP-01: Integration Architecture And Threat Model

### Priority

P0

### Outcome

The team has a documented target architecture for ChatGPT account integration
that makes transport, auth, authority, and citation boundaries explicit before
implementation starts.

### Why this matters

ECTRM already has strong internal assistant governance. A rushed MCP server
could accidentally bypass those protections by making convenience reads or
writes available through a second, less-governed path.

### Scope

- choose the first supported external surface:
  - remote MCP app for ChatGPT developer mode
  - personal-account use first
  - no app-directory dependency for the first milestone
- decide where the MCP server should live:
  - mounted in the existing FastAPI service
  - or deployed as a sidecar that calls typed ECTRM APIs or services
- define the trust boundary from ChatGPT to MCP to ECTRM services
- define the first tool families:
  - read-only retrieval tools
  - deferred governed write tools
- define the citation strategy and canonical URL policy for fetched records
- define the stop conditions for external write tools and unsupported actions
- record the prompt-injection and data-exfiltration threat model for the first
  read corpus

### Out of scope

- full server implementation
- OAuth client implementation
- public app-directory submission

### Suggested owner profile

Platform or backend engineer with assistant-governance context and enough
product judgment to define safe first scope.

### Dependencies

- [AI Workflow](./ai-workflow.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)

### Acceptance criteria

- the chosen transport and hosting shape are documented
- the first supported use case is explicitly personal-account ChatGPT use, not
  generic public launch
- the first tool families and explicitly deferred tool families are listed
- the trust boundary for reads, writes, auth, and citations is reviewable by
  engineering and product

### Verification

- docs review against the design inputs in this package

## WP-02: Remote MCP Server Scaffold And Deployment Seam

### Priority

P0

### Outcome

ECTRM has a deployable remote MCP server seam that ChatGPT can discover and
refresh, even before high-value business tools are added.

### Why this matters

The MCP transport should be proved early. This separates transport and hosting
risk from business-tool design risk.

### Scope

- choose the implementation framework for Python-based remote MCP support
- stand up a minimal MCP server with:
  - server instructions
  - tool registration
  - output schemas
  - health and version visibility
- support one primary transport compatible with current OpenAI requirements
- define local development and hosted deployment entrypoints
- define configuration and secret-loading strategy for the MCP surface
- decide whether the server is:
  - embedded in `apps/api`
  - or deployed as a dedicated process that reuses typed ECTRM service seams
- add contract tests for tool registration and transport reachability

### Out of scope

- high-value business tools
- final authentication flow
- action-capable mutations

### Suggested owner profile

Backend engineer comfortable with HTTP transports, deployment seams, and
contract testing.

### Dependencies

- WP-01

### Acceptance criteria

- a remote MCP endpoint can be started locally and reached from a test client
- tool discovery works against the chosen MCP framework
- deployment and local-run instructions are checked into repo docs
- the seam is shaped so future tool handlers can call typed ECTRM services

### Verification

- focused backend tests for MCP server startup and tool discovery
- local manual reachability check with a simple MCP client

## WP-03: ChatGPT Auth And Identity Bridge

### Priority

P0

### Outcome

A ChatGPT-connected user can authenticate to ECTRM through the MCP surface in a
way that preserves per-user identity, permissions, and audit provenance.

### Why this matters

ECTRM's current protected reads assume an in-product session. ChatGPT app
connections need a different auth handshake and must not collapse into a shared
service account.

### Scope

- choose the first durable authentication mode for hosted MCP use:
  - OAuth preferred
  - mixed auth only if specific MCP operations require it
- define how a ChatGPT-connected user maps to an ECTRM user record
- define token, refresh, revocation, and environment-separation behavior
- preserve row-level access and role checks through the external transport
- define how audit logs and run traces record the external app identity
- document whether and when no-auth is allowed for local-only development
- add backend enforcement so protected tools fail closed without resolved user
  identity

### Out of scope

- broad SSO redesign for the rest of ECTRM
- workspace-wide admin rollout controls

### Suggested owner profile

Backend or platform engineer with auth and audit-tracing experience.

### Dependencies

- WP-01
- WP-02

### Acceptance criteria

- a ChatGPT user can complete the chosen auth flow and connect the app
- each MCP request resolves to an explicit ECTRM identity
- protected reads enforce the same permission rules as existing app routes
- audit or trace records show that the request came from the external ChatGPT
  transport

### Verification

- focused backend auth tests
- manual connection test from ChatGPT app settings

## WP-04: First Read-Only ECTRM Tool Slice With `search` And `fetch`

### Priority

P0

### Outcome

The first Wave 0 milestone delivers a useful read-only ChatGPT experience by
publishing curated ECTRM retrieval tools that follow the current OpenAI
`search` and `fetch` compatibility pattern.

### Why this matters

This is the smallest path from "internal assistant only" to "usable from my own
ChatGPT account." It also lets the team measure real value before any write
surface exists.

### Scope

- choose the first retrieval corpus, such as:
  - operator docs and engineering docs
  - trade and workflow summaries
  - settlement or operational exception summaries
- define the result-title, URL, and record-label conventions for citations
- implement `search` with a stable result schema
- implement `fetch` with full-text or full-record retrieval for the chosen
  corpus
- add permission-aware filtering so users only see what their ECTRM role can
  read
- annotate the tools as read-only and give them ChatGPT-friendly descriptions
- define freshness, pagination, and truncation rules for large results

### Out of scope

- direct record mutation
- broad cross-domain search over every database table on day one
- interactive widget UI

### Suggested owner profile

Backend engineer with product input on which read corpus is most valuable for a
first external ChatGPT workflow.

### Dependencies

- WP-02
- WP-03

### Acceptance criteria

- ChatGPT can use the connected ECTRM app to search and fetch the first curated
  ECTRM corpus
- results have stable titles and canonical URLs suitable for citations
- unauthorized rows are not exposed through search or fetch
- local docs explain how to connect the app from a personal ChatGPT account and
  test the first prompts

### Verification

- focused backend tests for schema shape and permission filtering
- manual ChatGPT prompt checks against a seeded local or staging environment

## WP-05: Shared Tool Catalog And Governance Metadata

### Priority

P1

### Outcome

ECTRM has one server-owned tool catalog that can describe tool schemas,
descriptions, read or write posture, rollout status, and ownership for both the
internal assistant and the external MCP surface.

### Why this matters

Without a shared catalog, the repo will drift into two tool-definition systems:
one for ECTRM's internal assistant and one for ChatGPT. That would duplicate
governance work and create description drift.

### Scope

- define shared tool metadata such as:
  - tool key
  - display name
  - description
  - owner domain
  - read or write posture
  - required auth class
  - input schema
  - output schema
  - rollout status
  - external exposure policy
- align tool descriptions with current ChatGPT guidance:
  - action-oriented names
  - "Use this when..." behavior cues
  - disallowed or edge-case notes where needed
- map internal read-only tools and future MCP tools to the same registry where
  practical
- surface `readOnlyHint` and related tool-governance metadata from this shared
  source
- define how role-based tool allowlists interact with MCP publication

### Out of scope

- exposing every existing internal assistant tool externally
- broad admin UI redesign

### Suggested owner profile

Backend or platform engineer with existing assistant-tooling context.

### Dependencies

- WP-04 strongly benefits from landing first

### Acceptance criteria

- at least one shared metadata source drives both internal and external tool
  publication for a meaningful subset of tools
- read-only versus write-capable posture is explicit and testable
- tool descriptions are reviewed for ChatGPT tool-selection clarity

### Verification

- focused backend tests for tool-registry integrity and publication filters

## WP-06: Approval-Gated MCP Write Bridge

### Priority

P1

### Outcome

ECTRM can expose a narrow write-capable MCP tool family without allowing
ChatGPT to mutate business records directly or bypass existing action-review
contracts.

### Why this matters

Developer mode can call arbitrary tools. That power is only acceptable in ECTRM
if write-capable tools remain transport adapters over typed services and
approval-gated action flows.

### Scope

- choose one narrow first write family that fits the authority matrix, such as:
  - document reprocessing
  - workflow item update
  - another low-risk internal state change with existing typed handlers
- map tool inputs to typed service payloads or staged action requests
- preserve stale-state checks, idempotency, and reviewer metadata
- ensure tool descriptions make the approval posture and side effects explicit
- fail closed when evidence, permissions, or stale-state checks are missing
- document which high-risk actions remain explicitly out of scope

### Out of scope

- unconstrained trade booking, amendment, cancellation, settlement release, or
  other external-commitment actions
- bypassing approval by hiding mutation inside an apparently read-only tool

### Suggested owner profile

Backend engineer with strong familiarity with existing assistant action
requests, typed services, and the authority matrix.

### Dependencies

- WP-01
- WP-03
- WP-05

### Acceptance criteria

- the first write-capable MCP tool maps to a typed ECTRM mutation seam or
  approval-gated action request
- no freeform MCP tool handler writes directly to domain tables
- the action path preserves audit, stale-state, and idempotency behavior
- docs clearly state the approval and confirmation behavior seen by ChatGPT
  users

### Verification

- focused backend tests for the chosen action family
- `make api-assistant-evals` updates when action-governance behavior changes

## WP-07: Evals, Audit, And Red-Team Coverage For External ChatGPT Use

### Priority

P1

### Outcome

The external ChatGPT transport has its own regression and safety coverage
instead of relying on ad hoc manual prompting.

### Why this matters

The internal assistant already has serious governance coverage. The external
transport should not become an untested escape hatch.

### Scope

- add tests for:
  - MCP tool schema integrity
  - auth and permission failures
  - read-only annotation correctness
  - write-bridge contract enforcement
- add prompt-injection and data-exfiltration red-team cases for the first read
  corpus
- extend audit or run tracing so external MCP usage is easy to inspect
- document a manual verification checklist for ChatGPT connection, tool refresh,
  and first-prompt behavior
- decide whether the repo needs a named verification target such as:
  - `make api-mcp-test`
  - or an expanded assistant eval lane

### Out of scope

- fully automating ChatGPT's hosted UI
- broad security-program expansion outside this surface

### Suggested owner profile

Backend or platform engineer with test-harness and assistant-governance
experience.

### Dependencies

- WP-04
- WP-06 for write-tool coverage

### Acceptance criteria

- the repo has an explicit verification lane for the MCP surface
- prompt-injection and data-leak risks for the first published corpus have
  regression coverage or documented manual checks
- external MCP usage is auditable enough to explain which tools were called and
  by whom

### Verification

- run the named MCP verification lane
- run `make api-assistant-evals` when governed action behavior changes

## WP-08: Apps SDK Packaging And Optional UI Resources

### Priority

P2

### Outcome

ECTRM can evolve from a data-only remote MCP app into a richer ChatGPT app with
optional UI resources when that adds real operator value.

### Why this matters

The first milestone does not need custom ChatGPT UI. But if the external
experience grows, the team should have a clean path to package it as a fuller
app rather than bolting UI on later.

### Scope

- decide whether a richer ChatGPT app needs:
  - no UI, data-only
  - lightweight result presentation
  - interactive widgets for a narrow workflow
- add Apps SDK packaging only if the operator use case benefits materially
- define UI resource, domain, and CSP requirements if widgets are introduced
- ensure widget state and tool invocations still respect the same typed-service
  and authority boundaries

### Out of scope

- forcing a custom widget into the first milestone
- broad redesign of the main ECTRM web app

### Suggested owner profile

Full-stack engineer with enough frontend context to judge whether an external
ChatGPT UI is worth the maintenance cost.

### Dependencies

- WP-04 for data-only value proof
- WP-05 for shared tool metadata

### Acceptance criteria

- the team has an explicit yes or no decision on whether custom ChatGPT UI is
  needed
- if UI is added, resource metadata and tool flows are documented and tested

### Verification

- focused backend and frontend checks matching the chosen UI scope

## WP-09: Rollout, Admin Controls, And Submission Readiness

### Priority

P2

### Outcome

ECTRM can safely choose between private rollout, workspace-managed rollout, or
app-directory submission once the external surface is mature enough.

### Why this matters

The first goal is private usage from a personal ChatGPT account. If the surface
works well, the team will need an explicit decision path for broader rollout
instead of drifting into accidental production exposure.

### Scope

- define rollout stages:
  - local-only developer mode
  - hosted private developer mode
  - workspace-managed internal rollout
  - optional public submission
- document admin and support requirements for broader rollout:
  - environment ownership
  - incident handling
  - privacy review
  - rate limits and abuse controls
  - tool enable or disable controls
- decide whether app-directory submission is desirable or explicitly deferred

### Out of scope

- committing to a public listing before private value is proven
- broad sales or GTM planning

### Suggested owner profile

Platform or product-minded engineer with security and operations input.

### Dependencies

- WP-04 minimum
- WP-06 and WP-07 before any write-capable broad rollout

### Acceptance criteria

- the team has a documented rollout ladder beyond personal-account use
- broader rollout requirements are explicit before the surface is treated as a
  production feature
- public submission is either planned intentionally or deferred explicitly

### Verification

- docs review and owner sign-off on the rollout posture
