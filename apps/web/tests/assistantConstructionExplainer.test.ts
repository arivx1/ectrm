import { describe, expect, it } from 'vitest'

import { buildAssistantConstructionExplainer } from '../src/workspaces/assistant/assistantConstructionExplainer'
import type {
  AssistantAgent,
  AssistantPromptContext,
  AssistantPromptSection,
  AssistantRun,
  AssistantRuntimeSettings,
} from '../src/shared/models'

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
    allowed_tools: ['trade_lookup'],
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
    effective_policy: null,
    eval_gate: null,
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
    managed_agent_ids: [],
    delegation_guidance: 'Escalate unresolved exceptions when workflow evidence is missing.',
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
    effective_policy: null,
    eval_gate: null,
  },
] satisfies AssistantAgent[]

const previewSections = [
  {
    key: 'org',
    title: 'Organization contract',
    source: 'organization',
    scope: 'GLOBAL',
    content: 'Organization rules.',
  },
  {
    key: 'app',
    title: 'Selected trade context',
    source: 'application',
    scope: 'REQUEST',
    content: 'Trade details.',
  },
  {
    key: 'agent',
    title: 'Risk Ops profile',
    source: 'agent',
    scope: 'AGENT',
    content: 'Managed profile guidance.',
  },
  {
    key: 'data',
    title: 'Live trade summary',
    source: 'data',
    scope: 'RUNTIME',
    content: 'Live data snapshot.',
  },
] satisfies AssistantPromptSection[]

const promptPreview = {
  agent_id: 'risk-ops',
  agent_name: 'Risk Ops',
  agent_role_key: 'risk_ops',
  agent_profile_kind: 'ROLE_DERIVED',
  provider: 'openai',
  model: 'gpt-5.4',
  generated_at: '2026-05-16T16:00:00Z',
  warnings: [],
  sections: previewSections,
  rendered_system_prompt: 'Prompt body',
} satisfies AssistantPromptContext

describe('buildAssistantConstructionExplainer', () => {
  it('summarizes the next request with agent, access, and context layers', () => {
    const explainer = buildAssistantConstructionExplainer({
      activeAgent: agents[1],
      activeAgentName: promptPreview.agent_name ?? null,
      activeAgentRoleKey: promptPreview.agent_role_key ?? null,
      activeAgentProfileKind: promptPreview.agent_profile_kind ?? null,
      promptPreview,
      selectedRun: null,
      activeGroundingSections: previewSections,
      includeContext: true,
      useLiveTools: true,
      runtimeSettings,
      agentRoster: agents,
    })

    expect(explainer.heading).toBe('Next request construction')
    expect(explainer.summary).toContain('openai · gpt-5.4')
    expect(explainer.cards.find((card) => card.key === 'agent-layer')?.summary).toContain('Risk Ops')
    expect(explainer.cards.find((card) => card.key === 'access')?.details.join(' ')).toContain('trade_lookup')
    expect(explainer.cards.find((card) => card.key === 'skills-capabilities')?.chips).toContain('Risk Monitoring')
    expect(explainer.sourceGroups.map((group) => group.label)).toEqual([
      'Organization guidance',
      'Application context',
      'Managed agent overlay',
      'Operational data',
    ])
  })

  it('summarizes a stored run even when no named agent is active in the current composer state', () => {
    const selectedRun = {
      conversation_id: 12,
      run_id: 77,
      status: 'COMPLETED',
      created_at: '2026-05-16T15:00:00Z',
      completed_at: '2026-05-16T15:01:00Z',
      user_id: 'ops.user',
      user_role: 'TRADER',
      workspace: 'assistant',
      agent_id: null,
      agent_name: null,
      agent_role_key: null,
      agent_profile_kind: null,
      provider: 'openai',
      model: 'gpt-5.4-mini',
      use_live_tools: false,
      warning_count: 0,
      tool_call_count: 0,
      input_tokens: 10,
      output_tokens: 20,
      latest_user_message: 'Explain this trade.',
      assistant_message: 'Here is the explanation.',
      error_detail: null,
      request_messages: [],
      application_context: null,
      prompt_sections: previewSections.slice(0, 2),
      rendered_system_prompt: 'Prompt body',
      warnings: [],
      tool_calls: [],
    } satisfies AssistantRun

    const explainer = buildAssistantConstructionExplainer({
      activeAgent: null,
      activeAgentName: selectedRun.agent_name ?? null,
      activeAgentRoleKey: selectedRun.agent_role_key ?? null,
      activeAgentProfileKind: selectedRun.agent_profile_kind ?? null,
      promptPreview,
      selectedRun,
      activeGroundingSections: selectedRun.prompt_sections,
      includeContext: true,
      useLiveTools: true,
      runtimeSettings,
      agentRoster: agents,
    })

    expect(explainer.heading).toBe('Stored run construction')
    expect(explainer.summary).toContain('run #77')
    expect(explainer.cards.find((card) => card.key === 'request-lens')?.details).toContain(
      'Live tools: Disabled',
    )
    expect(explainer.cards.find((card) => card.key === 'agent-layer')?.summary).toContain(
      'No named agent overlay is selected',
    )
    expect(explainer.sourceGroups.map((group) => group.label)).toEqual([
      'Organization guidance',
      'Application context',
    ])
  })
})
