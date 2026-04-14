import { useState } from 'react'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import type { CreateTradeInvoiceInput, UpdateTradeInvoiceInput } from '../../entities/settlement/api'
import type { StoredAuthSession } from '../../shared/mutation'
import type { Trade, TradeInvoiceRecord, TradeWorkflowItemRecord } from '../../shared/models'
import {
  OperationalFormActions,
  OperationalFormActionsCopy,
} from '../operations/operationalFormPrimitives'
import {
  OperationalDescriptorForm,
  OperationalDescriptorFormFeedback,
  resolveOperationalFormDefinition,
} from '../operations/operationalFormRegistry'
import {
  OperationalDescriptorActionRow,
  resolveOperationalResourcePermissionMessage,
  resolveOperationalFormActionSet,
} from '../operations/operationalFormActionRegistry'

type SettlementInvoiceBoardProps = {
  authSession: StoredAuthSession | null
  trades: Trade[]
  invoices: TradeInvoiceRecord[]
  invoiceWorkItems: TradeWorkflowItemRecord[]
  saveError: string
  savingKey: string | null
  operationalResourceDescriptor?: OperationalResourceDescriptor | null
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatMoney: (value: number | null, currencyCode?: string | null) => string
  onIssueInvoice: (tradeId: string, payload: CreateTradeInvoiceInput) => Promise<void>
  onOpenTrade: (tradeId: string) => void
  onSaveInvoice: (invoiceId: number, payload: UpdateTradeInvoiceInput) => Promise<void>
}

type InvoiceDraft = {
  legNo: string
  invoiceNumber: string
  invoiceCurrencyCode: string
  billedQuantity: string
  invoiceAmount: string
  issuedAt: string
  dueAt: string
  notes: string
  disputeReason: string
}

function buildCreateDraft(trade: Trade): InvoiceDraft {
  return {
    legNo: '',
    invoiceNumber: '',
    invoiceCurrencyCode: trade.trade_currency_code ?? 'USD',
    billedQuantity: '',
    invoiceAmount: '',
    issuedAt: '',
    dueAt: trade.delivery_end ?? trade.effective_end_date ?? '',
    notes: '',
    disputeReason: '',
  }
}

function buildEditDraft(invoice: TradeInvoiceRecord): InvoiceDraft {
  return {
    legNo: invoice.leg_no != null ? String(invoice.leg_no) : '',
    invoiceNumber: invoice.invoice_number,
    invoiceCurrencyCode: invoice.invoice_currency_code,
    billedQuantity: invoice.billed_quantity != null ? String(invoice.billed_quantity) : '',
    invoiceAmount: String(invoice.invoice_amount),
    issuedAt: invoice.issued_at ? invoice.issued_at.slice(0, 10) : '',
    dueAt: invoice.due_at ? invoice.due_at.slice(0, 10) : '',
    notes: invoice.notes ?? '',
    disputeReason: invoice.dispute_reason ?? '',
  }
}

function toIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null
}

