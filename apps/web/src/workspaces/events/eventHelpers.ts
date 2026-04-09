import type { EventRow } from '../../shared/models'
import { tradeAggregateType } from '../../shared/trading'

const EVENT_FILTER_LABELS: Record<string, string> = {
  ALL: 'All events',
  SELECTED: 'Selected trade',
  TradeCreated: 'TradeCreated',
  TradeAmended: 'TradeAmended',
  TradeCancelled: 'TradeCancelled',
}

export const ALL_EVENT_TYPES = 'ALL_TYPES'
export const DEFAULT_VISIBLE_EVENT_COUNT = 12

export type EventTypeOption = {
  value: string
  count: number
}

export function isTradeLinkedEvent(event: Pick<EventRow, 'aggregate_type' | 'aggregate_id'>) {
  return event.aggregate_type === tradeAggregateType && event.aggregate_id.trim().length > 0
}

export function formatEventScopeLabel(eventFilter: string, selectedTradeId: string | null) {
  if (eventFilter !== 'SELECTED') {
    return EVENT_FILTER_LABELS[eventFilter] ?? eventFilter
  }

  return selectedTradeId ? `Selected trade (${selectedTradeId})` : 'Selected trade (none selected)'
}

export function buildEventTypeOptions<T extends Pick<EventRow, 'event_type'>>(events: T[]): EventTypeOption[] {
  return Object.entries(
    events.reduce<Record<string, number>>((counts, event) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }))
}

export function filterEventRows<
  T extends Pick<
    EventRow,
    'aggregate_type' | 'aggregate_id' | 'event_type' | 'actor_id' | 'correlation_id' | 'causation_id' | 'event_id' | 'schema_version'
  >,
>(
  events: T[],
  {
    eventTypeFilter,
    searchQuery,
  }: {
    eventTypeFilter: string
    searchQuery: string
  },
) {
  const searchTokens = searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return events.filter((event) => {
    if (eventTypeFilter !== ALL_EVENT_TYPES && event.event_type !== eventTypeFilter) {
      return false
    }

    if (searchTokens.length === 0) {
      return true
    }

    const searchableText = [
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      event.actor_id ?? 'system',
      event.event_id,
      event.correlation_id ?? '',
      event.causation_id ?? '',
      `v${event.schema_version}`,
    ]
      .join(' ')
      .toLowerCase()

    return searchTokens.every((token) => searchableText.includes(token))
  })
}
