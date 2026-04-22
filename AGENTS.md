# AGENTS.md

## Purpose

This file is the repo-level operating guide for coding agents working in ECTRM.
Read it before making code or documentation changes.

## Required Context

For general engineering work, start with:

- [README.md](./README.md)
- [docs/engineering/platform-blueprint.md](./docs/engineering/platform-blueprint.md)
- [docs/engineering/local-development.md](./docs/engineering/local-development.md)

For assistant, agent, automation, action-request, policy, or deterministic
algorithm work, also read:

- [docs/engineering/ai-workflow.md](./docs/engineering/ai-workflow.md)
- [docs/engineering/agent-autonomy-rubric.md](./docs/engineering/agent-autonomy-rubric.md)
- [docs/engineering/agent-knowledge-base.md](./docs/engineering/agent-knowledge-base.md)
- [docs/engineering/human-agent-authority-matrix.md](./docs/engineering/human-agent-authority-matrix.md)
- [docs/engineering/agent-action-request-contract.md](./docs/engineering/agent-action-request-contract.md)

## Core Rules

- Respect the existing dirty worktree. Do not revert unrelated changes.
- Keep business writes behind typed application services.
- Do not let freeform model output directly mutate business records.
- Treat deterministic services, formulas, and policy rules as the home for
  durable business truth.
- Use agents for explanation, synthesis, drafting, triage, and staging
  reviewable actions until the authority rubric says more autonomy is justified.
- Preserve manual fallback, audit, permission checks, and provenance.
- Add tests, assistant evals, or browser smoke coverage when behavior changes.

## Deterministic Algorithm Loop

When you see repeated judgment, stable reviewer decisions, prompt instructions
that compensate for missing product behavior, or recurring accepted
recommendations:

1. Check [Agent Knowledge Base](./docs/engineering/agent-knowledge-base.md) for
   an existing lesson or algorithm candidate.
2. Prefer existing deterministic services, formulas, policies, or action
   contracts when they apply.
3. If no pattern exists, propose or implement deterministic logic through the
   normal repo structure.
4. Include owner, inputs, outputs, rule set, stop conditions, tests, audit, and
   rollback expectations.
5. Update the knowledge base with a `lesson`, `algorithm-candidate`, or
   `algorithm-added` entry.

If the algorithm affects pricing, risk, settlement, credit, compliance,
permissions, policy, reference data, or external commitments, keep it as a
proposal until the appropriate human owner approves the domain rule.

## Knowledge Capture

Update [Agent Knowledge Base](./docs/engineering/agent-knowledge-base.md) when a
change teaches future agents something reusable about:

- autonomy boundaries
- deterministic algorithms
- staged action contracts
- stop conditions
- promotion or retirement signals
- reviewer expectations
- prompt behavior that should become product behavior

Use an ADR when the lesson changes architecture. Use engineering or product docs
when the lesson changes implementation policy or user-facing behavior.

## Verification

Use the narrowest verification that proves the change:

- docs-only changes: check links, formatting, and references
- assistant or automation changes: run or update `make api-assistant-evals`
- backend service changes: add or run focused API tests
- frontend behavior changes: run focused web tests and lint/build when relevant
- high-trust workflow changes: consider browser smoke coverage

If you cannot run the relevant verification, say so in your final response.
