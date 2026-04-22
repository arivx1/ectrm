import { patchJson, postJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type { TradeWorkflowItemRecord } from '../../shared/models'

export type CreateTradeWorkflowItemInput = {
  trade_id: string
  workflow_type: string
  status?: string | null
  owner?: string | null
  due_at?: string | null
  notes?: string | null
}

export type UpdateTradeWorkflowItemInput = {
  status?: string | null
  owner?: string | null
  due_at?: string | null
  notes?: string | null
}

function operationsHeaders(): Headers {
  return buildMutationHeaders()
}

export async function createTradeWorkflowItem(
  apiBase: string,
  payload: CreateTradeWorkflowItemInput,
): Promise<TradeWorkflowItemRecord> {
  return postJson<TradeWorkflowItemRecord>(`${apiBase}/operations/work-items`, payload, {
    headers: operationsHeaders(),
  })
}

export async function updateTradeWorkflowItem(
  apiBase: string,
  itemId: number,
  payload: UpdateTradeWorkflowItemInput,
): Promise<TradeWorkflowItemRecord> {
  return patchJson<TradeWorkflowItemRecord>(
    `${apiBase}/operations/work-items/${itemId}`,
    payload as Record<string, unknown>,
    {
      headers: operationsHeaders(),
    },
  )
}

export async function bookOptionSettlementUnderlying(
  apiBase: string,
  itemId: number,
): Promise<TradeWorkflowItemRecord> {
  return postJson<TradeWorkflowItemRecord>(
    `${apiBase}/operations/work-items/${itemId}/book-underlying`,
    {},
    {
      headers: operationsHeaders(),
    },
  )
}
