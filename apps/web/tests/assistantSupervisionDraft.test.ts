import { describe, expect, it } from 'vitest'

import {
  applyControlTowerSupervisionDraft,
  buildControlTowerWorkPackageReviewIntent,
  buildControlTowerSupervisionNote,
  controlTowerSignalTypeLabel,
  type AssistantControlTowerAgentSupervisionIntent,
} from '../src/workspaces/admin/assistantSupervisionDraft'
import type { AgentBuilderDraft } from '../src/workspaces/admin/assistantAgentBuilder'

function buildDraft(overrides: Partial<AgentBuilderDraft> = {}): AgentBuilderDraft {
  return {
    agent_id: 'ops-agent',
    name: 'Ops Agent',
    description: 'Coordinates operational follow-through.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    role_key: 'ops-coordinator',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Team specialization',
    human_owner_role: 'Operations Lead',
    authority_ceiling: 'STAGE',
    activation_notes: 'Existing note',
    profile_request_id: null,
    allowed_workspaces: ['assistant', 'operations'],
    capabilities: ['READ', 'EXPLAIN', 'ACTION'],
    allowed_tools: ['list_workflow_items'],
    allowed_action_types: ['update_workflow_status'],
    daily_token_allocation: '',
    system_prompt: 'Prompt',
    ...overrides,
  }
}

function buildIntent(
  overrides: Partial<AssistantControlTowerAgentSupervisionIntent> = {},
): AssistantControlTowerAgentSupervisionIntent {
  return {
    intent_id: 101,
    agent_id: 'ops-agent',
    agent_name: 'Ops Agent',
    signal_type: 'POLICY_WARNING',
    kind: 'agent_supervision',
    mode: 'pause',
    ...overrides,
  }
}

describe('assistantSupervisionDraft', () => {
  it('turns a pause draft into a paused audited edit', () => {
    const draft = buildDraft()
    const intent = buildIntent()

    const nextDraft = applyControlTowerSupervisionDraft(draft, intent, '2026-04-23')

    expect(nextDraft.status).toBe('PAUSED')
    expect(nextDraft.activation_notes).toContain('Existing note')
    expect(nextDraft.activation_notes).toContain('Control Tower pause draft')
    expect(nextDraft.activation_notes).toContain('policy warning')
  })

  it('keeps narrowing drafts at the current status and avoids duplicate notes', () => {
    const intent = buildIntent({
      intent_id: 102,
      signal_type: 'RUN_WARNING',
      mode: 'narrow',
    })
    const note = buildControlTowerSupervisionNote(intent, '2026-04-23')
    const draft = buildDraft({
      activation_notes: note,
    })

    const nextDraft = applyControlTowerSupervisionDraft(draft, intent, '2026-04-23')

    expect(nextDraft.status).toBe('ACTIVE')
    expect(nextDraft.activation_notes).toBe(note)
  })

  it('formats control tower signal labels for supervision copy', () => {
    expect(controlTowerSignalTypeLabel('FAILED_ACTIONS')).toBe('Failed actions')
    expect(controlTowerSignalTypeLabel('MISSING_EVAL_COVERAGE')).toBe('Missing eval coverage')
    expect(controlTowerSignalTypeLabel('STALE_WORK_PACKAGE')).toBe('Stale work package')
  })

  it('builds a stale work package review intent for backlog drill-down', () => {
    const intent = buildControlTowerWorkPackageReviewIntent({
      agent_id: 'watch-agent',
      agent_name: 'Watch Agent',
      status: 'ACTIVE',
      role_key: null,
      profile_kind: 'CUSTOM',
      signal_type: 'STALE_WORK_PACKAGE',
      severity: 'warning',
      summary: '1 work package is stale.',
      details: ['Accepted stale package'],
      pending_action_count: 0,
      failed_action_count: 0,
      warning_run_count: 0,
      eval_status: 'NOT_REQUIRED',
    })

    expect(intent.kind).toBe('work_package_review')
    expect(intent.agent_id).toBe('watch-agent')
    expect(intent.work_package_filters.source_agent_id).toBe('watch-agent')
    expect(intent.work_package_filters.stale_only).toBe(true)
  })
})
