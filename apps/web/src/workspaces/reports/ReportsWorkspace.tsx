import { useEffect, useMemo, useState } from 'react'

import {
  loadActivitySummary,
  loadPnlComparisonReport,
  loadExposureSummary,
  loadPnlHistoryReport,
  loadReportingOverview,
} from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import { formatCurrencyAmount } from '../../shared/format'
import type {
  ActivitySummaryRow,
  CounterpartyCreditReportRow,
  ExposureSummaryRow,
  PnlComparisonReport,
  PnlTradeAttributionRow,
  PnlTradeValuation,
  PnlHistoryReport,
  PortfolioRecord,
  ReportingOverview,
  Trade,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildUnitLabelByCommodity, summarizeUnitLabels } from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileLayout } from '../../shared/ui/TileLayout'
import { reportErrorState } from './reportTileScaffold'
import { buildSettlementReportTiles } from './settlementReportTiles'
import { ALL_FILTER_VALUE } from './settlementReportLens'
import {
  deltaTone,
  formatCodeLabel,
  formatLifecycleEventLabel,
  formatSignedMoney,
  uniqueSorted,
} from './reportUtils'
import { useSettlementReportLens } from './useSettlementReportLens'

type ReportsWorkspaceProps = {
  activeTrades: Trade[]
  authSession: StoredAuthSession | null
  counterpartyCreditReport: CounterpartyCreditReportRow[]
  portfolios: PortfolioRecord[]
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenSettlement: () => void
  onOpenTrade: (tradeId: string) => void
}

type PortfolioValuationRollup = {
  portfolio: string
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  pricedTradeCount: number
}

type TradeAttributionDisplayRow = PnlTradeAttributionRow & {
  portfolio: string
  book: string
}

function valuationCoverageTone(valuation: PnlTradeValuation): 'active' | 'in-progress' {
  return valuation.included_in_totals ? 'active' : 'in-progress'
}

function attributionTone(category: string): 'active' | 'in-progress' | 'blocked' {
  switch (category) {
    case 'REALIZATION':
    case 'MARK_CHANGE':
    case 'CARRY':
      return 'active'
    case 'NEW_POSITION':
    case 'REMOVED_POSITION':
    case 'POSITION_CHANGE':
    case 'ENTERED_TOTALS':
    case 'EXITED_TOTALS':
    case 'REOPENED':
      return 'in-progress'
    default:
      return 'blocked'
  }
}

function attributionLabel(category: string): string {
  switch (category) {
    case 'NEW_POSITION':
      return 'New position'
    case 'REMOVED_POSITION':
      return 'Removed position'
    case 'ENTERED_TOTALS':
      return 'Entered totals'
    case 'EXITED_TOTALS':
      return 'Exited totals'
    case 'REALIZATION':
      return 'Realization'
    case 'REOPENED':
      return 'Reopened'
    case 'POSITION_CHANGE':
      return 'Position change'
    case 'MARK_CHANGE':
      return 'Mark change'
    case 'CARRY':
      return 'Carry'
    case 'OUTSIDE_TOTALS':
      return 'Outside totals'
    default:
      return formatCodeLabel(category)
  }
}

