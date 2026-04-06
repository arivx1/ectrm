import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { Trade, TradeWorkflowItemRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { WorkflowQueueEditor } from '../operations/WorkflowQueueEditor'

type SettlementWorkspaceProps = {
  authSession: StoredAuthSession | null
  activeTrades: Trade[]
  workItems: TradeWorkflowItemRecord[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  workflowMutationError: string
  workflowMutationPendingId: number | null
  onOpenTrade: (tradeId: string) => void
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
  workItems,
  formatCommodityClass,
  formatNumber,
  formatDate,
  formatDateOnly,
  workflowMutationError,
  workflowMutationPendingId,
  onOpenTrade,
  onSaveWorkflowItem,
}: SettlementWorkspaceProps) {
  const settlementWorkItems = workItems.filter((item) => item.queue === 'settlement')
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
      trade.settlement_status === 'DISPUTED' ||
      trade.invoice_status === 'DISPUTED' ||
      trade.payment_status === 'OVERDUE',
  )
  const invoicePendingCount = activeTrades.filter(
    (trade) => !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(trade.invoice_status),
  ).length
  const paymentDueCount = activeTrades.filter((trade) => ['DUE', 'OVERDUE'].includes(trade.payment_status)).length
  const settledCount = activeTrades.filter(
    (trade) =>
      trade.settlement_status === 'SETTLED' &&
      ['PAID', 'NOT_REQUIRED'].includes(trade.payment_status),
  ).length
  const settlementBreakdown = ['PENDING', 'INVOICED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED']
    .map((status) => ({
      status,
      count: activeTrades.filter((trade) => trade.settlement_status === status).length,
    }))
    .filter((row) => row.count > 0)
  const oldestOpenTrade = openSettlementTrades[0] ?? null

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
            activeTrades.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Open Settlement</span>
                  <strong>{formatNumber(openSettlementWorkItems.length, 0)}</strong>
                  <p>Invoice and payment workflow tickets still open on the active trade book.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Invoice Pending</span>
                  <strong>{formatNumber(invoicePendingCount, 0)}</strong>
                  <p>Active trades still waiting on issued or approved invoice status.</p>
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
          title: oldestOpenTrade ? `${oldestOpenTrade.trade_id} is leading the open queue` : 'Settlement Ladder',
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
          title:
            settlementExceptionItems.length > 0 || disputedTrades.length > 0
              ? 'Settlement Exceptions'
              : 'No active settlement exceptions',
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
          description: 'Editable invoice and payment queue cards so settlement work can actually be assigned and advanced.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: openSettlementWorkItems.length > 0 ? (
            <WorkflowQueueEditor
              key={openSettlementWorkItems.map((item) => `${item.item_id}:${item.version}`).join('|')}
              authSession={authSession}
              items={openSettlementWorkItems}
              savingItemId={workflowMutationPendingId}
              saveError={workflowMutationError}
              formatCommodityClass={formatCommodityClass}
              formatDate={formatDate}
              formatDateOnly={formatDateOnly}
              onOpenTrade={onOpenTrade}
              onSaveItem={onSaveWorkflowItem}
            />
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
