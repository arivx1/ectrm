import { useEffect, useMemo, useState } from 'react'

import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import {
  loadInvoiceIssueCandidates,
  loadTradeAttentionCandidates,
  type InvoiceIssueCandidateList,
  type OperationalResourceDescriptor,
  type TradeAttentionCandidateList,
  type TradeAttentionCandidateType,
  type WorkspaceSettlementSummary,
} from '../../entities/app/api'
import {
  buildInvoiceIssueCandidateWorkflowHandoff,
  buildTradeAttentionCandidateWorkflowHandoff,
} from '../../entities/app/candidateWorkflowHandoffs'
import { sessionHeaders } from '../../entities/app/workspaceDataShared'
import { appConfig } from '../../shared/config'
import { normalizeAppRouteHandoff, type AppRouteHandoff } from '../../shared/appRouteHandoff'
import type {
  CreateTradeInvoiceInput,
  CreateTradePaymentInput,
  UpdateTradeInvoiceInput,
  UpdateTradePaymentInput,
} from '../../entities/settlement/api'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { TileLayout } from '../../shared/ui/TileLayout'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type {
  Trade,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
  ViewKey,
} from '../../shared/models'
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
  onClearHandoff: () => void
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
  onOpenTrade: (tradeId: string) => void
  onIssueInvoice: (tradeId: string, payload: CreateTradeInvoiceInput) => Promise<void>
  onSaveInvoice: (invoiceId: number, payload: UpdateTradeInvoiceInput) => Promise<void>
  onCreatePayment: (invoiceId: number, payload: CreateTradePaymentInput) => Promise<void>
  onSavePayment: (paymentId: number, payload: UpdateTradePaymentInput) => Promise<void>
  onSaveWorkflowItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

type SettlementCandidatePanel =
  | {
      key: 'invoice_pending'
      label: string
      mode: 'invoice'
    }
  | {
      key: 'payment_due' | 'settlement_exception'
      label: string
      mode: 'trade'
      candidateType: TradeAttentionCandidateType
    }

const SETTLEMENT_CANDIDATE_LIMIT = 8

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

