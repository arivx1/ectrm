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
  maximum_action_types: [
    'record_delivery_event',
    'reverse_delivery_event',
    'issue_trade_confirmation',
    'record_trade_confirmation_response',
    'update_trade_workflow_item',
    'record_trade_actualization',
    'void_trade_actualization',
  ],
  authority_ceiling: 'EXECUTE',
  approval_rules: ['Operations Lead audits executed actions.'],
  stop_conditions: ['Evidence is ambiguous.'],
  success_metrics: ['Higher approval hit rate.'],
  required_eval_coverage: ['Allowed action execution.', 'Denied overreach.'],
  base_prompt_guidance: ['Lead with the blocker.', 'Show evidence before staging.'],
  current_profile_ids: ['trade-ops-copilot'],
}

describe('assistant agent builder helpers', () => {
  it('normalizes agent ids from free-form names', () => {
    expect(suggestAgentBuilderAgentId('  Trade Explainer / Ops  ')).toBe('trade-explainer-ops')
    expect(suggestAgentBuilderAgentId('Desk   Briefing+++Lead')).toBe('desk-briefing-lead')
  })

  it('builds role preset drafts with only the currently published tool subset', () => {
    const draft = buildAgentBuilderDraft('market-research-agent', [
      'get_market_context',
      'analyze_pretrade_scenario_draft',
      'unused_tool',
    ])

    expect(draft.agent_id).toBe('market-research-agent')
    expect(draft.role_key).toBe('market-research-agent')
    expect(draft.profile_kind).toBe('ROLE_DERIVED')
    expect(draft.human_owner_role).toBe('Desk Lead')
    expect(draft.authority_ceiling).toBe('DRAFT')
    expect(draft.scope).toBe('ORGANIZATION')
    expect(draft.allowed_workspaces).toEqual([
      'assistant',
      'dashboard',
      'risk',
      'positions',
      'reports',
    ])
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT'])
    expect(draft.allowed_tools).toEqual([
      'get_market_context',
      'analyze_pretrade_scenario_draft',
    ])
    expect(draft.system_prompt).toContain('Market Research Agent')
    expect(draft.system_prompt).toContain('Guardrails')
    expect(draft.allowed_action_types).toEqual([])
    expect(draft.activation_notes).toContain('platform role catalog')
  })

  it('falls back to an empty tool subset when runtime settings are not loaded yet', () => {
    const draft = buildAgentBuilderDraft('pre-trade-structuring-agent', [])

    expect(draft.allowed_tools).toEqual([])
    expect(draft.allowed_action_types).toEqual([])
    expect(draft.allowed_workspaces).toEqual([
      'assistant',
      'trades',
      'risk',
      'positions',
      'reports',
      'reference',
    ])
    expect(draft.role_key).toBe('pre-trade-structuring-agent')
  })

  it('includes governed action types for action-scoped role presets', () => {
    const draft = buildAgentBuilderDraft('trade-ops-copilot', ['get_trade_workbench', 'list_documents'])

    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.role_key).toBe('trade-ops-copilot')
    expect(draft.profile_kind).toBe('ROLE_DERIVED')
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual(['get_trade_workbench', 'list_documents'])
    expect(draft.allowed_action_types).toEqual([
      'record_delivery_event',
      'reverse_delivery_event',
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
      'record_trade_actualization',
      'void_trade_actualization',
      'reprocess_document_ingestion',
    ])
  })

  it('includes governed reprocessing authority for the seeded document role', () => {
    const draft = buildAgentBuilderDraft('document-agent', ['list_documents', 'get_document_ingestion'])

    expect(draft.role_key).toBe('document-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.allowed_tools).toEqual(['list_documents', 'get_document_ingestion'])
    expect(draft.allowed_action_types).toEqual(['reprocess_document_ingestion'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.activation_notes).toContain('platform role catalog')
  })

  it('includes bounded movement execution authority for the movement controller preset', () => {
    const draft = buildAgentBuilderDraft('movement-controller-agent', [
      'list_deliveries',
      'get_document_ingestion',
      'get_workspace_summary',
    ])

    expect(draft.role_key).toBe('movement-controller-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual([
      'list_deliveries',
      'get_document_ingestion',
      'get_workspace_summary',
    ])
    expect(draft.allowed_action_types).toEqual([
      'record_delivery_event',
      'reverse_delivery_event',
      'record_trade_actualization',
      'void_trade_actualization',
      'update_trade_workflow_item',
    ])
  })

  it('includes settlement correction authority for the settlement copilot preset', () => {
    const draft = buildAgentBuilderDraft('settlement-copilot', [
      'list_trade_invoices',
      'list_trade_payments',
      'get_trade_settlement_summary',
    ])

    expect(draft.role_key).toBe('settlement-copilot')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual([
      'list_trade_invoices',
      'list_trade_payments',
      'get_trade_settlement_summary',
    ])
    expect(draft.allowed_action_types).toEqual([
      'issue_trade_invoice',
      'void_trade_invoice',
      'create_trade_payment',
      'reverse_trade_payment',
    ])
  })

  it('includes governed trade lifecycle execution for the trade capture preset', () => {
    const draft = buildAgentBuilderDraft('trade-capture-agent', ['get_trade_by_id', 'list_trade_events'])

    expect(draft.role_key).toBe('trade-capture-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual(['get_trade_by_id', 'list_trade_events'])
    expect(draft.allowed_action_types).toEqual(['create_trade', 'amend_trade', 'cancel_trade'])
  })

  it('includes accounting posting execution authority for the posting controller preset', () => {
    const draft = buildAgentBuilderDraft('accounting-posting-agent', [
      'list_trade_invoices',
      'list_accrual_entries',
      'list_accounting_entries',
    ])

    expect(draft.role_key).toBe('accounting-posting-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual([
      'list_trade_invoices',
      'list_accrual_entries',
      'list_accounting_entries',
    ])
    expect(draft.allowed_action_types).toEqual(['create_accounting_entry', 'reverse_accounting_entry'])
  })

  it('includes manual accrual execution authority for the accrual controller preset', () => {
    const draft = buildAgentBuilderDraft('accrual-controller-agent', [
      'list_accrual_lots',
      'list_accrual_entries',
      'get_accrual_reconciliation',
    ])

    expect(draft.role_key).toBe('accrual-controller-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual([
      'list_accrual_lots',
      'list_accrual_entries',
      'get_accrual_reconciliation',
    ])
    expect(draft.allowed_action_types).toEqual(['create_manual_accrual_entry', 'reverse_accrual_entry'])
  })

  it('includes confirmation execution authority for the confirmation controller preset', () => {
    const draft = buildAgentBuilderDraft('confirmation-controller-agent', [
      'list_trade_confirmations',
      'list_workflow_items',
      'unused_tool',
    ])

    expect(draft.role_key).toBe('confirmation-controller-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual(['list_trade_confirmations', 'list_workflow_items'])
    expect(draft.allowed_action_types).toEqual([
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
    ])
  })

  it('includes invoice correction authority for the invoice controller preset', () => {
    const draft = buildAgentBuilderDraft('invoice-controller-agent', [
      'list_trade_invoices',
      'get_trade_settlement_summary',
    ])

    expect(draft.role_key).toBe('invoice-controller-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_tools).toEqual(['list_trade_invoices', 'get_trade_settlement_summary'])
    expect(draft.allowed_action_types).toEqual(['issue_trade_invoice', 'void_trade_invoice'])
  })

  it('keeps control tower presets supervision-only with no governed actions', () => {
    const draft = buildAgentBuilderDraft('control-tower-agent', ['get_workspace_summary'])

    expect(draft.role_key).toBe('control-tower-agent')
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT'])
    expect(draft.authority_ceiling).toBe('DRAFT')
    expect(draft.allowed_tools).toEqual(['get_workspace_summary'])
    expect(draft.allowed_action_types).toEqual([])
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
    expect(draft.authority_ceiling).toBe('EXECUTE')
    expect(draft.allowed_workspaces).toEqual(['assistant', 'trades', 'operations'])
    expect(draft.capabilities).toEqual(['READ', 'EXPLAIN', 'DRAFT', 'ACTION'])
    expect(draft.allowed_tools).toEqual(['get_trade_workbench', 'list_workflow_items'])
    expect(draft.allowed_action_types).toEqual([
      'record_delivery_event',
      'reverse_delivery_event',
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
      'record_trade_actualization',
      'void_trade_actualization',
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
      authority_ceiling: 'EXTERNAL_COMMIT',
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
