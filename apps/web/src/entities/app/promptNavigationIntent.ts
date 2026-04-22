import { isViewKey, workspaceLabel } from './appViews'
import type { ViewKey } from '../../shared/models'

export type PromptNavigationIntentKind = 'open_workspace'

export type PromptNavigationFocus = {
  type: 'trade' | 'workflow_item' | 'document' | 'invoice' | 'payment' | 'reference_record' | 'report'
  id: string
  label?: string
}

export type PromptNavigationIntent = {
  kind: PromptNavigationIntentKind
  targetView: ViewKey
  label?: string
  rationale?: string
  filter?: string
  focus?: PromptNavigationFocus
  sourceRunId?: number
}

type PromptNavigationIntentInput = {
  kind?: unknown
  targetView?: unknown
  label?: unknown
  rationale?: unknown
  filter?: unknown
  focus?: unknown
  sourceRunId?: unknown
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue || undefined
}

function normalizePromptNavigationFocus(value: unknown): PromptNavigationFocus | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const candidate = value as { type?: unknown; id?: unknown; label?: unknown }
  const focusType = normalizeOptionalText(candidate.type)
  const focusId = normalizeOptionalText(candidate.id)
  if (!focusType || !focusId) {
    return undefined
  }

  switch (focusType) {
    case 'trade':
    case 'workflow_item':
    case 'document':
    case 'invoice':
    case 'payment':
    case 'reference_record':
    case 'report':
      return {
        type: focusType,
        id: focusId,
        label: normalizeOptionalText(candidate.label),
      }
    default:
      return undefined
  }
}

export function normalizePromptNavigationIntent(
  value: PromptNavigationIntentInput | null | undefined,
): PromptNavigationIntent | null {
  if (value?.kind !== 'open_workspace' || typeof value.targetView !== 'string' || !isViewKey(value.targetView)) {
    return null
  }

  const sourceRunId =
    typeof value.sourceRunId === 'number' && Number.isFinite(value.sourceRunId)
      ? value.sourceRunId
      : undefined

  return {
    kind: 'open_workspace',
    targetView: value.targetView,
    label: normalizeOptionalText(value.label),
    rationale: normalizeOptionalText(value.rationale),
    filter: normalizeOptionalText(value.filter),
    focus: normalizePromptNavigationFocus(value.focus),
    sourceRunId,
  }
}

export function promptNavigationIntentLabel(intent: PromptNavigationIntent): string {
  return intent.label ?? `Open ${workspaceLabel(intent.targetView)}`
}

export function promptNavigationIntentDetail(intent: PromptNavigationIntent): string {
  if (intent.rationale) {
    return intent.rationale
  }
  if (intent.focus?.label) {
    return `Open ${workspaceLabel(intent.targetView)} focused on ${intent.focus.label}.`
  }
  if (intent.filter) {
    return `Open ${workspaceLabel(intent.targetView)} with ${intent.filter} in focus.`
  }
  return `Open the ${workspaceLabel(intent.targetView)} workspace.`
}
