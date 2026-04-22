import { isViewKey, workspaceLabel } from './appViews'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import type { InspectorTab, ViewKey } from '../../shared/models'

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
  inspectorTab?: InspectorTab
  sourceRunId?: number
  sourceConversationId?: number
  sourceActionRequestId?: number
}

type PromptNavigationIntentInput = {
  kind?: unknown
  targetView?: unknown
  target_view?: unknown
  label?: unknown
  rationale?: unknown
  filter?: unknown
  focus?: unknown
  inspectorTab?: unknown
  tradeInspectorTab?: unknown
  inspector_tab?: unknown
  trade_inspector_tab?: unknown
  sourceRunId?: unknown
  source_run_id?: unknown
  sourceConversationId?: unknown
  source_conversation_id?: unknown
  sourceActionRequestId?: unknown
  source_action_request_id?: unknown
}

type PromptNavigationIntentDefaults = {
  sourceRunId?: number | null
  sourceConversationId?: number | null
  sourceActionRequestId?: number | null
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

function normalizeInspectorTab(value: unknown): InspectorTab | undefined {
  switch (value) {
    case 'overview':
    case 'events':
    case 'amend':
    case 'risk':
      return value
    default:
      return undefined
  }
}

function normalizeOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizePromptNavigationIntent(
  value: PromptNavigationIntentInput | null | undefined,
  defaults: PromptNavigationIntentDefaults = {},
): PromptNavigationIntent | null {
  const targetView = typeof value?.targetView === 'string' ? value.targetView : value?.target_view
  if (value?.kind !== 'open_workspace' || typeof targetView !== 'string' || !isViewKey(targetView)) {
    return null
  }

  const sourceRunId =
    normalizeOptionalFiniteNumber(value.sourceRunId) ??
    normalizeOptionalFiniteNumber(value.source_run_id) ??
    defaults.sourceRunId ??
    undefined
  const sourceConversationId =
    normalizeOptionalFiniteNumber(value.sourceConversationId) ??
    normalizeOptionalFiniteNumber(value.source_conversation_id) ??
    defaults.sourceConversationId ??
    undefined
  const sourceActionRequestId =
    normalizeOptionalFiniteNumber(value.sourceActionRequestId) ??
    normalizeOptionalFiniteNumber(value.source_action_request_id) ??
    defaults.sourceActionRequestId ??
    undefined

  return {
    kind: 'open_workspace',
    targetView,
    label: normalizeOptionalText(value.label),
    rationale: normalizeOptionalText(value.rationale),
    filter: normalizeOptionalText(value.filter),
    focus: normalizePromptNavigationFocus(value.focus),
    inspectorTab:
      normalizeInspectorTab(value.inspectorTab) ??
      normalizeInspectorTab(value.tradeInspectorTab) ??
      normalizeInspectorTab(value.inspector_tab) ??
      normalizeInspectorTab(value.trade_inspector_tab),
    sourceRunId,
    sourceConversationId,
    sourceActionRequestId,
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

function candidateInputsFromParsedJson(value: unknown): PromptNavigationIntentInput[] {
  if (Array.isArray(value)) {
    return value.flatMap(candidateInputsFromParsedJson)
  }
  if (typeof value !== 'object' || value === null) {
    return []
  }

  const record = value as {
    navigation_intent?: unknown
    navigation_intents?: unknown
    navigationIntent?: unknown
    navigationIntents?: unknown
  }
  const nestedIntent =
    record.navigation_intent ?? record.navigationIntent
  if (nestedIntent) {
    return candidateInputsFromParsedJson(nestedIntent)
  }
  const nestedIntents =
    record.navigation_intents ?? record.navigationIntents
  if (nestedIntents) {
    return candidateInputsFromParsedJson(nestedIntents)
  }
  return [value as PromptNavigationIntentInput]
}

function parseNavigationIntentBlock(
  rawBlock: string,
  defaults: PromptNavigationIntentDefaults,
): PromptNavigationIntent[] {
  try {
    const parsedValue: unknown = JSON.parse(rawBlock)
    return candidateInputsFromParsedJson(parsedValue)
      .map((candidate) => normalizePromptNavigationIntent(candidate, defaults))
      .filter((intent): intent is PromptNavigationIntent => intent !== null)
  } catch {
    return []
  }
}

export function parsePromptNavigationIntentsFromAssistantContent(
  content: string,
  defaults: PromptNavigationIntentDefaults = {},
): { content: string; intents: PromptNavigationIntent[] } {
  const intents: PromptNavigationIntent[] = []
  const strippedContent = content.replace(
    /```(?:navigation_intent|navigation_intents|json)\s*([\s\S]*?)```/gi,
    (block, rawBlock: string) => {
      const parsedIntents = parseNavigationIntentBlock(rawBlock, defaults)
      if (parsedIntents.length === 0) {
        return block
      }
      intents.push(...parsedIntents)
      return ''
    },
  )

  return {
    content: strippedContent.trim(),
    intents,
  }
}

export function buildPromptNavigationRouteHandoff(intent: PromptNavigationIntent): AppRouteHandoff | null {
  if (!intent.focus) {
    return null
  }

  return {
    source: 'assistant',
    tradeId: intent.focus.type === 'trade' ? intent.focus.id : intent.focus.id,
    focus: {
      type: intent.focus.type,
      id: intent.focus.id,
      label: intent.focus.label ?? null,
    },
    tradeInspectorTab: intent.inspectorTab ?? null,
    eventType: null,
    label: promptNavigationIntentLabel(intent),
    rationale: intent.rationale ?? null,
    filter: intent.filter ?? null,
    sourceRunId: intent.sourceRunId ?? null,
    sourceConversationId: intent.sourceConversationId ?? null,
    sourceActionRequestId: intent.sourceActionRequestId ?? null,
  }
}