export function ReportsWorkspace({
  activeTrades,
  authSession,
  counterpartyCreditReport,
  portfolios,
  formatNumber,
  formatMoney,
  formatDate,
  formatDateOnly,
  onOpenSettlement,
  onOpenTrade,
}: ReportsWorkspaceProps) {
  const reportAccessToken = authSession?.accessToken
  const [overview, setOverview] = useState<ReportingOverview | null>(null)
  const [exposureSummary, setExposureSummary] = useState<ExposureSummaryRow[]>([])
  const [activitySummary, setActivitySummary] = useState<ActivitySummaryRow[]>([])
  const [pnlHistory, setPnlHistory] = useState<PnlHistoryReport | null>(null)
  const [valuationSnapshot, setValuationSnapshot] = useState<PnlHistoryReport | null>(null)
  const [valuationSnapshotDate, setValuationSnapshotDate] = useState('')
  const [valuationPortfolioFilter, setValuationPortfolioFilter] = useState(ALL_FILTER_VALUE)
  const [valuationComparison, setValuationComparison] = useState<PnlComparisonReport | null>(null)
  const [comparisonStartDate, setComparisonStartDate] = useState('')
  const [comparisonEndDate, setComparisonEndDate] = useState('')
  const [comparisonPortfolioFilter, setComparisonPortfolioFilter] = useState(ALL_FILTER_VALUE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [valuationLoading, setValuationLoading] = useState(false)
  const [valuationError, setValuationError] = useState('')
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const settlement = useSettlementReportLens({ authSession, reportAccessToken })

  useEffect(() => {
    let cancelled = false

    async function loadBaseReports() {
      setLoading(true)
      setError('')

      try {
        const [
          nextOverview,
          nextExposureSummary,
          nextActivitySummary,
          nextPnlHistory,
        ] = await Promise.all([
          loadReportingOverview(appConfig.apiBase, reportAccessToken),
          loadExposureSummary(appConfig.apiBase, reportAccessToken),
          loadActivitySummary(appConfig.apiBase, reportAccessToken),
          loadPnlHistoryReport(appConfig.apiBase, {}, reportAccessToken),
        ])

        if (cancelled) {
          return
        }

        setOverview(nextOverview)
        setExposureSummary(nextExposureSummary)
        setActivitySummary(nextActivitySummary)
        setPnlHistory(nextPnlHistory)
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

    void loadBaseReports()

    return () => {
      cancelled = true
    }
  }, [reportAccessToken])

  const rankedCounterparties = useMemo(() => {
    return [...counterpartyCreditReport].sort((left, right) => {
      if (left.limit_breached !== right.limit_breached) {
        return left.limit_breached ? -1 : 1
      }
      if (left.review_is_due !== right.review_is_due) {
        return left.review_is_due ? -1 : 1
      }
      return right.active_trade_count - left.active_trade_count
    })
  }, [counterpartyCreditReport])
  const commodityUnitLabels = useMemo(() => buildUnitLabelByCommodity(activeTrades), [activeTrades])
  const grossNetVolumeUnitLabel = useMemo(
    () => summarizeUnitLabels(activeTrades.map((trade) => trade.unit_of_measure)),
    [activeTrades],
  )

  const availableSnapshotDates = useMemo(
    () => uniqueSorted((pnlHistory?.points ?? []).map((point) => point.date)),
    [pnlHistory],
  )
  const latestAvailableSnapshotDate = availableSnapshotDates[availableSnapshotDates.length - 1] ?? ''
  const previousAvailableSnapshotDate =
    availableSnapshotDates.length > 1 ? availableSnapshotDates[availableSnapshotDates.length - 2] : latestAvailableSnapshotDate
  const valuationQuickDates = useMemo(
    () => [...availableSnapshotDates].sort((left, right) => right.localeCompare(left)).slice(0, 5),
    [availableSnapshotDates],
  )
  const portfolioFilterOptions = useMemo(() => {
    return uniqueSorted([
      ...portfolios.filter((portfolio) => portfolio.is_active).map((portfolio) => portfolio.code),
      ...(valuationSnapshot?.valuations ?? []).map((valuation) => valuation.portfolio),
      ...(valuationComparison?.portfolio_deltas ?? []).map((row) => row.portfolio),
      valuationPortfolioFilter !== ALL_FILTER_VALUE ? valuationPortfolioFilter : null,
      comparisonPortfolioFilter !== ALL_FILTER_VALUE ? comparisonPortfolioFilter : null,
    ])
  }, [comparisonPortfolioFilter, portfolios, valuationComparison, valuationPortfolioFilter, valuationSnapshot])

  useEffect(() => {
    if (!valuationSnapshotDate && latestAvailableSnapshotDate) {
      setValuationSnapshotDate(latestAvailableSnapshotDate)
    }
  }, [latestAvailableSnapshotDate, valuationSnapshotDate])

  useEffect(() => {
    if (!comparisonEndDate && latestAvailableSnapshotDate) {
      setComparisonEndDate(latestAvailableSnapshotDate)
    }
    if (!comparisonStartDate && previousAvailableSnapshotDate) {
      setComparisonStartDate(previousAvailableSnapshotDate)
    }
  }, [comparisonEndDate, comparisonStartDate, latestAvailableSnapshotDate, previousAvailableSnapshotDate])

  useEffect(() => {
    if (!valuationSnapshotDate) {
      setValuationSnapshot(null)
      setValuationLoading(false)
      setValuationError('')
      return
    }

    let cancelled = false

    async function loadValuationSnapshot() {
      setValuationLoading(true)
      setValuationError('')

      try {
        const nextSnapshot = await loadPnlHistoryReport(appConfig.apiBase, {
          asOf: valuationSnapshotDate,
          portfolio: valuationPortfolioFilter !== ALL_FILTER_VALUE ? valuationPortfolioFilter : undefined,
        }, reportAccessToken)

        if (!cancelled) {
          setValuationSnapshot(nextSnapshot)
        }
      } catch (nextError) {
        if (!cancelled) {
          setValuationSnapshot(null)
          setValuationError(nextError instanceof Error ? nextError.message : 'Unable to load the valuation snapshot.')
        }
      } finally {
        if (!cancelled) {
          setValuationLoading(false)
        }
      }
    }

    void loadValuationSnapshot()

    return () => {
      cancelled = true
    }
  }, [reportAccessToken, valuationPortfolioFilter, valuationSnapshotDate])

  const comparisonDateError =
    comparisonStartDate && comparisonEndDate && comparisonStartDate > comparisonEndDate
      ? 'Comparison start date must be on or before the end date.'
      : ''

  useEffect(() => {
    if (!comparisonStartDate || !comparisonEndDate || comparisonDateError) {
      setValuationComparison(null)
      setComparisonLoading(false)
      setComparisonError(comparisonDateError)
      return
    }

    let cancelled = false

    async function loadValuationComparison() {
      setComparisonLoading(true)
      setComparisonError('')

      try {
        const nextComparison = await loadPnlComparisonReport(appConfig.apiBase, {
          fromAsOf: comparisonStartDate,
          toAsOf: comparisonEndDate,
          portfolio: comparisonPortfolioFilter !== ALL_FILTER_VALUE ? comparisonPortfolioFilter : undefined,
        }, reportAccessToken)
        if (!cancelled) {
          setValuationComparison(nextComparison)
        }
      } catch (nextError) {
        if (!cancelled) {
          setValuationComparison(null)
          setComparisonError(nextError instanceof Error ? nextError.message : 'Unable to load the valuation comparison.')
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false)
        }
      }
    }

    void loadValuationComparison()

    return () => {
      cancelled = true
    }
  }, [comparisonDateError, comparisonEndDate, comparisonPortfolioFilter, comparisonStartDate, reportAccessToken])

  const valuationSummary = valuationSnapshot?.summary ?? null
  const snapshotValuations = useMemo(() => valuationSnapshot?.valuations ?? [], [valuationSnapshot])
  const includedSnapshotValuations = useMemo(
    () => snapshotValuations.filter((valuation) => valuation.included_in_totals && valuation.pnl_contribution !== null),
    [snapshotValuations],
  )
  const excludedSnapshotValuationCount = Math.max(snapshotValuations.length - includedSnapshotValuations.length, 0)
  const snapshotPortfolioRollups = useMemo(() => {
    const rollups = new Map<string, PortfolioValuationRollup>()

    for (const valuation of includedSnapshotValuations) {
      const portfolioCode = valuation.portfolio ?? 'UNASSIGNED'
      const current = rollups.get(portfolioCode) ?? {
        portfolio: portfolioCode,
        totalPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        pricedTradeCount: 0,
      }

      const pnlContribution = valuation.pnl_contribution ?? 0
      current.totalPnl += pnlContribution
      if (valuation.pnl_bucket === 'REALIZED') {
        current.realizedPnl += pnlContribution
      } else {
        current.unrealizedPnl += pnlContribution
      }
      current.pricedTradeCount += 1
      rollups.set(portfolioCode, current)
    }

    return [...rollups.values()].sort((left, right) => {
      const totalDiff = Math.abs(right.totalPnl) - Math.abs(left.totalPnl)
      if (Math.abs(totalDiff) > 0.0001) {
        return totalDiff
      }
      return left.portfolio.localeCompare(right.portfolio)
    })
  }, [includedSnapshotValuations])
  const topSnapshotValuations = useMemo(() => {
    return [...snapshotValuations]
      .sort((left, right) => {
        const pnlDiff = Math.abs(right.pnl_contribution ?? 0) - Math.abs(left.pnl_contribution ?? 0)
        if (Math.abs(pnlDiff) > 0.0001) {
          return pnlDiff
        }
        return left.trade_id.localeCompare(right.trade_id)
      })
      .slice(0, 8)
  }, [snapshotValuations])
  const snapshotFilterActive =
    valuationPortfolioFilter !== ALL_FILTER_VALUE ||
    Boolean(valuationSnapshotDate && latestAvailableSnapshotDate && valuationSnapshotDate !== latestAvailableSnapshotDate)
  const comparisonSummary = valuationComparison?.delta ?? null
  const comparisonAttributionSummary = valuationComparison?.attribution_summary ?? null
  const comparisonPortfolioDeltas = useMemo(
    () => valuationComparison?.portfolio_deltas ?? [],
    [valuationComparison],
  )
  const comparisonDailyBridge = useMemo(
    () => valuationComparison?.daily_bridge ?? [],
    [valuationComparison],
  )
  const changedAttributionRows = useMemo(() => {
    const rows = valuationComparison?.attributions ?? []
    return rows.filter(
      (row) => Math.abs(row.pnl_delta) > 0.0001 || !['CARRY', 'OUTSIDE_TOTALS'].includes(row.attribution_category),
    )
  }, [valuationComparison])
  const topChangedAttributions = useMemo<TradeAttributionDisplayRow[]>(() => {
    return [...changedAttributionRows]
      .sort((left, right) => {
        const leftMagnitude = Math.max(
          Math.abs(left.pnl_delta),
          Math.abs(left.breakdown.realization_transfer_pnl),
          Math.abs(left.breakdown.reconciled_pnl_delta),
        )
        const rightMagnitude = Math.max(
          Math.abs(right.pnl_delta),
          Math.abs(right.breakdown.realization_transfer_pnl),
          Math.abs(right.breakdown.reconciled_pnl_delta),
        )
        if (Math.abs(rightMagnitude - leftMagnitude) > 0.0001) {
          return rightMagnitude - leftMagnitude
        }
        return left.trade_id.localeCompare(right.trade_id)
      })
      .map((row) => {
        const primaryValuation = row.to_valuation ?? row.from_valuation
        return {
          ...row,
          portfolio: primaryValuation?.portfolio ?? 'UNASSIGNED',
          book: primaryValuation?.book ?? 'Book TBD',
        }
      })
      .slice(0, 10)
  }, [changedAttributionRows])
  const comparisonFilterActive =
    comparisonPortfolioFilter !== ALL_FILTER_VALUE ||
    Boolean(
      comparisonStartDate &&
        previousAvailableSnapshotDate &&
        comparisonStartDate !== previousAvailableSnapshotDate,
    ) ||
    Boolean(comparisonEndDate && latestAvailableSnapshotDate && comparisonEndDate !== latestAvailableSnapshotDate)

  function resetValuationSnapshotFilters() {
    setValuationPortfolioFilter(ALL_FILTER_VALUE)
    setValuationSnapshotDate(latestAvailableSnapshotDate)
  }

  function resetValuationComparisonFilters() {
    setComparisonPortfolioFilter(ALL_FILTER_VALUE)
    setComparisonStartDate(previousAvailableSnapshotDate)
    setComparisonEndDate(latestAvailableSnapshotDate)
  }

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
                <MetricValue value={formatNumber(overview.gross_net_volume, 0)} unit={grossNetVolumeUnitLabel} />
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
                    <MetricValue
                      as="b"
                      value={formatNumber(row.net_volume, 0)}
                      unit={commodityUnitLabels.get(row.commodity) ?? 'Unit TBD'}
                    />
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
          id: 'reports-valuation-snapshot',
          eyebrow: 'Valuation',
          title: valuationSnapshotDate ? `Portfolio Snapshot · ${formatDateOnly(valuationSnapshotDate)}` : 'Portfolio Snapshot',
          description: 'Select one date at a time to inspect the marked portfolio and the trades driving that snapshot.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : availableSnapshotDates.length === 0 ? (
            <div className="empty-state">
              <strong>No valuation history yet</strong>
              <p>As trades and price observations arrive, daily valuation snapshots will become selectable here.</p>
            </div>
          ) : valuationLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : valuationError ? (
            reportErrorState(valuationError)
          ) : valuationSnapshot ? (
            <div className="pnl-trend-panel">
              <div className="pnl-trend-topbar">
                <div className="pnl-trend-copy">
                  <span>As Of {valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'Snapshot date TBD'}</span>
                  <p>
                    {valuationSnapshot.basis ?? pnlHistory?.basis ?? 'Valuation basis unavailable'}. Select a day to inspect
                    the desk-wide valuation or narrow the view to one portfolio.
                  </p>
                </div>
                <div className="pnl-trend-toolbar">
                  {valuationQuickDates.length > 0 ? (
                    <div className="pnl-trend-presets" aria-label="Recent valuation snapshot dates">
                      {valuationQuickDates.map((dateValue) => (
                        <button
                          key={dateValue}
                          type="button"
                          className={`tab-pill ${valuationSnapshotDate === dateValue ? 'is-active' : ''}`}
                          aria-pressed={valuationSnapshotDate === dateValue}
                          onClick={() => setValuationSnapshotDate(dateValue)}
                        >
                          {formatDateOnly(dateValue)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {snapshotFilterActive ? (
                    <button
                      type="button"
                      className="button button-ghost pnl-trend-reset-button"
                      onClick={resetValuationSnapshotFilters}
                    >
                      Latest Snapshot
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pnl-trend-filter-grid">
                <label className="field">
                  <span>Snapshot Date</span>
                  <input
                    className="control"
                    type="date"
                    value={valuationSnapshotDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setValuationSnapshotDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Portfolio</span>
                  <select
                    className="control"
                    value={valuationPortfolioFilter}
                    onChange={(event) => setValuationPortfolioFilter(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Portfolios</option>
                    {portfolioFilterOptions.map((portfolio) => (
                      <option key={portfolio} value={portfolio}>
                        {portfolio}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pnl-trend-summary-grid">
                <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
                  <span>Total Value</span>
                  <strong>{formatMoney(valuationSummary?.total_pnl ?? 0)}</strong>
                  <p>{valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'Snapshot date TBD'}</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Open Value</span>
                  <strong>{formatMoney(valuationSummary?.unrealized_pnl ?? 0)}</strong>
                  <p>{formatNumber(valuationSummary?.unrealized_trade_count ?? 0, 0)} open trade snapshots in totals.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Realized Value</span>
                  <strong>{formatMoney(valuationSummary?.realized_pnl ?? 0)}</strong>
                  <p>{formatNumber(valuationSummary?.realized_trade_count ?? 0, 0)} settled trade snapshots in totals.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Portfolios in Totals</span>
                  <strong>{formatNumber(snapshotPortfolioRollups.length, 0)}</strong>
                  <p>
                    {excludedSnapshotValuationCount > 0
                      ? `${formatNumber(excludedSnapshotValuationCount, 0)} trade valuation${excludedSnapshotValuationCount === 1 ? '' : 's'} remain outside totals.`
                      : `${formatNumber(valuationSummary?.priced_trade_count ?? 0, 0)} priced trade valuation${(valuationSummary?.priced_trade_count ?? 0) === 1 ? '' : 's'} included.`}
                  </p>
                </article>
              </div>

              <div className="shipment-card-actions pnl-trend-active-filters">
                <span>
                  Showing {formatNumber(snapshotValuations.length, 0)} trade valuation
                  {snapshotValuations.length === 1 ? '' : 's'} for {valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'the selected date'}.
                </span>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    {valuationPortfolioFilter !== ALL_FILTER_VALUE ? `Portfolio ${valuationPortfolioFilter}` : 'All portfolios'}
                  </span>
                  {excludedSnapshotValuationCount > 0 ? (
                    <span className="entity-chip entity-chip-soft">
                      {formatNumber(excludedSnapshotValuationCount, 0)} outside totals
                    </span>
                  ) : null}
                </div>
              </div>

              {snapshotPortfolioRollups.length > 0 ? (
                <div className="dashboard-report-grid">
                  {snapshotPortfolioRollups.map((rollup) => (
                    <article key={rollup.portfolio} className="dashboard-report-card">
                      <span>{rollup.portfolio}</span>
                      <strong>{formatMoney(rollup.totalPnl)}</strong>
                      <p>
                        Open {formatMoney(rollup.unrealizedPnl)} • Realized {formatMoney(rollup.realizedPnl)} •{' '}
                        {formatNumber(rollup.pricedTradeCount, 0)} priced trade{rollup.pricedTradeCount === 1 ? '' : 's'}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}

              {topSnapshotValuations.length > 0 ? (
                <div className="position-list">
                  {topSnapshotValuations.map((valuation) => (
                    <article key={valuation.trade_id} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{valuation.trade_id}</strong>
                          <span>
                            {valuation.portfolio ?? 'Unassigned'} • {valuation.book ?? 'Book TBD'} •{' '}
                            {valuation.pnl_bucket === 'REALIZED' ? 'Realized' : 'Open'}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${valuationCoverageTone(valuation)}`}>
                          {valuation.included_in_totals && valuation.pnl_contribution !== null
                            ? formatMoney(valuation.pnl_contribution)
                            : 'Excluded'}
                        </span>
                      </div>
                      <p>
                        {valuation.valuation_status === 'VALUED'
                          ? `${valuation.quantity !== null ? `${formatNumber(valuation.quantity, Number.isInteger(valuation.quantity) ? 0 : 2)} ${valuation.price_unit_code ?? ''}`.trim() : 'Quantity pending'} @ ${formatMoney(valuation.effective_mark)}${valuation.price_index_code ? ` via ${valuation.price_index_code}` : ''}.`
                          : valuation.valuation_status_reason ?? 'Valuation is not yet included in totals.'}
                      </p>
                      <div className="shipment-card-actions">
                        <span>
                          {valuation.pricing_type} • {formatCodeLabel(valuation.valuation_status)}
                        </span>
                        <div className="shipment-card-meta">
                          <button type="button" className="button button-ghost" onClick={() => onOpenTrade(valuation.trade_id)}>
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No trade valuations match this snapshot</strong>
                  <p>Try another date or clear the portfolio filter to widen the valuation lens.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No valuation snapshot selected</strong>
              <p>Choose a snapshot date to load the portfolio valuation breakdown.</p>
            </div>
          ),
        },
        {
          id: 'reports-valuation-compare',
          eyebrow: 'Attribution',
          title:
            comparisonStartDate && comparisonEndDate
              ? `Snapshot Compare · ${formatDateOnly(comparisonStartDate)} to ${formatDateOnly(comparisonEndDate)}`
              : 'Snapshot Compare',
          description: 'Compare any two valuation dates, isolate the straight difference, and read the first-pass P&L attribution trade by trade.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : availableSnapshotDates.length < 2 ? (
            <div className="empty-state">
              <strong>Need at least two snapshots</strong>
              <p>Once there are at least two marked dates, this panel will compare them and attribute the move.</p>
            </div>
          ) : comparisonLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : comparisonError ? (
            reportErrorState(comparisonError)
          ) : valuationComparison ? (
            <div className="pnl-trend-panel">
              <div className="pnl-trend-topbar">
                <div className="pnl-trend-copy">
                  <span>
                    {comparisonStartDate ? formatDateOnly(comparisonStartDate) : 'Start date TBD'} to{' '}
                    {comparisonEndDate ? formatDateOnly(comparisonEndDate) : 'End date TBD'}
                  </span>
                  <p>
                    {valuationComparison.basis}. Straight delta compares snapshot totals; attribution shows which trades
                    explain the move between the two dates.
                  </p>
                </div>
                <div className="pnl-trend-toolbar">
                  {comparisonFilterActive ? (
                    <button
                      type="button"
                      className="button button-ghost pnl-trend-reset-button"
                      onClick={resetValuationComparisonFilters}
                    >
                      Reset Compare
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pnl-trend-filter-grid">
                <label className="field">
                  <span>From Date</span>
                  <input
                    className="control"
                    type="date"
                    value={comparisonStartDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setComparisonStartDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>To Date</span>
                  <input
                    className="control"
                    type="date"
                    value={comparisonEndDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setComparisonEndDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Portfolio</span>
                  <select
                    className="control"
                    value={comparisonPortfolioFilter}
                    onChange={(event) => setComparisonPortfolioFilter(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Portfolios</option>
                    {portfolioFilterOptions.map((portfolio) => (
                      <option key={portfolio} value={portfolio}>
                        {portfolio}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pnl-trend-summary-grid">
                <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
                  <span>Net Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonSummary?.total_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonSummary?.total_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>
                    {formatMoney(valuationComparison.from_snapshot.total_pnl)} to {formatMoney(valuationComparison.to_snapshot.total_pnl)}
                  </p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Market / Mark Move</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.market_move_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.market_move_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Comparable market or mark movement applied to start-of-window quantity.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Quantity Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.quantity_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.quantity_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>New, removed, or resized exposure at the ending valuation mark.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Coverage Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.coverage_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.coverage_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Trades entering or exiting totals because valuation support changed.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Realization Transfer</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.realization_transfer_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.realization_transfer_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Movement between unrealized and realized buckets, separate from net P&amp;L.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Other Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.other_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.other_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Residual move from pricing-term or other non-market changes.</p>
                </article>
              </div>

              <div className="shipment-card-actions pnl-trend-active-filters">
                <span>
                  Comparing {formatDateOnly(valuationComparison.from_as_of)} against {formatDateOnly(valuationComparison.to_as_of)} across{' '}
                  {formatNumber(changedAttributionRows.length, 0)} changed trade{changedAttributionRows.length === 1 ? '' : 's'}.
                </span>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    {comparisonPortfolioFilter !== ALL_FILTER_VALUE ? `Portfolio ${comparisonPortfolioFilter}` : 'All portfolios'}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    {formatNumber(valuationComparison.to_snapshot.priced_trade_count, 0)} priced trade snapshots at end date
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Reconciled {formatSignedMoney(comparisonAttributionSummary?.reconciled_pnl_delta ?? 0, formatMoney)}
                  </span>
                </div>
              </div>

              {comparisonDailyBridge.length > 0 ? (
                <>
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">Bridge</span>
                      <h3>Daily Path</h3>
                    </div>
                    <p>
                      Step through the compare window one day at a time to see where the move actually happened.
                    </p>
                  </div>

                  <div className="dashboard-report-grid">
                    {comparisonDailyBridge.map((day) => (
                      <article key={`${day.from_as_of}-${day.to_as_of}`} className="dashboard-report-card">
                        <span>{formatDateOnly(day.to_as_of)}</span>
                        <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(day.delta.total_pnl)}`}>
                          {formatSignedMoney(day.delta.total_pnl, formatMoney)}
                        </strong>
                        <p>
                          {formatDateOnly(day.from_as_of)} to {formatDateOnly(day.to_as_of)} •{' '}
                          {formatNumber(day.changed_trade_count, 0)} changed trade
                          {day.changed_trade_count === 1 ? '' : 's'}
                        </p>
                        <p>
                          Market {formatSignedMoney(day.attribution_summary.market_move_pnl, formatMoney)} • Qty{' '}
                          {formatSignedMoney(day.attribution_summary.quantity_change_pnl, formatMoney)} • Transfer{' '}
                          {formatSignedMoney(day.attribution_summary.realization_transfer_pnl, formatMoney)}
                        </p>
                        <p>
                          {day.top_driver_trade_id && day.top_driver_summary
                            ? `${day.top_driver_trade_id} • ${day.top_driver_summary}`
                            : 'No material lifecycle or valuation movement landed on this day.'}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {comparisonPortfolioDeltas.length > 0 ? (
                <div className="dashboard-report-grid">
                  {comparisonPortfolioDeltas.map((row) => (
                    <article key={row.portfolio} className="dashboard-report-card">
                      <span>{row.portfolio}</span>
                      <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(row.delta.total_pnl)}`}>
                        {formatSignedMoney(row.delta.total_pnl, formatMoney)}
                      </strong>
                      <p>
                        {formatMoney(row.from_snapshot.total_pnl)} to {formatMoney(row.to_snapshot.total_pnl)} • Open{' '}
                        {formatSignedMoney(row.delta.unrealized_pnl, formatMoney)} • Realized{' '}
                        {formatSignedMoney(row.delta.realized_pnl, formatMoney)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}

              {topChangedAttributions.length > 0 ? (
                <div className="position-list">
                  {topChangedAttributions.map((row) => (
                    <article key={row.trade_id} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{row.trade_id}</strong>
                          <span>
                            {row.portfolio} • {row.book} • {attributionLabel(row.attribution_category)}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${attributionTone(row.attribution_category)}`}>
                          {formatSignedMoney(row.pnl_delta, formatMoney)}
                        </span>
                      </div>
                      <p>
                        {formatMoney(row.from_valuation?.pnl_contribution ?? 0)} on {formatDateOnly(comparisonStartDate)} to{' '}
                        {formatMoney(row.to_valuation?.pnl_contribution ?? 0)} on {formatDateOnly(comparisonEndDate)}.
                        {' '}
                        {row.from_valuation?.included_in_totals
                          ? `${row.from_valuation.pnl_bucket.toLowerCase()} before`
                          : 'Outside totals before'}
                        {' '}and{' '}
                        {row.to_valuation?.included_in_totals
                          ? `${row.to_valuation.pnl_bucket.toLowerCase()} after`
                          : 'outside totals after'}.
                        {' '}Driver: {row.driver_summary}.
                      </p>
                      <div className="shipment-card-actions">
                        <span>
                          Market/Mark {formatSignedMoney(row.breakdown.market_move_pnl, formatMoney)} • Qty{' '}
                          {formatSignedMoney(row.breakdown.quantity_change_pnl, formatMoney)} • Coverage{' '}
                          {formatSignedMoney(row.breakdown.coverage_change_pnl, formatMoney)}
                        </span>
                        <span>
                          Transfer {formatSignedMoney(row.breakdown.realization_transfer_pnl, formatMoney)} • Other{' '}
                          {formatSignedMoney(row.breakdown.other_change_pnl, formatMoney)} • Reconciled{' '}
                          {formatSignedMoney(row.breakdown.reconciled_pnl_delta, formatMoney)}
                        </span>
                        {row.driver_events.length > 0 ? (
                          <span>
                            {row.driver_events
                              .slice(0, 2)
                              .map((event) => `${formatLifecycleEventLabel(event.event_type)} ${formatDateOnly(event.occurred_at)}`)
                              .join(' • ')}
                            {row.driver_events.length > 2
                              ? ` • +${row.driver_events.length - 2} more`
                              : ''}
                          </span>
                        ) : null}
                        <div className="shipment-card-meta">
                          <button type="button" className="button button-ghost" onClick={() => onOpenTrade(row.trade_id)}>
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No attributed movement</strong>
                  <p>The two selected snapshots currently carry forward without trade-level delta.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No comparison loaded</strong>
              <p>Select two dates to compare valuation snapshots.</p>
            </div>
          ),
        },
        ...buildSettlementReportTiles({
          settlement,
          formatNumber,
          formatDate,
          formatDateOnly,
          onOpenSettlement,
          onOpenTrade,
        }),
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
