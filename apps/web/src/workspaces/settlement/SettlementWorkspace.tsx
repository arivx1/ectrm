import { TileLayout } from '../../shared/ui/TileLayout'
import type { Trade } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type SettlementWorkspaceProps = {
  authSession: StoredAuthSession | null
  activeTrades: Trade[]
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
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

function cashDirectionLabel(trade: Trade): string {
  if (trade.trade_side === 'SELL') {
    return 'Receivable'
  }
  if (trade.trade_side === 'BUY') {
    return 'Payable'
  }
  return 'Structured cashflow'
}

export function SettlementWorkspace({
  authSession,
  activeTrades,
  formatNumber,
  formatDate,
  formatDateOnly,
  onOpenTrade,
}: SettlementWorkspaceProps) {
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
      return (ageInDays(right.execution_timestamp ?? right.trade_date) ?? -1) - (ageInDays(left.execution_timestamp ?? left.trade_date) ?? -1)
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
                  <strong>{formatNumber(openSettlementTrades.length, 0)}</strong>
                  <p>Trades that are not fully settled and cash-complete yet.</p>
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
          title: disputedTrades.length > 0 ? 'Settlement Exceptions' : 'No active settlement exceptions',
          description: 'Disputed or overdue cashflow rows that usually need direct human escalation.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: disputedTrades.length > 0 ? (
            <div className="position-list">
              {disputedTrades.map((trade) => (
                <article key={trade.trade_id} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{trade.trade_id}</strong>
                      <span>
                        {trade.commodity} • {cashDirectionLabel(trade)}
                      </span>
                    </div>
                    <span className="status-pill status-pill-blocked">
                      {trade.payment_status === 'OVERDUE' ? 'OVERDUE' : 'DISPUTED'}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">Invoice {trade.invoice_status}</span>
                    <span className="entity-chip entity-chip-soft">Payment {trade.payment_status}</span>
                    <span className="entity-chip entity-chip-soft">Settlement {trade.settlement_status}</span>
                  </div>
                  <div className="shipment-card-actions">
                    <span>Updated {formatDate(trade.updated_at)}</span>
                    <button type="button" className="button button-ghost" onClick={() => onOpenTrade(trade.trade_id)}>
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
          description: 'An age-ordered list of trades still moving through invoice, payment, or final settlement.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: openSettlementTrades.length > 0 ? (
            <div className="position-list">
              {openSettlementTrades.map((trade) => {
                const age = ageInDays(trade.execution_timestamp ?? trade.trade_date)
                const tone =
                  settlementPriority(trade) === 0
                    ? 'blocked'
                    : settlementPriority(trade) === 1
                      ? 'in-progress'
                      : 'active'

                return (
                  <article key={trade.trade_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{trade.trade_id}</strong>
                        <span>
                          {trade.commodity} • {trade.counterparty ?? 'Counterparty TBD'}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${tone}`}>
                        {trade.settlement_status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{cashDirectionLabel(trade)}</span>
                      <span className="entity-chip entity-chip-soft">Invoice {trade.invoice_status}</span>
                      <span className="entity-chip entity-chip-soft">Payment {trade.payment_status}</span>
                      <span className="entity-chip entity-chip-soft">{trade.book}</span>
                    </div>
                    <div className="shipment-card-copy">
                      <p>
                        Trade date {formatDateOnly(trade.trade_date)} • Execution {formatDate(trade.execution_timestamp)} • Open{' '}
                        {age === null ? '—' : `${age}d`}
                      </p>
                    </div>
                    <div className="shipment-card-actions">
                      <span>{trade.trader_user ?? 'Trader TBD'}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(trade.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                )
              })}
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
