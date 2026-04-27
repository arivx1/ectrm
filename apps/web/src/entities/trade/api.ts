import { postJson } from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import {
  currentTradeEventSchemaVersion,
  type OptionLifecycleEventType,
  tradeAggregateType,
} from '../../shared/trading'

type TradeEventRequest = {
  aggregate_id: string
  event_type: 'TradeCreated' | 'TradeAmended' | 'TradeCancelled' | OptionLifecycleEventType
  payload: Record<string, unknown>
  command_type?: 'BookTrade' | 'AmendTradeTerms' | 'CancelTrade'
  command_id?: string
  expected_last_event_id?: string
  source_surface?: string
}

export async function submitTradeEvent(apiBase: string, request: TradeEventRequest) {
  const { actorId } = getMutationContext()
  return postJson(`${apiBase}/events`, {
    aggregate_type: tradeAggregateType,
    aggregate_id: request.aggregate_id,
    event_type: request.event_type,
    occurred_at: new Date().toISOString(),
    actor_id: actorId,
    ...(request.command_type ? { command_type: request.command_type } : {}),
    ...(request.command_id ? { command_id: request.command_id } : {}),
    ...(request.expected_last_event_id
      ? { expected_last_event_id: request.expected_last_event_id }
      : {}),
    ...(request.source_surface ? { source_surface: request.source_surface } : {}),
    payload: request.payload,
    schema_version: currentTradeEventSchemaVersion,
  }, {
    headers: buildMutationHeaders({ 'x-correlation-id': crypto.randomUUID() }),
  })
}

export async function submitBookTrade(
  apiBase: string,
  request: {
    trade_id: string
    payload: Record<string, unknown>
  },
) {
  return submitTradeEvent(apiBase, {
    aggregate_id: request.trade_id,
    event_type: 'TradeCreated',
    payload: request.payload,
    command_type: 'BookTrade',
    command_id: crypto.randomUUID(),
    source_surface: 'web.trades.create',
  })
}

export async function submitAmendTradeTerms(
  apiBase: string,
  request: {
    trade_id: string
    payload: Record<string, unknown>
    expected_last_event_id: string
  },
) {
  return submitTradeEvent(apiBase, {
    aggregate_id: request.trade_id,
    event_type: 'TradeAmended',
    payload: request.payload,
    command_type: 'AmendTradeTerms',
    command_id: crypto.randomUUID(),
    expected_last_event_id: request.expected_last_event_id,
    source_surface: 'web.trades.amend',
  })
}

export async function submitCancelTrade(
  apiBase: string,
  request: {
    trade_id: string
    payload: Record<string, unknown>
    expected_last_event_id: string
  },
) {
  return submitTradeEvent(apiBase, {
    aggregate_id: request.trade_id,
    event_type: 'TradeCancelled',
    payload: request.payload,
    command_type: 'CancelTrade',
    command_id: crypto.randomUUID(),
    expected_last_event_id: request.expected_last_event_id,
    source_surface: 'web.trades.cancel',
  })
}
