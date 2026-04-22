import type { InspectorTab, ViewKey } from './models'

export type AppRouteHandoffSource = 'events'

export type AppRouteHandoff = {
  source: AppRouteHandoffSource
  tradeId: string
  tradeInspectorTab: InspectorTab | null
  eventType: string | null
}

type AppRouteHandoffInput = {
  source?: unknown
  tradeId?: unknown
  tradeInspectorTab?: unknown
  eventType?: unknown
}

const APP_ROUTE_HANDOFF_PARAM = 'handoff'
const APP_ROUTE_HANDOFF_TRADE_PARAM = 'focusTrade'
const APP_ROUTE_HANDOFF_TRADE_TAB_PARAM = 'tradeTab'
const APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM = 'eventType'

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

export function normalizeAppRouteHandoff(
  value: AppRouteHandoffInput | null | undefined,
): AppRouteHandoff | null {
  if (value?.source !== 'events') {
    return null
  }

  const tradeId = normalizeOptionalText(value.tradeId)
  if (!tradeId) {
    return null
  }

  return {
    source: 'events',
    tradeId,
    tradeInspectorTab: normalizeInspectorTab(value.tradeInspectorTab),
    eventType: normalizeOptionalText(value.eventType),
  }
}

export function readAppRouteHandoff(params: URLSearchParams): AppRouteHandoff | null {
  return normalizeAppRouteHandoff({
    source: params.get(APP_ROUTE_HANDOFF_PARAM),
    tradeId: params.get(APP_ROUTE_HANDOFF_TRADE_PARAM),
    tradeInspectorTab: params.get(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM),
    eventType: params.get(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM),
  })
}

export function writeAppRouteHandoff(params: URLSearchParams, handoff: AppRouteHandoff | null): void {
  params.delete(APP_ROUTE_HANDOFF_PARAM)
  params.delete(APP_ROUTE_HANDOFF_TRADE_PARAM)
  params.delete(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM)
  params.delete(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM)

  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return
  }

  params.set(APP_ROUTE_HANDOFF_PARAM, normalizedHandoff.source)
  params.set(APP_ROUTE_HANDOFF_TRADE_PARAM, normalizedHandoff.tradeId)
  if (normalizedHandoff.tradeInspectorTab) {
    params.set(APP_ROUTE_HANDOFF_TRADE_TAB_PARAM, normalizedHandoff.tradeInspectorTab)
  }
  if (normalizedHandoff.eventType) {
    params.set(APP_ROUTE_HANDOFF_EVENT_TYPE_PARAM, normalizedHandoff.eventType)
  }
}

export function getAppRouteHandoffKey(handoff: AppRouteHandoff | null): string | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return null
  }

  return `${normalizedHandoff.source}:${normalizedHandoff.tradeId}:${normalizedHandoff.tradeInspectorTab ?? ''}:${normalizedHandoff.eventType ?? ''}`
}

export function describeAppRouteHandoff(
  handoff: AppRouteHandoff | null,
  currentView: ViewKey,
): { title: string; detail: string } | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (!normalizedHandoff) {
    return null
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
    default:
      return null
  }
}
