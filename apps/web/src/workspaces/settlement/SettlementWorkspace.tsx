import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { WorkspaceSettlementSummary } from '../../entities/app/api'
import type {
  CreateTradeInvoiceInput,
  CreateTradePaymentInput,
  UpdateTradeInvoiceInput,
  UpdateTradePaymentInput,
} from '../../entities/settlement/api'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { Trade, TradeInvoiceRecord, TradePaymentRecord, TradeWorkflowItemRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { SettlementInvoiceBoard } from './SettlementInvoiceBoard'
import { SettlementPaymentBoard } from './SettlementPaymentBoard'

type SettlementWorkspaceProps = {
  authSession: StoredAuthSession | null
  activeTrades: Trade[]
  invoices: TradeInvoiceRecord[]
  payments: TradePaymentRecord[]
  settlementSummary: WorkspaceSettlementSummary | null
  workItems: TradeWorkflowItemRecord[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null, currencyCode?: string | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  invoiceMutationError: string
  invoiceMutationPendingKey: string | null
  paymentMutationError: string
  paymentMutationPendingKey: string | null
  onOpenTrade: (tradeId: string) => void
  onIssueInvoice: (tradeId: string, payload: CreateTradeInvoiceInput) => Promise<void>
  onSaveInvoice: (invoiceId: number, payload: UpdateTradeInvoiceInput) => Promise<void>
  onCreatePayment: (invoiceId: number, payload: CreateTradePaymentInput) => Promise<void>
  onSavePayment: (paymentId: number, payload: UpdateTradePaymentInput) => Promise<void>
  onSaveWorkflowItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

function ageInDays(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return Math.floor((Date.now() - timestamp) / 86_400_000)
}

function settlementPriority(trade: Trade): number {
  if (trade.credit_hold_active) {
    return 0
  }
  if (
    trade.settlement_status === 'DISPUTED' ||
    trade.invoice_status === 'DISPUTED' ||
    trade.payment_status === 'OVERDUE'
  ) {
    return 0
  }
  if (trade.payment_status === 'DUE') {
    return 1
  }
  if (trade.settlement_status === 'INVOICED' || trade.settlement_status === 'PARTIALLY_SETTLED') {
    return 2
  }
  return 3
}

export function SettlementWorkspace({
  authSession,
  activeTrades,
  invoices,
  payments,
  settlementSummary,
  workItems,
  formatCommodityClass,
  formatMoney,
  formatNumber,
  formatDate,
  formatDateOnly,
  invoiceMutationError,
  invoiceMutationPendingKey,
  paymentMutationError,
  paymentMutationPendingKey,
  onOpenTrade,
  onIssueInvoice,
  onSaveInvoice,
  onCreatePayment,
  onSavePayment,
}: SettlementWorkspaceProps) {
  const invoiceCountByTradeId = new Map<string, number>()
  for (const invoice of invoices) {
    invoiceCountByTradeId.set(invoice.trade_id, (invoiceCountByTradeId.get(invoice.trade_id) ?? 0) + 1)
  }
  const settlementWorkItems = workItems.filter((item) => item.queue === 'settlement')
  const invoiceWorkItems = settlementWorkItems.filter((item) => item.workflow_type === 'INVOICE')
  const paymentWorkItems = settlementWorkItems.filter((item) => item.workflow_type === 'PAYMENT')
  const openSettlementWorkItems = settlementWorkItems.filter((item) => !item.is_closed)
  const settlementExceptionItems = openSettlementWorkItems.filter(
    (item) => item.is_overdue || item.status === 'DISPUTED' || item.status === 'OVERDUE',
  )
  const openSettlementTrades = [...activeTrades]
    .filter(
      (trade) =>
        !(
          trade.settlement_status === 'SETTLED' &&
          (trade.payment_status === 'PAID' || trade.payment_status === 'NOT_REQUIRED')
        ),
    )
    .sort((left, right) => {
      const priority = settlementPriority(left) - settlementPriority(right)
      if (priority !== 0) {
        return priority
      }
      return (
        (ageInDays(right.execution_timestamp ?? right.trade_date) ?? -1) -
        (ageInDays(left.execution_timestamp ?? left.trade_date) ?? -1)
      )
    })

  const disputedTrades = activeTrades.filter(
    (trade) =>
      trade.credit_hold_active ||
      trade.settlement_status === 'DISPUTED' ||
      trade.invoice_status === 'DISPUTED' ||
      trade.payment_status === 'OVERDUE',
  )
  const invoiceQueueTrades = openSettlementTrades.filter(
    (trade) => trade.invoice_status !== 'NOT_REQUIRED' || invoiceCountByTradeId.has(trade.trade_id),
  )
  const invoiceQueueTradeIds = new Set(invoiceQueueTrades.map((trade) => trade.trade_id))
  const paymentQueueInvoices = invoices.filter((invoice) => invoiceQueueTradeIds.has(invoice.trade_id))
  const invoicePendingCount =
    settlementSummary?.invoice_pending_count ??
    invoiceQueueTrades.filter((trade) => !invoiceCountByTradeId.has(trade.trade_id)).length
  const paymentDueCount =
    settlementSummary?.payment_due_count ??
    activeTrades.filter((trade) => ['DUE', 'OVERDUE'].includes(trade.payment_status)).length
  const settledCount =
    settlementSummary?.settled_count ??
    activeTrades.filter(
      (trade) =>
        trade.settlement_status === 'SETTLED' &&
        ['PAID', 'NOT_REQUIRED'].includes(trade.payment_status),
    ).length
  const settlementBreakdown =
    settlementSummary?.breakdown.length
      ? settlementSummary.breakdown
      : ['PENDING', 'INVOICED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED']
          .map((status) => ({
            status,
            count: activeTrades.filter((trade) => trade.settlement_status === status).length,
          }))
          .filter((row) => row.count > 0)
  const openSettlementCount = settlementSummary?.open_work_item_count ?? openSettlementWorkItems.length
  const hasSettlementExceptions =
    settlementSummary !== null
      ? settlementSummary.trade_exception_count > 0 || settlementSummary.workflow_exception_count > 0
      : settlementExceptionItems.length > 0 || disputedTrades.length > 0
  const hasSettlementSummaryData =
    settlementBreakdown.length > 0 || openSettlementCount > 0 || invoicePendingCount > 0 || paymentDueCount > 0 || settledCount > 0
  const hasSettlementQueue = activeTrades.length > 0 || hasSettlementSummaryData
  const oldestOpenTrade = openSettlementTrades[0] ?? null
  const settledOpenStateTitle = oldestOpenTrade ? `${oldestOpenTrade.trade_id} is leading the open queue` : 'Settlement Ladder'
  const settlementExceptionTitle = hasSettlementExceptions ? 'Settlement Exceptions' : 'No active settlement exceptions'

  return (
    <TileLayout
      workspaceId="settlement"
      workspaceLabel="Settlement"
      authSession={authSession}
      tiles={[
        {
          id: 'settlement-summary',
          eyebrow: 'Snapshot',
          title: 'Settlement Control Board',
          description: 'Invoice, payment, and settlement aging centered on the active trade book.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            hasSettlementQueue ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Open Settlement</span>
                  <strong>{formatNumber(openSettlementCount, 0)}</strong>
                  <p>Invoice and payment workflow tickets still open on the active trade book.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Unissued Invoices</span>
                  <strong>{formatNumber(invoicePendingCount, 0)}</strong>
                  <p>Trades that still need their first settlement invoice record issued from the ledger.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Due / Overdue</span>
                  <strong>{formatNumber(paymentDueCount, 0)}</strong>
                  <p>Trades currently waiting on due or overdue payment collection/settlement.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Fully Settled</span>
                  <strong>{formatNumber(settledCount, 0)}</strong>
                  <p>Trades that have reached both settled and paid (or payment not required) states.</p>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No settlement queue</strong>
                <p>Create active trades to populate the settlement workspace.</p>
              </div>
            ),
        },
        {
          id: 'settlement-status',
          eyebrow: 'Ladder',
          title: settledOpenStateTitle,
          description: 'A status ladder showing how the active trade set is distributed across settlement stages.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: settlementBreakdown.length > 0 ? (
            <div className="shipment-kpi-stack">
              {settlementBreakdown.map((row) => (
                <div key={row.status} className="shipment-kpi-row">
                  <span>{row.status.replaceAll('_', ' ')}</span>
                  <strong>{formatNumber(row.count, 0)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No status ladder</strong>
              <p>The settlement stage view will appear as trades enter the post-trade workflow.</p>
            </div>
          ),
        },
        {
          id: 'settlement-disputes',
          eyebrow: 'Escalation',
          title: settlementExceptionTitle,
          description: 'Disputed, overdue, or otherwise late settlement tasks that usually need direct human escalation.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: settlementExceptionItems.length > 0 ? (
            <div className="position-list">
              {settlementExceptionItems.map((item) => (
                <article key={item.item_id} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{item.trade_id}</strong>
                      <span>
                        {item.commodity} • {item.counterparty ?? 'Counterparty TBD'}
                      </span>
                    </div>
                    <span className="status-pill status-pill-blocked">{item.status.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{item.workflow_type.replaceAll('_', ' ')}</span>
                    <span className="entity-chip entity-chip-soft">{formatCommodityClass(item.commodity_class)}</span>
                    <span className="entity-chip entity-chip-soft">{item.owner ? `Owner ${item.owner}` : 'Unassigned'}</span>
                  </div>
                  <div className="shipment-card-copy">
                    <p>{item.due_at ? `Due ${formatDateOnly(item.due_at)}` : 'No due date'} • Updated {formatDate(item.updated_at)}</p>
                  </div>
                  <div className="shipment-card-actions">
                    <span>{item.notes ? item.notes : 'Awaiting operator follow-up.'}</span>
                    <button type="button" className="button button-ghost" onClick={() => onOpenTrade(item.trade_id)}>
                      Open Trade
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No escalations</strong>
              <p>No active trade is currently disputed or overdue in the settlement pipeline.</p>
            </div>
          ),
        },
        {
          id: 'settlement-queue',
          eyebrow: 'Queue',
          title: 'Open Settlement Queue',
          description: 'Issue invoices first, then schedule and reconcile cash receipts against those invoices on the payment ledger.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: invoiceQueueTrades.length > 0 || paymentQueueInvoices.length > 0 ? (
            <div className="settlement-queue-stack">
              {invoiceQueueTrades.length > 0 ? (
                <section className="settlement-queue-section">
                  <div className="scheduler-section-banner">
                    <div className="scheduler-section-copy">
                      <strong>Invoice Ledger</strong>
                      <p>Dedicated invoice records now drive invoice and settlement rollups for each active trade.</p>
                    </div>
                  </div>
                  <SettlementInvoiceBoard
                    key={[
                      invoiceQueueTrades
                        .map((trade) => `${trade.trade_id}:${invoiceCountByTradeId.get(trade.trade_id) ?? 0}`)
                        .join('|'),
                      invoices.map((invoice) => `${invoice.invoice_id}:${invoice.version}`).join('|'),
                    ].join('|')}
                    authSession={authSession}
                    trades={invoiceQueueTrades}
                    invoices={invoices}
                    invoiceWorkItems={invoiceWorkItems}
                    saveError={invoiceMutationError}
                    savingKey={invoiceMutationPendingKey}
                    formatCommodityClass={formatCommodityClass}
                    formatDate={formatDate}
                    formatDateOnly={formatDateOnly}
                    formatMoney={formatMoney}
                    onIssueInvoice={onIssueInvoice}
                    onOpenTrade={onOpenTrade}
                    onSaveInvoice={onSaveInvoice}
                  />
                </section>
              ) : null}
              {paymentQueueInvoices.length > 0 ? (
                <section className="settlement-queue-section">
                  <div className="scheduler-section-banner">
                    <div className="scheduler-section-copy">
                      <strong>Payment Ledger</strong>
                      <p>Cash collection and settlement now run from dedicated payment records instead of a status-only queue row.</p>
                    </div>
                  </div>
                  <SettlementPaymentBoard
                    key={[
                      paymentQueueInvoices.map((invoice) => `${invoice.invoice_id}:${invoice.version}`).join('|'),
                      payments.map((payment) => `${payment.payment_id}:${payment.version}`).join('|'),
                    ].join('|')}
                    authSession={authSession}
                    invoices={paymentQueueInvoices}
                    payments={payments.filter((payment) =>
                      paymentQueueInvoices.some((invoice) => invoice.invoice_id === payment.invoice_id),
                    )}
                    paymentWorkItems={paymentWorkItems}
                    saveError={paymentMutationError}
                    savingKey={paymentMutationPendingKey}
                    formatCommodityClass={formatCommodityClass}
                    formatDate={formatDate}
                    formatDateOnly={formatDateOnly}
                    formatMoney={formatMoney}
                    onCreatePayment={onCreatePayment}
                    onOpenTrade={onOpenTrade}
                    onSavePayment={onSavePayment}
                  />
                </section>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No open settlement rows</strong>
              <p>The settlement queue clears once active trades are fully invoiced, paid, and settled.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
