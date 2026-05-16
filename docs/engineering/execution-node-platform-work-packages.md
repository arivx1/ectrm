# Execution Node Platform Work Packages

## Goal

Turn the future "assign this work to a server" concept into a governed delivery
plan that lets ECTRM use cloud-hosted workers, customer-hosted machines, and
personal execution nodes without distributing business authority away from the
main platform.

This package assumes:

- the control plane remains the system of authority
- deterministic services and typed actions remain the only business-write path
- execution nodes are compute locations, not owners of business truth
- early rollout should favor low-risk, reviewable workloads

## Primary Design Inputs

- [ADR 0004: Centralized Control Plane With Assignable Execution Nodes](../adr/0004-control-plane-and-execution-nodes.md)
- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)

## Current Repo Anchors

- `codex_task_requests` already model a queued, callback-driven admin dispatch
  workflow.
- assistant action requests already preserve typed payloads, stale-state basis,
  and governed execution rules.
- admin and assistant surfaces already point toward a control-tower operating
  model instead of ad hoc background scripts.
- the repo already prefers local-first fallback and explicit runtime metadata
  rather than hidden transport assumptions.

## Non-Goals

This plan does not assume:

- immediate microservice decomposition
- peer-to-peer node writes into the primary business database
- autonomous trade, settlement, policy, or reference-data mutations from
  remote nodes
- broad personal-node access to restricted data on day one
- self-hosting of the full control plane as a prerequisite for assignable jobs

## Delivery Order

### Wave 0: Define the authority seam

1. ENP-01 execution job contract
2. ENP-02 node registry and trust tiers
3. ENP-03 lease, heartbeat, and provenance model

### Wave 1: Reuse existing low-risk dispatch paths

4. ENP-04 provider abstraction for Codex-style and similar reviewable jobs
5. ENP-05 admin assignment and supervision UX

### Wave 2: Add personal and customer-hosted nodes

6. ENP-06 outbound node agent and enrollment flow
7. ENP-07 scoped credentials, artifacts, and data-access envelopes

### Wave 3: Expand the job catalog conservatively

8. ENP-08 first local-first workload pilots
9. ENP-09 policy-based routing and cloud pools

### Wave 4: Connect execution results back into governed product seams

10. ENP-10 action-gateway integration and promotion gates

## Shared Definition Of Done

Each work package is done only when:

- job states, retries, lease expiry, and cancellation semantics are typed and
  testable
- no new business-write path bypasses typed services, policy checks, audit, or
  approval expectations
- node capabilities, trust tiers, and routing rules are explicit and
  operator-visible
- failures, heartbeats, artifacts, and downstream effects are observable from
  the control plane
- docs and operating guidance explain how personal nodes differ from managed
  cloud workers

## ENP-01: Execution Job Contract

### Priority

P1

### Size

M

### Outcome

ECTRM has a single typed job record for assignable execution work.

### Scope

