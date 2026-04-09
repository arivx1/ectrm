import { useState } from 'react'
import type { CreateTradePaymentInput, UpdateTradePaymentInput } from '../../entities/settlement/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { TradeInvoiceRecord, TradePaymentRecord, TradeWorkflowItemRecord } from '../../shared/models'
import { paymentStatusOptions } from '../../shared/trading'

type SettlementPaymentBoardProps = {
  authSession: StoredAuthSession | null
  invoices: TradeInvoiceRecord[]
  payments: TradePaymentRecord[]
  paymentWorkItems: TradeWorkflowItemRecord[]
  saveError: string
  savingKey: string | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatMoney: (value: number | null, currencyCode?: string | null) => string
  onCreatePayment: (invoiceId: number, payload: CreateTradePaymentInput) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSavePayment: (paymentId: number, payload: UpdateTradePaymentInput) => Promise<void>
}

type PaymentDraft = {
  paymentReference: string
  paymentCurrencyCode: string
  paymentAmount: string
  status: string
  dueAt: string
  receivedAt: string
  notes: string
}

const paymentRecordStatusOptions = paymentStatusOptions.filter((option) => option !== 'NOT_REQUIRED')

function buildPaymentDraft(invoice: TradeInvoiceRecord, payment?: TradePaymentRecord): PaymentDraft {
  return {
    paymentReference: payment?.payment_reference ?? '',
    paymentCurrencyCode: payment?.payment_currency_code ?? invoice.invoice_currency_code,
    paymentAmount: payment ? String(payment.payment_amount) : String(invoice.invoice_amount),
    status: payment?.status ?? (invoice.payment_status === 'PAID' ? 'PENDING' : invoice.payment_status),
    dueAt: payment?.due_at ? payment.due_at.slice(0, 10) : invoice.due_at.slice(0, 10),
    receivedAt: payment?.received_at ? payment.received_at.slice(0, 10) : '',
    notes: payment?.notes ?? '',
  }
}

function buildCreateDraft(invoice: TradeInvoiceRecord, payments: TradePaymentRecord[] = []): PaymentDraft {
  const templatePayment = payments[0]
  return {
    paymentReference: '',
    paymentCurrencyCode: invoice.invoice_currency_code,
    paymentAmount: String(templatePayment?.outstanding_amount ?? invoice.outstanding_amount),
    status: invoice.payment_status === 'PAID' ? 'PENDING' : invoice.payment_status,
    dueAt: invoice.due_at.slice(0, 10),
    receivedAt: '',
    notes: '',
  }
}

function toIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null
}

function buildCreatePayload(invoice: TradeInvoiceRecord, draft: PaymentDraft): CreateTradePaymentInput {
  const paymentAmount = Number.parseFloat(draft.paymentAmount)
  const payload: CreateTradePaymentInput = {
    invoice_id: invoice.invoice_id,
  }

  if (draft.paymentReference.trim()) {
    payload.payment_reference = draft.paymentReference.trim()
  }
  if (draft.paymentCurrencyCode.trim()) {
    payload.payment_currency_code = draft.paymentCurrencyCode.trim().toUpperCase()
  }
  if (Number.isFinite(paymentAmount)) {
    payload.payment_amount = paymentAmount
  }
  if (draft.status) {
    payload.status = draft.status
  }
  if (draft.dueAt) {
    payload.due_at = toIsoDate(draft.dueAt)
  }
  if (draft.receivedAt) {
    payload.received_at = toIsoDate(draft.receivedAt)
  }
  if (draft.notes.trim()) {
    payload.notes = draft.notes.trim()
  }

  return payload
}

function buildUpdatePayload(payment: TradePaymentRecord, draft: PaymentDraft): UpdateTradePaymentInput {
  const payload: UpdateTradePaymentInput = {}
  const paymentAmount = Number.parseFloat(draft.paymentAmount)

  if (draft.paymentReference.trim() !== payment.payment_reference) {
    payload.payment_reference = draft.paymentReference.trim() || null
  }
  if (draft.paymentCurrencyCode.trim().toUpperCase() !== payment.payment_currency_code) {
    payload.payment_currency_code = draft.paymentCurrencyCode.trim().toUpperCase() || null
  }
  if (Number.isFinite(paymentAmount) && paymentAmount !== payment.payment_amount) {
    payload.payment_amount = paymentAmount
  }
  if (draft.status !== payment.status) {
    payload.status = draft.status
  }
  if (draft.dueAt !== payment.due_at.slice(0, 10)) {
    payload.due_at = toIsoDate(draft.dueAt)
  }
  if (draft.receivedAt !== (payment.received_at ? payment.received_at.slice(0, 10) : '')) {
    payload.received_at = toIsoDate(draft.receivedAt)
  }
  if (draft.notes.trim() !== (payment.notes ?? '')) {
    payload.notes = draft.notes.trim() || null
  }

  return payload
}

