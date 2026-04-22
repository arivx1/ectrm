# ADR 0003: Operational Framework and Projection Monitoring Guardrails

## Status

Accepted

## Context

The v2 architecture direction in ADR 0002 moved the product toward domain ownership, but recent implementation work exposed a second problem: multiple operational surfaces were evolving as separate products.

Examples included:

- workspace rendering and bootstrap behavior spread across shell switches
- confirmations, workflow items, deliveries, shipments, invoices, and payments using repeated controller and board patterns
- operational forms and action buttons being authored separately per board
- projection integrity checks existing as developer tooling rather than an operator-owned control plane

That made the app harder to evolve safely. Small changes could fix one screen while leaving the same behavior broken elsewhere.

## Decision

Operational surfaces should be built as configured instances of shared descriptors, controllers, and delivery contracts.

### Workspace Descriptors

The web application shell should prefer a single workspace descriptor layer for:

- renderer ownership
- required data groups
- refresh plans
- window notice behavior
- workspace metadata

New workspaces should extend the descriptor layer rather than adding new shell switch logic.

### Operational Resource Descriptors

Operational resources should declare their read, mutation, action, and surface metadata through shared resource descriptors.

This applies to:

- confirmations
- workflow items
- delivery obligations
- shipment actualization
- settlement invoices
- settlement payments

Routes should remain thin. They should delegate standard auth, transaction, query, mutation, and error behavior to shared operational route helpers.

### Workboards and Action Panels

Operational boards should use the shared board/controller/action registry stack.

Use configured instances for:

- board shells
- queue shaping
- empty states
- summary cards
- inline ledgers
- action side panels
- form fields
- action button sets
- item-specific action state

Workspace-specific code is still allowed when it represents true domain behavior, but not for generic shell, queue, form, or action scaffolding.

### Projection Integrity Monitoring

Projection integrity is an operational control, not just a developer script.

It should have:

- deterministic audit checks
- deterministic repair paths where safe
- admin-facing run and repair controls
- a recurring scheduler
- persisted runtime state
- persisted alert history
- persisted delivery history

Alert delivery is local-first:

- `ADMIN_WORKSPACE` records a delivered admin-workspace outcome
- `EMAIL` resolves active admin recipients and either sends through configured SMTP or archives to the local email sink
- `SLACK` sends through a configured webhook or archives to the local Slack sink
- `INCIDENT_QUEUE` sends through a configured webhook or archives to the local incident queue sink

External transports may be configured, but missing SMTP or webhook settings must not leave alerts in limbo.

## Consequences

Positive:

- operational screens become easier to extend consistently
- admin and scheduler behavior share the same projection-monitoring contract
- local-first alert delivery gives operators a complete audit trail even without external infrastructure
- frontend and backend descriptors make drift more visible in tests

Tradeoffs:

- descriptors can become too abstract if they start hiding true domain behavior
- local archive delivery is an operational fallback, not a substitute for production incident tooling
- projection repair logic needs careful invariant coverage before expanding automatic repair scope

## Guardrails

When adding new operational behavior:

1. Prefer extending an existing descriptor or registry before creating a new route, board, form, or action component.
2. Keep domain-specific business logic in domain services, not in shared shells.
3. Add contract tests for new descriptors and registry entries.
4. Add projection invariant tests for any event flow that mutates trade, delivery, confirmation, invoice, payment, settlement, or option state.
5. Treat external alert delivery as best-effort and recorded; never block projection monitoring completion on a third-party outage.

## Verification Expectations

Before merging changes to these seams, run:

- backend unit tests for operational routes, projection integrity, and projection monitoring
- frontend registry and admin monitoring tests
- the full web build
- a live external transport smoke when SMTP, Slack, or incident webhook environment variables are configured
