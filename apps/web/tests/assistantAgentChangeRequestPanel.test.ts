import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AssistantAgentChangeRequestPanel } from '../src/workspaces/assistant/AssistantAgentChangeRequestPanel'
import type { AssistantAgent, AssistantRuntimeSettings } from '../src/shared/models'
import type { StoredAuthSession } from '../src/shared/mutation'

const runtimeSettings = {
  available_skills: [
    {
      name: 'risk_monitoring',
      label: 'Risk Monitoring',
      description: 'Review trade and position risk signals.',
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
    agent_id: 'risk-ops',
    name: 'Risk Ops',
    description: 'Investigates risk posture and coordinates follow-up.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5.4',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Explains risk posture and next-step options.',
    human_owner_role: 'Risk Manager',
    authority_ceiling: 'STAGE',
    orchestration_pattern: 'MANAGER',
    managed_agent_ids: [],
    allowed_workspaces: ['assistant', 'trades'],
    capabilities: ['READ', 'EXPLAIN', 'ACTION'],
    skills: ['risk_monitoring'],
    allowed_tools: ['trade_lookup'],
    allowed_action_types: ['update_trade_workflow_item'],
  },
] satisfies AssistantAgent[]

const authSession = {
  sessionId: 'session-1',
  accessToken: 'token-1',
  expiresAt: '2099-01-01T00:00:00Z',
  user: {
    user_id: 'ops_requester',
    email: 'ops_requester@example.com',
    display_name: 'Ops Requester',
    role: 'OPS_USER',
    default_assistant_persona: 'operator',
  },
} satisfies StoredAuthSession

describe('AssistantAgentChangeRequestPanel', () => {
  it('asks unauthenticated users to sign in before requesting changes', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantAgentChangeRequestPanel, {
        authSession: null,
        agents,
        runtimeSettings,
        selectedAgentId: 'risk-ops',
        onSelectAgent: () => undefined,
      }),
    )

    expect(markup).toContain('Suggest agent changes')
    expect(markup).toContain('Sign in to submit governed change requests')
  })

  it('renders the governed request form for the selected agent', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantAgentChangeRequestPanel, {
        authSession,
        agents,
        runtimeSettings,
        selectedAgentId: 'risk-ops',
        onSelectAgent: () => undefined,
      }),
    )

    expect(markup).toContain('Suggest agent changes')
    expect(markup).toContain('Edit existing agent')
    expect(markup).toContain('Narrow access')
    expect(markup).toContain('My requests')
    expect(markup).toContain('Risk Ops')
    expect(markup).toContain('Risk Manager')
  })
})
