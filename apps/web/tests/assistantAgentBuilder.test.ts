import { describe, expect, it } from 'vitest'

import {
  buildAgentBuilderDraft,
  buildAgentBuilderDraftFromRole,
  createEmptyAgentBuilderDraft,
  evaluateAgentRoleProfileFit,
  suggestAgentBuilderAgentId,
} from '../src/workspaces/admin/assistantAgentBuilder'
import type { AssistantAgentRoleArchetype } from '../src/shared/models'

const tradeOpsRole: AssistantAgentRoleArchetype = {
  role_key: 'trade-ops-copilot',
  name: 'Trade Ops Copilot',
  description: 'Coordinates trade operations follow-through.',
  catalog_status: 'SEEDED',
  mission: ['Keep booked trades moving.', 'Stage the smallest justified action.'],
  human_owner_role: 'Operations Lead',
  allowed_workspaces: ['assistant', 'trades', 'operations'],
  work_objects: ['trade', 'workflow item'],
  capability_ceiling: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
  default_tools: ['get_trade_workbench', 'list_workflow_items', 'list_documents'],
  maximum_action_types: ['issue_trade_confirmation', 'update_trade_workflow_item'],
  authority_ceiling: 'STAGE',
  approval_rules: ['Operations Lead reviews staged actions.'],
  stop_conditions: ['Evidence is ambiguous.'],
  success_metrics: ['Higher approval hit rate.'],
  required_eval_coverage: ['Allowed action staging.', 'Denied overreach.'],
  base_prompt_guidance: ['Lead with the blocker.', 'Show evidence before staging.'],
  current_profile_ids: ['trade-ops-copilot'],
}

