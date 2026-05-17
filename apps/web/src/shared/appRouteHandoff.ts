import type { InspectorTab, ViewKey } from './models'

export type AppRouteHandoffSource = 'events' | 'assistant' | 'map' | 'reference' | 'terminal'
export type AppRouteHandoffFocusType =
  | 'trade'
  | 'workflow_item'
  | 'document'
  | 'invoice'
  | 'payment'
  | 'reference_record'
  | 'market_instrument'
  | 'report'

export type AppRouteHandoffFocus = {
  type: AppRouteHandoffFocusType
  id: string
  label: string | null
}

export type AppRouteHandoff = {
  source: AppRouteHandoffSource
  tradeId: string
  focus: AppRouteHandoffFocus
  tradeInspectorTab: InspectorTab | null
  eventType: string | null
  label: string | null
  rationale: string | null
  filter: string | null
  sourceRunId: number | null
  sourceConversationId: number | null
  sourceActionRequestId: number | null
}

type AppRouteHandoffInput = {
  source?: unknown
  tradeId?: unknown
  focus?: unknown
  focusType?: unknown
  focusId?: unknown
  focusLabel?: unknown
  tradeInspectorTab?: unknown
  eventType?: unknown
  label?: unknown
  rationale?: unknown
  filter?: unknown
  sourceRunId?: unknown
  sourceConversationId?: unknown
  sourceActionRequestId?: unknown
}

const APP_ROUTE_HANDOFF_PARAM = 'handoff'
const APP_ROUTE_HANDOFF_TRADE_PARAM = 'focusTrade'
const APP_ROUTE_HANDOFF_FOCUS_TYPE_PARAM = 'focusType'
const APP_ROUTE_HANDOFF_FOCUS_ID_PARAM = 'focusId'
const APP_ROUTE_HANDOFF_FOCUS_LABEL_PARAM = 'focusLabel'
const APP_ROUTE_HANDOFF_TRADE_TAB_PARAM = 'tradeTab'
const APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM = 'eventType'
const APP_ROUTE_HANDOFF_LABEL_PARAM = 'handoffLabel'
const APP_ROUTE_HANDOFF_REASON_PARAM = 'handoffReason'
const APP_ROUTE_HANDOFF_FILTER_PARAM = 'focusFilter'
const APP_ROUTE_HANDOFF_RUN_PARAM = 'assistantRun'
const APP_ROUTE_HANDOFF_CONVERSATION_PARAM = 'assistantConversation'
const APP_ROUTE_HANDOFF_ACTION_REQUEST_PARAM = 'actionRequest'

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

function normalizeInspectorTab(value: unknown): InspectorTab | null {
  switch (value) {
    case 'overview':
    case 'events':
    case 'amend':
    case 'risk':
      return value
    default:
      return null
  }
}

function normalizeHandoffSource(value: unknown): AppRouteHandoffSource | null {
  switch (value) {
    case 'events':
    case 'assistant':
    case 'map':
    case 'reference':
    case 'terminal':
      return value
    default:
      return null
  }
}