- define a durable execution-job model with states such as `QUEUED`, `LEASED`,
  `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, and `EXPIRED`
- capture job type, requester, workspace or work-object context, required
  capabilities, trust tier, routing mode, idempotency key, and artifact
  metadata
- define which fields are server-authored versus node-reported
- document stale-job, duplicate-result, and replay expectations

### Out Of Scope

- node enrollment
- advanced routing policy

### Acceptance Criteria

- at least one existing dispatch workflow can be represented through the new
  contract
- retries and duplicate callbacks have deterministic handling
- the contract is explicit enough for admin UI and API consumers to render job
  state without hidden conventions

## ENP-02: Node Registry And Trust Tiers

### Priority

P1

### Size

M

### Outcome

ECTRM can register execution nodes without treating them as equivalent to the
control plane.

### Scope

- define node identity, enrollment tokens, and revocation rules
- define capability claims such as `browser`, `python`, `gpu`, and
  `office_network`
- define trust tiers such as managed cloud, customer cloud, and personal node
- define policy flags for data access and outbound network restrictions
- make node health and paused state visible to admins

### Out Of Scope

- automatic capacity scaling
- unrestricted end-user self-service enrollment

### Acceptance Criteria

- the system can distinguish "can run this software" from "is allowed to see
  this data"
- admins can revoke or pause a node without deleting execution history
- personal nodes have a narrower default trust profile than managed nodes

## ENP-03: Lease, Heartbeat, And Provenance Model

### Priority

P1

### Size

M

### Outcome

Distributed execution has explicit ownership, liveness, and audit semantics.

### Scope

- add lease acquisition and expiry rules
- add heartbeat timestamps and offline detection
- define cancellation and safe retry behavior
- persist result summary, artifact references, and failure detail
- include correlation IDs so job events, callbacks, and surfaced outputs can be
  traced together

### Out Of Scope

- job-specific business rules

### Acceptance Criteria

- a dead or disconnected node does not leave a job permanently ambiguous
- operators can see whether work is queued, leased, actively running, or stale
- replay and duplicate-callback behavior are deterministic

## ENP-04: Provider Abstraction For Reviewable Jobs

### Priority

P1

### Size

M

### Outcome

Existing dispatch surfaces can target more than one execution backend without
changing their governance model.

### Scope

- refactor Codex-style task dispatch behind a provider abstraction
- support at least one control-plane-managed provider in addition to the
  current hosted workflow path
- keep callback and artifact semantics aligned across providers
- preserve admin ownership and reviewable outputs

### Out Of Scope

- broad business workflow execution

### Acceptance Criteria

- the same admin task can target a hosted provider or a registered node class
- provider differences do not leak into the core task contract
- reviewable artifacts remain the expected output

## ENP-05: Admin Assignment And Supervision UX

### Priority

P1

### Size

M

### Outcome

Operators can choose where a job runs and understand why it was or was not
assigned.

### Scope

- add manual routing choices such as specific node, node pool, or auto-select
- show capability mismatch, trust-policy blocks, and node health
- show lease owner, start time, heartbeat lag, retry count, and pause controls
- preserve manual retry and cancel behavior

### Out Of Scope

- end-user job routing on every product surface

### Acceptance Criteria

- an admin can intentionally route work to a personal node or a cloud node
- the UI explains why a node is ineligible
- operators can pause noisy nodes or retry failed jobs without shell access

## ENP-06: Outbound Node Agent And Enrollment Flow

### Priority

P2

### Size

L

### Outcome

Personal and customer-hosted machines can participate through an outbound node
agent.

### Scope

- define a lightweight node agent that authenticates to the control plane
- prefer outbound polling or persistent outbound connection over inbound
  networking
- support capability registration, heartbeats, job lease pickup, and artifact
  upload
- support revocation, forced re-authentication, and local pause

### Out Of Scope

- peer-to-peer mesh networking
- permanent unrestricted local filesystem sharing

### Acceptance Criteria

- a laptop can be enrolled without exposing an inbound port
- the control plane can revoke the node and stop new leases quickly
- node lifecycle events are visible in admin history

## ENP-07: Scoped Credentials, Artifacts, And Data-Access Envelopes

### Priority

P2

### Size

L

### Outcome

Nodes receive the minimum credentials and data needed for a job.

### Scope

- define short-lived lease or download credentials
- define how artifacts are uploaded and referenced
- define data envelopes by classification and trust tier
- require explicit policy for jobs that use local files, office-network access,
  or restricted datasets
- separate node-local secrets from control-plane-owned secrets

### Out Of Scope

- general-purpose secret management for every future integration

### Acceptance Criteria

- personal nodes do not automatically inherit cloud-worker credentials
- artifact access can be revoked or expired
- restricted jobs can be blocked before lease rather than after execution

## ENP-08: First Local-First Workload Pilots

### Priority

P2

### Size

M

### Outcome

ECTRM proves the model on narrow workloads that benefit from flexible placement
without increasing business authority.

### Candidate first pilots

- Codex engineering tasks
- browser automation that returns artifacts or review notes
- document extraction or classification runs
- report rendering
- read-only research or summarization batches

### Scope

- choose one or two pilot job types
- define expected artifacts, stop conditions, and manual fallback
- add focused tests and operator runbooks
- measure queue time, success rate, retry rate, and operator clarity

### Out Of Scope

- trade capture
- settlement mutation
- reference-data mutation

### Acceptance Criteria

- at least one pilot can run on a cloud node and a personal node
- pilot outputs stay reviewable and non-authoritative
- failure and retry behavior are clear to operators

## ENP-09: Policy-Based Routing And Cloud Pools

### Priority

P3

### Size

L

### Outcome

ECTRM can auto-route eligible jobs across managed node pools without hiding the
governance decision.

### Scope

- add node pools and policy-selected routing
- define cost, latency, locality, and trust-policy inputs
- allow manual override where the operator has permission
- keep routing explanations visible in the control plane

### Out Of Scope

- fully dynamic market-style scheduling

### Acceptance Criteria

- auto-routing never selects a node that violates trust or data policy
- operators can see the routing reason after assignment
- manual pinning remains available for authorized users

## ENP-10: Action-Gateway Integration And Promotion Gates

### Priority

P3

### Size

M

### Outcome

Execution-node outputs can re-enter ECTRM through the same governed seams used
elsewhere.

### Scope

- define how a completed job returns artifacts, typed outputs, or staged action
  requests
- reuse the action-request contract when a job proposes a mutation
- define promotion gates for any job type that wants to move from draft-only
  output toward bounded execution
- add stop conditions for stale evidence, trust-policy mismatch, missing
  provenance, or failed verification

### Out Of Scope

- direct autonomous business mutation from arbitrary nodes

### Acceptance Criteria

- a node-produced recommendation can stage a governed action without inventing
  a parallel mutation path
- promotion beyond draft or stage requires explicit evidence and policy
- jobs that fail provenance or verification checks stop safely

## Recommended First Sequence

The safest likely sequence is:

1. standardize the execution-job contract
2. model nodes, trust tiers, and heartbeats
3. refactor Codex-style dispatch onto the shared execution model
4. add admin assignment visibility
5. enroll one outbound personal node and one managed cloud node
6. pilot one or two non-authoritative workloads

That gives ECTRM a reusable execution platform without turning personal
machines into shadow application servers.
