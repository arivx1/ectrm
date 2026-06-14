import assert from 'node:assert/strict'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { AssistantWorkspace } from '../src/workspaces/assistant/AssistantWorkspace'
import { TokenAnalysisWorkspace } from '../src/workspaces/assistant/TokenAnalysisWorkspace'
import { buildAssistantAgentAccessSummary } from '../src/workspaces/assistant/assistantWorkspaceAccessSummary'
import type { AssistantAgent, AssistantRuntimeSettings } from '../src/shared/models'

test('assistant workspace renders the grounded prompt console on the server', () => {
  const markup = renderToStaticMarkup(
    createElement(AssistantWorkspace, {
      authSession: null,
      globalFilter: '',
      health: 'ok',
      trades: [],
      events: [],
      positions: [],
      selectedTrade: null,
      selectedTradeEvents: [],
      onOpenSettings: () => undefined,
      onRefreshData: async () => undefined,
    }),
  )

  assert.match(markup, /Grounded Prompt Console/)
  assert.match(markup, />Voice Unavailable</)
  assert.doesNotMatch(markup, /Token Tracker/)
})

test('token analysis workspace renders token usage without the assistant console chrome', () => {
  const markup = renderToStaticMarkup(createElement(TokenAnalysisWorkspace))

  assert.match(markup, /Token Tracker/)
  assert.match(markup, /Usage by period/)
  assert.doesNotMatch(markup, /Grounded Prompt Console/)
})

describe('buildAssistantAgentAccessSummary', () => {
  const runtimeSettings = {
    available_tools: [
      {
        name: 'market_snapshot',
        description: 'Read the latest market snapshot.',
      },
      {
        name: 'trade_lookup',
        description: 'Read trade details.',
      },
    ],
  } satisfies Pick<AssistantRuntimeSettings, 'available_tools'>

  const selectedAgent = {
    agent_id: 'risk-ops',
    name: 'Risk Ops',
    description: 'Handles governed risk operations.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: 'openai',
    model: 'gpt-5.4',
    profile_kind: 'CUSTOM',
    orchestration_pattern: 'SINGLE',
    managed_agent_ids: [],
    allowed_workspaces: ['assistant', 'trades'],
    capabilities: ['READ', 'ACTION'],
    skills: ['risk_monitoring'],
    allowed_tools: ['trade_lookup'],
    allowed_action_types: ['update_trade_workflow_item'],
  } satisfies AssistantAgent

  test('reports actual selected-agent access instead of the global runtime catalog', () => {
    const summary = buildAssistantAgentAccessSummary(selectedAgent, runtimeSettings)

    expect(summary.heading).toBe('Risk Ops access')
    expect(summary.summary).toContain('1 live tool(s)')
    expect(summary.summary).toContain('1 governed action type(s)')
    expect(summary.summary).toContain('2 workspace(s)')
    expect(summary.detail).toContain('Tools: trade_lookup')
    expect(summary.detail).toContain('Actions: update_trade_workflow_item')
    expect(summary.detail).toContain('Workspaces: assistant · trades')
    expect(summary.detail).not.toContain('market_snapshot')
  })

  test('falls back to the platform foundation summary when no named agent is selected', () => {
    const summary = buildAssistantAgentAccessSummary(null, runtimeSettings)

    expect(summary.heading).toBe('Platform foundation access')
    expect(summary.summary).toContain('No named agent is selected')
    expect(summary.detail).toContain('Published runtime tools: market_snapshot · trade_lookup')
  })
})
