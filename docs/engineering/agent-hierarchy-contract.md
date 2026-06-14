# Agent Hierarchy Contract

## Purpose

This document records the first repo-supported pattern for managed agents that
consult, supervise, or route work to other managed agents.

The goal is not to introduce an unconstrained agent swarm. The goal is to make
manager and specialist relationships explicit so:

- prompts can explain who owns final synthesis
- coordination tools can respect configured subordinate boundaries and depth
  limits
- seeded profiles share one topology instead of inventing ad hoc delegation
- future autonomy review can reason about hierarchy with the same evidence it
  already uses for tools, actions, and outcome metrics

## Default Pattern

ECTRM should default to a shallow supervised hierarchy:

1. human supervisor
2. control or routing agent
3. domain manager agent
4. specialist agent
5. typed application service or approval-gated action

Use this pattern unless a narrower single-agent flow is clearly sufficient.

## Supported Orchestration Patterns

Managed agent profiles now declare one orchestration pattern:

- `SINGLE`: no subordinate consultation required
- `MANAGER`: one manager synthesizes work from bounded specialists
- `TRIAGE`: one manager routes to the right domain manager or specialist
- `PARALLEL`: one manager fans out read or draft questions, then synthesizes
- `EVALUATOR`: one manager critiques or reviews another agent's draft output

These patterns are descriptive and governance-oriented. They do not widen
authority beyond the role, tool, and action contracts already enforced in the
platform.

## Runtime Fields

Managed agent records now carry hierarchy metadata:

- `orchestration_pattern`
- `parent_agent_id`
- `managed_agent_ids`
- `delegation_guidance`

Role archetypes publish the recommended equivalents:

- `recommended_orchestration_pattern`
- `recommended_parent_role_keys`
- `recommended_managed_role_keys`
- `delegation_guidance`

Seeded role-derived profiles inherit these defaults so the stored roster matches
the role catalog.

## Coordination Guardrails

`consult_managed_agent` remains advisory-only.

- consulted agents may explain, draft, or read within their own lane
- consulted agents do not stage or execute governed actions through the
  consultation path
- if a manager has configured `managed_agent_ids`, runtime consultation is
  restricted to that subordinate list
- if a profile declares a non-`SINGLE` orchestration pattern but has no
  configured `managed_agent_ids`, consultation fails closed

This keeps hierarchy useful without letting freeform delegation bypass the
existing action gateway.

`enlist_managed_agent` is the bounded execution path.

- enlisted agents run as their own managed-agent execution, not as hidden
  prompt text inside the manager's answer
- enlisted agents inherit the requesting user's identity context, but only act
  within the enlisted profile's own capabilities, `allowed_tools`,
  `allowed_action_types`, and authority ceiling
- delegated business mutations still become typed action requests and, when the
  enlisted profile is execute-capable, flow through the same autonomous
  execution checks and typed application services as any other governed action
- if a manager has configured `managed_agent_ids`, runtime enlistment is
  restricted to that subordinate list
- if a profile declares a non-`SINGLE` orchestration pattern but has no
  configured `managed_agent_ids`, enlistment also fails closed
- runtime delegation depth stays shallow so the platform does not drift into
  recursive swarms

This keeps delegated execution explicit, auditable, and governed by the same
action and authority contracts as direct assistant work.

## Seeded Topology

The current seeded hierarchy is:

- `control-tower-agent`
  - `market-research-agent`
    - `pre-trade-structuring-agent`
    - `risk-sentinel`
  - `trade-capture-agent`
    - `trade-governor`
  - `trade-ops-copilot`
    - `movement-controller-agent`
    - `confirmation-controller-agent`
    - `workflow-controller-agent`
    - `counterparty-state-sync-agent`
    - `document-agent`
    - `logistics-coordinator`
  - `settlement-copilot`
    - `invoice-controller-agent`
    - `accrual-controller-agent`
    - `accounting-posting-agent`
    - `fee-accrual-agent`
    - `counterparty-outreach-agent`
  - `reporting-reconciliation-agent`

This topology is intentionally shallow. If a request needs deeper recursion,
that is a signal to re-check whether the work should be a deterministic service,
a stronger workspace object, or a smaller number of clearer agent roles.

## Design Rules

- Keep one final synthesizer per request.
- Prefer 2 layers below the human, not deep recursive trees.
- Use specialists for narrow evidence gathering, not for independent authority.
- Keep durable writes behind typed services and approval or policy controls.
- Treat repeated coordination logic as a candidate for deterministic routing,
  queue rules, or product workflow instead of ever-growing prompt prose.
