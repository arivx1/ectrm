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
}

export async function submitTradeEvent(apiBase: string, request: TradeEventRequest) {
  const { actorId } = getMutationContext()
  return postJson(`${apiBase}/events`, {
    aggregate_type: tradeAggregateType,
    aggregate_id: request.aggregate_id,
    event_type: request.event_type,
    occurred_at: new Date().toISOString(),
    actor_id: actorId,
    payload: request.payload,
    schema_version: currentTradeEventSchemaVersion,
  }, {
    headers: buildMutationHeaders({ 'x-correlation-id': crypto.randomUUID() }),
  })
}
