import { useState } from 'react'
import type { CreateTradeInvoiceInput, UpdateTradeInvoiceInput } from '../../entities/settlement/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { Trade, TradeInvoiceRecord, TradeWorkflowItemRecord } from '../../shared/models'

type SettlementInvoiceBoardProps = {
  authSession: StoredAuthSession | null
  trades: Trade[]
  invoices: TradeInvoiceRecord[]
  invoiceWorkItems: TradeWorkflowItemRecord[]
  saveError: string
  savingKey: string | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatMoney: (value: number | null, currencyCode?: string | null) => string
  onIssueInvoice: (tradeId: string, payload: CreateTradeInvoiceInput) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSaveInvoice: (invoiceId: number, payload: UpdateTradeInvoiceInput) => Promise<void>
}

type InvoiceDraft = {
  invoiceNumber: string
  invoiceCurrencyCode: string
  invoiceAmount: string
  issuedAt: string
  dueAt: string
  notes: string
  disputeReason: string
}

function defaultInvoiceAmount(trade: Trade): string {
  if (trade.price == null || trade.volume == null) {
    return ''
  }
  const amount = Math.abs(trade.price * trade.volume)
  return Number.isFinite(amount) ? String(amount) : ''
}

function defaultInvoiceNumber(trade: Trade): string {
  return `INV-${trade.trade_id}`
}

function buildDraft(trade: Trade, invoice: TradeInvoiceRecord | undefined): InvoiceDraft {
  return {
    invoiceNumber: invoice?.invoice_number ?? defaultInvoiceNumber(trade),
    invoiceCurrencyCode: invoice?.invoice_currency_code ?? trade.trade_currency_code ?? 'USD',
    invoiceAmount: invoice ? String(invoice.invoice_amount) : defaultInvoiceAmount(trade),
    issuedAt: invoice?.issued_at ? invoice.issued_at.slice(0, 10) : '',
    dueAt: invoice?.due_at ? invoice.due_at.slice(0, 10) : trade.delivery_end ?? trade.effective_end_date ?? '',
    notes: invoice?.notes ?? '',
    disputeReason: invoice?.dispute_reason ?? '',
  }
}

function emptyDraft(trade: Trade): InvoiceDraft {
  return buildDraft(trade, undefined)
}

function updateIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null
}

function buildCreatePayload(trade: Trade, draft: InvoiceDraft): CreateTradeInvoiceInput {
  const payload: CreateTradeInvoiceInput = { trade_id: trade.trade_id }
  const invoiceNumber = draft.invoiceNumber.trim()
  const invoiceCurrencyCode = draft.invoiceCurrencyCode.trim().toUpperCase()
  const invoiceAmount = Number.parseFloat(draft.invoiceAmount)
  const notes = draft.notes.trim()

  if (invoiceNumber) {
    payload.invoice_number = invoiceNumber
  }
  if (invoiceCurrencyCode) {
    payload.invoice_currency_code = invoiceCurrencyCode
  }
  if (Number.isFinite(invoiceAmount)) {
    payload.invoice_amount = invoiceAmount
  }
  if (draft.issuedAt) {
    payload.issued_at = updateIsoDate(draft.issuedAt)
  }
  if (draft.dueAt) {
    payload.due_at = updateIsoDate(draft.dueAt)
  }
  if (notes) {
    payload.notes = notes
  }

  return payload
}

function buildUpdatePayload(
  invoice: TradeInvoiceRecord,
  draft: InvoiceDraft,
  nextStatus?: string,
): UpdateTradeInvoiceInput {
  const payload: UpdateTradeInvoiceInput = {}
  const invoiceNumber = draft.invoiceNumber.trim()
  const invoiceCurrencyCode = draft.invoiceCurrencyCode.trim().toUpperCase()
  const invoiceAmount = Number.parseFloat(draft.invoiceAmount)
  const issuedAt = draft.issuedAt
  const dueAt = draft.dueAt
  const notes = draft.notes.trim()
  const disputeReason = draft.disputeReason.trim()

  if (invoiceNumber && invoiceNumber !== invoice.invoice_number) {
    payload.invoice_number = invoiceNumber
  }
  if (invoiceCurrencyCode && invoiceCurrencyCode !== invoice.invoice_currency_code) {
    payload.invoice_currency_code = invoiceCurrencyCode
  }
  if (Number.isFinite(invoiceAmount) && invoiceAmount !== invoice.invoice_amount) {
    payload.invoice_amount = invoiceAmount
  }
  if (issuedAt !== invoice.issued_at.slice(0, 10)) {
    payload.issued_at = updateIsoDate(issuedAt)
  }
  if (dueAt !== invoice.due_at.slice(0, 10)) {
    payload.due_at = updateIsoDate(dueAt)
  }
  if (notes !== (invoice.notes ?? '')) {
    payload.notes = notes || null
  }
  if (disputeReason !== (invoice.dispute_reason ?? '')) {
    payload.dispute_reason = disputeReason || null
  }
  if (nextStatus && nextStatus !== invoice.status) {
    payload.status = nextStatus
  }

  return payload
}

