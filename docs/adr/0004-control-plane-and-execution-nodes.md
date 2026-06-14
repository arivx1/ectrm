# ADR 0004: Centralized Control Plane With Assignable Execution Nodes

## Status

Proposed

## Context

ECTRM already has strong governance direction for assistant actions and
engineering-task dispatch:

- business mutations are expected to flow through typed services
- assistant actions are staged or executed through governed contracts
- Codex task dispatch is modeled as an admin-owned workflow with persisted task
  state and callbacks

At the same time, some future workloads will benefit from running away from the
main application host:

- repository and engineering automation
- browser automation
- document processing
- long-running imports or syncs
- report rendering
- model-assisted batch analysis that returns reviewable outputs

The product also wants future flexibility in where those workloads run. An
operator may want to assign work to:

- a cloud-hosted worker
- an office workstation
- a personal computer acting as a temporary execution host

That flexibility is useful, but it creates a governance risk if arbitrary
machines become peers of the main application. ECTRM should not distribute
business authority, policy ownership, or source-of-truth data across ad hoc
hosts.

## Decision

ECTRM should adopt a centralized control-plane model with assignable execution
nodes.

### Control plane

The control plane remains the system of authority. It owns:

- authentication and node registration
- job definitions, queues, leases, and status transitions
- typed action and application-service execution
- policy, permissions, and trust-tier rules
- audit, provenance, and operator-visible history
- artifact metadata and result lineage
- approval workflows and governed action requests

The control plane may run on one server today and remain a modular monolith.
This ADR does not imply a microservice split.

### Execution nodes

Execution nodes are registered workers that execute assigned jobs on behalf of
the control plane. A node may be:

- ECTRM-managed cloud infrastructure
- customer-managed server infrastructure
- a desktop or laptop enrolled as a personal execution node

Execution nodes are compute locations, not business-authority locations.

### Authority boundary

Execution nodes must not become direct authorities over trades, settlement,
policy, permissions, reference data, or other business records.

Guardrails:

1. Nodes do not write directly to the primary business database.
2. Nodes do not bypass typed application services.
3. Freeform model output produced on a node does not directly mutate business
   records.
4. Sensitive mutations still return through the control plane as typed actions,
   staged action requests, or other governed service calls.
5. Control-plane policy decides what a node is allowed to see, run, and return.

### Job contract

Distributed work should be represented through a typed job contract with
explicit states such as:

- `QUEUED`
- `LEASED`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `EXPIRED`

Each job should capture:

- job type
- requesting user or automation
- owning workspace or work object where applicable
- required capabilities
- trust tier and data-classification requirements
- routing mode: manual pin, eligible set, or policy-selected
- idempotency key
- input references and freshness basis
- started, heartbeat, and completed timestamps
- result summary, artifacts, and failure detail

### Transport and connectivity

Node communication should prefer outbound connectivity from the node to the
control plane, such as polling or an authenticated persistent connection.

ECTRM should avoid requiring inbound access to personal machines unless a later
use case proves it is necessary.

### Capability and trust model

Nodes should register capabilities and trust attributes separately.

Capability examples:

- `python`
- `browser`
- `document_ocr`
- `gpu`
- `office_network`
- `local_files`

Trust or policy examples:

- `managed_cloud`
- `customer_cloud`
- `personal_node`
- `restricted_data_allowed`
- `no_external_egress`

Routing must consider both capability fit and trust policy. A personal node may
be allowed to run some jobs and prohibited from others even when it has the
required software capability.

### First workload boundary

The first execution-node workloads should be low-risk and non-authoritative.

Good early candidates:

- Codex engineering tasks
- browser automation with reviewable output
- document extraction or classification
- read-only or draft-only research tasks
- report generation
- external syncs that stage imports for review

Poor first candidates:

- direct trade booking
- invoice or payment mutation
- policy or permission updates
- reference-data changes
- any workflow that externally commits the firm

### Self-hosting distinction

This ADR separates two future concerns:

1. where the control plane runs
2. where assigned jobs execute

ECTRM may later support self-hosting of the control plane, but that is a
separate decision from allowing personal or cloud execution nodes.

## Consequences

Positive:

- preserves one authority system for policy, audit, and business writes
- allows flexible execution placement without making every host trusted
- fits the existing action-request, callback, and admin-supervision direction
- gives the product a path for local-first and cloud-hosted workloads
- makes node assignment a product feature instead of an infrastructure side
  channel

Tradeoffs:

- requires a real job model, heartbeat semantics, and lease handling
- personal-node support adds enrollment, secret-scoping, and trust-tier
  complexity
- some workloads will need artifact indirection instead of direct record
  mutation
- routing policy can become overcomplicated if node capabilities are not kept
  explicit and typed

## Guardrails

When implementing this architecture:

1. Keep the control plane centralized until scale or legal boundary pressure
   proves otherwise.
2. Reuse the same governed action and application-service seams already used by
   assistants, automation, and admin actions.
3. Treat execution nodes as untrusted or partially trusted by default.
4. Start with outbound node connectivity, short-lived leases, and revocable
   credentials.
5. Keep manual fallback and explicit operator visibility for assignment,
   failure, retry, and pause behavior.
6. Separate node capability matching from authority to mutate business state.

## Implementation Notes

This ADR is intentionally future-facing.

It does not require immediate distributed execution work, and it should not
pull priority away from the core-platform hardening already described in
existing roadmaps. The first practical use should be one narrow workload that
already fits the repo's governance model, such as Codex-style engineering tasks
or another reviewable non-core job type.