function normalizeHandoffFocusType(value: unknown): AppRouteHandoffFocusType | null {
  switch (value) {
    case 'trade':
    case 'workflow_item':
    case 'document':
    case 'invoice':
    case 'payment':
    case 'reference_record':
    case 'market_instrument':
    case 'report':
      return value
    default:
      return null
  }
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }
  const parsedValue = Number(trimmedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function normalizeHandoffFocus(value: AppRouteHandoffInput): AppRouteHandoffFocus | null {
  const candidateFocus =
    typeof value.focus === 'object' && value.focus !== null
      ? (value.focus as { type?: unknown; id?: unknown; label?: unknown })
      : null
  const focusType =
    normalizeHandoffFocusType(candidateFocus?.type) ??
    normalizeHandoffFocusType(value.focusType) ??
    'trade'
  const focusId =
    normalizeOptionalText(candidateFocus?.id) ??
    normalizeOptionalText(value.focusId) ??
    normalizeOptionalText(value.tradeId)

  if (!focusId) {
    return null
  }

  return {
    type: focusType,
    id: focusId,
    label: normalizeOptionalText(candidateFocus?.label) ?? normalizeOptionalText(value.focusLabel),
  }
}

export function normalizeAppRouteHandoff(
  value: AppRouteHandoffInput | null | undefined,
): AppRouteHandoff | null {
  if (!value) {
    return null
  }

  const source = normalizeHandoffSource(value.source)
  if (!source) {
    return null
  }

  const focus = normalizeHandoffFocus(value)
  if (!focus) {
    return null
  }

  return {
    source,
    tradeId: focus.type === 'trade' ? focus.id : normalizeOptionalText(value.tradeId) ?? focus.id,
    focus,
    tradeInspectorTab: normalizeInspectorTab(value.tradeInspectorTab),
    eventType: normalizeOptionalText(value.eventType),
    label: normalizeOptionalText(value.label),
    rationale: normalizeOptionalText(value.rationale),
    filter: normalizeOptionalText(value.filter),
    sourceRunId: normalizeOptionalNumber(value.sourceRunId),
    sourceConversationId: normalizeOptionalNumber(value.sourceConversationId),
    sourceActionRequestId: normalizeOptionalNumber(value.sourceActionRequestId),
  }
}

export function readAppRouteHandoff(params: URLSearchParams): AppRouteHandoff | null {
  return normalizeAppRouteHandoff({
    source: params.get(APP_ROUTE_HANDOFF_PARAM),
    tradeId: params.get(APP_ROUTE_HANDOFF_TRADE_PARAM),
    focusType: params.get(APP_ROUTE_HANDOFF_FOCUS_TYPE_PARAM),
    focusId: params.get(APP_ROUTE_HANDOFF_FOCUS_ID_PARAM),
    focusLabel: params.get(APP_ROUTE_HANDOFF_FOCUS_LABEL_PARAM),
    tradeInspectorTab: params.get(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM),
    eventType: params.get(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM),
    label: params.get(APP_ROUTE_HANDOFF_LABEL_PARAM),
    rationale: params.get(APP_ROUTE_HANDOFF_REASON_PARAM),
    filter: params.get(APP_ROUTE_HANDOFF_FILTER_PARAM),
    sourceRunId: params.get(APP_ROUTE_HANDOFF_RUN_PARAM),
    sourceConversationId: params.get(APP_ROUTE_HANDOFF_CONVERSATION_PARAM),
    sourceActionRequestId: params.get(APP_ROUTE_HANDOFF_ACTION_REQUEST_PARAM),
  })
}

export function writeAppRouteHandoff(params: URLSearchParams, handoff: AppRouteHandoff | null): void {
  params.delete(APP_ROUTE_HANDOFF_PARAM)
  params.delete(APP_ROUTE_HANDOFF_TRADE_PARAM)
  params.delete(APP_ROUTE_HANDOFF_FOCUS_TYPE_PARAM)
  params.delete(APP_ROUTE_HANDOFF_FOCUS_ID_PARAM)
  params.delete(APP_ROUTE_HANDOFF_FOCUS_LABEL_PARAM)
  params.delete(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM)
  params.delete(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM)
  params.delete(APP_ROUTE_HANDOFF_LABEL_PARAM)
  params.delete(APP_ROUTE_HANDOFF_REASON_PARAM)
  params.delete(APP_ROUTE_HANDOFF_FILTER_PARAM)
  params.delete(APP_ROUTE_HANDOFF_RUN_PARAM)
  params.delete(APP_ROUTE_HANDOFF_CONVERSATION_PARAM)
  params.delete(APP_ROUTE_HANDOFF_ACTION_REQUEST_PARAM)

  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return
  }

  params.set(APP_ROUTE_HANDOFF_PARAM, normalizedHandoff.source)
  if (normalizedHandoff.focus.type === 'trade') {
    params.set(APP_ROUTE_HANDOFF_TRADE_PARAM, normalizedHandoff.tradeId)
  } else {
    params.set(APP_ROUTE_HANDOFF_FOCUS_TYPE_PARAM, normalizedHandoff.focus.type)
    params.set(APP_ROUTE_HANDOFF_FOCUS_ID_PARAM, normalizedHandoff.focus.id)
    if (normalizedHandoff.focus.label) {
      params.set(APP_ROUTE_HANDOFF_FOCUS_LABEL_PARAM, normalizedHandoff.focus.label)
    }
    if (normalizedHandoff.tradeId && normalizedHandoff.tradeId !== normalizedHandoff.focus.id) {
      params.set(APP_ROUTE_HANDOFF_TRADE_PARAM, normalizedHandoff.tradeId)
    }
  }
  if (normalizedHandoff.tradeInspectorTab) {
    params.set(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM, normalizedHandoff.tradeInspectorTab)
  }
  if (normalizedHandoff.eventType) {
    params.set(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM, normalizedHandoff.eventType)
  }
  if (normalizedHandoff.label) {
    params.set(APP_ROUTE_HANDOFF_LABEL_PARAM, normalizedHandoff.label)
  }
  if (normalizedHandoff.rationale) {
    params.set(APP_ROUTE_HANDOFF_REASON_PARAM, normalizedHandoff.rationale)
  }
  if (normalizedHandoff.filter) {
    params.set(APP_ROUTE_HANDOFF_FILTER_PARAM, normalizedHandoff.filter)
  }
  if (normalizedHandoff.sourceRunId !== null) {
    params.set(APP_ROUTE_HANDOFF_RUN_PARAM, String(normalizedHandoff.sourceRunId))
  }
  if (normalizedHandoff.sourceConversationId !== null) {
    params.set(APP_ROUTE_HANDOFF_CONVERSATION_PARAM, String(normalizedHandoff.sourceConversationId))
  }
  if (normalizedHandoff.sourceActionRequestId !== null) {
    params.set(APP_ROUTE_HANDOFF_ACTION_REQUEST_PARAM, String(normalizedHandoff.sourceActionRequestId))
  }
}

