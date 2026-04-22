import { useMemo, useState } from 'react'

import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { OperationalResourceDescriptor, WorkspaceSettlementSummary } from '../../entities/app/api'
import { describeAppRouteHandoff, type AppRouteHandoff } from '../../shared/appRouteHandoff'
import type {
  CreateTradeInvoiceInput,
  CreateTradePaymentInput,
  UpdateTradeInvoiceInput,
  UpdateTradePaymentInput,
} from '../../entities/settlement/api'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { TileLayout } from '../../shared/ui/TileLayout'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type { Trade, TradeInvoiceRecord, TradePaymentRecord, TradeWorkflowItemRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { OperationalBoardController } from '../operations/OperationalBoardController'
import { renderOperationalInlineBoard } from '../operations/operationalInlineBoardRegistry'
import { resolveOperationalWorkboardDefinition } from '../operations/operationalWorkboardRegistry'

type SettlementWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
  activeTrades: Trade[]
  invoices: TradeInvoiceRecord[]
  payments: TradePaymentRecord[]
  settlementSummary: WorkspaceSettlementSummary | null
  workItems: TradeWorkflowItemRecord[]
  operationalResourceDescriptors: OperationalResourceDescriptor[]
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

function matchesSettlementTradeFilter(trade: Trade, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.book,
    trade.portfolio,
    trade.counterparty,
    trade.commodity_class,
    trade.commodity,
    trade.trade_side,
    trade.invoice_status,
    trade.payment_status,
    trade.settlement_status,
    trade.status,
  ])
}

function matchesInvoiceScreenFilter(invoice: TradeInvoiceRecord, query: string): boolean {
  return matchesTextFilter(query, [
    invoice.invoice_id,
    invoice.trade_id,
    invoice.delivery_id,
    invoice.invoice_number,
    invoice.invoice_currency_code,
    invoice.status,
    invoice.dispute_reason,
    invoice.notes,
    invoice.book,
    invoice.portfolio,
    invoice.counterparty,
    invoice.commodity_class,
    invoice.commodity,
  ])
}

function matchesPaymentScreenFilter(payment: TradePaymentRecord, query: string): boolean {
  return matchesTextFilter(query, [
    payment.payment_id,
    payment.trade_id,
    payment.invoice_id,
    payment.invoice_number,
    payment.payment_reference,
    payment.payment_currency_code,
    payment.status,
    payment.notes,
    payment.book,
    payment.portfolio,
    payment.counterparty,
    payment.commodity_class,
    payment.commodity,
  ])
}

function matchesSettlementWorkflowFilter(item: TradeWorkflowItemRecord, query: string): boolean {
  return matchesTextFilter(query, [
    item.item_id,
    item.trade_id,
    item.linked_trade_id,
    item.queue,
    item.workflow_type,
    item.status,
    item.owner,
    item.book,
    item.portfolio,
    item.counterparty,
    item.commodity_class,
    item.commodity,
    item.notes,
  ])
}