describe('assistant agent builder helpers', () => {
  it('normalizes agent ids from free-form names', () => {
    expect(suggestAgentBuilderAgentId('  Trade Explainer / Ops  ')).toBe('trade-explainer-ops')
    expect(suggestAgentBuilderAgentId('Desk   Briefing+++Lead')).toBe('desk-briefing-lead')
  })

  it('builds role preset drafts with only the currently published tool subset', () => {
    const draft = buildAgentBuilderDraft('ops-coordinator', [
      'list_workflow_items',
      'list_deliveries',
      'list_trade_confirmations',
      'unused_tool',
    ])

    expect(draft.agent_id).toBe('ops-coordinator')
    expect(draft.role_key).toBe('ops-coordinator')
    expect(draft.profile_kind).toBe('ROLE_DERIVED')
    expect(draft.human_owner_role).toBe('Operations Lead')
    expect(draft.authority_ceiling).toBe('DRAFT')
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
    expect(draft.role_key).toBe('desk-briefing')
  })

  it('includes governed action types for action-scoped role presets', () => {
    const draft = buildAgentBuilderDraft('trade-ops-copilot', ['get_trade_workbench', 'list_documents'])

    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.role_key).toBe('trade-ops-copilot')
    expect(draft.profile_kind).toBe('ROLE_DERIVED')
    expect(draft.authority_ceiling).toBe('STAGE')
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
    expect(second.role_key).toBe('')
    expect(second.profile_kind).toBe('CUSTOM')
  })

  it('builds role-derived drafts from the server role catalog', () => {
    const draft = buildAgentBuilderDraftFromRole(tradeOpsRole, [
      'get_trade_workbench',
      'list_workflow_items',
      'unused_tool',
    ])

    expect(draft.agent_id).toBe('trade-ops-copilot-specialization')
    expect(draft.role_key).toBe('trade-ops-copilot')
    expect(draft.profile_kind).toBe('ROLE_DERIVED')
    expect(draft.human_owner_role).toBe('Operations Lead')
    expect(draft.authority_ceiling).toBe('STAGE')
    expect(draft.allowed_workspaces).toEqual(['assistant', 'trades', 'operations'])
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.allowed_tools).toEqual(['get_trade_workbench', 'list_workflow_items'])
    expect(draft.allowed_action_types).toEqual([
      'issue_trade_confirmation',
      'update_trade_workflow_item',
    ])
    expect(draft.system_prompt).toContain('Role mission')
    expect(draft.system_prompt).toContain('Stop conditions')
  })

  it('summarizes narrowed role-derived profiles without blocking save', () => {
    const draft = {
      ...buildAgentBuilderDraftFromRole(tradeOpsRole, tradeOpsRole.default_tools),
      allowed_workspaces: ['assistant', 'operations'],
      capabilities: ['READ', 'EXPLAIN', 'ACTION'],
      allowed_tools: ['get_trade_workbench'],
      allowed_action_types: ['update_trade_workflow_item'],
      authority_ceiling: 'STAGE',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toEqual([])
    expect(fit.sections.find((section) => section.label === 'Workspaces')?.status).toBe('narrowed')
    expect(fit.sections.find((section) => section.label === 'Live tools')?.status).toBe('narrowed')
    expect(fit.sections.find((section) => section.label === 'Governed actions')?.status).toBe('narrowed')
  })

  it('blocks role profile expansion before save', () => {
    const draft = {
      ...buildAgentBuilderDraftFromRole(tradeOpsRole, tradeOpsRole.default_tools),
      allowed_workspaces: ['assistant', 'settlement'],
      allowed_tools: ['list_trade_invoices'],
      authority_ceiling: 'EXECUTE',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toContain('Workspaces exceed the Trade Ops Copilot role boundary.')
    expect(fit.errors).toContain('Live tools exceed the Trade Ops Copilot role boundary.')
    expect(fit.errors).toContain('Authority exceeds the Trade Ops Copilot role boundary.')
  })

  it('requires explicit governed actions for action-capable drafts', () => {
    const draft = {
      ...buildAgentBuilderDraftFromRole(tradeOpsRole, tradeOpsRole.default_tools),
      allowed_action_types: [],
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toContain('ACTION-capable profiles need at least one explicit governed action.')
    expect(fit.sections.find((section) => section.label === 'Governed actions')?.status).toBe('missing')
  })

  it('allows custom profiles to stay draft-only before governance is complete', () => {
    const draft = {
      ...createEmptyAgentBuilderDraft(),
      name: 'Weather Dispatch Analyst',
      agent_id: 'weather-dispatch-analyst',
      description: 'Summarizes weather exceptions.',
      system_prompt: 'Summarize weather exceptions.',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toEqual([])
    expect(fit.sections.find((section) => section.label === 'Profile source')?.status).toBe(
      'customized',
    )
  })

  it('blocks active custom profiles without approved request governance', () => {
    const draft = {
      ...createEmptyAgentBuilderDraft(),
      name: 'Weather Dispatch Analyst',
      agent_id: 'weather-dispatch-analyst',
      description: 'Summarizes weather exceptions.',
      status: 'ACTIVE',
      human_owner_role: 'Operations Lead',
      authority_ceiling: 'DRAFT',
      activation_notes: 'Prompt reviewed.',
      system_prompt: 'Summarize weather exceptions.',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toContain('Active custom profiles need an approved profile request or role mapping.')
  })

  it('requires request-backed eval coverage for action-capable active custom profiles', () => {
    const draft = {
      ...createEmptyAgentBuilderDraft(),
      status: 'ACTIVE',
      human_owner_role: 'Operations Lead',
      authority_ceiling: 'STAGE',
      activation_notes: 'Prompt reviewed.',
      capabilities: ['READ', 'EXPLAIN', 'ACTION'],
      allowed_action_types: ['update_trade_workflow_item'],
      system_prompt: 'Stage supported workflow updates only.',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toContain('Action-capable custom profiles need an approved profile request with eval coverage.')
  })

  it('requires specialization eval coverage before custom profiles exceed draft authority', () => {
    const draft = {
      ...createEmptyAgentBuilderDraft(),
      status: 'ACTIVE',
      human_owner_role: 'Operations Lead',
      authority_ceiling: 'STAGE',
      activation_notes: 'Prompt reviewed.',
      capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
      system_prompt: 'Draft and stage exception follow-up only after evidence review.',
    }

    const fit = evaluateAgentRoleProfileFit(draft, [tradeOpsRole])

    expect(fit.errors).toContain(
      'Custom profiles above draft-only authority need an approved specialization-specific eval case.',
    )
  })
})
