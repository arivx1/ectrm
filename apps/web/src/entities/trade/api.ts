import { postJson } from '../../shared/api'

type TradeEventRequest = {
  aggregate_id: string
  event_type: 'TradeCreated' | 'TradeAmended' | 'TradeCancelled'
  actor_id: string
  payload: Record<string, unknown>
}

export async function submitTradeEvent(apiBase: string, request: TradeEventRequest) {
  return postJson(`${apiBase}/events`, {
    aggregate_type: 'trade',
    aggregate_id: request.aggregate_id,
    event_type: request.event_type,
    occurred_at: new Date().toISOString(),
    actor_id: request.actor_id,
    payload: request.payload,
    schema_version: 1,
  }, {
    headers: {
      'x-correlation-id': crypto.randomUUID(),
    },
  })
}
