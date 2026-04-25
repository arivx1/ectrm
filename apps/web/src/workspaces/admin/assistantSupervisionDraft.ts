import type {
  AssistantAgentWorkPackageStatus,
  AssistantControlTowerAgentTrustSignal,
} from '../../shared/models'

import type { AgentBuilderDraft } from './assistantAgentBuilder'

export type AssistantControlTowerSupervisionMode = 'pause' | 'narrow'

type AssistantControlTowerIntentBase = {
  intent_id: number
  agent_id: string
  agent_name: string | null
  signal_type: AssistantControlTowerAgentTrustSignal['signal_type']
}

export type AssistantControlTowerAgentSupervisionIntent = AssistantControlTowerIntentBase & {
  kind: 'agent_supervision'
  mode: AssistantControlTowerSupervisionMode
}

export type AssistantControlTowerWorkPackageReviewIntent = AssistantControlTowerIntentBase & {
  kind: 'work_package_review'
  work_package_filters: {
    source_agent_id?: string
    status?: '' | AssistantAgentWorkPackageStatus
    stale_only?: boolean
  }
}

export type AssistantControlTowerSupervisionIntent =
  | AssistantControlTowerAgentSupervisionIntent
  | AssistantControlTowerWorkPackageReviewIntent

export function controlTowerSignalTypeLabel(
  signalType: AssistantControlTowerSupervisionIntent['signal_type'],
): string {
  switch (signalType) {
    case 'MISSING_EVAL_COVERAGE':
      return 'Missing eval coverage'
    case 'POLICY_WARNING':
      return 'Policy warning'
    case 'RUN_WARNING':
      return 'Run warning'
    case 'ACTION_BACKLOG':
      return 'Action backlog'
    case 'FAILED_ACTIONS':
      return 'Failed actions'
    case 'STALE_WORK_PACKAGE':
      return 'Stale work package'
    default:
      return signalType
  }
}

export function controlTowerSupervisionModeLabel(
  mode: AssistantControlTowerSupervisionMode,
): string {
  return mode === 'pause' ? 'Pause agent' : 'Narrow scope'
}

export function buildControlTowerWorkPackageReviewIntent(
  signal: AssistantControlTowerAgentTrustSignal,
): AssistantControlTowerWorkPackageReviewIntent {
  return {
    intent_id: Date.now(),
    agent_id: signal.agent_id,
    agent_name: signal.agent_name,
    signal_type: signal.signal_type,
    kind: 'work_package_review',
    work_package_filters: {
      source_agent_id: signal.agent_id,
      stale_only: signal.signal_type === 'STALE_WORK_PACKAGE',
    },
  }
}

export function buildControlTowerSupervisionNote(
  intent: AssistantControlTowerAgentSupervisionIntent,
  preparedOn: string,
): string {
  const signalLabel = controlTowerSignalTypeLabel(intent.signal_type)
  if (intent.mode === 'pause') {
    return [
      `[Control Tower pause draft · ${preparedOn}]`,
      `Prepared from ${signalLabel.toLowerCase()}.`,
      'Human supervisor should review and save the pause before more work is assigned.',
    ].join(' ')
  }

  return [
    `[Control Tower narrowing draft · ${preparedOn}]`,
    `Prepared from ${signalLabel.toLowerCase()}.`,
    'Human supervisor should narrow tools, actions, or capabilities explicitly before saving.',
  ].join(' ')
}

export function applyControlTowerSupervisionDraft(
  form: AgentBuilderDraft,
  intent: AssistantControlTowerAgentSupervisionIntent,
  preparedOn: string,
): AgentBuilderDraft {
  return {
    ...form,
    status: intent.mode === 'pause' ? 'PAUSED' : form.status,
    activation_notes: appendUniqueAuditNote(
      form.activation_notes,
      buildControlTowerSupervisionNote(intent, preparedOn),
    ),
  }
}

function appendUniqueAuditNote(existing: string, note: string): string {
  const trimmedExisting = existing.trim()
  if (!trimmedExisting) {
    return note
  }
  if (trimmedExisting.includes(note)) {
    return trimmedExisting
  }
  return `${trimmedExisting}\n\n${note}`
}
