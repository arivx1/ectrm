import type { EventRow } from '../../shared/models'
import { tradeAggregateType } from '../../shared/trading'

const EVENT_FILTER_LABELS: Record<string, string> = {
  ALL: 'All events',
  SELECTED: 'Selected trade',
  TradeCreated: 'TradeCreated',
  TradeAmended: 'TradeAmended',
  TradeCancelled: 'TradeCancelled',
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
