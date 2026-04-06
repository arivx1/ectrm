import { useEffect, useState } from 'react'

import {
  loadActivitySummary,
  loadCashForecastReport,
  loadExposureSummary,
  loadPnlHistoryReport,
  loadReportingOverview,
  loadSettlementAgingReport,
} from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import { formatCurrencyAmount } from '../../shared/format'
import type {
  ActivitySummaryRow,
  CashForecastReport,
  CounterpartyCreditReportRow,
  ExposureSummaryRow,
  PnlHistoryReport,
  ReportingOverview,
  SettlementAgingReport,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { TileLayout } from '../../shared/ui/TileLayout'

type ReportsWorkspaceProps = {
  authSession: StoredAuthSession | null
  counterpartyCreditReport: CounterpartyCreditReportRow[]
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
}

function reportErrorState(message: string) {
  return (
    <div className="empty-state">
      <strong>Reporting is unavailable</strong>
      <p>{message}</p>
    </div>
  )
}

export function ReportsWorkspace({
  authSession,
  counterpartyCreditReport,
  formatNumber,
  formatMoney,
  formatDate,
}: ReportsWorkspaceProps) {
  const [overview, setOverview] = useState<ReportingOverview | null>(null)
  const [exposureSummary, setExposureSummary] = useState<ExposureSummaryRow[]>([])
  const [activitySummary, setActivitySummary] = useState<ActivitySummaryRow[]>([])
  const [pnlHistory, setPnlHistory] = useState<PnlHistoryReport | null>(null)
  const [settlementAging, setSettlementAging] = useState<SettlementAgingReport | null>(null)
  const [cashForecast, setCashForecast] = useState<CashForecastReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadReports() {
      setLoading(true)
      setError('')

      try {
        const [
          nextOverview,
          nextExposureSummary,
          nextActivitySummary,
          nextPnlHistory,
          nextSettlementAging,
          nextCashForecast,
        ] = await Promise.all([
          loadReportingOverview(appConfig.apiBase),
          loadExposureSummary(appConfig.apiBase),
          loadActivitySummary(appConfig.apiBase),
          loadPnlHistoryReport(appConfig.apiBase),
          loadSettlementAgingReport(appConfig.apiBase),
          loadCashForecastReport(appConfig.apiBase),
        ])

        if (cancelled) {
          return
        }

        setOverview(nextOverview)
        setExposureSummary(nextExposureSummary)
        setActivitySummary(nextActivitySummary)
        setPnlHistory(nextPnlHistory)
        setSettlementAging(nextSettlementAging)
        setCashForecast(nextCashForecast)
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load report data.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadReports()

    return () => {
      cancelled = true
    }
  }, [])

  const rankedCounterparties = [...counterpartyCreditReport].sort((left, right) => {
    if (left.limit_breached !== right.limit_breached) {
      return left.limit_breached ? -1 : 1
    }
    if (left.review_is_due !== right.review_is_due) {
      return left.review_is_due ? -1 : 1
    }
    return right.active_trade_count - left.active_trade_count
  })

  const agingCurrencySummaries = settlementAging?.currency_summaries ?? []
  const agingRows = settlementAging?.rows ?? []
  const cashCurrencySummaries = cashForecast?.currency_summaries ?? []
  const cashPoints = cashForecast?.points ?? []

  return (
    <TileLayout
      workspaceId="reports"
      workspaceLabel="Reports"
      authSession={authSession}
      tiles={[
        {
          id: 'reports-overview',
          eyebrow: 'Summary',
          title: 'Reporting Overview',
          description: 'A dedicated reporting surface over the desk summaries that previously lived only behind endpoints.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : overview ? (
            <div className="dashboard-report-grid">
              <article className="dashboard-report-card">
                <span>Active Trades</span>
                <strong>{formatNumber(overview.active_trade_count, 0)}</strong>
                <p>Trade count represented in the reporting overview.</p>
              </article>
              <article className="dashboard-report-card">
                <span>Tracked Commodities</span>
                <strong>{formatNumber(overview.tracked_commodity_count, 0)}</strong>
                <p>Distinct commodities currently represented in the reporting layer.</p>
              </article>
              <article className="dashboard-report-card">
                <span>Gross Net Volume</span>
                <strong>{formatNumber(overview.gross_net_volume, 0)}</strong>
                <p>Absolute reported volume across the exposure summary output.</p>
              </article>
              <article className="dashboard-report-card">
                <span>P&amp;L Snapshot</span>
                <strong>{formatMoney(pnlHistory?.summary.total_pnl ?? null)}</strong>
                <p>{pnlHistory?.basis ?? 'P&L reporting basis unavailable'}.</p>
              </article>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No reporting overview</strong>
              <p>The reporting service has not produced an overview yet.</p>
            </div>
          ),
        },
        {
          id: 'reports-exposure',
          eyebrow: 'Exposure',
          title: 'Exposure Summary',
          description: 'The commodity-level report output presented as a dedicated analyst workspace instead of a raw endpoint.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : exposureSummary.length > 0 ? (
            <div className="position-list">
              {exposureSummary.map((row) => (
                <article key={row.commodity} className="position-card">
                  <div>
                    <strong>{row.commodity}</strong>
                    <span>{row.active_trade_count} active trade{row.active_trade_count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="position-value">
                    <b>{formatNumber(row.net_volume, 0)}</b>
                    <span>{formatDate(row.updated_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No exposure report yet</strong>
              <p>Once the reporting layer sees projected positions, the commodity rollup will appear here.</p>
            </div>
          ),
        },
        {
          id: 'reports-activity',
          eyebrow: 'Activity',
          title: 'Activity Summary',
          description: 'A reporting-first view of the lifecycle tape grouped by event type and recency.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : activitySummary.length > 0 ? (
            <div className="position-list">
              {activitySummary.map((row) => (
                <article key={row.event_type} className="position-card">
                  <div>
                    <strong>{row.event_type}</strong>
                    <span>Last seen {formatDate(row.last_occurred_at)}</span>
                  </div>
                  <div className="position-value">
                    <b>{formatNumber(row.event_count, 0)}</b>
                    <span>events</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No activity report yet</strong>
              <p>Event reporting will appear once lifecycle events have been captured.</p>
            </div>
          ),
        },
        {
          id: 'reports-settlement-aging',
          eyebrow: 'Settlement',
          title: 'Settlement Aging',
          description: 'Open invoice exposure grouped into current and past-due buckets, with disputed cash called out instead of staying buried in the settlement queue.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : settlementAging && agingCurrencySummaries.length > 0 ? (
            <>
              <div className="dashboard-report-grid">
                {agingCurrencySummaries.map((summary) => (
                  <article key={summary.currency_code} className="dashboard-report-card">
                    <span>{summary.currency_code} Open</span>
                    <strong>{formatCurrencyAmount(summary.total_outstanding_amount, summary.currency_code)}</strong>
                    <p>
                      Current {formatCurrencyAmount(summary.current_amount, summary.currency_code)} • 1-7{' '}
                      {formatCurrencyAmount(summary.past_due_1_7_amount, summary.currency_code)} • 8-30{' '}
                      {formatCurrencyAmount(summary.past_due_8_30_amount, summary.currency_code)} • 31+{' '}
                      {formatCurrencyAmount(summary.past_due_31_plus_amount, summary.currency_code)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="position-list">
                {agingRows.slice(0, 8).map((row) => (
                  <article
                    key={`${row.counterparty_code ?? 'UNSPECIFIED'}-${row.book}-${row.currency_code}`}
                    className="position-card shipment-card"
                  >
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{row.counterparty_code ?? 'Counterparty TBD'}</strong>
                        <span>
                          {row.book} • {row.trade_count} trade{row.trade_count === 1 ? '' : 's'} • {row.invoice_count} invoice
                          {row.invoice_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${row.overdue_invoice_count > 0 || row.disputed_invoice_count > 0 ? 'blocked' : 'active'}`}>
                        {formatCurrencyAmount(row.total_outstanding_amount, row.currency_code)}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">
                        Current {formatCurrencyAmount(row.current_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        1-7 {formatCurrencyAmount(row.past_due_1_7_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        8-30 {formatCurrencyAmount(row.past_due_8_30_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        31+ {formatCurrencyAmount(row.past_due_31_plus_amount, row.currency_code)}
                      </span>
                      {row.disputed_amount > 0 ? (
                        <span className="entity-chip entity-chip-soft">
                          Disputed {formatCurrencyAmount(row.disputed_amount, row.currency_code)}
                        </span>
                      ) : null}
                    </div>
                    <div className="shipment-card-copy">
                      <p>
                        {row.overdue_invoice_count} overdue • {row.disputed_invoice_count} disputed • Oldest due{' '}
                        {formatDate(row.oldest_due_at)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>No settlement aging yet</strong>
              <p>Open invoices will populate aging once the settlement ledger starts carrying unpaid cash exposure.</p>
            </div>
          ),
        },
        {
          id: 'reports-cash-forecast',
          eyebrow: 'Cash',
          title: 'Cash Forecast',
          description: 'Expected receipts from open invoices versus actual settlement receipts, using the live ledger instead of desk-side spreadsheets.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : cashForecast && cashCurrencySummaries.length > 0 ? (
            <>
              <div className="dashboard-report-grid">
                {cashCurrencySummaries.map((summary) => (
                  <article key={summary.currency_code} className="dashboard-report-card">
                    <span>{summary.currency_code} Horizon</span>
                    <strong>{formatCurrencyAmount(summary.expected_horizon_amount, summary.currency_code)}</strong>
                    <p>
                      Open {formatCurrencyAmount(summary.open_outstanding_amount, summary.currency_code)} • Overdue{' '}
                      {formatCurrencyAmount(summary.overdue_outstanding_amount, summary.currency_code)} • Received{' '}
                      {formatCurrencyAmount(summary.received_horizon_amount, summary.currency_code)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="position-list">
                {cashPoints.slice(0, 12).map((point) => (
                  <article key={`${point.forecast_date}-${point.currency_code}`} className="position-card">
                    <div>
                      <strong>{formatDate(point.forecast_date)}</strong>
                      <span>
                        {point.currency_code} • {point.expected_invoice_count} due • {point.received_payment_count} received
                      </span>
                    </div>
                    <div className="position-value">
                      <b>{formatCurrencyAmount(point.expected_amount, point.currency_code)}</b>
                      <span>Expected</span>
                    </div>
                    <div className="shipment-card-copy">
                      <p>Received {formatCurrencyAmount(point.received_amount, point.currency_code)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>No cash forecast yet</strong>
              <p>Cash forecast points will appear once invoice due dates or payment receipts have been recorded.</p>
            </div>
          ),
        },
        {
          id: 'reports-credit',
          eyebrow: 'Credit',
          title: 'Counterparty Credit Report',
          description: 'Credit, exposure, and review posture on one desk-facing report surface.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: rankedCounterparties.length > 0 ? (
            <div className="position-list">
              {rankedCounterparties.slice(0, 8).map((row) => (
                <article key={row.counterparty_code} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{row.counterparty_name}</strong>
                      <span>
                        {row.counterparty_code} • {row.counterparty_type}
                      </span>
                    </div>
                    <span className={`status-pill status-pill-${row.limit_breached || row.review_is_due ? 'blocked' : 'active'}`}>
                      {row.credit_status}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{row.active_trade_count} active</span>
                    <span className="entity-chip entity-chip-soft">{row.priced_trade_count} priced</span>
                    <span className="entity-chip entity-chip-soft">{row.unpriced_trade_count} unpriced</span>
                    <span className="entity-chip entity-chip-soft">{row.breach_action}</span>
                  </div>
                  <div className="shipment-card-copy">
                    <p>
                      Exposure {formatCurrencyAmount(row.exposure_amount ?? null, row.exposure_currency_code)} • Limit{' '}
                      {formatCurrencyAmount(row.limit_amount ?? null, row.limit_currency_code)}
                    </p>
                    <p>
                      Rating {row.credit_rating ?? 'NR'} • Updated {formatDate(row.latest_trade_updated_at ?? null)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No counterparty credit report</strong>
              <p>Counterparty reporting will appear once active trade exposure and credit data are available.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
