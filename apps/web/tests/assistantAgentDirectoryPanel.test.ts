import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AssistantAgentDirectoryPanel } from '../src/workspaces/assistant/AssistantAgentDirectoryPanel'
import type { AssistantAgent, AssistantRuntimeSettings } from '../src/shared/models'

const runtimeSettings = {
  available_skills: [
    {
      name: 'risk_monitoring',
      label: 'Risk Monitoring',
      description: 'Review trade and position risk signals.',
    },
    {
      name: 'inter_agent_consultation',
      label: 'Inter-Agent Consultation',
      description: 'Coordinate with other managed agents.',
    },
  ],
  available_tools: [
    {
      name: 'trade_lookup',
      description: 'Read trade details.',
    },
    {
      name: 'market_snapshot',
      description: 'Read market snapshots.',
    },
  ],
  available_action_types: [
    {
      name: 'update_trade_workflow_item',
      label: 'Update Trade Workflow Item',
      description: 'Stage a workflow update.',
    },
  ],
} satisfies Pick<
  AssistantRuntimeSettings,
  'available_skills' | 'available_tools' | 'available_action_types'
>

const agents = [
  {
    agent_id: 'control-tower',
    name: 'Control Tower',
    description: 'Supervises the managed roster.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: 'openai',
    model: 'gpt-5.4',
    role_key: 'control_tower',
    profile_kind: 'CURATED',
    specialization_summary: 'Coordinates escalations across the roster.',
    human_owner_role: 'Operations Director',
    authority_ceiling: 'EXPLAIN',
    activation_notes: 'Escalates risky changes to human review.',
    orchestration_pattern: 'MANAGER',
    parent_agent_id: null,
    managed_agent_ids: ['risk-ops'],
    delegation_guidance: 'Coordinate specialists and escalate unresolved risk.',
    profile_request_id: null,
    allowed_workspaces: ['assistant', 'admin'],
    capabilities: ['READ', 'EXPLAIN'],
    skills: ['inter_agent_consultation'],
    allowed_tools: ['market_snapshot'],
    allowed_action_types: [],
    daily_token_allocation: 12000,
    token_budget: {
      status: 'GREEN',
      allocated_tokens: 12000,
      used_tokens: 2400,
      remaining_tokens: 9600,
      percent_used: 20,
      warning_threshold_percent: 80,
      allocation_source: 'AGENT',
      window_started_at: '2026-05-16T00:00:00Z',
      reset_at: '2026-05-17T00:00:00Z',
    },
    effective_policy: {
      allowed_tools: [],
      blocked_tools: [],
      allowed_actions: [],
      blocked_actions: [],
      policy_notes: ['Review required before expanding scope.'],
    },
    eval_gate: {
      status: 'PASS',
      role_key: 'control_tower',
      required_cases: ['coordination'],
      covered_cases: ['coordination'],
      missing_cases: [],
      custom_case_count: 0,
      notes: [],
    },
  },
  {
    agent_id: 'risk-ops',
    name: 'Risk Ops',
    description: 'Investigates risk posture and coordinates follow-up.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5.4',
    role_key: 'risk_ops',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Explains risk posture, trade exposure, and follow-up options.',
    human_owner_role: 'Risk Manager',
    authority_ceiling: 'STAGE',
    activation_notes: 'Stops before any unreviewed external commitment.',
    orchestration_pattern: 'MANAGER',
    parent_agent_id: 'control-tower',
    managed_agent_ids: ['settlement-ops'],
    delegation_guidance: 'Escalate unresolved exceptions and consult settlement when workflow evidence is missing.',
    profile_request_id: null,
    allowed_workspaces: ['assistant', 'trades', 'risk'],
    capabilities: ['READ', 'EXPLAIN', 'ACTION'],
    skills: ['risk_monitoring', 'inter_agent_consultation'],
    allowed_tools: ['trade_lookup'],
    allowed_action_types: ['update_trade_workflow_item'],
    daily_token_allocation: 9000,
    token_budget: {
      status: 'AMBER',
      allocated_tokens: 9000,
      used_tokens: 7200,
      remaining_tokens: 1800,
      percent_used: 80,
      warning_threshold_percent: 80,
      allocation_source: 'AGENT',
      window_started_at: '2026-05-16T00:00:00Z',
      reset_at: '2026-05-17T00:00:00Z',
    },
    effective_policy: {
      allowed_tools: [
        {
          resource_type: 'tool',
          resource_id: 'trade_lookup',
          policy_key: 'risk.trade_lookup',
          allowed: true,
          reason: 'Risk review can inspect trade details.',
          risk_level: 'LOW',
        },
      ],
      blocked_tools: [],
      allowed_actions: [
        {
          resource_type: 'action',
          resource_id: 'update_trade_workflow_item',
          policy_key: 'risk.workflow_update',
          allowed: true,
          reason: 'Workflow updates stay review-gated.',
          risk_level: 'MEDIUM',
        },
      ],
      blocked_actions: [],
      policy_notes: ['Stage-only workflow updates.'],
    },
    eval_gate: {
      status: 'BLOCKED',
      role_key: 'risk_ops',
      required_cases: ['risk-review', 'workflow-update'],
      covered_cases: ['risk-review'],
      missing_cases: ['workflow-update'],
      custom_case_count: 0,
      notes: [],
    },
  },
  {
    agent_id: 'settlement-ops',
    name: 'Settlement Ops',
    description: 'Follows downstream settlement evidence and breaks.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    role_key: 'settlement_ops',
    profile_kind: 'CUSTOM',
    specialization_summary: 'Tracks settlement evidence and break resolution.',
    human_owner_role: 'Settlement Lead',
    authority_ceiling: 'DRAFT',
    activation_notes: null,
    orchestration_pattern: 'SINGLE',
    parent_agent_id: 'risk-ops',
    managed_agent_ids: [],
    delegation_guidance: 'Return evidence to the requesting supervisor.',
    profile_request_id: null,
    allowed_workspaces: ['assistant', 'settlement'],
    capabilities: ['READ', 'EXPLAIN'],
    skills: ['risk_monitoring'],
    allowed_tools: ['trade_lookup'],
    allowed_action_types: [],
    daily_token_allocation: 4000,
    token_budget: {
      status: 'GREEN',
      allocated_tokens: 4000,
      used_tokens: 1200,
      remaining_tokens: 2800,
      percent_used: 30,
      warning_threshold_percent: 80,
      allocation_source: 'AGENT',
      window_started_at: '2026-05-16T00:00:00Z',
      reset_at: '2026-05-17T00:00:00Z',
    },
    effective_policy: {
      allowed_tools: [],
      blocked_tools: [],
      allowed_actions: [],
      blocked_actions: [],
      policy_notes: [],
    },
    eval_gate: {
      status: 'PASS',
      role_key: 'settlement_ops',
      required_cases: ['settlement-review'],
      covered_cases: ['settlement-review'],
      missing_cases: [],
      custom_case_count: 0,
      notes: [],
    },
  },
] satisfies AssistantAgent[]