function buildCreatePayload(trade: Trade, draft: InvoiceDraft): CreateTradeInvoiceInput {
  const payload: CreateTradeInvoiceInput = { trade_id: trade.trade_id }
  const parsedLegNo = Number.parseInt(draft.legNo, 10)
  const billedQuantity = Number.parseFloat(draft.billedQuantity)
  const invoiceAmount = Number.parseFloat(draft.invoiceAmount)
  const invoiceNumber = draft.invoiceNumber.trim()
  const invoiceCurrencyCode = draft.invoiceCurrencyCode.trim().toUpperCase()
  const notes = draft.notes.trim()

  if (Number.isInteger(parsedLegNo) && parsedLegNo > 0) {
    payload.leg_no = parsedLegNo
  }
  if (invoiceNumber) {
    payload.invoice_number = invoiceNumber
  }
  if (invoiceCurrencyCode) {
    payload.invoice_currency_code = invoiceCurrencyCode
  }
  if (Number.isFinite(billedQuantity)) {
    payload.billed_quantity = billedQuantity
  }
  if (Number.isFinite(invoiceAmount)) {
    payload.invoice_amount = invoiceAmount
  }
  if (draft.issuedAt) {
    payload.issued_at = toIsoDate(draft.issuedAt)
  }
  if (draft.dueAt) {
    payload.due_at = toIsoDate(draft.dueAt)
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
  if (draft.issuedAt !== invoice.issued_at.slice(0, 10)) {
    payload.issued_at = toIsoDate(draft.issuedAt)
  }
  if (draft.dueAt !== invoice.due_at.slice(0, 10)) {
    payload.due_at = toIsoDate(draft.dueAt)
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

function invoiceTone(trade: Trade, hasInvoices: boolean): 'active' | 'in-progress' | 'blocked' {
  if (trade.credit_hold_active) {
    return 'blocked'
  }
  if (
    trade.settlement_status === 'DISPUTED' ||
    trade.invoice_status === 'DISPUTED' ||
    trade.payment_status === 'OVERDUE'
  ) {
    return 'blocked'
  }
  if (hasInvoices) {
    return 'in-progress'
  }
  return 'active'
}

function invoiceScopeLabel(invoice: TradeInvoiceRecord): string {
  if (invoice.leg_no != null) {
    return `Leg ${invoice.leg_no}`
  }
  if (invoice.delivery_id) {
    return 'Delivery scoped'
  }
  return 'Trade-level adjustment'
}

function formatBilledQuantity(invoice: TradeInvoiceRecord): string | null {
  if (invoice.billed_quantity == null) {
    return null
  }
  const quantity = invoice.billed_quantity.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
  return [quantity, invoice.quantity_unit_code].filter(Boolean).join(' ')
}

export function SettlementInvoiceBoard({
  authSession,
  trades,
  invoices,
  invoiceWorkItems,
  saveError,
  savingKey,
  operationalResourceDescriptor = null,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  onIssueInvoice,
  onOpenTrade,
  onSaveInvoice,
}: SettlementInvoiceBoardProps) {
  const invoicesByTradeId = new Map<string, TradeInvoiceRecord[]>()
  for (const invoice of [...invoices].sort(
    (left, right) => right.issued_at.localeCompare(left.issued_at) || right.invoice_id - left.invoice_id,
  )) {
    const current = invoicesByTradeId.get(invoice.trade_id) ?? []
    current.push(invoice)
    invoicesByTradeId.set(invoice.trade_id, current)
  }

  const invoiceItemByTradeId = new Map(invoiceWorkItems.map((item) => [item.trade_id, item]))
  const [createDrafts, setCreateDrafts] = useState<Record<string, InvoiceDraft>>(() =>
    Object.fromEntries(trades.map((trade) => [trade.trade_id, buildCreateDraft(trade)])),
  )
  const [editDrafts, setEditDrafts] = useState<Record<number, InvoiceDraft>>(() =>
    Object.fromEntries(invoices.map((invoice) => [invoice.invoice_id, buildEditDraft(invoice)])),
  )
  const permissionMessage =
    resolveOperationalResourcePermissionMessage(operationalResourceDescriptor) ??
    'Sign in to issue, approve, and dispute settlement invoices.'

  function updateCreateDraft(tradeId: string, patch: Partial<InvoiceDraft>) {
    const trade = trades.find((candidate) => candidate.trade_id === tradeId)
    if (!trade) {
      return
    }
    setCreateDrafts((current) => ({
      ...current,
      [tradeId]: {
        ...(current[tradeId] ?? buildCreateDraft(trade)),
        ...patch,
      },
    }))
  }

  function updateEditDraft(invoiceId: number, patch: Partial<InvoiceDraft>, invoice: TradeInvoiceRecord) {
    setEditDrafts((current) => ({
      ...current,
      [invoiceId]: {
        ...(current[invoiceId] ?? buildEditDraft(invoice)),
        ...patch,
      },
    }))
  }

  async function handleIssueInvoice(trade: Trade) {
    await onIssueInvoice(
      trade.trade_id,
      buildCreatePayload(trade, createDrafts[trade.trade_id] ?? buildCreateDraft(trade)),
    )
  }

  async function handleSaveInvoice(invoice: TradeInvoiceRecord, nextStatus?: string) {
    const payload = buildUpdatePayload(
      invoice,
      editDrafts[invoice.invoice_id] ?? buildEditDraft(invoice),
      nextStatus,
    )
    if (Object.keys(payload).length === 0) {
      return
    }
    await onSaveInvoice(invoice.invoice_id, payload)
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">
          {permissionMessage}
        </p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      <div className="position-list">
        {trades.map((trade) => {
          const tradeInvoices = invoicesByTradeId.get(trade.trade_id) ?? []
          const workflowItem = invoiceItemByTradeId.get(trade.trade_id)
          const createDraft = createDrafts[trade.trade_id] ?? buildCreateDraft(trade)
          const isCreating = savingKey === `trade:${trade.trade_id}`
          const creditHoldActive = trade.credit_hold_active === true
          const latestInvoice = tradeInvoices[0]
          const invoiceCreateForm = resolveOperationalFormDefinition('invoiceCreate', {
            creditHoldActive,
            creditHoldReason: trade.credit_hold_reason ?? 'Credit approval is pending review.',
            draft: createDraft,
            isSaving: isCreating,
            trade,
            updateDraft: (patch) => updateCreateDraft(trade.trade_id, patch),
          })
          const invoiceCreateActionSet = resolveOperationalFormActionSet('invoiceCreateActions', {
            creditHoldActive,
            hasAuthenticatedSession: Boolean(authSession),
            hasExistingInvoices: tradeInvoices.length > 0,
            isCreating,
            onIssue: () => handleIssueInvoice(trade),
            onOpenTrade: () => onOpenTrade(trade.trade_id),
          }, operationalResourceDescriptor)

          return (
            <article
              key={trade.trade_id}
              className="position-card shipment-card workflow-item-card settlement-invoice-card"
            >
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{trade.trade_id}</strong>
                  <span>
                    {trade.commodity} • {trade.counterparty ?? 'Counterparty TBD'} • {trade.book}
                  </span>
                </div>
                <span className={`status-pill status-pill-${invoiceTone(trade, tradeInvoices.length > 0)}`}>
                  {trade.invoice_status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">
                  {formatCommodityClass(trade.commodity_class)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Actualization {trade.actualization_status.replaceAll('_', ' ')}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Payment {trade.payment_status.replaceAll('_', ' ')}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {workflowItem?.owner ? `Owner ${workflowItem.owner}` : 'Unassigned'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {tradeInvoices.length === 1 ? '1 invoice' : `${tradeInvoices.length} invoices`}
                </span>
                {creditHoldActive ? <span className="status-pill status-pill-blocked">Credit Hold</span> : null}
              </div>
              <div className="shipment-card-copy">
                <p>
                  {latestInvoice
                    ? `${tradeInvoices.length} invoice(s) recorded • Latest ${latestInvoice.invoice_number} updated ${formatDate(
                        latestInvoice.updated_at,
                      )}`
                    : invoiceCreateForm.helpText}
                </p>
              </div>

              <OperationalDescriptorForm className="settlement-invoice-grid" form={invoiceCreateForm} />
              <OperationalDescriptorFormFeedback form={invoiceCreateForm} />
              <OperationalFormActions>
                <OperationalFormActionsCopy>
                  <p>{invoiceCreateForm.helpText}</p>
                </OperationalFormActionsCopy>
                <OperationalDescriptorActionRow actionSet={invoiceCreateActionSet} />
              </OperationalFormActions>
              {tradeInvoices.length > 0 ? (
                <div className="settlement-payment-list">
                  {tradeInvoices.map((invoice) => {
                    const draft = editDrafts[invoice.invoice_id] ?? buildEditDraft(invoice)
                    const isSavingInvoice = savingKey === `invoice:${invoice.invoice_id}`
                    const savePayload = buildUpdatePayload(invoice, draft)
                    const approvePayload = buildUpdatePayload(invoice, draft, 'APPROVED')
                    const disputePayload = buildUpdatePayload(invoice, draft, 'DISPUTED')
                    const disputeBlocked =
                      !draft.disputeReason.trim() && invoice.status !== 'DISPUTED'
                    const billedQuantity = formatBilledQuantity(invoice)
                    const invoiceEditForm = resolveOperationalFormDefinition('invoiceEdit', {
                      billedQuantityLabel: billedQuantity,
                      creditHoldActive,
                      creditHoldReason: trade.credit_hold_reason ?? 'Credit approval is pending review.',
                      draft,
                      invoice,
                      isSaving: isSavingInvoice,
                      scopeLabel: invoiceScopeLabel(invoice),
                      updateDraft: (patch) => updateEditDraft(invoice.invoice_id, patch, invoice),
                    })
                    const invoiceEditActionSet = resolveOperationalFormActionSet('invoiceEditActions', {
                      actionStates: invoice.action_states ?? [],
                      approvePayloadEmpty: Object.keys(approvePayload).length === 0,
                      disputeBlocked,
                      disputePayloadEmpty: Object.keys(disputePayload).length === 0,
                      hasAuthenticatedSession: Boolean(authSession),
                      isSaving: isSavingInvoice,
                      onApprove: () => handleSaveInvoice(invoice, 'APPROVED'),
                      onDispute: () => handleSaveInvoice(invoice, 'DISPUTED'),
                      onSave: () => handleSaveInvoice(invoice),
                      savePayloadEmpty: Object.keys(savePayload).length === 0,
                    }, operationalResourceDescriptor)

                    return (
                      <article key={invoice.invoice_id} className="settlement-payment-entry">
                        <div className="shipment-card-head">
                          <div className="shipment-card-copy">
                            <strong>{invoice.invoice_number}</strong>
                            <span>
                              Issued {formatDateOnly(invoice.issued_at)} • Updated {formatDate(invoice.updated_at)}
                            </span>
                          </div>
                          <span
                            className={`status-pill status-pill-${
                              invoice.status === 'DISPUTED' || invoice.is_overdue ? 'blocked' : 'in-progress'
                            }`}
                          >
                            {invoice.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <div className="shipment-card-meta">
                          <span className="entity-chip entity-chip-soft">{invoiceScopeLabel(invoice)}</span>
                          {billedQuantity ? (
                            <span className="entity-chip entity-chip-soft">{billedQuantity}</span>
                          ) : null}
                          <span className="entity-chip entity-chip-soft">
                            Payment {invoice.payment_status.replaceAll('_', ' ')}
                          </span>
                          <span className="entity-chip entity-chip-soft">
                            Settlement {invoice.settlement_status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <div className="settlement-payment-summary">
                          <div className="shipment-kpi-row">
                            <span>Invoice Amount</span>
                            <strong>
                              {formatMoney(invoice.invoice_amount, invoice.invoice_currency_code)}
                            </strong>
                          </div>
                          <div className="shipment-kpi-row">
                            <span>Total Paid</span>
                            <strong>
                              {formatMoney(invoice.total_paid_amount, invoice.invoice_currency_code)}
                            </strong>
                          </div>
                          <div className="shipment-kpi-row">
                            <span>Outstanding</span>
                            <strong>
                              {formatMoney(invoice.outstanding_amount, invoice.invoice_currency_code)}
                            </strong>
                          </div>
                          <div className="shipment-kpi-row">
                            <span>Due</span>
                            <strong>{formatDateOnly(invoice.due_at)}</strong>
                          </div>
                        </div>
                        <OperationalDescriptorForm className="settlement-invoice-grid" form={invoiceEditForm} />
                        <OperationalDescriptorFormFeedback form={invoiceEditForm} />
                        <OperationalFormActions>
                          <OperationalFormActionsCopy>
                            <p>{invoiceEditForm.helpText}</p>
                          </OperationalFormActionsCopy>
                          <OperationalDescriptorActionRow actionSet={invoiceEditActionSet} />
                        </OperationalFormActions>
                      </article>
                    )
                  })}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
