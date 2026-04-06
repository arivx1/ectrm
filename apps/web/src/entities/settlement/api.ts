import { patchJson, postJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type { TradeInvoiceRecord, TradePaymentRecord } from '../../shared/models'

export type CreateTradeInvoiceInput = {
  trade_id: string
  invoice_number?: string | null
  invoice_currency_code?: string | null
  invoice_amount?: number | null
  issued_at?: string | null
  due_at?: string | null
  notes?: string | null
}

export type UpdateTradeInvoiceInput = {
  invoice_number?: string | null
  invoice_currency_code?: string | null
  invoice_amount?: number | null
  status?: string | null
  issued_at?: string | null
  due_at?: string | null
  dispute_reason?: string | null
  notes?: string | null
}

export type CreateTradePaymentInput = {
  invoice_id: number
  payment_reference?: string | null
  payment_currency_code?: string | null
  payment_amount?: number | null
  status?: string | null
  due_at?: string | null
  received_at?: string | null
  notes?: string | null
}

export type UpdateTradePaymentInput = {
  payment_reference?: string | null
  payment_currency_code?: string | null
  payment_amount?: number | null
  status?: string | null
  due_at?: string | null
  received_at?: string | null
  notes?: string | null
}

function settlementHeaders(): Headers {
  return buildMutationHeaders()
}

export async function createTradeInvoice(
  apiBase: string,
  payload: CreateTradeInvoiceInput,
): Promise<TradeInvoiceRecord> {
  return postJson<TradeInvoiceRecord>(`${apiBase}/settlement/invoices`, payload, {
    headers: settlementHeaders(),
  })
}

export async function updateTradeInvoice(
  apiBase: string,
  invoiceId: number,
  payload: UpdateTradeInvoiceInput,
): Promise<TradeInvoiceRecord> {
  return patchJson<TradeInvoiceRecord>(
    `${apiBase}/settlement/invoices/${invoiceId}`,
    payload as Record<string, unknown>,
    {
      headers: settlementHeaders(),
    },
  )
}

export async function createTradePayment(
  apiBase: string,
  payload: CreateTradePaymentInput,
): Promise<TradePaymentRecord> {
  return postJson<TradePaymentRecord>(`${apiBase}/settlement/payments`, payload, {
    headers: settlementHeaders(),
  })
}

export async function updateTradePayment(
  apiBase: string,
  paymentId: number,
  payload: UpdateTradePaymentInput,
): Promise<TradePaymentRecord> {
  return patchJson<TradePaymentRecord>(
    `${apiBase}/settlement/payments/${paymentId}`,
    payload as Record<string, unknown>,
    {
      headers: settlementHeaders(),
    },
  )
}