function paymentTone(payment: TradePaymentRecord): 'active' | 'in-progress' | 'blocked' {
  if (payment.is_overdue || payment.status === 'OVERDUE') {
    return 'blocked'
  }
  if (payment.status === 'PAID') {
    return 'in-progress'
  }
  return 'active'
}

export function SettlementPaymentBoard({
  authSession,
  invoices,
  payments,
  paymentWorkItems,
  saveError,
  savingKey,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  onCreatePayment,
  onOpenTrade,
  onSavePayment,
}: SettlementPaymentBoardProps) {
  const paymentsByInvoiceId = new Map<number, TradePaymentRecord[]>()
  for (const payment of payments) {
    const current = paymentsByInvoiceId.get(payment.invoice_id) ?? []
    current.push(payment)
    paymentsByInvoiceId.set(payment.invoice_id, current)
  }
  const paymentItemByTradeId = new Map(paymentWorkItems.map((item) => [item.trade_id, item]))
  const [drafts, setDrafts] = useState<Record<number, PaymentDraft>>(() =>
    Object.fromEntries(payments.map((payment) => [payment.payment_id, buildPaymentDraft(invoices.find((invoice) => invoice.invoice_id === payment.invoice_id) ?? invoices[0], payment)])),
  )
  const [createDrafts, setCreateDrafts] = useState<Record<number, PaymentDraft>>(() =>
    Object.fromEntries(
      invoices.map((invoice) => [
        invoice.invoice_id,
        buildCreateDraft(invoice, paymentsByInvoiceId.get(invoice.invoice_id) ?? []),
      ]),
    ),
  )

  function updatePaymentDraft(paymentId: number, patch: Partial<PaymentDraft>, invoice: TradeInvoiceRecord, payment: TradePaymentRecord) {
    setDrafts((current) => ({
      ...current,
      [paymentId]: {
        ...(current[paymentId] ?? buildPaymentDraft(invoice, payment)),
        ...patch,
      },
    }))
  }

  function updateCreateDraft(invoiceId: number, patch: Partial<PaymentDraft>, invoice: TradeInvoiceRecord) {
    setCreateDrafts((current) => ({
      ...current,
      [invoiceId]: {
        ...(current[invoiceId] ?? buildCreateDraft(invoice, paymentsByInvoiceId.get(invoiceId) ?? [])),
        ...patch,
      },
    }))
  }

  async function handleCreate(invoice: TradeInvoiceRecord) {
    await onCreatePayment(
      invoice.invoice_id,
      buildCreatePayload(
        invoice,
        createDrafts[invoice.invoice_id] ?? buildCreateDraft(invoice, paymentsByInvoiceId.get(invoice.invoice_id) ?? []),
      ),
    )
  }

  async function handleSave(invoice: TradeInvoiceRecord, payment: TradePaymentRecord) {
    const payload = buildUpdatePayload(payment, drafts[payment.payment_id] ?? buildPaymentDraft(invoice, payment))
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSavePayment(payment.payment_id, payload)
  }

  async function handleMarkPaid(invoice: TradeInvoiceRecord, payment: TradePaymentRecord) {
    const draft = drafts[payment.payment_id] ?? buildPaymentDraft(invoice, payment)
    const payload = buildUpdatePayload(payment, { ...draft, status: 'PAID' })
    if (!payload.received_at && !draft.receivedAt) {
      payload.received_at = toIsoDate(new Date().toISOString().slice(0, 10))
    }
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSavePayment(payment.payment_id, payload)
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to schedule, receive, and reconcile settlement payments.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      <div className="position-list">
        {invoices.map((invoice) => {
          const invoicePayments = [...(paymentsByInvoiceId.get(invoice.invoice_id) ?? [])].sort((left, right) =>
            left.due_at.localeCompare(right.due_at) || left.payment_id - right.payment_id,
          )
          const paymentItem = paymentItemByTradeId.get(invoice.trade_id)
          const totalPaidAmount = invoice.total_paid_amount
          const outstandingAmount = invoice.outstanding_amount
          const createDraft = createDrafts[invoice.invoice_id] ?? buildCreateDraft(invoice, invoicePayments)
          const createPending = savingKey === `invoice:${invoice.invoice_id}:new`

          return (
            <article key={invoice.invoice_id} className="position-card shipment-card workflow-item-card settlement-payment-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{invoice.trade_id}</strong>
                  <span>
                    {invoice.commodity} • {invoice.counterparty ?? 'Counterparty TBD'} • {invoice.book}
                  </span>
                </div>
                <span
                  className={`status-pill status-pill-${
                    invoice.payment_status === 'OVERDUE'
                      ? 'blocked'
                      : invoice.payment_status === 'PAID'
                        ? 'in-progress'
                        : 'active'
                  }`}
                >
                  {invoice.payment_status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{invoice.invoice_number}</span>
                <span className="entity-chip entity-chip-soft">{formatCommodityClass(invoice.commodity_class)}</span>
                <span className="entity-chip entity-chip-soft">
                  {paymentItem?.owner ? `Owner ${paymentItem.owner}` : 'Unassigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Settlement {invoice.settlement_status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="settlement-payment-summary">
                <div className="shipment-kpi-row">
                  <span>Invoice Amount</span>
                  <strong>{formatMoney(invoice.invoice_amount, invoice.invoice_currency_code)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Total Paid</span>
                  <strong>{formatMoney(totalPaidAmount, invoice.invoice_currency_code)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Outstanding</span>
                  <strong>{formatMoney(outstandingAmount, invoice.invoice_currency_code)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Invoice Due</span>
                  <strong>{formatDateOnly(invoice.due_at)}</strong>
                </div>
              </div>
              {invoicePayments.length > 0 ? (
                <div className="settlement-payment-list">
                  {invoicePayments.map((payment) => {
                    const draft = drafts[payment.payment_id] ?? buildPaymentDraft(invoice, payment)
                    const pending = savingKey === `payment:${payment.payment_id}`
                    const savePayload = buildUpdatePayload(payment, draft)

                    return (
                      <article key={payment.payment_id} className="settlement-payment-entry">
                        <div className="shipment-card-head">
                          <div className="shipment-card-copy">
                            <strong>{payment.payment_reference}</strong>
                            <span>
                              Due {formatDateOnly(payment.due_at)} • Updated {formatDate(payment.updated_at)}
                            </span>
                          </div>
                          <span className={`status-pill status-pill-${paymentTone(payment)}`}>
                            {payment.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <div className="workflow-item-grid settlement-payment-grid">
                          <label className="field">
                            <span>Reference</span>
                            <input
                              className="control control-compact"
                              value={draft.paymentReference}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { paymentReference: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                          <label className="field">
                            <span>Currency</span>
                            <input
                              className="control control-compact"
                              value={draft.paymentCurrencyCode}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { paymentCurrencyCode: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                          <label className="field">
                            <span>Amount</span>
                            <input
                              className="control control-compact"
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.paymentAmount}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { paymentAmount: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                          <label className="field">
                            <span>Status</span>
                            <select
                              className="control control-compact"
                              value={draft.status}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { status: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            >
                              {paymentRecordStatusOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Due</span>
                            <input
                              className="control control-compact"
                              type="date"
                              value={draft.dueAt}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { dueAt: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                          <label className="field">
                            <span>Received</span>
                            <input
                              className="control control-compact"
                              type="date"
                              value={draft.receivedAt}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { receivedAt: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Notes</span>
                            <textarea
                              className="control control-compact"
                              rows={2}
                              value={draft.notes}
                              onChange={(event) =>
                                updatePaymentDraft(payment.payment_id, { notes: event.target.value }, invoice, payment)
                              }
                              disabled={pending}
                            />
                          </label>
                        </div>
                        <div className="workflow-item-button-row">
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleSave(invoice, payment)}
                            disabled={!authSession || pending || Object.keys(savePayload).length === 0}
                          >
                            {pending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleMarkPaid(invoice, payment)}
                            disabled={!authSession || pending || payment.status === 'PAID'}
                          >
                            Mark Paid
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}
              <div className="workflow-item-grid settlement-payment-grid">
                <label className="field">
                  <span>New Reference</span>
                  <input
                    className="control control-compact"
                    value={createDraft.paymentReference}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { paymentReference: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
                <label className="field">
                  <span>Currency</span>
                  <input
                    className="control control-compact"
                    value={createDraft.paymentCurrencyCode}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { paymentCurrencyCode: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input
                    className="control control-compact"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createDraft.paymentAmount}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { paymentAmount: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    className="control control-compact"
                    value={createDraft.status}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { status: event.target.value }, invoice)}
                    disabled={createPending}
                  >
                    {paymentRecordStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Due</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={createDraft.dueAt}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { dueAt: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
                <label className="field">
                  <span>Received</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={createDraft.receivedAt}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { receivedAt: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
                <label className="field field-wide">
                  <span>Notes</span>
                  <textarea
                    className="control control-compact"
                    rows={2}
                    value={createDraft.notes}
                    onChange={(event) => updateCreateDraft(invoice.invoice_id, { notes: event.target.value }, invoice)}
                    disabled={createPending}
                  />
                </label>
              </div>
              <div className="workflow-item-actions">
                <div className="shipment-card-copy">
                  <p>
                    Invoice {invoice.invoice_number} for {formatMoney(invoice.invoice_amount, invoice.invoice_currency_code)}.
                    {` `}
                    Open trade payment status is {invoice.payment_status.replaceAll('_', ' ')}.
                  </p>
                </div>
                <div className="workflow-item-button-row">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => handleCreate(invoice)}
                    disabled={!authSession || createPending}
                  >
                    {createPending ? 'Creating...' : 'Add Payment'}
                  </button>
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(invoice.trade_id)}>
                    Open Trade
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