export function SettlementWorkspace({
  authSession,
  routeHandoff,
  globalFilter,
  activeTrades,
  invoices,
  payments,
  settlementSummary,
  workItems,
  operationalResourceDescriptors,
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
  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const hasScreenFilter = effectiveScreenFilter.trim().length > 0
  const directlyMatchedTrades = useMemo(
    () => activeTrades.filter((trade) => matchesSettlementTradeFilter(trade, effectiveScreenFilter)),
    [activeTrades, effectiveScreenFilter],
  )
  const directlyMatchedInvoices = useMemo(
    () => invoices.filter((invoice) => matchesInvoiceScreenFilter(invoice, effectiveScreenFilter)),
    [effectiveScreenFilter, invoices],
  )
  const directlyMatchedPayments = useMemo(
    () => payments.filter((payment) => matchesPaymentScreenFilter(payment, effectiveScreenFilter)),
    [effectiveScreenFilter, payments],
  )
  const directlyMatchedWorkItems = useMemo(
    () => workItems.filter((item) => matchesSettlementWorkflowFilter(item, effectiveScreenFilter)),
    [effectiveScreenFilter, workItems],
  )
  const visibleTradeIds = useMemo(
    () =>
      new Set([
        ...directlyMatchedTrades.map((trade) => trade.trade_id),
        ...directlyMatchedInvoices.map((invoice) => invoice.trade_id),
        ...directlyMatchedPayments.map((payment) => payment.trade_id),
        ...directlyMatchedWorkItems.map((item) => item.trade_id),
      ]),
    [directlyMatchedInvoices, directlyMatchedPayments, directlyMatchedTrades, directlyMatchedWorkItems],
  )
  const visibleActiveTrades = useMemo(
    () => activeTrades.filter((trade) => visibleTradeIds.has(trade.trade_id)),
    [activeTrades, visibleTradeIds],
  )
  const visibleInvoices = useMemo(
    () => invoices.filter((invoice) => visibleTradeIds.has(invoice.trade_id)),
    [invoices, visibleTradeIds],
  )
  const visiblePayments = useMemo(
    () => payments.filter((payment) => visibleTradeIds.has(payment.trade_id)),
    [payments, visibleTradeIds],
  )
  const visibleWorkItems = useMemo(
    () => workItems.filter((item) => visibleTradeIds.has(item.trade_id)),
    [visibleTradeIds, workItems],
  )
  const invoiceCountByTradeId = new Map<string, number>()
  for (const invoice of visibleInvoices) {
    invoiceCountByTradeId.set(invoice.trade_id, (invoiceCountByTradeId.get(invoice.trade_id) ?? 0) + 1)
  }
  const settlementWorkItems = visibleWorkItems.filter((item) => item.queue === 'settlement')
  const invoiceWorkItems = settlementWorkItems.filter((item) => item.workflow_type === 'INVOICE')
  const paymentWorkItems = settlementWorkItems.filter((item) => item.workflow_type === 'PAYMENT')
  const openSettlementWorkItems = settlementWorkItems.filter((item) => !item.is_closed)
  const settlementExceptionItems = openSettlementWorkItems.filter(
    (item) => item.is_overdue || item.status === 'DISPUTED' || item.status === 'OVERDUE',
  )
  const openSettlementTrades = [...visibleActiveTrades]
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

  const disputedTrades = visibleActiveTrades.filter(
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
  const paymentQueueInvoices = visibleInvoices.filter((invoice) => invoiceQueueTradeIds.has(invoice.trade_id))
  const invoicePendingCount =
    !hasScreenFilter && settlementSummary?.invoice_pending_count !== undefined
      ? settlementSummary.invoice_pending_count
      : invoiceQueueTrades.filter((trade) => !invoiceCountByTradeId.has(trade.trade_id)).length
  const paymentDueCount =
    !hasScreenFilter && settlementSummary?.payment_due_count !== undefined
      ? settlementSummary.payment_due_count
      : visibleActiveTrades.filter((trade) => ['DUE', 'OVERDUE'].includes(trade.payment_status)).length
  const settledCount =
    !hasScreenFilter && settlementSummary?.settled_count !== undefined
      ? settlementSummary.settled_count
      : visibleActiveTrades.filter(
      (trade) =>
        trade.settlement_status === 'SETTLED' &&
        ['PAID', 'NOT_REQUIRED'].includes(trade.payment_status),
    ).length
  const settlementBreakdown =
    !hasScreenFilter && settlementSummary?.breakdown.length
      ? settlementSummary.breakdown
      : ['PENDING', 'INVOICED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED']
          .map((status) => ({
            status,
            count: visibleActiveTrades.filter((trade) => trade.settlement_status === status).length,
          }))
          .filter((row) => row.count > 0)
  const openSettlementCount =
    !hasScreenFilter && settlementSummary?.open_work_item_count !== undefined
      ? settlementSummary.open_work_item_count
      : openSettlementWorkItems.length
  const hasSettlementExceptions =
    !hasScreenFilter && settlementSummary !== null
      ? settlementSummary.trade_exception_count > 0 || settlementSummary.workflow_exception_count > 0
      : settlementExceptionItems.length > 0 || disputedTrades.length > 0
  const hasSettlementSummaryData =
    settlementBreakdown.length > 0 || openSettlementCount > 0 || invoicePendingCount > 0 || paymentDueCount > 0 || settledCount > 0
  const hasSettlementQueue = visibleActiveTrades.length > 0 || hasSettlementSummaryData
  const oldestOpenTrade = openSettlementTrades[0] ?? null
  const settledOpenStateTitle = oldestOpenTrade ? `${oldestOpenTrade.trade_id} is leading the open queue` : 'Settlement Ladder'
  const settlementExceptionTitle = hasSettlementExceptions ? 'Settlement Exceptions' : 'No active settlement exceptions'
  const invoiceLedgerWorkboard = resolveOperationalWorkboardDefinition('invoiceLedger', operationalResourceDescriptors)
  const paymentLedgerWorkboard = resolveOperationalWorkboardDefinition('paymentLedger', operationalResourceDescriptors)
  const workspaceFocusBanner = describeAppRouteHandoff(routeHandoff, 'settlement')
  const settlementSummaryCards: TileSectionGridItem[] = [
    {
      id: 'open-settlement',
      title: 'Open Settlement',
      content: (
        <>
          <span>Open Settlement</span>
          <strong>{formatNumber(openSettlementCount, 0)}</strong>
          <p>Invoice and payment workflow tickets still open on the active trade book.</p>
        </>
      ),
    },
    {
      id: 'unissued-invoices',
      title: 'Unissued Invoices',
      content: (
        <>
          <span>Unissued Invoices</span>
          <strong>{formatNumber(invoicePendingCount, 0)}</strong>
          <p>Trades that still need their first settlement invoice record issued from the ledger.</p>
        </>
      ),
    },
    {
      id: 'due-overdue',
      title: 'Due / Overdue',
      content: (
        <>
          <span>Due / Overdue</span>
          <strong>{formatNumber(paymentDueCount, 0)}</strong>
          <p>Trades currently waiting on due or overdue payment collection/settlement.</p>
        </>
      ),
    },
    {
      id: 'fully-settled',
      title: 'Fully Settled',
      content: (
        <>
          <span>Fully Settled</span>
          <strong>{formatNumber(settledCount, 0)}</strong>
          <p>Trades that have reached both settled and paid (or payment not required) states.</p>
        </>
      ),
    },
  ]

  return (
    <TileLayout
      workspaceId="settlement"
      workspaceLabel="Settlement"
      authSession={authSession}
      headerContent={
        <>
          {workspaceFocusBanner ? (
            <section className="feedback-banner feedback-banner-success workspace-focus-banner">
              <div className="workspace-handoff-banner-copy">
                <strong>{workspaceFocusBanner.title}</strong>
                <p>{workspaceFocusBanner.detail}</p>
              </div>
            </section>
          ) : null}
          <WorkspaceLocalFilterBar
            value={screenFilter}
            onChange={setScreenFilter}
            placeholder="Trade ID, invoice number, payment reference, counterparty, or status"
            description="Keep invoice and payment filtering local to settlement so you can narrow cash workflow without disturbing the rest of the app."
            totalCount={activeTrades.length + invoices.length + payments.length + workItems.length}
            matchedCount={
              visibleActiveTrades.length +
              visibleInvoices.length +
              visiblePayments.length +
              visibleWorkItems.length
            }
            resultLabel="settlement records"
            globalValue={globalFilter}
          />
        </>
      }
      sections={[
        {
          id: 'settlement-summary-cards',
          itemIds: settlementSummaryCards.map((card) => card.id),
        },
      ]}
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
              <TileSectionGrid sectionId="settlement-summary-cards" items={settlementSummaryCards} />
            ) : (
              <div className="empty-state">
                <strong>No settlement queue</strong>
                <p>Once a trade reaches invoice-ready or payment follow-through, this workspace becomes the cash control board.</p>
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
              <OperationalBoardController
                workboard={invoiceLedgerWorkboard}
                className="settlement-queue-section"
                isEmpty={invoiceQueueTrades.length === 0}
              >
                {renderOperationalInlineBoard(
                  'invoiceLedger',
                  {
                    authSession,
                    trades: invoiceQueueTrades,
                    invoices: visibleInvoices,
                    invoiceWorkItems,
                    saveError: invoiceMutationError,
                    savingKey: invoiceMutationPendingKey,
                    operationalResourceDescriptor: invoiceLedgerWorkboard.resources[0] ?? null,
                    formatCommodityClass,
                    formatDate,
                    formatDateOnly,
                    formatMoney,
                    onIssueInvoice,
                    onOpenTrade,
                    onSaveInvoice,
                  },
                  [
                    invoiceQueueTrades
                      .map((trade) => `${trade.trade_id}:${invoiceCountByTradeId.get(trade.trade_id) ?? 0}`)
                      .join('|'),
                    visibleInvoices.map((invoice) => `${invoice.invoice_id}:${invoice.version}`).join('|'),
                  ].join('|'),
                )}
              </OperationalBoardController>
              <OperationalBoardController
                workboard={paymentLedgerWorkboard}
                className="settlement-queue-section"
                isEmpty={paymentQueueInvoices.length === 0}
              >
                {renderOperationalInlineBoard(
                  'paymentLedger',
                  {
                    authSession,
                    invoices: paymentQueueInvoices,
                    payments: visiblePayments.filter((payment) =>
                      paymentQueueInvoices.some((invoice) => invoice.invoice_id === payment.invoice_id),
                    ),
                    paymentWorkItems,
                    saveError: paymentMutationError,
                    savingKey: paymentMutationPendingKey,
                    operationalResourceDescriptor: paymentLedgerWorkboard.resources[0] ?? null,
                    formatCommodityClass,
                    formatDate,
                    formatDateOnly,
                    formatMoney,
                    onCreatePayment,
                    onOpenTrade,
                    onSavePayment,
                  },
                  [
                    paymentQueueInvoices.map((invoice) => `${invoice.invoice_id}:${invoice.version}`).join('|'),
                    visiblePayments.map((payment) => `${payment.payment_id}:${payment.version}`).join('|'),
                  ].join('|'),
                )}
              </OperationalBoardController>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No open settlement rows</strong>
              <p>The queue appears when open trades need invoice issuance, payment follow-up, or dispute handling.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