function summarizeSettlementTradeCandidate(candidate: {
  invoice_status: string
  payment_status: string
  settlement_status: string
}): string {
  return [
    `Invoice ${candidate.invoice_status}`,
    `Payment ${candidate.payment_status}`,
    `Settlement ${candidate.settlement_status}`,
  ].join(' • ')
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
  onClearHandoff,
  onOpenView,
  onOpenTrade,
  onIssueInvoice,
  onSaveInvoice,
  onCreatePayment,
  onSavePayment,
}: SettlementWorkspaceProps) {
  const [screenFilter, setScreenFilter] = useState('')
  const [activeCandidatePanel, setActiveCandidatePanel] = useState<SettlementCandidatePanel | null>(null)
  const [invoiceIssueCandidates, setInvoiceIssueCandidates] = useState<InvoiceIssueCandidateList | null>(null)
  const [tradeAttentionCandidates, setTradeAttentionCandidates] = useState<TradeAttentionCandidateList | null>(null)
  const [candidatePanelLoading, setCandidatePanelLoading] = useState(false)
  const [candidatePanelError, setCandidatePanelError] = useState('')
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
  const settlementExceptionCandidateCount =
    !hasScreenFilter && settlementSummary?.trade_exception_count !== undefined
      ? settlementSummary.trade_exception_count
      : disputedTrades.length
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
  const normalizedRouteHandoff = normalizeAppRouteHandoff(routeHandoff)
  const routeHandoffFocusTradeId =
    normalizedRouteHandoff?.focus.type === 'trade'
      ? normalizedRouteHandoff.focus.id
      : normalizedRouteHandoff && normalizedRouteHandoff.tradeId !== normalizedRouteHandoff.focus.id
        ? normalizedRouteHandoff.tradeId
        : null
  function clearWorkspaceHandoff() {
    setScreenFilter('')
    onClearHandoff()
  }

  useEffect(() => {
    if (hasScreenFilter) {
      setActiveCandidatePanel(null)
      setInvoiceIssueCandidates(null)
      setTradeAttentionCandidates(null)
      setCandidatePanelError('')
      setCandidatePanelLoading(false)
    }
  }, [hasScreenFilter])

  useEffect(() => {
    const currentCandidatePanel = activeCandidatePanel
    const currentAuthSession = authSession

    if (!currentCandidatePanel || hasScreenFilter) {
      return
    }
    if (!currentAuthSession) {
      setInvoiceIssueCandidates(null)
      setTradeAttentionCandidates(null)
      setCandidatePanelError('Sign in to load live candidate reads.')
      setCandidatePanelLoading(false)
      return
    }
    const selectedCandidatePanel: SettlementCandidatePanel = currentCandidatePanel
    const authorizedSession: StoredAuthSession = currentAuthSession

    let cancelled = false
    setCandidatePanelLoading(true)
    setCandidatePanelError('')

    async function loadCandidates() {
      try {
        if (selectedCandidatePanel.mode === 'invoice') {
          const nextCandidates = await loadInvoiceIssueCandidates(
            appConfig.apiBase,
            { limit: SETTLEMENT_CANDIDATE_LIMIT },
            { readHeaders: sessionHeaders(authorizedSession) },
          )
          if (!cancelled) {
            setInvoiceIssueCandidates(nextCandidates)
            setTradeAttentionCandidates(null)
          }
          return
        }
        const tradeCandidateType: TradeAttentionCandidateType = selectedCandidatePanel.candidateType

        const nextCandidates = await loadTradeAttentionCandidates(
          appConfig.apiBase,
          {
            candidateType: tradeCandidateType,
            limit: SETTLEMENT_CANDIDATE_LIMIT,
          },
          { readHeaders: sessionHeaders(authorizedSession) },
        )
        if (!cancelled) {
          setTradeAttentionCandidates(nextCandidates)
          setInvoiceIssueCandidates(null)
        }
      } catch (error) {
        if (!cancelled) {
          setInvoiceIssueCandidates(null)
          setTradeAttentionCandidates(null)
          setCandidatePanelError(error instanceof Error ? error.message : 'Unable to load settlement candidates.')
        }
      } finally {
        if (!cancelled) {
          setCandidatePanelLoading(false)
        }
      }
    }

    void loadCandidates()

    return () => {
      cancelled = true
    }
  }, [activeCandidatePanel, authSession, hasScreenFilter])

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
          {!hasScreenFilter ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setActiveCandidatePanel((current) =>
                  current?.key === 'invoice_pending'
                    ? null
                    : { key: 'invoice_pending', label: 'Unissued invoice candidates', mode: 'invoice' },
                )
                setInvoiceIssueCandidates(null)
                setTradeAttentionCandidates(null)
                setCandidatePanelError('')
              }}
            >
              {activeCandidatePanel?.key === 'invoice_pending' ? 'Hide candidates' : 'Open candidates'}
            </button>
          ) : null}
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
          {!hasScreenFilter ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setActiveCandidatePanel((current) =>
                  current?.key === 'payment_due'
                    ? null
                    : {
                        key: 'payment_due',
                        label: 'Due and overdue payment candidates',
                        mode: 'trade',
                        candidateType: 'payment_due',
                      },
                )
                setInvoiceIssueCandidates(null)
                setTradeAttentionCandidates(null)
                setCandidatePanelError('')
              }}
            >
              {activeCandidatePanel?.key === 'payment_due' ? 'Hide candidates' : 'Open candidates'}
            </button>
          ) : null}
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
  const activeInvoiceCandidateSummary = invoiceIssueCandidates
    ? `${formatNumber(invoiceIssueCandidates.count, 0)} of ${formatNumber(invoiceIssueCandidates.total_count, 0)} invoice issue candidates loaded.`
    : null
  const activeTradeCandidateSummary = tradeAttentionCandidates
    ? `${formatNumber(tradeAttentionCandidates.count, 0)} of ${formatNumber(tradeAttentionCandidates.total_count, 0)} settlement candidates loaded.`
    : null

  return (
    <TileLayout
      workspaceId="settlement"
      workspaceLabel="Settlement"
      authSession={authSession}
      headerContent={
        <>
          <WorkspaceHandoffFocusBanner
            handoff={routeHandoff}
            currentView="settlement"
            clearLabel="Show Full Settlement"
            onClear={clearWorkspaceHandoff}
            actions={
              routeHandoffFocusTradeId
                ? [
                    {
                      label: 'Open Focused Trade',
                      onClick: () => onOpenTrade(routeHandoffFocusTradeId),
                    },
                  ]
                : []
            }
          />
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
              <div className="position-list">
                <TileSectionGrid sectionId="settlement-summary-cards" items={settlementSummaryCards} />
                {!hasScreenFilter && activeCandidatePanel && ['invoice_pending', 'payment_due'].includes(activeCandidatePanel.key) ? (
                  <article className="position-card position-card-drilldown">
                    <div className="position-card-head">
                      <div className="position-card-copy">
                        <strong>{activeCandidatePanel.label}</strong>
                        <p>
                          {activeCandidatePanel.mode === 'invoice'
                            ? activeInvoiceCandidateSummary
                            : activeTradeCandidateSummary}
                        </p>
                      </div>
                    </div>
                    {candidatePanelLoading ? (
                      <div className="skeleton-stack">
                        <div className="skeleton-block" />
                      </div>
                    ) : candidatePanelError ? (
                      <div className="empty-state">
                        <strong>Candidate read unavailable</strong>
                        <p>{candidatePanelError}</p>
                      </div>
                    ) : activeCandidatePanel.mode === 'invoice' && invoiceIssueCandidates ? (
                      invoiceIssueCandidates.items.length > 0 ? (
                        <div className="position-list">
                          {invoiceIssueCandidates.items.map((candidate) => {
                            const workflowHandoff = buildInvoiceIssueCandidateWorkflowHandoff(candidate)
                            return (
                              <article key={candidate.trade_id} className="position-card position-card-drilldown">
                              <div className="position-card-head">
                                <div className="position-card-copy">
                                  <strong>{candidate.trade_id}</strong>
                                  <span>
                                    {candidate.commodity} • {candidate.counterparty ?? 'Counterparty TBD'}
                                  </span>
                                </div>
                                <span
                                  className={`status-pill status-pill-${
                                    candidate.readiness_status === 'READY' ? 'active' : 'blocked'
                                  }`}
                                >
                                  {candidate.readiness_status.replaceAll('_', ' ')}
                                </span>
                              </div>
                              <div className="shipment-card-meta">
                                <span className="entity-chip entity-chip-soft">{candidate.book}</span>
                                <span className="entity-chip entity-chip-soft">
                                  {formatCommodityClass(candidate.commodity_class)}
                                </span>
                                <span className="entity-chip entity-chip-soft">
                                  {candidate.trade_currency_code ?? 'Currency TBD'}
                                </span>
                              </div>
                              <div className="position-card-copy">
                                <p>{candidate.preview_summary}</p>
                                <p>Priority: {candidate.priority_reason}</p>
                                {candidate.blocking_reasons.length > 0 ? (
                                  <p>{candidate.blocking_reasons.join(' • ')}</p>
                                ) : candidate.assumptions.length > 0 ? (
                                  <p>{candidate.assumptions.join(' • ')}</p>
                                ) : null}
                              </div>
                              <div className="position-card-actions">
                                <span>
                                  {candidate.age_days !== null ? `${candidate.age_days}d old` : 'Recent'} •{' '}
                                  {summarizeSettlementTradeCandidate(candidate)}
                                </span>
                                <div className="workflow-item-button-row">
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    onClick={() => onOpenView(workflowHandoff.view, workflowHandoff.handoff)}
                                  >
                                    {workflowHandoff.label}
                                  </button>
                                  <button
                                    type="button"
                                    className="button button-ghost"
                                    onClick={() => onOpenTrade(candidate.trade_id)}
                                  >
                                    Open Trade
                                  </button>
                                </div>
                              </div>
                              </article>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <strong>No invoice issue candidates</strong>
                          <p>The deterministic invoice issue read is clear right now.</p>
                        </div>
                      )
                    ) : activeCandidatePanel.mode === 'trade' && tradeAttentionCandidates ? (
                      tradeAttentionCandidates.items.length > 0 ? (
                        <div className="position-list">
                          {tradeAttentionCandidates.items.map((candidate) => {
                            const workflowHandoff = buildTradeAttentionCandidateWorkflowHandoff(candidate)
                            return (
                              <article key={candidate.trade_id} className="position-card position-card-drilldown">
                              <div className="position-card-head">
                                <div className="position-card-copy">
                                  <strong>{candidate.trade_id}</strong>
                                  <span>
                                    {candidate.commodity} • {candidate.counterparty ?? 'Counterparty TBD'}
                                  </span>
                                </div>
                                <span
                                  className={`status-pill status-pill-${
                                    candidate.blocking_reasons.length > 0 ? 'blocked' : 'active'
                                  }`}
                                >
                                  {candidate.age_days !== null ? `${candidate.age_days}d old` : 'Active'}
                                </span>
                              </div>
                              <div className="shipment-card-meta">
                                {candidate.candidate_types.map((candidateType) => (
                                  <span key={candidateType} className="entity-chip entity-chip-soft">
                                    {candidateType.replaceAll('_', ' ')}
                                  </span>
                                ))}
                                <span className="entity-chip entity-chip-soft">{candidate.book}</span>
                              </div>
                              <div className="position-card-copy">
                                <p>{summarizeSettlementTradeCandidate(candidate)}</p>
                                <p>Priority: {candidate.priority_reason}</p>
                                <p>
                                  {candidate.next_steps.length > 0
                                    ? candidate.next_steps.join(' • ')
                                    : `Execution ${formatDate(candidate.execution_timestamp)}`}
                                </p>
                                {candidate.blocking_reasons.length > 0 ? (
                                  <p>{candidate.blocking_reasons.join(' • ')}</p>
                                ) : null}
                              </div>
                              <div className="position-card-actions">
                                <span>
                                  Delivery {formatDateOnly(candidate.delivery_start)} to {formatDateOnly(candidate.delivery_end)}
                                </span>
                                <div className="workflow-item-button-row">
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    onClick={() => onOpenView(workflowHandoff.view, workflowHandoff.handoff)}
                                  >
                                    {workflowHandoff.label}
                                  </button>
                                  <button
                                    type="button"
                                    className="button button-ghost"
                                    onClick={() => onOpenTrade(candidate.trade_id)}
                                  >
                                    Open Trade
                                  </button>
                                </div>
                              </div>
                              </article>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <strong>No settlement candidates</strong>
                          <p>The deterministic due-payment candidate read is clear right now.</p>
                        </div>
                      )
                    ) : null}
                  </article>
                ) : null}
              </div>
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
          content: (
            <div className="position-list">
              {!hasScreenFilter && settlementExceptionCandidateCount > 0 ? (
                <article className="position-card">
                  <div className="position-card-actions">
                    <span>
                      {formatNumber(settlementExceptionCandidateCount, 0)} trade exceptions are flagged by the summary model.
                    </span>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => {
                        setActiveCandidatePanel((current) =>
                          current?.key === 'settlement_exception'
                            ? null
                            : {
                                key: 'settlement_exception',
                                label: 'Settlement exception candidates',
                                mode: 'trade',
                                candidateType: 'settlement_exception',
                              },
                        )
                        setInvoiceIssueCandidates(null)
                        setTradeAttentionCandidates(null)
                        setCandidatePanelError('')
                      }}
                    >
                      {activeCandidatePanel?.key === 'settlement_exception' ? 'Hide candidates' : 'Open candidates'}
                    </button>
                  </div>
                </article>
              ) : null}
              {settlementExceptionItems.length > 0 ? (
                settlementExceptionItems.map((item) => (
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
                ))
              ) : (
                <div className="empty-state">
                  <strong>No escalations</strong>
                  <p>No active trade is currently disputed or overdue in the settlement pipeline.</p>
                </div>
              )}
              {!hasScreenFilter &&
              activeCandidatePanel?.key === 'settlement_exception' &&
              activeCandidatePanel.mode === 'trade' ? (
                <article className="position-card position-card-drilldown">
                  <div className="position-card-head">
                    <div className="position-card-copy">
                      <strong>{activeCandidatePanel.label}</strong>
                      <p>{activeTradeCandidateSummary}</p>
                    </div>
                  </div>
                  {candidatePanelLoading ? (
                    <div className="skeleton-stack">
                      <div className="skeleton-block" />
                    </div>
                  ) : candidatePanelError ? (
                    <div className="empty-state">
                      <strong>Candidate read unavailable</strong>
                      <p>{candidatePanelError}</p>
                    </div>
                  ) : tradeAttentionCandidates && tradeAttentionCandidates.items.length > 0 ? (
                    <div className="position-list">
                      {tradeAttentionCandidates.items.map((candidate) => (
                        <article key={candidate.trade_id} className="position-card position-card-drilldown">
                          <div className="position-card-head">
                            <div className="position-card-copy">
                              <strong>{candidate.trade_id}</strong>
                              <span>
                                {candidate.commodity} • {candidate.counterparty ?? 'Counterparty TBD'}
                              </span>
                            </div>
                            <span className="status-pill status-pill-blocked">
                              {candidate.payment_status === 'OVERDUE' ? 'OVERDUE' : candidate.settlement_status}
                            </span>
                          </div>
                          <div className="shipment-card-meta">
                            {candidate.candidate_types.map((candidateType) => (
                              <span key={candidateType} className="entity-chip entity-chip-soft">
                                {candidateType.replaceAll('_', ' ')}
                              </span>
                            ))}
                            <span className="entity-chip entity-chip-soft">{candidate.book}</span>
                          </div>
                          <div className="position-card-copy">
                            <p>{summarizeSettlementTradeCandidate(candidate)}</p>
                            <p>Priority: {candidate.priority_reason}</p>
                            {candidate.blocking_reasons.length > 0 ? (
                              <p>{candidate.blocking_reasons.join(' • ')}</p>
                            ) : candidate.next_steps.length > 0 ? (
                              <p>{candidate.next_steps.join(' • ')}</p>
                            ) : null}
                          </div>
                          <div className="position-card-actions">
                            <span>{candidate.age_days !== null ? `${candidate.age_days}d old` : 'Active'}</span>
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => onOpenTrade(candidate.trade_id)}
                            >
                              Open Trade
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : tradeAttentionCandidates ? (
                    <div className="empty-state">
                      <strong>No settlement exceptions</strong>
                      <p>The deterministic exception candidate read is clear right now.</p>
                    </div>
                  ) : null}
                </article>
              ) : null}
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
