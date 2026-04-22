import { patchJson, postJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type { TradeConfirmationRecord } from '../../shared/models'

export type CreateTradeConfirmationInput = {
  trade_id: string
  source_document_id?: string | null
  confirmation_number?: string | null
  status?: string | null
  sent_at?: string | null
  confirmed_at?: string | null
  dispute_reason?: string | null
  notes?: string | null
  comparison_waiver_note?: string | null
}

export type UpdateTradeConfirmationInput = {
  source_document_id?: string | null
  confirmation_number?: string | null
  status?: string | null
  sent_at?: string | null
  confirmed_at?: string | null
  dispute_reason?: string | null
  notes?: string | null
  comparison_waiver_note?: string | null
}

export type IssueTradeConfirmationInput = {
  issued_at?: string | null
  issue_method?: string | null
  issue_recipient?: string | null
  issue_note?: string | null
}

export type RespondTradeConfirmationInput = {
  action: 'RECEIVED' | 'COUNTERPARTY_CONFIRMED' | 'COUNTERPARTY_DISPUTED'
  received_at?: string | null
  response_method?: string | null
  response_reference?: string | null
  response_note?: string | null
  dispute_reason?: string | null
}

function confirmationHeaders(): Headers {
  return buildMutationHeaders()
}

export async function createTradeConfirmation(
  apiBase: string,
  payload: CreateTradeConfirmationInput,
): Promise<TradeConfirmationRecord> {
  return postJson<TradeConfirmationRecord>(`${apiBase}/confirmations`, payload, {
    headers: confirmationHeaders(),
  })
}

export async function updateTradeConfirmation(
  apiBase: string,
  confirmationId: number,
  payload: UpdateTradeConfirmationInput,
): Promise<TradeConfirmationRecord> {
  return patchJson<TradeConfirmationRecord>(
    `${apiBase}/confirmations/${confirmationId}`,
    payload as Record<string, unknown>,
    {
      headers: confirmationHeaders(),
    },
  )
}

export async function issueTradeConfirmation(
  apiBase: string,
  confirmationId: number,
  payload: IssueTradeConfirmationInput,
): Promise<TradeConfirmationRecord> {
  return postJson<TradeConfirmationRecord>(
    `${apiBase}/confirmations/${confirmationId}/issue`,
    payload as Record<string, unknown>,
    {
      headers: confirmationHeaders(),
    },
  )
}

export async function respondTradeConfirmation(
  apiBase: string,
  confirmationId: number,
  payload: RespondTradeConfirmationInput,
): Promise<TradeConfirmationRecord> {
  return postJson<TradeConfirmationRecord>(
    `${apiBase}/confirmations/${confirmationId}/response`,
    payload as Record<string, unknown>,
    {
      headers: confirmationHeaders(),
    },
  )
}