export function getAppRouteHandoffKey(handoff: AppRouteHandoff | null): string | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return null
  }

  return [
    normalizedHandoff.source,
    normalizedHandoff.focus.type,
    normalizedHandoff.focus.id,
    normalizedHandoff.tradeInspectorTab ?? '',
    normalizedHandoff.eventType ?? '',
    normalizedHandoff.sourceRunId ?? '',
    normalizedHandoff.sourceConversationId ?? '',
  ].join(':')
}

export function getAppRouteHandoffFilterValue(handoff: AppRouteHandoff | null): string | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  return normalizedHandoff?.filter ?? normalizedHandoff?.focus.id ?? null
}

export function getAppRouteHandoffTradeId(handoff: AppRouteHandoff | null): string | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  return normalizedHandoff?.focus.type === 'trade' ? normalizedHandoff.focus.id : null
}

type RailRouteWorkspaceHandoffTarget = 'shipments' | 'scheduling'
type RailRouteWorkspaceHandoffSource = Extract<AppRouteHandoffSource, 'map' | 'reference'>

export function buildRailRouteWorkspaceHandoff(args: {
  source: RailRouteWorkspaceHandoffSource
  railRouteCode: string
  railRouteLabel?: string | null
  targetView: RailRouteWorkspaceHandoffTarget
}): AppRouteHandoff {
  const { source, railRouteCode, railRouteLabel = null, targetView } = args
  const normalizedRailRouteCode = railRouteCode.trim().toUpperCase()
  const focusLabel = railRouteLabel?.trim() || normalizedRailRouteCode
  const workspaceLabel = targetView === 'shipments' ? 'deliveries' : 'scheduling'
  const rowLabel = targetView === 'shipments' ? 'deliveries' : 'scheduling rows'
  const sourceDetail = source === 'map' ? 'selected' : 'selected reference-data'

  return {
    source,
    tradeId: normalizedRailRouteCode,
    focus: {
      type: 'reference_record',
      id: normalizedRailRouteCode,
      label: focusLabel,
    },
    tradeInspectorTab: null,
    eventType: null,
    label: `Open ${workspaceLabel} for ${normalizedRailRouteCode}`,
    rationale:
      `This workspace started focused on the ${sourceDetail} rail route so you can review the matching ${rowLabel} before widening back to the full board.`,
    filter: normalizedRailRouteCode,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  }
}

