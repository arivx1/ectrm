import { useMemo } from 'react'

import type { Trade as TradeRecord } from '../../shared/models'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'
import { MarketContextTileContent } from './MarketContextPanel'
import { MarketPricesTileContent } from './MarketPricesPanel'
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  buildAreaPath,
  buildChartPoints,
  buildLinePath,
  projectChartY,
} from './chartUtils'

type EventRow = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
}

type PriceIndexRecord = {
  code: string
  name: string
  provider: string
  unit_code: string
  currency_code: string
  is_active: boolean
}

type DashboardWorkspaceProps = {
  authSession: StoredAuthSession | null
  appLoading: boolean
  activeTrades: TradeRecord[]
  priceIndices: PriceIndexRecord[]
  positionsWithClass: PositionRow[]
  events: EventRow[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

function normalizeUnit(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || 'Unit TBD'
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

function tradeDirection(trade: TradeRecord): number {
  if (typeof trade.volume === 'number' && trade.volume < 0) {
    return -1
  }

  return trade.trade_side === 'SELL' ? -1 : 1
}

type TrendTone = 'up' | 'down' | 'flat'

type PnlTrendPoint = {
  label: string
  value: number
}

type PnlTrendSummary = {
  points: PnlTrendPoint[]
  pricedTradeCount: number
  executionAnchoredTradeCount: number
}

function formatTrendDateLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function tradeTimelineAnchor(trade: TradeRecord): { date: Date; usedExecutionTimestamp: boolean } | null {
  const executionTimestamp = trade.execution_timestamp ? Date.parse(trade.execution_timestamp) : Number.NaN
  if (!Number.isNaN(executionTimestamp)) {
    return {
      date: new Date(executionTimestamp),
      usedExecutionTimestamp: true,
    }
  }

  const createdTimestamp = Date.parse(trade.created_at)
  if (Number.isNaN(createdTimestamp)) {
    return null
  }

  return {
    date: new Date(createdTimestamp),
    usedExecutionTimestamp: false,
  }
}

function markedTradeContribution(trade: TradeRecord): number | null {
  if (trade.price === null || trade.volume === null) {
    return null
  }

  return trade.price * Math.abs(trade.volume) * tradeDirection(trade)
}

function buildPnlTrend(activeTrades: TradeRecord[]): PnlTrendSummary {
  const grouped = new Map<string, { timestamp: number; label: string; contribution: number }>()
  let pricedTradeCount = 0
  let executionAnchoredTradeCount = 0

  for (const trade of activeTrades) {
    const contribution = markedTradeContribution(trade)
    if (contribution === null) {
      continue
    }

    const anchor = tradeTimelineAnchor(trade)
    if (!anchor) {
      continue
    }

    pricedTradeCount += 1
    if (anchor.usedExecutionTimestamp) {
      executionAnchoredTradeCount += 1
    }

    const dateKey = localDateKey(anchor.date)
    const dayTimestamp = new Date(
      anchor.date.getFullYear(),
      anchor.date.getMonth(),
      anchor.date.getDate(),
    ).getTime()
    const current = grouped.get(dateKey) ?? {
      timestamp: dayTimestamp,
      label: formatTrendDateLabel(anchor.date),
      contribution: 0,
    }

    current.contribution += contribution
    grouped.set(dateKey, current)
  }

  let runningValue = 0
  const points = [...grouped.entries()]
    .sort((left, right) => left[1].timestamp - right[1].timestamp)
    .map(([, row]) => {
      runningValue += row.contribution

      return {
        label: row.label,
        value: runningValue,
      }
    })

  return {
    points,
    pricedTradeCount,
    executionAnchoredTradeCount,
  }
}

function trendTone(firstValue: number | null, lastValue: number | null): TrendTone {
  if (firstValue === null || lastValue === null) {
    return 'flat'
  }

  if (lastValue > firstValue) {
    return 'up'
  }

  if (lastValue < firstValue) {
    return 'down'
  }

  return 'flat'
}

function formatSignedMoney(value: number, formatMoney: (value: number | null) => string): string {
  const formattedValue = formatMoney(Math.abs(value))
  if (value > 0) {
    return `+${formattedValue}`
  }

  if (value < 0) {
    return `-${formattedValue}`
  }

  return formattedValue
}

function PnlTrendChart({
  points,
  tone,
}: {
  points: PnlTrendPoint[]
  tone: TrendTone
}) {
  const values = points.map((point) => point.value)
  const chartPoints = buildChartPoints(values)
  const linePath = buildLinePath(chartPoints)
  const baselineY = projectChartY(0, values, true)
  const areaPath = buildAreaPath(chartPoints, baselineY)
  const lastPoint = chartPoints[chartPoints.length - 1]
  const firstLabel = points[0]?.label
  const lastLabel = points[points.length - 1]?.label

  return (
    <div className={`market-price-chart market-price-chart-${tone} pnl-trend-chart`}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={
          firstLabel && lastLabel
            ? `Cumulative P and L proxy trend from ${firstLabel} to ${lastLabel}`
            : 'Cumulative P and L proxy trend'
        }
      >
        <line
          className="pnl-trend-zero-line"
          x1={CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y1={baselineY}
          y2={baselineY}
        />
        <path className="market-price-chart-area pnl-trend-area" d={areaPath} />
        <path className="market-price-chart-line" d={linePath} />
        {lastPoint && <circle className="market-price-chart-dot" cx={lastPoint.x} cy={lastPoint.y} r="4" />}
      </svg>
    </div>
  )
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const {
    authSession,
    appLoading,
    activeTrades,
    priceIndices,
    positionsWithClass,
    events,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
  } = props

  const exposureByClass = useMemo(() => {
    const unitsByCommodity = new Map<string, Set<string>>()
    for (const trade of activeTrades) {
      const existing = unitsByCommodity.get(trade.commodity) ?? new Set<string>()
      existing.add(normalizeUnit(trade.unit_of_measure))
      unitsByCommodity.set(trade.commodity, existing)
    }

    const totals = new Map<string, { commodityClass: string; unitLabel: string; netVolume: number; commodityCount: number }>()
    for (const position of positionsWithClass) {
      const unitCandidates = unitsByCommodity.get(position.commodity)
      const unitLabel =
        !unitCandidates || unitCandidates.size === 0
          ? 'Unit TBD'
          : unitCandidates.size === 1
            ? [...unitCandidates][0]
            : 'Mixed UOM'
      const key = `${position.commodity_class}::${unitLabel}`
      const current = totals.get(key) ?? {
        commodityClass: position.commodity_class,
        unitLabel,
        netVolume: 0,
        commodityCount: 0,
      }

      current.netVolume += position.net_volume
      current.commodityCount += 1
      totals.set(key, current)
    }

    return [...totals.values()].sort((left, right) => {
      const classCompare = left.commodityClass.localeCompare(right.commodityClass)
      if (classCompare !== 0) {
        return classCompare
      }

      return left.unitLabel.localeCompare(right.unitLabel)
    })
  }, [activeTrades, positionsWithClass])

  const markedPnlProxy = useMemo(
    () =>
      activeTrades.reduce((sum, trade) => {
        if (trade.price === null || trade.volume === null) {
          return sum
        }

        return sum + trade.price * Math.abs(trade.volume) * tradeDirection(trade)
      }, 0),
    [activeTrades],
  )

  const pricedTradeCount = useMemo(
    () => activeTrades.filter((trade) => trade.price !== null && trade.volume !== null).length,
    [activeTrades],
  )

  const pnlTrend = useMemo(() => buildPnlTrend(activeTrades), [activeTrades])

  const pnlTrendStart = pnlTrend.points[0] ?? null
  const pnlTrendEnd = pnlTrend.points[pnlTrend.points.length - 1] ?? null
  const pnlTrendWindowChange =
    pnlTrendStart && pnlTrendEnd ? pnlTrendEnd.value - pnlTrendStart.value : 0
  const pnlTrendTone = trendTone(pnlTrendStart?.value ?? null, pnlTrendEnd?.value ?? null)

  const grossExposure = useMemo(
    () => positionsWithClass.reduce((sum, position) => sum + Math.abs(position.net_volume), 0),
    [positionsWithClass],
  )

  const largestExposureBucket = useMemo(
    () =>
      exposureByClass.reduce<{ commodityClass: string; unitLabel: string; netVolume: number } | null>(
        (current, row) =>
          current === null || Math.abs(row.netVolume) > Math.abs(current.netVolume)
            ? {
                commodityClass: row.commodityClass,
                unitLabel: row.unitLabel,
                netVolume: row.netVolume,
              }
            : current,
        null,
      ),
    [exposureByClass],
  )

  const dashboardIssues = useMemo(() => {
    const overdueSettlement = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 5 && trade.settlement_status !== 'SETTLED'
    })
    const stalePricing = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 2 && trade.pricing_status === 'PENDING'
    })
    const incompleteOperationalData = activeTrades.filter(
      (trade) =>
        !trade.execution_timestamp ||
        !trade.external_trade_id ||
        !trade.counterparty ||
        !trade.unit_of_measure,
    )

    const openIssueTradeIds = new Set(
      [...overdueSettlement, ...stalePricing, ...incompleteOperationalData].map((trade) => trade.trade_id),
    )

    return {
      total: openIssueTradeIds.size,
      rows: [
        {
          label: 'Overdue settlement',
          count: overdueSettlement.length,
          detail: 'Active trades still pending settlement 5+ days after execution.',
          tone: overdueSettlement.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Stale pricing',
          count: stalePricing.length,
          detail: 'Trades still marked PENDING pricing 2+ days after execution.',
          tone: stalePricing.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Incomplete ops data',
          count: incompleteOperationalData.length,
          detail: 'Active trades missing execution time, external ID, counterparty, or UOM.',
          tone: incompleteOperationalData.length > 0 ? 'blocked' : 'active',
        },
      ] as Array<{ label: string; count: number; detail: string; tone: 'active' | 'blocked' }>,
    }
  }, [activeTrades])

  return (
    <TileLayout
      workspaceId="dashboard"
      workspaceLabel="Dashboard"
      authSession={authSession}
      tiles={[
        {
          id: 'desk-snapshot',
          eyebrow: 'Reporting',
          title: 'Desk Snapshot',
          description: 'P&L proxy, gross exposure, and operational attention points from the live desk state.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : (
            <div className="dashboard-snapshot-panel">
              {pnlTrend.points.length > 0 ? (
                <section className="pnl-trend-panel">
                  <div className="pnl-trend-head">
                    <div className="pnl-trend-copy">
                      <span>P&amp;L Over Time</span>
                      <strong>{formatMoney(pnlTrendEnd?.value ?? null)}</strong>
                      <p>
                        Cumulative proxy across {pnlTrend.pricedTradeCount} priced active trade
                        {pnlTrend.pricedTradeCount === 1 ? '' : 's'}, grouped by trade date.
                      </p>
                    </div>
                    <div className="pnl-trend-summary">
                      <small className={`market-price-change market-price-change-${pnlTrendTone}`}>
                        {formatSignedMoney(pnlTrendWindowChange, formatMoney)} window move
                      </small>
                      <span>
                        {pnlTrend.points.length} plotted day{pnlTrend.points.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <PnlTrendChart points={pnlTrend.points} tone={pnlTrendTone} />

                  <div className="pnl-trend-axis">
                    <span>{pnlTrendStart?.label ?? 'Start'}</span>
                    <span>{pnlTrendEnd?.label ?? 'Latest'}</span>
                  </div>

                  {pnlTrend.executionAnchoredTradeCount < pnlTrend.pricedTradeCount ? (
                    <p className="pnl-trend-note">
                      Uses trade creation date when an execution timestamp is not available.
                    </p>
                  ) : null}
                </section>
              ) : (
                <div className="empty-state">
                  <strong>No P&amp;L trend yet</strong>
                  <p>
                    {activeTrades.length > 0
                      ? 'Price the active trades to start plotting the desk P&L proxy over time.'
                      : 'Create active trades to start building the desk P&L proxy curve.'}
                  </p>
                </div>
              )}

              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>P&amp;L Proxy</span>
                  <strong>{formatMoney(markedPnlProxy)}</strong>
                  <p>
                    Based on {pricedTradeCount} priced trade{pricedTradeCount === 1 ? '' : 's'} using stored price
                    differential times current volume. True P&amp;L will need market marks and settlements.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <strong>{formatNumber(grossExposure, 0)}</strong>
                  <p>
                    Across {positionsWithClass.length} commodity position{positionsWithClass.length === 1 ? '' : 's'} and{' '}
                    {exposureByClass.length} reporting bucket{exposureByClass.length === 1 ? '' : 's'} with UOM coverage.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Needs Attention</span>
                  <strong>{formatNumber(dashboardIssues.total, 0)}</strong>
                  <p>
                    Trade-driven operational watchlist. Shipment and invoice exceptions can slot in here once those
                    workflows are modeled in the platform.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Bucket</span>
                  <strong>
                    {largestExposureBucket
                      ? `${formatNumber(largestExposureBucket.netVolume, 0)} ${largestExposureBucket.unitLabel}`
                      : '—'}
                  </strong>
                  <p>
                    {largestExposureBucket
                      ? `${formatCommodityClass(largestExposureBucket.commodityClass)} currently leads the dashboard exposure view.`
                      : 'No open exposure bucket is available yet.'}
                  </p>
                </article>
              </div>
            </div>
          ),
        },
        {
          id: 'market-context',
          eyebrow: 'Signals',
          title: 'Market Context',
          description: 'Desk-facing price, fundamental, macro, positioning, and provider-health context in one place.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <MarketContextTileContent
              appLoading={appLoading}
              formatDate={formatDate}
              formatNumber={formatNumber}
            />
          ),
        },
        {
          id: 'market-prices',
          eyebrow: 'Market Data',
          title: 'Market Prices',
          description: 'Current marks with a rolling view so you can see where tracked curves are moving.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <MarketPricesTileContent
              appLoading={appLoading}
              activeTrades={activeTrades}
              priceIndices={priceIndices}
              formatNumber={formatNumber}
            />
          ),
        },
        {
          id: 'position-snapshot',
          eyebrow: 'Exposure',
          title: 'Position Snapshot',
          description: 'Class-level exposure first, with commodity coverage called out in each reporting bucket.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : exposureByClass.length > 0 ? (
            <div className="position-class-grid">
              {exposureByClass.map((row) => (
                <article key={`${row.commodityClass}-${row.unitLabel}`} className="position-class-card">
                  <span>{formatCommodityClass(row.commodityClass)}</span>
                  <strong>
                    {formatNumber(row.netVolume, 0)} <small>{row.unitLabel}</small>
                  </strong>
                  <p>
                    {row.commodityCount} commodit{row.commodityCount === 1 ? 'y' : 'ies'} contributing to this
                    reporting bucket.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No open exposure</strong>
              <p>The system is healthy, but there are no active trades contributing exposure yet.</p>
            </div>
          ),
        },
        {
          id: 'operational-attention',
          eyebrow: 'Watchlist',
          title: 'Operational Attention',
          description: 'A lightweight issue board derived from trade aging and data completeness.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : dashboardIssues.rows.some((row) => row.count > 0) ? (
            <div className="dashboard-issue-list">
              {dashboardIssues.rows.map((row) => (
                <article key={row.label} className="dashboard-issue-row">
                  <div>
                    <strong>{row.label}</strong>
                    <p>{row.detail}</p>
                  </div>
                  <div className="dashboard-issue-meta">
                    <span className={`status-pill status-pill-${row.tone}`}>{row.count} open</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No active operational issues</strong>
              <p>The live trades are priced, settled, and populated well enough that nothing is currently flagged here.</p>
            </div>
          ),
        },
        {
          id: 'recent-timeline',
          eyebrow: 'Activity',
          title: 'Recent Timeline',
          description: 'The latest event flow without leaving the dashboard.',
          span: 'full',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: (
            <div className="timeline">
              {appLoading ? (
                <div className="skeleton-stack">
                  <div className="skeleton-block" />
                </div>
              ) : events.slice(0, 5).length > 0 ? (
                events.slice(0, 5).map((event) => (
                  <article key={event.event_id} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <strong>{event.event_type}</strong>
                        <span>{formatDate(event.recorded_at)}</span>
                      </div>
                      <p>
                        {event.aggregate_id} • {event.aggregate_type}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No recent events</strong>
                  <p>Create or amend a trade to start building the operational timeline.</p>
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  )
}