describe('AssistantAgentDirectoryPanel', () => {
  it('renders a read-only construction and hierarchy view for the selected agent', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantAgentDirectoryPanel, {
        agents,
        runtimeSettings,
        selectedAgentId: 'risk-ops',
        onSelectAgent: () => undefined,
      }),
    )

    expect(markup).toContain('Agent Directory')
    expect(markup).toContain('Risk Ops')
    expect(markup).toContain('Explains risk posture, trade exposure, and follow-up options.')
    expect(markup).toContain('Risk Manager')
    expect(markup).toContain('STAGE')
    expect(markup).toContain('Risk Monitoring')
    expect(markup).toContain('Inter-Agent Consultation')
    expect(markup).toContain('Update Trade Workflow Item')
    expect(markup).toContain('Control Tower')
    expect(markup).toContain('Settlement Ops')
    expect(markup).toContain('workflow-update')
    expect(markup).toContain('1 allowed tool')
  })

  it('falls back to a platform-foundation review view when no named agent is selected', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantAgentDirectoryPanel, {
        agents,
        runtimeSettings,
        selectedAgentId: '',
        onSelectAgent: () => undefined,
      }),
    )

    expect(markup).toContain('Platform Foundation')
    expect(markup).toContain('No named role or specialization is pinned')
    expect(markup).toContain('Published reusable specialties are available to named agents')
    expect(markup).toContain('trade_lookup')
    expect(markup).toContain('market_snapshot')
  })
})
