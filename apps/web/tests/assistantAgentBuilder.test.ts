import { describe, expect, it } from 'vitest'

import {
  buildAgentBuilderDraft,
  createEmptyAgentBuilderDraft,
  suggestAgentBuilderAgentId,
} from '../src/workspaces/admin/assistantAgentBuilder'

describe('assistant agent builder helpers', () => {
  it('normalizes agent ids from free-form names', () => {
    expect(suggestAgentBuilderAgentId('  Trade Explainer / Ops  ')).toBe('trade-explainer-ops')
    expect(suggestAgentBuilderAgentId('Desk   Briefing+++Lead')).toBe('desk-briefing-lead')
  })

  it('builds template drafts with only the currently published tool subset', () => {
    const draft = buildAgentBuilderDraft('ops-coordinator', [
      'list_workflow_items',
      'list_deliveries',
      'list_trade_confirmations',
      'unused_tool',
    ])

    expect(draft.agent_id).toBe('ops-coordinator')
    expect(draft.scope).toBe('TEAM')
    expect(draft.allowed_workspaces).toEqual([
      'assistant',
      'shipments',
      'scheduling',
      'operations',
      'settlement',
    ])
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT'])
    expect(draft.allowed_tools).toEqual([
      'list_workflow_items',
      'list_deliveries',
      'list_trade_confirmations',
    ])
    expect(draft.system_prompt).toContain('Ops Coordinator')
    expect(draft.system_prompt).toContain('Guardrails')
    expect(draft.allowed_action_types).toEqual([])
  })

  it('falls back to an empty tool subset when runtime settings are not loaded yet', () => {
    const draft = buildAgentBuilderDraft('desk-briefing', [])

    expect(draft.allowed_tools).toEqual([])
    expect(draft.allowed_action_types).toEqual([])
    expect(draft.allowed_workspaces).toEqual(['assistant', 'dashboard', 'risk', 'positions', 'reports'])
  })

  it('includes governed action types for action-scoped templates', () => {
    const draft = buildAgentBuilderDraft('trade-ops-copilot', ['get_trade_workbench', 'list_documents'])

    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.allowed_tools).toEqual(['get_trade_workbench', 'list_documents'])
    expect(draft.allowed_action_types).toEqual([
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
      'reprocess_document_ingestion',
    ])
  })

  it('returns a fresh empty draft each time', () => {
    const first = createEmptyAgentBuilderDraft()
    const second = createEmptyAgentBuilderDraft()

    first.allowed_workspaces.push('trades')

    expect(second.allowed_workspaces).toEqual(['assistant'])
    expect(second.capabilities).toEqual(['READ', 'EXPLAIN'])
    expect(second.allowed_action_types).toEqual([])
  })
})