function invoiceTone(
  trade: Trade,
  invoice: TradeInvoiceRecord | undefined,
): 'active' | 'in-progress' | 'blocked' {
  if (trade.credit_hold_active) {
    return 'blocked'
  }
  if (
    trade.settlement_status === 'DISPUTED' ||
    invoice?.status === 'DISPUTED' ||
    invoice?.is_overdue ||
    trade.payment_status === 'OVERDUE'
  ) {
    return 'blocked'
  }
  if (invoice) {
    return 'in-progress'
  }
  return 'active'
}

export function SettlementInvoiceBoard({
  authSession,
  trades,
  invoices,
  invoiceWorkItems,
  saveError,
  savingKey,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  onIssueInvoice,
  onOpenTrade,
  onSaveInvoice,
}: SettlementInvoiceBoardProps) {
  const invoiceByTradeId = new Map(invoices.map((invoice) => [invoice.trade_id, invoice]))
  const invoiceItemByTradeId = new Map(invoiceWorkItems.map((item) => [item.trade_id, item]))
  const [drafts, setDrafts] = useState<Record<string, InvoiceDraft>>(() =>
    Object.fromEntries(
      trades.map((trade) => [trade.trade_id, buildDraft(trade, invoiceByTradeId.get(trade.trade_id))]),
    ),
  )

  function updateDraft(tradeId: string, patch: Partial<InvoiceDraft>) {
    const trade = trades.find((candidate) => candidate.trade_id === tradeId)
    if (!trade) {
      return
    }
    setDrafts((current) => ({
      ...current,
      [tradeId]: {
        ...(current[tradeId] ?? emptyDraft(trade)),
        ...patch,
      },
    }))
  }

  async function handleIssueInvoice(trade: Trade) {
    await onIssueInvoice(trade.trade_id, buildCreatePayload(trade, drafts[trade.trade_id] ?? emptyDraft(trade)))
  }

  async function handleSaveInvoice(trade: Trade, invoice: TradeInvoiceRecord, nextStatus?: string) {
    const payload = buildUpdatePayload(invoice, drafts[trade.trade_id] ?? buildDraft(trade, invoice), nextStatus)
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSaveInvoice(invoice.invoice_id, payload)
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to issue, approve, and dispute settlement invoices.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      <div className="position-list">
        {trades.map((trade) => {
          const invoice = invoiceByTradeId.get(trade.trade_id)
          const workflowItem = invoiceItemByTradeId.get(trade.trade_id)
          const draft = drafts[trade.trade_id] ?? buildDraft(trade, invoice)
          const pendingKey = invoice ? `invoice:${invoice.invoice_id}` : `trade:${trade.trade_id}`
          const isSaving = savingKey === pendingKey
          const creditHoldActive = trade.credit_hold_active === true
          const savePayload = invoice ? buildUpdatePayload(invoice, draft) : null
          const approvePayload = invoice ? buildUpdatePayload(invoice, draft, 'APPROVED') : null
          const disputePayload = invoice ? buildUpdatePayload(invoice, draft, 'DISPUTED') : null
          const disputeBlocked = !invoice ? true : !draft.disputeReason.trim() && invoice.status !== 'DISPUTED'

          return (
            <article key={trade.trade_id} className="position-card shipment-card workflow-item-card settlement-invoice-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{trade.trade_id}</strong>
                  <span>
                    {trade.commodity} • {trade.counterparty ?? 'Counterparty TBD'} • {trade.book}
                  </span>
                </div>
                <span className={`status-pill status-pill-${invoiceTone(trade, invoice)}`}>
                  {(invoice?.status ?? 'PENDING').replaceAll('_', ' ')}
                </span>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{formatCommodityClass(trade.commodity_class)}</span>
                <span className="entity-chip entity-chip-soft">Payment {trade.payment_status.replaceAll('_', ' ')}</span>
                {creditHoldActive ? <span className="status-pill status-pill-blocked">Credit Hold</span> : null}
                <span className="entity-chip entity-chip-soft">
                  {workflowItem?.owner ? `Owner ${workflowItem.owner}` : 'Unassigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {draft.dueAt ? `Due ${formatDateOnly(draft.dueAt)}` : 'Due date TBD'}
                </span>
              </div>
              <div className="shipment-card-copy">
                <p>
                  {invoice
                    ? `Issued ${formatDateOnly(invoice.issued_at)} • Updated ${formatDate(invoice.updated_at)}`
                    : `Est. notional ${formatMoney(
                        trade.price != null && trade.volume != null ? Math.abs(trade.price * trade.volume) : null,
                        trade.trade_currency_code,
                      )}`}
                </p>
              </div>
              <div className="workflow-item-grid settlement-invoice-grid">
                <label className="field">
                  <span>Invoice Number</span>
                  <input
                    className="control control-compact"
                    value={draft.invoiceNumber}
                    onChange={(event) => updateDraft(trade.trade_id, { invoiceNumber: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field">
                  <span>Currency</span>
                  <input
                    className="control control-compact"
                    value={draft.invoiceCurrencyCode}
                    onChange={(event) => updateDraft(trade.trade_id, { invoiceCurrencyCode: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input
                    className="control control-compact"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.invoiceAmount}
                    onChange={(event) => updateDraft(trade.trade_id, { invoiceAmount: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field">
                  <span>Issued</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={draft.issuedAt}
                    onChange={(event) => updateDraft(trade.trade_id, { issuedAt: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field">
                  <span>Due</span>
                  <input
                    className="control control-compact"
                    type="date"
                    value={draft.dueAt}
                    onChange={(event) => updateDraft(trade.trade_id, { dueAt: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field">
                  <span>Settlement</span>
                  <input
                    className="control control-compact"
                    value={trade.settlement_status.replaceAll('_', ' ')}
                    disabled
                  />
                </label>
                <label className="field field-wide">
                  <span>Notes</span>
                  <textarea
                    className="control control-compact"
                    rows={3}
                    value={draft.notes}
                    onChange={(event) => updateDraft(trade.trade_id, { notes: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
                <label className="field field-wide">
                  <span>Dispute Reason</span>
                  <textarea
                    className="control control-compact"
                    rows={2}
                    value={draft.disputeReason}
                    onChange={(event) => updateDraft(trade.trade_id, { disputeReason: event.target.value })}
                    disabled={isSaving || creditHoldActive}
                  />
                </label>
              </div>
              {creditHoldActive ? (
                <p className="field-error">
                  {trade.credit_hold_reason ?? 'Credit approval is pending review.'}
                </p>
              ) : null}
              <div className="workflow-item-actions">
                <div className="shipment-card-copy">
                  <p>
                    {invoice
                      ? `Invoice ${invoice.invoice_number} for ${formatMoney(
                          invoice.invoice_amount,
                          invoice.invoice_currency_code,
                        )}`
                      : 'Issue the first invoice record to move this trade from status-only settlement into the invoice ledger.'}
                  </p>
                </div>
                <div className="workflow-item-button-row">
                  {!invoice ? (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => handleIssueInvoice(trade)}
                      disabled={!authSession || isSaving || creditHoldActive}
                    >
                      {isSaving ? 'Issuing...' : 'Issue Invoice'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => handleSaveInvoice(trade, invoice)}
                        disabled={!authSession || isSaving || creditHoldActive || Object.keys(savePayload ?? {}).length === 0}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleSaveInvoice(trade, invoice, 'APPROVED')}
                        disabled={!authSession || isSaving || creditHoldActive || Object.keys(approvePayload ?? {}).length === 0}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleSaveInvoice(trade, invoice, 'DISPUTED')}
                        disabled={
                          !authSession ||
                          isSaving ||
                          creditHoldActive ||
                          disputeBlocked ||
                          Object.keys(disputePayload ?? {}).length === 0
                        }
                      >
                        Mark Disputed
                      </button>
                    </>
                  )}
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(trade.trade_id)}>
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
