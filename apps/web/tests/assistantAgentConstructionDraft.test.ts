import { describe, expect, it } from 'vitest'

import {
  buildDraftConstructionDiffSummary,
  buildDraftPreviewAgent,
} from '../src/workspaces/admin/assistantAgentConstructionDraft'
import type { AssistantAdminAgent } from '../src/shared/models'
import type { AgentBuilderDraft } from '../src/workspaces/admin/assistantAgentBuilder'

const savedAgent = {
  agent_id: 'ops-governor',
  name: 'Ops Governor',
  description: 'Stages governed trade operations actions.',
  status: 'ACTIVE',
  scope: 'TEAM',
  provider: 'openai',
  model: 'gpt-5.4',
  role_key: 'trade-ops-copilot',
  profile_kind: 'ROLE_DERIVED',
  specialization_summary: 'Coordinate trade operations follow-through.',
  human_owner_role: 'Operations Lead',
  authority_ceiling: 'STAGE',
  activation_notes: 'Approved for staged action review.',
  orchestration_pattern: 'MANAGER',
  parent_agent_id: null,
  managed_agent_ids: ['pre-trade-structuring-agent'],
  delegation_guidance: 'Consult specialists when prompts shift into trade ideas.',
  profile_request_id: null,
  allowed_workspaces: ['assistant', 'admin', 'trades'],
  capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
  skills: ['trade_governance', 'inter_agent_consultation'],
  allowed_tools: ['get_trade_by_id'],
  allowed_action_types: ['cancel_trade'],
  daily_token_allocation: 50000,
  token_budget: undefined,
  effective_policy: null,
  eval_gate: null,
  system_prompt: 'Stage reviewable operations actions.',
  created_at: '2026-05-17T10:00:00Z',
  created_by: 'ops_admin',
  updated_at: '2026-05-17T10:00:00Z',
  updated_by: 'ops_admin',
  version: 4,
  latest_revision_id: 10,
  published_revision_id: 10,
  published_at: '2026-05-17T10:00:00Z',
  published_by: 'ops_admin',
  has_unpublished_revision: false,
} satisfies AssistantAdminAgent

const draft = {
  agent_id: savedAgent.agent_id,
  name: savedAgent.name,
  description: savedAgent.description,
  status: 'ACTIVE',
  scope: 'TEAM',
  provider: 'openai',
  model: 'gpt-5.4',
  role_key: 'trade-ops-copilot',
  profile_kind: 'ROLE_DERIVED',
  specialization_summary: savedAgent.specialization_summary,
  human_owner_role: 'Operations Lead',
  authority_ceiling: 'DRAFT',
  activation_notes: 'Narrowed after profile request review.',
  orchestration_pattern: 'MANAGER',
  parent_agent_id: '',
  managed_agent_ids: ['pre-trade-structuring-agent'],
  delegation_guidance: savedAgent.delegation_guidance,
  profile_request_id: 9001,
  allowed_workspaces: ['assistant', 'admin', 'trades'],
  capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
  skills: ['trade_governance', 'inter_agent_consultation'],
  allowed_tools: ['get_trade_by_id'],
  allowed_action_types: [],
  daily_token_allocation: '50000',
  system_prompt: savedAgent.system_prompt,
} satisfies AgentBuilderDraft

describe('assistant agent construction draft helpers', () => {
  it('summarizes pending construction changes before save', () => {
    const diff = buildDraftConstructionDiffSummary(savedAgent, draft)
    const diffByField = new Map(diff.map((row) => [row.field_key, row]))

    expect(diffByField.get('authority_ceiling')?.current_value).toBe('STAGE')
    expect(diffByField.get('authority_ceiling')?.next_value).toBe('DRAFT')
    expect(diffByField.get('allowed_action_types')?.current_value).toBe('cancel_trade')
    expect(diffByField.get('allowed_action_types')?.next_value).toBe('None')
    expect(diffByField.get('profile_request_id')?.next_value).toBe('9001')
  })

  it('builds a draft preview agent without mutating saved revision metadata', () => {
    const draftAgent = buildDraftPreviewAgent(savedAgent, draft)

    expect(draftAgent.has_unpublished_revision).toBe(true)
    expect(draftAgent.version).toBe(savedAgent.version)
    expect(draftAgent.authority_ceiling).toBe('DRAFT')
    expect(draftAgent.allowed_action_types).toEqual([])
    expect(draftAgent.profile_request_id).toBe(9001)
  })
})