export function viewAppliesAppRouteHandoffFilter(view: ViewKey): boolean {
  return view === 'operations' || view === 'settlement' || view === 'shipments' || view === 'scheduling'
}

function formatFocusType(focusType: AppRouteHandoffFocusType): string {
  switch (focusType) {
    case 'trade':
      return 'trade'
    case 'workflow_item':
      return 'workflow item'
    case 'reference_record':
      return 'reference record'
    case 'market_instrument':
      return 'market instrument'
    default:
      return focusType
  }
}

export function describeAppRouteHandoff(
  handoff: AppRouteHandoff | null,
  currentView: ViewKey,
): { title: string; detail: string } | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return null
  }

  const focusLabel = normalizedHandoff.focus.label ?? normalizedHandoff.focus.id
  if (normalizedHandoff.source === 'assistant') {
    const sourceLabel = normalizedHandoff.sourceRunId
      ? `Assistant run #${normalizedHandoff.sourceRunId}`
      : 'Assistant'
    return {
      title: normalizedHandoff.label ?? `Opened from ${sourceLabel} for ${focusLabel}`,
      detail:
        normalizedHandoff.rationale ??
        `This workspace opened with ${formatFocusType(normalizedHandoff.focus.type)} ${focusLabel} in focus. Clear the focus when you are ready to return to the full workspace.`,
    }
  }

  if (normalizedHandoff.source === 'map' || normalizedHandoff.source === 'reference') {
    const sourceLabel = normalizedHandoff.source === 'map' ? 'Map' : 'Reference Data'
    return {
      title: normalizedHandoff.label ?? `Opened from ${sourceLabel} for ${focusLabel}`,
      detail:
        normalizedHandoff.rationale ??
        `This workspace opened with ${formatFocusType(normalizedHandoff.focus.type)} ${focusLabel} in focus. Clear the focus when you are ready to return to the full workspace.`,
    }
  }

  if (normalizedHandoff.source === 'terminal') {
    return {
      title: normalizedHandoff.label ?? `Opened from Terminal Search for ${focusLabel}`,
      detail:
        normalizedHandoff.rationale ??
        `Terminal search opened with ${formatFocusType(normalizedHandoff.focus.type)} ${focusLabel} in focus. Clear the focus when you are ready to widen back to the full workspace.`,
    }
  }

  const title = `Opened from Activity Feed for ${normalizedHandoff.tradeId}`
  switch (currentView) {
    case 'operations':
      return {
        title,
        detail:
          'This workspace started focused on that trade so you can clear the matching queue items before widening back to the full book.',
      }
    case 'settlement':
      return {
        title,
        detail:
          'This workspace started focused on that trade so invoice, payment, and dispute follow-through stay anchored to the same issue.',
      }
    case 'trades':
      return {
        title,
        detail:
          normalizedHandoff.tradeInspectorTab === 'amend'
            ? 'Trade Capture opened on the amend panel so you can review the latest economics and workflow changes in context.'
            : 'Trade Capture opened directly on the same trade so you can confirm the latest lifecycle state before taking the next step.',
      }
    case 'shipments':
      return {
        title,
        detail:
          'Deliveries opened focused on that trade so you can review the matching physical obligations before widening back to the full board.',
      }
    default:
      return null
  }
}
