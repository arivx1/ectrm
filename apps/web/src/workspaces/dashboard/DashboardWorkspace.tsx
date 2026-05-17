import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

import {
  loadTradeAttentionCandidates,
  type TradeAttentionCandidateList,
  type TradeAttentionCandidateType,
  type WorkspaceDashboardSummary,
} from '../../entities/app/api'
import { buildTradeAttentionCandidateWorkflowHandoff } from '../../entities/app/candidateWorkflowHandoffs'
import { sessionHeaders } from '../../entities/app/workspaceDataShared'
import { appConfig } from '../../shared/config'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import type { PnlHistoryPoint, PnlHistoryReport, Trade as TradeRecord, ViewKey } from '../../shared/models'
import { buildUnitLabelByCommodity, summarizeUnitLabels } from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildDashboardInstrumentBrief,
  buildDashboardInstrumentHandoff,
  resolveDashboardInstrumentBriefSelection,
  type DashboardInstrumentBriefSelection,
} from './dashboardInstrumentBrief'
import {
  DASHBOARD_DESK_HEADLINE_CONCERNS,
  DASHBOARD_DESK_HEADLINE_SEVERITIES,
  buildDashboardDeskHeadlines,
  filterDashboardDeskHeadlines,
  formatDashboardDeskHeadlineConcern,
  formatDashboardDeskHeadlineSeverity,
  type DashboardDeskHeadlineConcern,
  type DashboardDeskHeadlineItem,
  type DashboardDeskHeadlineSeverity,
} from './dashboardDeskHeadlines'
import { buildDashboardMarketMonitorSummary } from './dashboardMarketMonitor'
import {
  DASHBOARD_WATCHLIST_STORAGE_KEY,
  buildDefaultDashboardWatchlist,
  evaluateDashboardWatchlistAlerts,
  formatDashboardWatchlistAlertCondition,
  formatDashboardWatchlistAlertSeverity,
  formatDashboardWatchlistObjectType,
  parseDashboardWatchlist,
  serializeDashboardWatchlist,
  type DashboardWatchlist,
  type DashboardWatchlistAlert,
  type DashboardWatchlistAlertSeverity,
} from './dashboardWatchlists'
import { loadDashboardPnlHistory } from './pnlHistoryLoader'
import { ExternalSeriesTileContent } from './ExternalSeriesPanel'
import { MarketContextTileContent } from './MarketContextPanel'
import { MarketMonitorStripTileContent, MarketPricesTileContent } from './MarketPricesPanel'
import { WeatherIntelligenceTileContent } from './WeatherIntelligencePanel'
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  buildAreaPath,
  buildChartPoints,
  buildLinePath,
  projectChartX,
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
  commodity_class?: string | null
  commodity_code?: string | null
  market?: string | null
  location_code?: string | null
}

type DashboardWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff?: AppRouteHandoff | null
  globalFilter: string
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
  onOpenTrade: (tradeId: string) => void
  onClearHandoff?: () => void
  appLoading: boolean
  activeTrades: TradeRecord[]
  dashboardSummary: WorkspaceDashboardSummary | null
  priceIndices: PriceIndexRecord[]
  positionsWithClass: PositionRow[]
  events: EventRow[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

type DashboardIssueRow = {
  label: string
  count: number
  detail: string
  tone: 'active' | 'blocked'
  candidateType: TradeAttentionCandidateType
  destinationView: ViewKey
}

const DASHBOARD_CANDIDATE_LIMIT = 8

type DashboardViewAction = {
  label: string
  view: ViewKey
  variant?: 'secondary' | 'ghost'
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

function daysUntilDate(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return Math.floor((timestamp - Date.now()) / 86_400_000)
}

function tradeDirection(trade: TradeRecord): number {
  if (typeof trade.volume === 'number' && trade.volume < 0) {
    return -1
  }

  return trade.trade_side === 'SELL' ? -1 : 1
}

function matchesDashboardTradeFilter(trade: TradeRecord, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.book,
    trade.portfolio,
    trade.counterparty,
    trade.commodity_class,
    trade.commodity,
    trade.instrument_type,
    trade.trade_nature,
    trade.trade_structure,
    trade.trade_side,
    trade.pricing_type,
    trade.pricing_status,
    trade.confirmation_status,
    trade.nomination_status,
    trade.allocation_status,
    trade.actualization_status,
    trade.invoice_status,
    trade.payment_status,
    trade.settlement_status,
    trade.price_index_code,
    trade.status,
  ])
}

function matchesDashboardPositionFilter(position: PositionRow, query: string): boolean {
  return matchesTextFilter(query, [
    position.commodity,
    position.commodity_class,
    position.net_volume,
  ])
}

function matchesDashboardEventFilter(event: EventRow, query: string): boolean {
  return matchesTextFilter(query, [
    event.event_id,
    event.aggregate_id,
    event.aggregate_type,
    event.event_type,
    event.recorded_at,
  ])
}

function matchesDashboardPriceIndexFilter(priceIndex: PriceIndexRecord, query: string): boolean {
  return matchesTextFilter(query, [
    priceIndex.code,
    priceIndex.name,
    priceIndex.provider,
    priceIndex.unit_code,
    priceIndex.currency_code,
    priceIndex.commodity_class,
    priceIndex.commodity_code,
    priceIndex.market,
    priceIndex.location_code,
    priceIndex.is_active,
  ])
}

type TrendTone = 'up' | 'down' | 'flat'
type PnlAxisTick = {
  key: string
  label: string
  fraction?: number
  y?: number
}

function parseReportDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(year, month - 1, day)
}

function formatReportDateLabel(value: string): string {
  const parsed = parseReportDate(value)
  if (!parsed) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
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

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function summarizeCandidateStatuses(candidate: {
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  pricing_status: string
  invoice_status: string
  payment_status: string
  settlement_status: string
}): string {
  return [
    `Confirmation ${candidate.confirmation_status}`,
    `Nomination ${candidate.nomination_status}`,
    `Allocation ${candidate.allocation_status}`,
    `Pricing ${candidate.pricing_status}`,
    `Invoice ${candidate.invoice_status}`,
    `Payment ${candidate.payment_status}`,
    `Settlement ${candidate.settlement_status}`,
  ].join(' • ')
}

function headlineSeverityTone(severity: DashboardDeskHeadlineSeverity): 'active' | 'blocked' | 'in-progress' {
  switch (severity) {
    case 'critical':
      return 'blocked'
    case 'warning':
      return 'in-progress'
    case 'info':
      return 'active'
  }
}

function watchlistAlertSeverityTone(severity: DashboardWatchlistAlertSeverity): 'active' | 'blocked' | 'in-progress' {
  switch (severity) {
    case 'critical':
      return 'blocked'
    case 'warning':
      return 'in-progress'
    case 'info':
      return 'active'
  }
}

function readDashboardWatchlistFromStorage(): DashboardWatchlist | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return parseDashboardWatchlist(window.localStorage.getItem(DASHBOARD_WATCHLIST_STORAGE_KEY))
  } catch {
    return null
  }
}

function writeDashboardWatchlistToStorage(watchlist: DashboardWatchlist): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_WATCHLIST_STORAGE_KEY, serializeDashboardWatchlist(watchlist))
  } catch {
    // Local storage can be blocked in hardened browser contexts; the in-memory watchlist still works.
  }
}

function removeDashboardWatchlistFromStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(DASHBOARD_WATCHLIST_STORAGE_KEY)
  } catch {
    // Storage cleanup is best-effort only.
  }
}

function formatDateInputValue(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, days: number): Date {
  const nextValue = new Date(value)
  nextValue.setDate(nextValue.getDate() + days)
  return nextValue
}

function formatDateWindowLabel(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) {
    return `${formatReportDateLabel(start)} to ${formatReportDateLabel(end)}`
  }

  if (start) {
    return `Since ${formatReportDateLabel(start)}`
  }

  if (end) {
    return `Through ${formatReportDateLabel(end)}`
  }

  return 'All available history'
}

const COMPACT_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const WHOLE_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatAxisMoneyLabel(value: number): string {
  if (Math.abs(value) >= 1000) {
    return COMPACT_CURRENCY_FORMATTER.format(value)
  }

  return WHOLE_CURRENCY_FORMATTER.format(value)
}

function uniqueRoundedValues(values: number[]): number[] {
  const unique: number[] = []

  for (const value of values) {
    if (unique.some((candidate) => Math.abs(candidate - value) < 0.01)) {
      continue
    }

    unique.push(value)
  }

  return unique
}

function buildPnlYAxisTicks(values: number[]): PnlAxisTick[] {
  if (values.length === 0) {
    return []
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const candidateValues =
    minValue === maxValue
      ? [maxValue]
      : minValue < 0 && maxValue > 0
        ? [maxValue, 0, minValue]
        : [maxValue, maxValue - (maxValue - minValue) / 2, minValue]

  return uniqueRoundedValues(candidateValues).map((value) => ({
    key: `y-${value}`,
    label: formatAxisMoneyLabel(value),
    y: projectChartY(value, values, true),
  }))
}

function buildPnlPointFractions(points: PnlHistoryPoint[]): number[] | null {
  if (points.length === 0) {
    return null
  }

  const timestamps = points.map((point) => parseReportDate(point.date)?.getTime() ?? null)
  if (timestamps.some((timestamp) => timestamp === null)) {
    return null
  }

  const startTimestamp = timestamps[0] as number
  const endTimestamp = timestamps[timestamps.length - 1] as number
  if (startTimestamp === endTimestamp) {
    return points.map(() => 0.5)
  }

  return timestamps.map((timestamp) => ((timestamp as number) - startTimestamp) / (endTimestamp - startTimestamp))
}

function buildPnlXAxisTicks(points: PnlHistoryPoint[]): PnlAxisTick[] {
  if (points.length === 0) {
    return []
  }

  const firstDate = parseReportDate(points[0].date)
  const lastDate = parseReportDate(points[points.length - 1].date)
  if (!firstDate || !lastDate) {
    return []
  }

  const firstTimestamp = firstDate.getTime()
  const lastTimestamp = lastDate.getTime()
  if (firstTimestamp === lastTimestamp) {
    return [
      {
        key: `x-${points[0].date}`,
        label: formatReportDateLabel(points[0].date),
        fraction: 0.5,
      },
    ]
  }

  const daySpan = Math.max(1, Math.round((lastTimestamp - firstTimestamp) / 86_400_000))
  const desiredTickCount = daySpan <= 6 ? daySpan + 1 : daySpan <= 20 ? 5 : 6
  const seenDateKeys = new Set<string>()
  const ticks: PnlAxisTick[] = []

  for (let index = 0; index < desiredTickCount; index += 1) {
    const fraction = desiredTickCount === 1 ? 0.5 : index / (desiredTickCount - 1)
    const dayOffset = Math.round(daySpan * fraction)
    const tickDate = addDays(firstDate, dayOffset)
    const tickDateKey = formatDateInputValue(tickDate)
    if (seenDateKeys.has(tickDateKey)) {
      continue
    }

    seenDateKeys.add(tickDateKey)
    ticks.push({
      key: `x-${tickDateKey}`,
      label: formatReportDateLabel(tickDateKey),
      fraction: (tickDate.getTime() - firstTimestamp) / (lastTimestamp - firstTimestamp),
    })
  }

  return ticks
}

function PnlTrendChart({
  points,
  tone,
  formatMoney,
}: {
  points: PnlHistoryPoint[]
  tone: TrendTone
  formatMoney: (value: number | null) => string
}) {
  const values = points.map((point) => point.total_pnl)
  const xFractions = buildPnlPointFractions(points) ?? undefined
  const chartPoints = buildChartPoints(values, xFractions)
  const linePath = buildLinePath(chartPoints)
  const baselineY = projectChartY(0, values, true)
  const areaPath = buildAreaPath(chartPoints, baselineY)
  const lastPoint = chartPoints[chartPoints.length - 1]
  const yTicks = buildPnlYAxisTicks(values)
  const xTicks = buildPnlXAxisTicks(points)
  const firstLabel = points[0] ? formatReportDateLabel(points[0].date) : null
  const lastLabel = points[points.length - 1] ? formatReportDateLabel(points[points.length - 1].date) : null
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const activePoint = activePointIndex === null ? null : points[activePointIndex] ?? null
  const activeChartPoint = activePointIndex === null ? null : chartPoints[activePointIndex] ?? null
  const visiblePoint = activeChartPoint ?? lastPoint
  const tooltipAnchorClass =
    activeChartPoint === null
      ? ''
      : activeChartPoint.x >= CHART_WIDTH - 72
        ? 'is-right'
        : activeChartPoint.x <= 72
          ? 'is-left'
          : ''

  function updateActivePoint(event: ReactPointerEvent<HTMLDivElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || chartPoints.length === 0) {
      return
    }

    const pointerX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH
    let nearestIndex = 0
    let nearestDistance = Math.abs(chartPoints[0].x - pointerX)

    for (let index = 1; index < chartPoints.length; index += 1) {
      const distance = Math.abs(chartPoints[index].x - pointerX)
      if (distance < nearestDistance) {
        nearestIndex = index
        nearestDistance = distance
      }
    }

    setActivePointIndex(nearestIndex)
  }

  return (
    <div className="pnl-trend-figure">
      <div className="pnl-trend-y-axis" aria-hidden="true">
        <span className="pnl-trend-y-axis-label">P&amp;L (USD)</span>
        <div className="pnl-trend-y-scale">
          {yTicks.map((tick) => (
            <span
              key={tick.key}
              className="pnl-trend-y-tick"
              style={{ top: `${((tick.y ?? 0) / CHART_HEIGHT) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="pnl-trend-plot">
        <div
          className="pnl-trend-chart-frame"
          onPointerMove={updateActivePoint}
          onPointerLeave={() => setActivePointIndex(null)}
        >
          {activePoint && activeChartPoint ? (
            <div
              className={`pnl-trend-tooltip ${tooltipAnchorClass}`.trim()}
              style={{ left: `${(activeChartPoint.x / CHART_WIDTH) * 100}%` }}
            >
              <span>{formatReportDateLabel(activePoint.date)}</span>
              <strong>{formatMoney(activePoint.total_pnl)}</strong>
              <small>
                Realized {formatMoney(activePoint.realized_pnl)} • Open {formatMoney(activePoint.unrealized_pnl)}
              </small>
            </div>
          ) : null}

          <div className={`market-price-chart market-price-chart-${tone} pnl-trend-chart`}>
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={
                firstLabel && lastLabel
                  ? `Desk P and L trend from ${firstLabel} to ${lastLabel}`
                  : 'Desk P and L trend'
              }
            >
              {yTicks.map((tick) => (
                <line
                  key={tick.key}
                  className="pnl-trend-grid-line"
                  x1={CHART_PADDING}
                  x2={CHART_WIDTH - CHART_PADDING}
                  y1={tick.y ?? 0}
                  y2={tick.y ?? 0}
                />
              ))}
              {xTicks.map((tick) => (
                <line
                  key={tick.key}
                  className="pnl-trend-grid-line pnl-trend-grid-line-vertical"
                  x1={projectChartX(tick.fraction ?? 0)}
                  x2={projectChartX(tick.fraction ?? 0)}
                  y1={CHART_PADDING}
                  y2={CHART_HEIGHT - CHART_PADDING}
                />
              ))}
              <line
                className="pnl-trend-zero-line"
                x1={CHART_PADDING}
                x2={CHART_WIDTH - CHART_PADDING}
                y1={baselineY}
                y2={baselineY}
              />
              <path className="market-price-chart-area pnl-trend-area" d={areaPath} />
              <path className="market-price-chart-line" d={linePath} />
              {activeChartPoint ? (
                <>
                  <line
                    className="pnl-trend-hover-line"
                    x1={activeChartPoint.x}
                    x2={activeChartPoint.x}
                    y1={CHART_PADDING}
                    y2={CHART_HEIGHT - CHART_PADDING}
                  />
                  <line
                    className="pnl-trend-hover-line pnl-trend-hover-line-horizontal"
                    x1={CHART_PADDING}
                    x2={CHART_WIDTH - CHART_PADDING}
                    y1={activeChartPoint.y}
                    y2={activeChartPoint.y}
                  />
                </>
              ) : null}
            </svg>
            {visiblePoint ? (
              <span
                aria-hidden="true"
                className={`market-price-chart-point ${activeChartPoint ? 'pnl-trend-hover-dot' : ''}`.trim()}
                style={{
                  left: `${(visiblePoint.x / CHART_WIDTH) * 100}%`,
                  top: `${(visiblePoint.y / CHART_HEIGHT) * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="pnl-trend-x-axis" aria-hidden="true">
          {xTicks.map((tick, index) => (
            <span
              key={tick.key}
              className={`pnl-trend-x-tick ${index === 0 ? 'is-start' : ''} ${index === xTicks.length - 1 ? 'is-end' : ''}`.trim()}
              style={{ left: `${(tick.fraction ?? 0.5) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const {
    authSession,
    routeHandoff = null,
    globalFilter,
    onOpenView,
    onOpenTrade,
    onClearHandoff,
    appLoading,
    activeTrades,
    dashboardSummary,
    priceIndices,
    positionsWithClass,
    events,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
  } = props
  const [pnlHistoryReport, setPnlHistoryReport] = useState<PnlHistoryReport | null>(null)
  const [pnlHistoryLoading, setPnlHistoryLoading] = useState(true)
  const [pnlHistoryError, setPnlHistoryError] = useState('')
  const [selectedBookFilter, setSelectedBookFilter] = useState('')
  const [selectedCommodityClassFilter, setSelectedCommodityClassFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [screenFilter, setScreenFilter] = useState('')
  const [activeAttentionIssue, setActiveAttentionIssue] = useState<DashboardIssueRow | null>(null)
  const [headlineCommodityFilter, setHeadlineCommodityFilter] = useState('ALL')
  const [headlineConcernFilter, setHeadlineConcernFilter] = useState<DashboardDeskHeadlineConcern | 'ALL'>('ALL')
  const [headlineSeverityFilter, setHeadlineSeverityFilter] = useState<DashboardDeskHeadlineSeverity | 'ALL'>('ALL')
  const [savedWatchlist, setSavedWatchlist] = useState<DashboardWatchlist | null>(() => readDashboardWatchlistFromStorage())
  const [attentionCandidates, setAttentionCandidates] = useState<TradeAttentionCandidateList | null>(null)
  const [attentionCandidatesLoading, setAttentionCandidatesLoading] = useState(false)
  const [attentionCandidatesError, setAttentionCandidatesError] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const hasScreenFilter = effectiveScreenFilter.trim().length > 0

  const directlyMatchedTrades = useMemo(
    () => activeTrades.filter((trade) => matchesDashboardTradeFilter(trade, effectiveScreenFilter)),
    [activeTrades, effectiveScreenFilter],
  )
  const directlyMatchedEvents = useMemo(
    () => events.filter((event) => matchesDashboardEventFilter(event, effectiveScreenFilter)),
    [effectiveScreenFilter, events],
  )
  const directlyMatchedPositions = useMemo(
    () => positionsWithClass.filter((position) => matchesDashboardPositionFilter(position, effectiveScreenFilter)),
    [effectiveScreenFilter, positionsWithClass],
  )
  const directlyMatchedPriceIndices = useMemo(
    () => priceIndices.filter((priceIndex) => matchesDashboardPriceIndexFilter(priceIndex, effectiveScreenFilter)),
    [effectiveScreenFilter, priceIndices],
  )
  const directlyMatchedPositionCommodities = useMemo(
    () => new Set(directlyMatchedPositions.map((position) => position.commodity)),
    [directlyMatchedPositions],
  )
  const directlyMatchedPriceIndexCodes = useMemo(
    () => new Set(directlyMatchedPriceIndices.map((priceIndex) => priceIndex.code)),
    [directlyMatchedPriceIndices],
  )
  const visibleTradeIds = useMemo(() => {
    if (!hasScreenFilter) {
      return new Set(activeTrades.map((trade) => trade.trade_id))
    }

    return new Set(
      activeTrades
        .filter(
          (trade) =>
            directlyMatchedPriceIndexCodes.has(trade.price_index_code ?? '') ||
            directlyMatchedPositionCommodities.has(trade.commodity) ||
            directlyMatchedTrades.some((matchedTrade) => matchedTrade.trade_id === trade.trade_id) ||
            directlyMatchedEvents.some((event) => event.aggregate_id === trade.trade_id),
        )
        .map((trade) => trade.trade_id),
    )
  }, [
    activeTrades,
    directlyMatchedEvents,
    directlyMatchedPositionCommodities,
    directlyMatchedPriceIndexCodes,
    directlyMatchedTrades,
    hasScreenFilter,
  ])
  const visibleActiveTrades = useMemo(
    () => activeTrades.filter((trade) => visibleTradeIds.has(trade.trade_id)),
    [activeTrades, visibleTradeIds],
  )
  const visiblePositionCommodityCodes = useMemo(() => {
    if (!hasScreenFilter) {
      return new Set(positionsWithClass.map((position) => position.commodity))
    }

    return new Set([
      ...directlyMatchedPositionCommodities,
      ...visibleActiveTrades.map((trade) => trade.commodity),
    ])
  }, [directlyMatchedPositionCommodities, hasScreenFilter, positionsWithClass, visibleActiveTrades])
  const visiblePositionsWithClass = useMemo(
    () => positionsWithClass.filter((position) => visiblePositionCommodityCodes.has(position.commodity)),
    [positionsWithClass, visiblePositionCommodityCodes],
  )
  const visiblePriceIndexCodes = useMemo(() => {
    if (!hasScreenFilter) {
      return new Set(priceIndices.map((priceIndex) => priceIndex.code))
    }

    return new Set([
      ...directlyMatchedPriceIndexCodes,
      ...visibleActiveTrades
        .map((trade) => trade.price_index_code)
        .filter((priceIndexCode): priceIndexCode is string => Boolean(priceIndexCode)),
    ])
  }, [directlyMatchedPriceIndexCodes, hasScreenFilter, priceIndices, visibleActiveTrades])
  const visiblePriceIndices = useMemo(
    () => priceIndices.filter((priceIndex) => visiblePriceIndexCodes.has(priceIndex.code)),
    [priceIndices, visiblePriceIndexCodes],
  )
  const directlyMatchedEventIds = useMemo(
    () => new Set(directlyMatchedEvents.map((event) => event.event_id)),
    [directlyMatchedEvents],
  )
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) => visibleTradeIds.has(event.aggregate_id) || directlyMatchedEventIds.has(event.event_id),
      ),
    [directlyMatchedEventIds, events, visibleTradeIds],
  )

  const bookFilterOptions = useMemo(
    () => [...new Set(visibleActiveTrades.map((trade) => trade.book).filter((value) => value.trim() !== ''))].sort(),
    [visibleActiveTrades],
  )
  const commodityClassFilterOptions = useMemo(
    () =>
      [...new Set(visibleActiveTrades.map((trade) => trade.commodity_class).filter((value) => value.trim() !== ''))].sort(),
    [visibleActiveTrades],
  )
  const pnlFilterError =
    dateFromFilter && dateToFilter && dateFromFilter > dateToFilter
      ? 'Start date must be on or before end date.'
      : ''
  const hasActivePnlFilters = Boolean(
    selectedBookFilter || selectedCommodityClassFilter || dateFromFilter || dateToFilter,
  )
  const datePresets = useMemo(() => {
    const today = new Date()
    return [
      { id: 'ALL', label: 'All', dateFrom: '', dateTo: '' },
      { id: '30D', label: '30D', dateFrom: formatDateInputValue(addDays(today, -29)), dateTo: formatDateInputValue(today) },
      { id: '90D', label: '90D', dateFrom: formatDateInputValue(addDays(today, -89)), dateTo: formatDateInputValue(today) },
      {
        id: 'YTD',
        label: 'YTD',
        dateFrom: formatDateInputValue(new Date(today.getFullYear(), 0, 1)),
        dateTo: formatDateInputValue(today),
      },
    ] as const
  }, [])

  useEffect(() => {
    if (appLoading) {
      return
    }

    if (pnlFilterError) {
      setPnlHistoryLoading(false)
      return
    }

    let cancelled = false

    async function loadReport() {
      setPnlHistoryLoading(true)
      setPnlHistoryError('')

      try {
        const nextReport = await loadDashboardPnlHistory(
          {
            book: selectedBookFilter,
            commodityClass: selectedCommodityClassFilter,
            dateFrom: dateFromFilter,
            dateTo: dateToFilter,
          },
          authSession,
        )
        if (!cancelled) {
          setPnlHistoryReport(nextReport)
        }
      } catch (error) {
        if (!cancelled) {
          setPnlHistoryReport(null)
          setPnlHistoryError(error instanceof Error ? error.message : 'Unable to load P&L history.')
        }
      } finally {
        if (!cancelled) {
          setPnlHistoryLoading(false)
        }
      }
    }

    void loadReport()

    return () => {
      cancelled = true
    }
  }, [
    appLoading,
    activeTrades,
    events,
    authSession,
    selectedBookFilter,
    selectedCommodityClassFilter,
    dateFromFilter,
    dateToFilter,
    pnlFilterError,
  ])

  useEffect(() => {
    if (hasScreenFilter) {
      setActiveAttentionIssue(null)
      setAttentionCandidates(null)
      setAttentionCandidatesError('')
      setAttentionCandidatesLoading(false)
    }
  }, [hasScreenFilter])

  useEffect(() => {
    const currentAttentionIssue = activeAttentionIssue
    const currentAuthSession = authSession

    if (!currentAttentionIssue || hasScreenFilter) {
      return
    }
    if (!currentAuthSession) {
      setAttentionCandidates(null)
      setAttentionCandidatesError('Sign in to load live candidate reads.')
      setAttentionCandidatesLoading(false)
      return
    }
    const selectedAttentionIssue: DashboardIssueRow = currentAttentionIssue
    const authorizedSession: StoredAuthSession = currentAuthSession

    let cancelled = false
    setAttentionCandidatesLoading(true)
    setAttentionCandidatesError('')

    async function loadCandidates() {
      try {
        const nextCandidates = await loadTradeAttentionCandidates(
          appConfig.apiBase,
          {
            candidateType: selectedAttentionIssue.candidateType,
            limit: DASHBOARD_CANDIDATE_LIMIT,
          },
          { readHeaders: sessionHeaders(authorizedSession) },
        )
        if (!cancelled) {
          setAttentionCandidates(nextCandidates)
        }
      } catch (error) {
        if (!cancelled) {
          setAttentionCandidates(null)
          setAttentionCandidatesError(
            error instanceof Error ? error.message : 'Unable to load trade attention candidates.',
          )
        }
      } finally {
        if (!cancelled) {
          setAttentionCandidatesLoading(false)
        }
      }
    }

    void loadCandidates()

    return () => {
      cancelled = true
    }
  }, [activeAttentionIssue, authSession, hasScreenFilter])

  useEffect(() => {
    if (savedWatchlist) {
      writeDashboardWatchlistToStorage(savedWatchlist)
    }
  }, [savedWatchlist])

  const unitLabelByCommodity = useMemo(() => buildUnitLabelByCommodity(activeTrades), [activeTrades])
  const canUseDashboardSummary = !hasScreenFilter && dashboardSummary !== null

  const exposureByClass = useMemo(() => {
    if (canUseDashboardSummary && dashboardSummary?.positions.buckets.length) {
      return dashboardSummary.positions.buckets.map((row) => ({
        commodityClass: row.commodity_class,
        unitLabel: row.unit_label,
        netVolume: row.net_volume,
        commodityCount: row.commodity_count,
      }))
    }

    const totals = new Map<string, { commodityClass: string; unitLabel: string; netVolume: number; commodityCount: number }>()
    for (const position of visiblePositionsWithClass) {
      const unitLabel = unitLabelByCommodity.get(position.commodity) ?? 'Unit TBD'
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
  }, [canUseDashboardSummary, dashboardSummary, unitLabelByCommodity, visiblePositionsWithClass])

  const grossExposureUnitLabel = useMemo(
    () =>
      summarizeUnitLabels(
        canUseDashboardSummary && dashboardSummary?.positions.buckets.length
          ? dashboardSummary.positions.buckets.map((bucket) => bucket.unit_label)
          : visibleActiveTrades.map((trade) => trade.unit_of_measure),
      ),
    [canUseDashboardSummary, dashboardSummary, visibleActiveTrades],
  )

  const markedPnlProxy = useMemo(
    () =>
      visibleActiveTrades.reduce((sum, trade) => {
        if (trade.price === null || trade.volume === null) {
          return sum
        }

        return sum + trade.price * Math.abs(trade.volume) * tradeDirection(trade)
      }, 0),
    [visibleActiveTrades],
  )

  const pricedTradeCount = useMemo(
    () => visibleActiveTrades.filter((trade) => trade.price !== null && trade.volume !== null).length,
    [visibleActiveTrades],
  )
  const effectivePnlHistoryReport = pnlFilterError ? null : pnlHistoryReport
  const pnlTrendPoints = effectivePnlHistoryReport?.points ?? []
  const singlePoint = pnlTrendPoints.length === 1 ? pnlTrendPoints[0] : null
  const hasComparableTrend = pnlTrendPoints.length > 1
  const pnlTrendStart = pnlTrendPoints[0] ?? null
  const pnlTrendEnd = pnlTrendPoints[pnlTrendPoints.length - 1] ?? null
  const pnlTrendWindowChange =
    pnlTrendStart && pnlTrendEnd ? pnlTrendEnd.total_pnl - pnlTrendStart.total_pnl : 0
  const pnlTrendTone = trendTone(pnlTrendStart?.total_pnl ?? null, pnlTrendEnd?.total_pnl ?? null)
  const reportSummary = effectivePnlHistoryReport?.summary ?? null
  const currentPnlProxy = hasScreenFilter ? markedPnlProxy : reportSummary?.total_pnl ?? markedPnlProxy
  const currentPricedTradeCount = hasScreenFilter
    ? pricedTradeCount
    : reportSummary?.priced_trade_count ?? pricedTradeCount
  const activeDatePreset =
    datePresets.find((preset) => preset.dateFrom === dateFromFilter && preset.dateTo === dateToFilter)?.id ?? null
  const visibleDateWindowLabel =
    pnlTrendStart && pnlTrendEnd
      ? formatDateWindowLabel(pnlTrendStart.date, pnlTrendEnd.date)
      : formatDateWindowLabel(dateFromFilter, dateToFilter)
  const pnlTrendSubtitle = pnlHistoryError
    ? pnlHistoryError
    : pnlTrendPoints.length > 0
      ? `${countLabel(pnlTrendPoints.length, 'marked day')} across ${countLabel(currentPricedTradeCount, 'priced trade')} in view.${hasScreenFilter ? ' Local screen search does not change the historical report window.' : ''}`
      : hasActivePnlFilters
        ? 'No marked history matches the current filter scope yet.'
        : visibleActiveTrades.length > 0
          ? 'Mark-to-market daily history will fill in as priced trades and observations arrive.'
          : 'Create active trades to start building desk P&L history.'
  const activeFilterLabels = [
    selectedBookFilter ? `Book · ${selectedBookFilter}` : null,
    selectedCommodityClassFilter ? `Class · ${formatCommodityClass(selectedCommodityClassFilter)}` : null,
    dateFromFilter || dateToFilter ? `Window · ${formatDateWindowLabel(dateFromFilter, dateToFilter)}` : null,
  ].filter((value): value is string => Boolean(value))

  const positionRowCount = canUseDashboardSummary
    ? dashboardSummary?.positions.position_count ?? visiblePositionsWithClass.length
    : visiblePositionsWithClass.length
  const positionBucketCount = canUseDashboardSummary
    ? dashboardSummary?.positions.bucket_count ?? exposureByClass.length
    : exposureByClass.length
  const grossExposure = useMemo(
    () =>
      canUseDashboardSummary
        ? dashboardSummary?.positions.gross_exposure ??
          visiblePositionsWithClass.reduce((sum, position) => sum + Math.abs(position.net_volume), 0)
        : visiblePositionsWithClass.reduce((sum, position) => sum + Math.abs(position.net_volume), 0),
    [canUseDashboardSummary, dashboardSummary, visiblePositionsWithClass],
  )

  const largestExposureBucket = useMemo(
    () => {
      if (canUseDashboardSummary && dashboardSummary?.positions.largest_bucket) {
        return {
          commodityClass: dashboardSummary.positions.largest_bucket.commodity_class,
          unitLabel: dashboardSummary.positions.largest_bucket.unit_label,
          netVolume: dashboardSummary.positions.largest_bucket.net_volume,
        }
      }

      return exposureByClass.reduce<{ commodityClass: string; unitLabel: string; netVolume: number } | null>(
        (current, row) =>
          current === null || Math.abs(row.netVolume) > Math.abs(current.netVolume)
            ? {
                commodityClass: row.commodityClass,
                unitLabel: row.unitLabel,
                netVolume: row.netVolume,
              }
            : current,
        null,
      )
    },
    [canUseDashboardSummary, dashboardSummary, exposureByClass],
  )

  const dashboardIssues = useMemo(() => {
    if (canUseDashboardSummary && dashboardSummary?.attention) {
      const attention = dashboardSummary.attention
      return {
        total: attention.total_count,
        rows: [
          {
            label: 'Confirmation backlog',
            count: attention.confirmation_backlog_count,
            detail: 'Trades executed 1+ day ago that still are not confirmed.',
            tone: attention.confirmation_backlog_count > 0 ? 'blocked' : 'active',
            candidateType: 'confirmation_backlog',
            destinationView: 'operations',
          },
          {
            label: 'Nomination backlog',
            count: attention.nomination_backlog_count,
            detail: 'Physical trades nearing delivery that still need nomination or scheduling completion.',
            tone: attention.nomination_backlog_count > 0 ? 'blocked' : 'active',
            candidateType: 'nomination_backlog',
            destinationView: 'scheduling',
          },
          {
            label: 'Allocation backlog',
            count: attention.allocation_backlog_count,
            detail: 'Nominated flows that have not reached an allocated or completed state yet.',
            tone: attention.allocation_backlog_count > 0 ? 'blocked' : 'active',
            candidateType: 'allocation_backlog',
            destinationView: 'scheduling',
          },
          {
            label: 'Invoice backlog',
            count: attention.invoice_backlog_count,
            detail: 'Physical trades aging 5+ days without an issued or approved invoice workflow state.',
            tone: attention.invoice_backlog_count > 0 ? 'blocked' : 'active',
            candidateType: 'invoice_backlog',
            destinationView: 'settlement',
          },
          {
            label: 'Overdue payments',
            count: attention.overdue_payment_count,
            detail: 'Trades with overdue payment state or aging invoices that still are not paid.',
            tone: attention.overdue_payment_count > 0 ? 'blocked' : 'active',
            candidateType: 'overdue_payment',
            destinationView: 'settlement',
          },
          {
            label: 'Stale pricing',
            count: attention.stale_pricing_count,
            detail: 'Trades still marked pending or partial pricing 2+ days after execution.',
            tone: attention.stale_pricing_count > 0 ? 'blocked' : 'active',
            candidateType: 'stale_pricing',
            destinationView: 'trades',
          },
          {
            label: 'Incomplete ops data',
            count: attention.incomplete_ops_data_count,
            detail: 'Active trades missing core execution, counterparty, quantity, or physical delivery attributes.',
            tone: attention.incomplete_ops_data_count > 0 ? 'blocked' : 'active',
            candidateType: 'incomplete_ops_data',
            destinationView: 'trades',
          },
        ] as DashboardIssueRow[],
      }
    }

    const confirmationBacklog = visibleActiveTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 1 && trade.confirmation_status !== 'CONFIRMED'
    })
    const nominationBacklog = visibleActiveTrades.filter((trade) => {
      const daysUntilDelivery = daysUntilDate(trade.delivery_start)
      return (
        trade.trade_nature === 'PHYSICAL' &&
        daysUntilDelivery !== null &&
        daysUntilDelivery <= 3 &&
        !['NOT_REQUIRED', 'SCHEDULED', 'NOMINATED', 'COMPLETED'].includes(trade.nomination_status)
      )
    })
    const allocationBacklog = visibleActiveTrades.filter(
      (trade) =>
        trade.trade_nature === 'PHYSICAL' &&
        ['NOMINATED', 'COMPLETED'].includes(trade.nomination_status) &&
        !['NOT_REQUIRED', 'ALLOCATED', 'COMPLETED'].includes(trade.allocation_status),
    )
    const invoiceBacklog = visibleActiveTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return (
        trade.trade_nature === 'PHYSICAL' &&
        ageDays !== null &&
        ageDays >= 5 &&
        !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(trade.invoice_status)
      )
    })
    const overduePayments = visibleActiveTrades.filter((trade) => {
      if (trade.payment_status === 'OVERDUE') {
        return true
      }

      const ageDays = ageInDays(trade.execution_timestamp)
      return (
        ageDays !== null &&
        ageDays >= 10 &&
        (
          ['ISSUED', 'APPROVED'].includes(trade.invoice_status) ||
          ['INVOICED', 'PARTIALLY_SETTLED'].includes(trade.settlement_status)
        ) &&
        !['NOT_REQUIRED', 'PAID'].includes(trade.payment_status)
      )
    })
    const stalePricing = visibleActiveTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 2 && ['PENDING', 'PARTIALLY_PRICED'].includes(trade.pricing_status)
    })
    const incompleteOperationalData = visibleActiveTrades.filter(
      (trade) =>
        !trade.execution_timestamp ||
        !trade.external_trade_id ||
        !trade.counterparty ||
        !trade.unit_of_measure ||
        (trade.trade_nature === 'PHYSICAL' &&
          (!trade.location_code || !trade.delivery_start || !trade.delivery_end || !trade.price_unit_code)),
    )

    const openIssueTradeIds = new Set(
      [
        ...confirmationBacklog,
        ...nominationBacklog,
        ...allocationBacklog,
        ...invoiceBacklog,
        ...overduePayments,
        ...stalePricing,
        ...incompleteOperationalData,
      ].map((trade) => trade.trade_id),
    )

    return {
      total: openIssueTradeIds.size,
      rows: [
        {
          label: 'Confirmation backlog',
          count: confirmationBacklog.length,
          detail: 'Trades executed 1+ day ago that still are not confirmed.',
          tone: confirmationBacklog.length > 0 ? 'blocked' : 'active',
          candidateType: 'confirmation_backlog',
          destinationView: 'operations',
        },
        {
          label: 'Nomination backlog',
          count: nominationBacklog.length,
          detail: 'Physical trades nearing delivery that still need nomination or scheduling completion.',
          tone: nominationBacklog.length > 0 ? 'blocked' : 'active',
          candidateType: 'nomination_backlog',
          destinationView: 'scheduling',
        },
        {
          label: 'Allocation backlog',
          count: allocationBacklog.length,
          detail: 'Nominated flows that have not reached an allocated or completed state yet.',
          tone: allocationBacklog.length > 0 ? 'blocked' : 'active',
          candidateType: 'allocation_backlog',
          destinationView: 'scheduling',
        },
        {
          label: 'Invoice backlog',
          count: invoiceBacklog.length,
          detail: 'Physical trades aging 5+ days without an issued or approved invoice workflow state.',
          tone: invoiceBacklog.length > 0 ? 'blocked' : 'active',
          candidateType: 'invoice_backlog',
          destinationView: 'settlement',
        },
        {
          label: 'Overdue payments',
          count: overduePayments.length,
          detail: 'Trades with overdue payment state or aging invoices that still are not paid.',
          tone: overduePayments.length > 0 ? 'blocked' : 'active',
          candidateType: 'overdue_payment',
          destinationView: 'settlement',
        },
        {
          label: 'Stale pricing',
          count: stalePricing.length,
          detail: 'Trades still marked pending or partial pricing 2+ days after execution.',
          tone: stalePricing.length > 0 ? 'blocked' : 'active',
          candidateType: 'stale_pricing',
          destinationView: 'trades',
        },
        {
          label: 'Incomplete ops data',
          count: incompleteOperationalData.length,
          detail: 'Active trades missing core execution, counterparty, quantity, or physical delivery attributes.',
          tone: incompleteOperationalData.length > 0 ? 'blocked' : 'active',
          candidateType: 'incomplete_ops_data',
          destinationView: 'trades',
        },
      ] as DashboardIssueRow[],
    }
  }, [canUseDashboardSummary, dashboardSummary, visibleActiveTrades])
  const defaultWatchlist = useMemo(
    () =>
      buildDefaultDashboardWatchlist({
        activeTrades: visibleActiveTrades,
        priceIndices: visiblePriceIndices,
        exposureByClass,
      }),
    [exposureByClass, visibleActiveTrades, visiblePriceIndices],
  )
  const effectiveWatchlist = savedWatchlist ?? defaultWatchlist
  const watchlistAlerts = useMemo(
    () =>
      evaluateDashboardWatchlistAlerts({
        watchlist: effectiveWatchlist,
        priceIndices: visiblePriceIndices,
        exposureByClass,
        issues: dashboardIssues.rows,
        activeTrades: visibleActiveTrades,
      }),
    [dashboardIssues.rows, effectiveWatchlist, exposureByClass, visibleActiveTrades, visiblePriceIndices],
  )
  const marketMonitorSummary = useMemo(
    () =>
      buildDashboardMarketMonitorSummary({
        activeTrades: visibleActiveTrades,
        exposureByClass,
        issues: dashboardIssues.rows,
        events: visibleEvents,
      }),
    [dashboardIssues.rows, exposureByClass, visibleActiveTrades, visibleEvents],
  )
  const deskHeadlines = useMemo(
    () =>
      buildDashboardDeskHeadlines({
        activeTrades: visibleActiveTrades,
        priceIndices: visiblePriceIndices,
        exposureByClass,
        issues: dashboardIssues.rows,
        events: visibleEvents,
      }),
    [dashboardIssues.rows, exposureByClass, visibleActiveTrades, visibleEvents, visiblePriceIndices],
  )
  const filteredDeskHeadlines = useMemo(
    () =>
      filterDashboardDeskHeadlines(deskHeadlines, {
        commodityClass: headlineCommodityFilter,
        concern: headlineConcernFilter,
        severity: headlineSeverityFilter,
      }),
    [deskHeadlines, headlineCommodityFilter, headlineConcernFilter, headlineSeverityFilter],
  )
  const deskHeadlineCommodityOptions = useMemo(
    () =>
      [...new Set(deskHeadlines.map((item) => item.commodityClass).filter((value): value is string => Boolean(value)))]
        .sort(),
    [deskHeadlines],
  )
  const instrumentBriefSelection = useMemo(
    () => resolveDashboardInstrumentBriefSelection(routeHandoff),
    [routeHandoff],
  )
  const instrumentBrief = useMemo(
    () =>
      instrumentBriefSelection
        ? buildDashboardInstrumentBrief({
            selection: instrumentBriefSelection,
            activeTrades,
            priceIndices,
            positionsWithClass,
            events,
          })
        : null,
    [activeTrades, events, instrumentBriefSelection, positionsWithClass, priceIndices],
  )
  const activeAttentionSummary = activeAttentionIssue && attentionCandidates
    ? `${formatNumber(attentionCandidates.count, 0)} of ${formatNumber(attentionCandidates.total_count, 0)} candidate trades loaded.`
    : null
  const quickStartActions = [
    {
      title: 'Capture a trade',
      detail: 'Open the ticket-entry workflow when the desk needs to book, inspect, or amend a trade.',
      view: 'trades',
      actionLabel: 'Open Trade Capture',
    },
    {
      title: 'Investigate a trade issue',
      detail: 'Open the activity feed when you need to trace what changed on a trade before you jump into capture or operations.',
      view: 'events',
      actionLabel: 'Open Activity Feed',
    },
    {
      title: 'Check exposure',
      detail: 'Open the exposure workspace when the question is concentration, pricing coverage, or the biggest books.',
      view: 'risk',
      actionLabel: 'Open Exposure',
    },
    {
      title: 'Run the work queue',
      detail: 'Open operations when teams are working confirmations, blockers, approvals, and other open handoffs.',
      view: 'operations',
      actionLabel: 'Open Work Queue',
    },
    {
      title: 'Learn the workflow',
      detail: 'Open the in-product guide when someone needs onboarding help or a quick explanation of how the platform works.',
      view: 'guide',
      actionLabel: 'Open How It Works',
    },
  ] satisfies Array<{
    title: string
    detail: string
    view: ViewKey
    actionLabel: string
  }>
  const marketMonitorActions: DashboardViewAction[] = [
    { label: 'Open Reports', view: 'reports', variant: 'secondary' },
    { label: 'Open Risk', view: 'risk' },
    { label: 'Open Operations', view: 'operations' },
    { label: 'Open Activity', view: 'events' },
    { label: 'Open Trades', view: 'trades' },
  ]
  const marketPriceActions: DashboardViewAction[] = [
    { label: 'Open Reports', view: 'reports', variant: 'secondary' },
    { label: 'Open Trades', view: 'trades' },
  ]
  const marketContextActions: DashboardViewAction[] = [
    { label: 'Open Reports', view: 'reports', variant: 'secondary' },
    { label: 'Open Activity', view: 'events' },
  ]
  const positionActions: DashboardViewAction[] = [
    { label: 'Open Positions', view: 'positions', variant: 'secondary' },
    { label: 'Open Risk', view: 'risk' },
  ]
  const weatherActions: DashboardViewAction[] = [
    { label: 'Open Map', view: 'map', variant: 'secondary' },
    { label: 'Open Reports', view: 'reports' },
  ]
  const timelineActions: DashboardViewAction[] = [
    { label: 'Open Activity Feed', view: 'events', variant: 'secondary' },
    { label: 'Open Operations', view: 'operations' },
  ]

  function renderTileActions(actions: DashboardViewAction[]) {
    return (
      <div className="workflow-item-button-row dashboard-tile-action-row">
        {actions.map((action) => (
          <button
            key={`${action.view}-${action.label}`}
            type="button"
            className={`button ${action.variant === 'secondary' ? 'button-secondary' : 'button-ghost'}`}
            onClick={() => onOpenView(action.view)}
          >
            {action.label}
          </button>
        ))}
      </div>
    )
  }

  function openInstrumentBrief(selection: DashboardInstrumentBriefSelection): void {
    onOpenView('dashboard', buildDashboardInstrumentHandoff(selection))
  }

  function openPriceIndexBrief(priceIndex: PriceIndexRecord): void {
    openInstrumentBrief({
      kind: 'price_index',
      id: priceIndex.code,
      label: priceIndex.name,
    })
  }

  function openCommodityClassBrief(commodityClass: string): void {
    openInstrumentBrief({
      kind: 'commodity_class',
      id: commodityClass,
      label: formatCommodityClass(commodityClass),
    })
  }

  function clearInstrumentBrief(): void {
    if (onClearHandoff) {
      onClearHandoff()
      return
    }

    onOpenView('dashboard', null)
  }

  function openDeskHeadline(item: DashboardDeskHeadlineItem): void {
    if (item.source.type === 'trade') {
      onOpenTrade(item.source.id)
      return
    }

    onOpenView(item.ownerView)
  }

  function deskHeadlineActionLabel(item: DashboardDeskHeadlineItem): string {
    return item.source.type === 'trade' ? 'Open Trade' : `Open ${item.ownerView}`
  }

  function saveLiveDeskWatchlist(): void {
    setSavedWatchlist(
      buildDefaultDashboardWatchlist({
        activeTrades: visibleActiveTrades,
        priceIndices: visiblePriceIndices,
        exposureByClass,
      }),
    )
  }

  function resetTerminalWatchlist(): void {
    setSavedWatchlist(null)
    removeDashboardWatchlistFromStorage()
  }

  function openWatchlistAlert(alert: DashboardWatchlistAlert): void {
    if (alert.objectType === 'price_index') {
      const priceIndex = visiblePriceIndices.find((candidate) => candidate.code === alert.objectId)
      if (priceIndex) {
        openPriceIndexBrief(priceIndex)
        return
      }
    }

    if (alert.objectType === 'commodity_class') {
      openCommodityClassBrief(alert.objectId)
      return
    }

    onOpenView(alert.ownerView)
  }

  function watchlistAlertActionLabel(alert: DashboardWatchlistAlert): string {
    return alert.objectType === 'price_index' || alert.objectType === 'commodity_class'
      ? 'Open Brief'
      : `Open ${alert.ownerView}`
  }

  function renderWatchlistAlertsContent() {
    const isSavedWatchlist = savedWatchlist !== null
    const visibleAlerts = watchlistAlerts.slice(0, 6)
    const visibleItems = effectiveWatchlist.items.slice(0, 6)

    return (
      <div className="watchlist-alert-panel">
        <div className="watchlist-alert-head">
          <div className="watchlist-alert-copy">
            <span>{isSavedWatchlist ? 'Saved terminal watchlist' : 'Preview terminal watchlist'}</span>
            <strong>{effectiveWatchlist.name}</strong>
            <p>
              {isSavedWatchlist
                ? `Saved terminal watchlist updated ${formatDate(effectiveWatchlist.updatedAt)}.`
                : 'Previewing a live desk watchlist built from the current market tape, largest exposure, and desk signals.'}
            </p>
          </div>
          <div className="workflow-item-button-row dashboard-tile-action-row watchlist-alert-actions">
            <button
              type="button"
              className="button button-secondary"
              aria-label="Save Watchlist"
              onClick={saveLiveDeskWatchlist}
            >
              Save Watchlist
            </button>
            {isSavedWatchlist ? (
              <button type="button" className="button button-ghost" onClick={resetTerminalWatchlist}>
                Reset Watchlist
              </button>
            ) : null}
          </div>
        </div>

        <div className="dashboard-report-grid watchlist-alert-stat-grid">
          <article className="dashboard-report-card">
            <span>Watched Items</span>
            <strong>{formatNumber(effectiveWatchlist.items.length, 0)}</strong>
            <p>Price indices, commodity classes, and desk signals powering this terminal tile.</p>
          </article>
          <article className="dashboard-report-card">
            <span>Alert Rules</span>
            <strong>{formatNumber(effectiveWatchlist.alertRules.length, 0)}</strong>
            <p>Typed thresholds covering price moves, stale data, exposure, pricing, and settlement.</p>
          </article>
          <article className="dashboard-report-card">
            <span>Triggered</span>
            <strong>{formatNumber(watchlistAlerts.length, 0)}</strong>
            <p>Governed in-product statuses evaluated from deterministic dashboard data.</p>
          </article>
        </div>

        {visibleItems.length > 0 ? (
          <div className="watchlist-item-strip" aria-label="Saved watchlist items">
            {visibleItems.map((item) => (
              <span key={`${item.objectType}-${item.objectId}`} className="entity-chip entity-chip-soft">
                {formatDashboardWatchlistObjectType(item.objectType)} ·{' '}
                {item.objectType === 'commodity_class' ? formatCommodityClass(item.objectId) : item.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No watchlist items yet</strong>
            <p>Save the live desk watchlist to capture the current terminal-mode market focus.</p>
          </div>
        )}

        {visibleAlerts.length > 0 ? (
          <div className="watchlist-alert-list">
            {visibleAlerts.map((alert) => (
              <article key={alert.id} className="watchlist-alert-row">
                <div className="watchlist-alert-row-copy">
                  <div className="watchlist-alert-title-row">
                    <span className={`status-pill status-pill-${watchlistAlertSeverityTone(alert.severity)}`}>
                      {formatDashboardWatchlistAlertSeverity(alert.severity)}
                    </span>
                    <span>{formatDashboardWatchlistAlertCondition(alert.conditionType)}</span>
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                  <small>Source: {alert.sourceLabel}</small>
                </div>
                <div className="watchlist-alert-row-meta">
                  <span>Triggered</span>
                  <button type="button" className="button button-ghost" onClick={() => openWatchlistAlert(alert)}>
                    {watchlistAlertActionLabel(alert)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Watchlist rules are clear</strong>
            <p>No saved alert condition is currently crossing its typed threshold in this dashboard view.</p>
          </div>
        )}
      </div>
    )
  }

  function renderDeskHeadlinesContent() {
    const hasHeadlineFilters =
      headlineCommodityFilter !== 'ALL' || headlineConcernFilter !== 'ALL' || headlineSeverityFilter !== 'ALL'

    return (
      <div className="desk-headline-panel">
        <div className="desk-headline-toolbar" aria-label="Filter desk headlines">
          <label>
            <span>Commodity</span>
            <select
              value={headlineCommodityFilter}
              onChange={(event) => setHeadlineCommodityFilter(event.target.value)}
              aria-label="Filter headlines by commodity"
            >
              <option value="ALL">All commodities</option>
              {deskHeadlineCommodityOptions.map((commodityClass) => (
                <option key={commodityClass} value={commodityClass}>
                  {formatCommodityClass(commodityClass)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Concern</span>
            <select
              value={headlineConcernFilter}
              onChange={(event) =>
                setHeadlineConcernFilter(event.target.value as DashboardDeskHeadlineConcern | 'ALL')
              }
              aria-label="Filter headlines by concern"
            >
              <option value="ALL">All concerns</option>
              {DASHBOARD_DESK_HEADLINE_CONCERNS.map((concern) => (
                <option key={concern} value={concern}>
                  {formatDashboardDeskHeadlineConcern(concern)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Severity</span>
            <select
              value={headlineSeverityFilter}
              onChange={(event) =>
                setHeadlineSeverityFilter(event.target.value as DashboardDeskHeadlineSeverity | 'ALL')
              }
              aria-label="Filter headlines by severity"
            >
              <option value="ALL">All severities</option>
              {DASHBOARD_DESK_HEADLINE_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {formatDashboardDeskHeadlineSeverity(severity)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredDeskHeadlines.length > 0 ? (
          <div className="desk-headline-list">
            {filteredDeskHeadlines.slice(0, 8).map((item) => (
              <article key={item.id} className="desk-headline-row">
                <div className="desk-headline-copy">
                  <div className="desk-headline-title-row">
                    <span className={`status-pill status-pill-${headlineSeverityTone(item.severity)}`}>
                      {formatDashboardDeskHeadlineSeverity(item.severity)}
                    </span>
                    <span>{formatDashboardDeskHeadlineConcern(item.concern)}</span>
                    {item.commodityClass ? <span>{formatCommodityClass(item.commodityClass)}</span> : null}
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>Source: {item.source.label}</small>
                </div>
                <div className="desk-headline-meta">
                  <span>{item.timestamp ? formatDate(item.timestamp) : 'Live'}</span>
                  <button type="button" className="button button-ghost" onClick={() => openDeskHeadline(item)}>
                    {deskHeadlineActionLabel(item)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>
              {deskHeadlines.length > 0
                ? 'No headlines match these filters'
                : visibleActiveTrades.length + visiblePositionsWithClass.length + visiblePriceIndices.length === 0
                  ? 'No headline source data'
                  : visibleEvents.length === 0
                    ? 'No active attention or workflow events'
                    : 'No desk headlines'}
            </strong>
            <p>
              {deskHeadlines.length > 0 && hasHeadlineFilters
                ? 'Broaden the commodity, concern, or severity filter to bring more terminal headlines back into view.'
                : 'The feed only promotes deterministic market, workflow, exposure, and activity evidence.'}
            </p>
          </div>
        )}
      </div>
    )
  }

  function renderInstrumentBriefContent() {
    if (!instrumentBriefSelection) {
      return (
        <div className="empty-state">
          <strong>No instrument selected</strong>
          <p>Open a price index or commodity-class brief from the market strip, monitor board, or exposure cards.</p>
        </div>
      )
    }

    if (!instrumentBrief) {
      return (
        <div className="empty-state">
          <strong>Unsupported instrument brief</strong>
          <p>
            The requested market instrument is not available in the current dashboard data. Clear the focus to return
            to the live board.
          </p>
          <button type="button" className="button button-secondary" onClick={clearInstrumentBrief}>
            Clear Brief
          </button>
        </div>
      )
    }

    const pricedBriefTrades = instrumentBrief.relatedTrades.filter(
      (trade) => trade.price !== null && trade.volume !== null,
    ).length
    const pricingCoverage =
      instrumentBrief.relatedTrades.length > 0
        ? Math.round((pricedBriefTrades / instrumentBrief.relatedTrades.length) * 100)
        : null
    const netBriefExposure = instrumentBrief.relatedPositions.reduce(
      (sum, position) => sum + position.net_volume,
      0,
    )
    const briefExposureUnitLabel = summarizeUnitLabels(
      instrumentBrief.relatedTrades.map((trade) => trade.unit_of_measure),
    )
    const ownerAction: DashboardViewAction =
      instrumentBrief.ownerView === 'reference'
        ? { label: 'Open Reference Data', view: 'reference', variant: 'secondary' }
        : { label: 'Open Positions', view: 'positions', variant: 'secondary' }

    return (
      <div className="instrument-brief-panel">
        <div className="instrument-brief-head">
          <div className="instrument-brief-copy">
            <span>
              {instrumentBrief.selection.kind === 'price_index' ? 'Price Index' : 'Commodity Class'} Brief
            </span>
            <strong>{instrumentBrief.title}</strong>
            <p>{instrumentBrief.subtitle}</p>
          </div>
          <div className="workflow-item-button-row dashboard-tile-action-row">
            <button type="button" className="button button-ghost" onClick={clearInstrumentBrief}>
              Clear Brief
            </button>
          </div>
        </div>

        <div className="dashboard-report-grid instrument-brief-summary-grid">
          <article className="dashboard-report-card">
            <span>Related Trades</span>
            <strong>{formatNumber(instrumentBrief.relatedTrades.length, 0)}</strong>
            <p>Active trades connected by curve, commodity, or commodity class.</p>
          </article>
          <article className="dashboard-report-card">
            <span>Pricing Coverage</span>
            <strong>{pricingCoverage === null ? '—' : `${formatNumber(pricingCoverage, 0)}%`}</strong>
            <p>{countLabel(pricedBriefTrades, 'priced trade')} in this brief.</p>
          </article>
          <article className="dashboard-report-card">
            <span>Net Exposure</span>
            {instrumentBrief.relatedPositions.length > 0 ? (
              <MetricValue value={formatNumber(netBriefExposure, 0)} unit={briefExposureUnitLabel} />
            ) : (
              <strong>—</strong>
            )}
            <p>{countLabel(instrumentBrief.relatedPositions.length, 'position row')} linked to the brief.</p>
          </article>
          <article className="dashboard-report-card">
            <span>Recent Events</span>
            <strong>{formatNumber(instrumentBrief.relatedEvents.length, 0)}</strong>
            <p>Workflow events attached to the related trade set.</p>
          </article>
        </div>

        {instrumentBrief.linkedPriceIndices.length > 0 ? (
          <section className="instrument-brief-section">
            <div className="instrument-brief-section-head">
              <strong>Linked Curves</strong>
              <p>Current market history for the curves tied to this brief.</p>
            </div>
            <MarketPricesTileContent
              appLoading={appLoading}
              activeTrades={instrumentBrief.relatedTrades}
              priceIndices={instrumentBrief.linkedPriceIndices}
              formatNumber={formatNumber}
            />
          </section>
        ) : null}

        <div className="instrument-brief-section-grid">
          <section className="instrument-brief-section">
            <div className="instrument-brief-section-head">
              <strong>Related Trades</strong>
              <p>Open the ticket for commercial, lifecycle, and event detail.</p>
            </div>
            {instrumentBrief.relatedTrades.length > 0 ? (
              <div className="instrument-brief-row-list">
                {instrumentBrief.relatedTrades.slice(0, 5).map((trade) => (
                  <article key={trade.trade_id} className="instrument-brief-row">
                    <div className="instrument-brief-row-copy">
                      <strong>{trade.trade_id}</strong>
                      <p>
                        {trade.book} - {trade.commodity} - {trade.counterparty ?? 'Counterparty TBD'}
                      </p>
                    </div>
                    <div className="instrument-brief-row-meta">
                      <span className={`status-pill status-pill-${trade.pricing_status === 'PRICED' ? 'active' : 'blocked'}`}>
                        {trade.pricing_status}
                      </span>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => onOpenTrade(trade.trade_id)}
                      >
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No related trades</strong>
                <p>This brief is supported by reference and market-data context, but no active trade is linked yet.</p>
              </div>
            )}
          </section>

          <section className="instrument-brief-section">
            <div className="instrument-brief-section-head">
              <strong>Recent Activity</strong>
              <p>Latest workflow events for the related trade set.</p>
            </div>
            {instrumentBrief.relatedEvents.length > 0 ? (
              <div className="instrument-brief-row-list">
                {instrumentBrief.relatedEvents.slice(0, 5).map((event) => (
                  <article key={event.event_id} className="instrument-brief-row">
                    <div className="instrument-brief-row-copy">
                      <strong>{event.event_type}</strong>
                      <p>
                        {event.aggregate_id} - {event.aggregate_type}
                      </p>
                    </div>
                    <span>{formatDate(event.recorded_at)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No recent activity</strong>
                <p>No workflow events are attached to the related trade set yet.</p>
              </div>
            )}
          </section>
        </div>

        {renderTileActions([
          ownerAction,
          { label: 'Open Trades', view: 'trades' },
          { label: 'Open Reports', view: 'reports' },
          { label: 'Open Risk', view: 'risk' },
        ])}
      </div>
    )
  }

  return (
    <TileLayout
      workspaceId="dashboard"
      workspaceLabel="Live Desk"
      authSession={authSession}
      headerContent={
        <>
          <WorkspaceHandoffFocusBanner
            handoff={routeHandoff}
            currentView="dashboard"
            clearLabel="Show Full Dashboard"
            onClear={clearInstrumentBrief}
          />
          <WorkspaceLocalFilterBar
            value={screenFilter}
            onChange={setScreenFilter}
            placeholder="Trade, commodity, event, book, counterparty, price index, or workflow status"
            description="Keep dashboard filtering local to this screen so you can narrow live desk context without changing any other workspace."
            totalCount={activeTrades.length + positionsWithClass.length + events.length + priceIndices.length}
            matchedCount={
              visibleActiveTrades.length +
              visiblePositionsWithClass.length +
              visibleEvents.length +
              visiblePriceIndices.length
            }
            resultLabel="dashboard records"
            globalValue={globalFilter}
            note="The local search narrows the live snapshot, exposure, market-price, and timeline cards. The P&L history module keeps using its own book, class, and date controls."
          />
        </>
      }
      tiles={[
        {
          id: 'market-monitor-strip',
          eyebrow: 'Market Tape',
          title: 'Market Monitor Strip',
          description: 'Compact price tape for the desk curves already tied to active trades, with partial coverage called out inline.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <div className="dashboard-tile-action-shell">
              <MarketMonitorStripTileContent
                appLoading={appLoading}
                activeTrades={visibleActiveTrades}
                priceIndices={visiblePriceIndices}
                formatNumber={formatNumber}
                onOpenPriceIndexBrief={openPriceIndexBrief}
              />
              {renderTileActions(marketPriceActions)}
            </div>
          ),
        },
        {
          id: 'market-monitor-board',
          eyebrow: 'Desk Monitor',
          title: 'Market Monitor Board',
          description: 'Cross-panel market focus, pricing coverage, attention queues, and fast drill-throughs for a terminal-style first screen.',
          span: 'wide',
          availableSpans: ['full', 'wide', 'half'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : (
            <div className="market-monitor-board">
              <div className="dashboard-report-grid market-monitor-summary-grid">
                <article className="dashboard-report-card">
                  <span>Active Trades</span>
                  <strong>{formatNumber(marketMonitorSummary.activeTradeCount, 0)}</strong>
                  <p>
                    {countLabel(marketMonitorSummary.focusRows.length, 'commodity class')} currently represented in
                    the live monitor.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Pricing Coverage</span>
                  <strong>
                    {marketMonitorSummary.pricedTradeCoveragePercent === null
                      ? '—'
                      : `${formatNumber(marketMonitorSummary.pricedTradeCoveragePercent, 0)}%`}
                  </strong>
                  <p>
                    {countLabel(marketMonitorSummary.pricedTradeCount, 'priced trade')} out of{' '}
                    {countLabel(marketMonitorSummary.activeTradeCount, 'active trade')} in the current board.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Attention Queue</span>
                  <strong>{formatNumber(marketMonitorSummary.issueCount, 0)}</strong>
                  <p>
                    {marketMonitorSummary.priorityRows[0]
                      ? `${marketMonitorSummary.priorityRows[0].label} is leading the watchlist right now.`
                      : 'No active operational backlog is currently leading the watchlist.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Latest Event</span>
                  <strong>
                    {marketMonitorSummary.latestEventAt
                      ? formatDate(marketMonitorSummary.latestEventAt)
                      : 'No events'}
                  </strong>
                  <p>
                    {countLabel(marketMonitorSummary.eventCount, 'workflow event')} in the local timeline and{' '}
                    {countLabel(marketMonitorSummary.positionBucketCount, 'exposure bucket')} in view.
                  </p>
                </article>
              </div>

              <div className="market-monitor-section-grid">
                <section className="market-monitor-section">
                  <div className="market-monitor-section-head">
                    <strong>Market Focus</strong>
                    <p>The heaviest live commodity classes with pricing-link and exposure context.</p>
                  </div>
                  {marketMonitorSummary.focusRows.length > 0 ? (
                    <div className="market-monitor-focus-list">
                      {marketMonitorSummary.focusRows.slice(0, 4).map((row) => (
                        <article key={row.commodityClass} className="market-monitor-focus-row">
                          <div className="market-monitor-focus-copy">
                            <strong>{formatCommodityClass(row.commodityClass)}</strong>
                            <p>
                              {countLabel(row.tradeCount, 'active trade')} •{' '}
                              {countLabel(row.pricedTradeCount, 'priced trade')} •{' '}
                              {countLabel(row.linkedPriceIndexCount, 'linked curve')}
                            </p>
                          </div>
                          <div className="market-monitor-focus-meta">
                            {row.leadExposureNetVolume !== null && row.leadExposureUnitLabel ? (
                              <MetricValue
                                value={formatNumber(row.leadExposureNetVolume, 0)}
                                unit={row.leadExposureUnitLabel}
                              />
                            ) : (
                              <strong>—</strong>
                            )}
                            <span>{countLabel(row.commodityCount, 'commodity')} in the position bucket view</span>
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => openCommodityClassBrief(row.commodityClass)}
                            >
                              Open Brief
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>No live commodity focus yet</strong>
                      <p>Create or widen the local screen filter to bring more market-facing exposure back into view.</p>
                    </div>
                  )}
                </section>

                <section className="market-monitor-section">
                  <div className="market-monitor-section-head">
                    <strong>Desk Priorities</strong>
                    <p>Open backlog categories sorted by live trade pressure.</p>
                  </div>
                  {marketMonitorSummary.priorityRows.length > 0 ? (
                    <div className="market-monitor-priority-list">
                      {marketMonitorSummary.priorityRows.slice(0, 4).map((row) => (
                        <article key={row.label} className="market-monitor-priority-row">
                          <div className="market-monitor-priority-copy">
                            <strong>{row.label}</strong>
                            <p>{row.detail}</p>
                          </div>
                          <div className="market-monitor-priority-meta">
                            <span className={`status-pill status-pill-${row.tone}`}>{row.count} open</span>
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => onOpenView(row.destinationView)}
                            >
                              Open {row.destinationView}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>No active desk priorities</strong>
                      <p>The current trade set is clear enough that nothing is bubbling to the top queue right now.</p>
                    </div>
                  )}
                </section>
              </div>

              {renderTileActions(marketMonitorActions)}
            </div>
          ),
        },
        {
          id: 'desk-headlines',
          eyebrow: 'Headlines',
          title: 'Desk Headlines',
          description: 'A Bloomberg-style attention stream blended from market signals, workflow blockers, pricing gaps, exposure, and activity.',
          span: 'wide',
          availableSpans: ['full', 'wide', 'half'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : (
            renderDeskHeadlinesContent()
          ),
        },
        {
          id: 'watchlist-alerts',
          eyebrow: 'Watchlist',
          title: 'Watchlist Alerts',
          description: 'Saved terminal-mode markets and desk signals with typed in-product alert thresholds.',
          span: 'wide',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : (
            renderWatchlistAlertsContent()
          ),
        },
        {
          id: 'instrument-brief',
          eyebrow: 'Drill-Down',
          title: instrumentBrief?.title ?? 'Instrument Brief',
          description: 'Read-only price-index and commodity-class context with related trades, exposure, events, and owner workspaces.',
          span: 'wide',
          availableSpans: ['full', 'wide', 'half'],
          content: renderInstrumentBriefContent(),
        },
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
              {pnlHistoryLoading ? (
                <div className="skeleton-stack">
                  <div className="skeleton-block" />
                  <div className="skeleton-block" />
                </div>
              ) : (
                <section className="pnl-trend-panel">
                  <div className="pnl-trend-topbar">
                    <div className="pnl-trend-copy">
                      <span>P&amp;L Over Time</span>
                      <p>{pnlTrendSubtitle}</p>
                    </div>
                    <div className="pnl-trend-toolbar">
                      <div className="pnl-trend-presets" aria-label="Date range presets">
                        {datePresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`tab-pill ${activeDatePreset === preset.id ? 'is-active' : ''}`}
                            aria-pressed={activeDatePreset === preset.id}
                            onClick={() => {
                              setDateFromFilter(preset.dateFrom)
                              setDateToFilter(preset.dateTo)
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {hasActivePnlFilters ? (
                        <button
                          type="button"
                          className="button button-ghost pnl-trend-reset-button"
                          onClick={() => {
                            setSelectedBookFilter('')
                            setSelectedCommodityClassFilter('')
                            setDateFromFilter('')
                            setDateToFilter('')
                          }}
                        >
                          Reset Filters
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="pnl-trend-summary-grid">
                    <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
                      <span>Total P&amp;L</span>
                      <strong>{formatMoney(currentPnlProxy)}</strong>
                      <p>{visibleDateWindowLabel}</p>
                    </article>

                    <article className="pnl-trend-stat-card">
                      <span>Window Move</span>
                      <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${hasComparableTrend ? pnlTrendTone : 'flat'}`}>
                        {hasComparableTrend ? formatSignedMoney(pnlTrendWindowChange, formatMoney) : '—'}
                      </strong>
                      <p>
                        {hasComparableTrend
                          ? visibleDateWindowLabel
                          : singlePoint
                            ? `${formatReportDateLabel(singlePoint.date)} is the only marked day in view.`
                            : 'Need at least two marked days to compare a window move.'}
                      </p>
                    </article>

                    <article className="pnl-trend-stat-card">
                      <span>Realized P&amp;L</span>
                      <strong>{formatMoney(reportSummary?.realized_pnl ?? 0)}</strong>
                      <p>{countLabel(reportSummary?.realized_trade_count ?? 0, 'settled trade')}</p>
                    </article>

                    <article className="pnl-trend-stat-card">
                      <span>Open P&amp;L</span>
                      <strong>{formatMoney(reportSummary?.unrealized_pnl ?? 0)}</strong>
                      <p>{countLabel(reportSummary?.unrealized_trade_count ?? 0, 'open trade')}</p>
                    </article>
                  </div>

                  <div className="pnl-trend-filter-grid">
                    <label className="field">
                      <span>Book</span>
                      <select
                        className="control"
                        value={selectedBookFilter}
                        onChange={(event) => setSelectedBookFilter(event.target.value)}
                      >
                        <option value="">All books</option>
                        {bookFilterOptions.map((book) => (
                          <option key={book} value={book}>
                            {book}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Commodity Class</span>
                      <select
                        className="control"
                        value={selectedCommodityClassFilter}
                        onChange={(event) => setSelectedCommodityClassFilter(event.target.value)}
                      >
                        <option value="">All classes</option>
                        {commodityClassFilterOptions.map((commodityClass) => (
                          <option key={commodityClass} value={commodityClass}>
                            {formatCommodityClass(commodityClass)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Start Date</span>
                      <input
                        className="control"
                        type="date"
                        value={dateFromFilter}
                        onChange={(event) => setDateFromFilter(event.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>End Date</span>
                      <input
                        className="control"
                        type="date"
                        value={dateToFilter}
                        onChange={(event) => setDateToFilter(event.target.value)}
                      />
                    </label>
                  </div>

                  {activeFilterLabels.length > 0 ? (
                    <div className="chip-row pnl-trend-active-filters">
                      {activeFilterLabels.map((label) => (
                        <span key={label} className="entity-chip entity-chip-soft">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {pnlFilterError ? <small className="field-error">{pnlFilterError}</small> : null}

                  {hasComparableTrend ? (
                    <div className="pnl-trend-chart-shell">
                      <PnlTrendChart points={pnlTrendPoints} tone={pnlTrendTone} formatMoney={formatMoney} />
                    </div>
                  ) : singlePoint ? (
                    <div className="pnl-trend-sparse-state">
                      <div className="pnl-trend-sparse-copy">
                        <span>Single Marked Day</span>
                        <strong>{formatMoney(singlePoint.total_pnl)}</strong>
                        <p>
                          {formatReportDateLabel(singlePoint.date)} is the only marked day in the current window.
                          Widen the date range or clear filters to reveal trend movement.
                        </p>
                      </div>

                      <div className={`pnl-trend-sparse-visual market-price-chart-${pnlTrendTone}`}>
                        <div className="pnl-trend-sparse-line" />
                        <div className="pnl-trend-sparse-dot" />
                        <small>{formatReportDateLabel(singlePoint.date)}</small>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>No P&amp;L trend yet</strong>
                      <p>
                        {pnlFilterError
                          ? pnlFilterError
                          : pnlHistoryError
                          ? pnlHistoryError
                          : visibleActiveTrades.length > 0
                          ? hasActivePnlFilters
                            ? 'No active trades matched the current report filters yet.'
                            : 'Price the active trades to populate the P&L history.'
                          : 'Create active trades to start building the desk P&L history.'}
                      </p>
                    </div>
                  )}

                  <p className="pnl-trend-note">{effectivePnlHistoryReport?.methodology ?? 'Mark-to-market methodology updates as filters load.'}</p>
                </section>
              )}

              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>P&amp;L Proxy</span>
                  <strong>{formatMoney(currentPnlProxy)}</strong>
                  <p>
                    {hasScreenFilter
                      ? `Based on ${currentPricedTradeCount} priced trade${currentPricedTradeCount === 1 ? '' : 's'} in the current local dashboard view.`
                      : `Based on ${currentPricedTradeCount} priced trade${currentPricedTradeCount === 1 ? '' : 's'} from the reporting service using market marks, stored price differentials, and settlement history.`}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <MetricValue value={formatNumber(grossExposure, 0)} unit={grossExposureUnitLabel} />
                  <p>
                    Across {positionRowCount} commodity position{positionRowCount === 1 ? '' : 's'} and {positionBucketCount}{' '}
                    reporting bucket{positionBucketCount === 1 ? '' : 's'} with UOM coverage.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Needs Attention</span>
                  <strong>{formatNumber(dashboardIssues.total, 0)}</strong>
                  <p>
                    Trade-driven post-trade watchlist spanning confirmation, nomination, allocation, invoicing, and payment aging.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Bucket</span>
                  {largestExposureBucket ? (
                    <MetricValue
                      value={formatNumber(largestExposureBucket.netVolume, 0)}
                      unit={largestExposureBucket.unitLabel}
                    />
                  ) : (
                    <strong>—</strong>
                  )}
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
          id: 'quick-start',
          eyebrow: 'Start Here',
          title: 'Common Starting Points',
          description: 'Go straight to the workspace built for the job you are trying to do.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: (
            <div className="dashboard-report-grid dashboard-start-grid">
              {quickStartActions.map((action) => (
                <article key={action.view} className="dashboard-report-card section-start-card dashboard-start-card">
                  <div className="section-start-card-copy">
                    <span>{action.actionLabel}</span>
                    <strong>{action.title}</strong>
                    <p>{action.detail}</p>
                  </div>
                  <div className="section-start-card-actions">
                    <button type="button" className="button button-secondary" onClick={() => onOpenView(action.view)}>
                      {action.actionLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ),
        },
        {
          id: 'weather-intelligence',
          eyebrow: 'Weather',
          title: 'Weather Intelligence',
          description: 'Desk-facing weather-sensitive exposure and regional signal context based on the stored weather footprint.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <div className="dashboard-tile-action-shell">
              <WeatherIntelligenceTileContent
                appLoading={appLoading}
                formatDate={formatDate}
                formatNumber={formatNumber}
              />
              {renderTileActions(weatherActions)}
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
            <div className="dashboard-tile-action-shell">
              <MarketContextTileContent
                appLoading={appLoading}
                formatDate={formatDate}
                formatNumber={formatNumber}
              />
              {renderTileActions(marketContextActions)}
            </div>
          ),
        },
        {
          id: 'external-series',
          eyebrow: 'Catalog',
          title: 'External Series',
          description: 'Inspect the raw market-data series catalog and stored observation history behind the desk-level signal blend.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <ExternalSeriesTileContent
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
          availableSpans: ['full', 'wide', 'half'],
          content: (
            <div className="dashboard-tile-action-shell">
              <MarketPricesTileContent
                appLoading={appLoading}
                activeTrades={visibleActiveTrades}
                priceIndices={visiblePriceIndices}
                formatNumber={formatNumber}
                onOpenPriceIndexBrief={openPriceIndexBrief}
              />
              {renderTileActions(marketPriceActions)}
            </div>
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
            <div className="dashboard-tile-action-shell">
              <div className="position-class-grid">
                {exposureByClass.map((row) => (
                  <article key={`${row.commodityClass}-${row.unitLabel}`} className="position-class-card">
                    <span>{formatCommodityClass(row.commodityClass)}</span>
                    <MetricValue value={formatNumber(row.netVolume, 0)} unit={row.unitLabel} />
                    <p>
                      {row.commodityCount} commodit{row.commodityCount === 1 ? 'y' : 'ies'} contributing to this
                      reporting bucket.
                    </p>
                    <div className="workflow-item-button-row dashboard-tile-action-row">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => openCommodityClassBrief(row.commodityClass)}
                      >
                        Open Brief
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {renderTileActions(positionActions)}
            </div>
          ) : (
            <div className="dashboard-tile-action-shell">
              <div className="empty-state">
                <strong>{hasScreenFilter ? 'No exposure matches the filter' : 'No open exposure'}</strong>
                <p>
                  {hasScreenFilter
                    ? 'Try a broader local search to bring more commodity exposure back into the dashboard.'
                    : 'The system is healthy, but there are no active trades contributing exposure yet.'}
                </p>
              </div>
              {renderTileActions(positionActions)}
            </div>
          ),
        },
        {
          id: 'operational-attention',
          eyebrow: 'Watchlist',
          title: 'Operational Attention',
          description: 'A lightweight post-trade issue board derived from workflow state, aging, and data completeness.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : dashboardIssues.rows.some((row) => row.count > 0) ? (
            <div className="dashboard-issue-list">
              {dashboardIssues.rows.map((row) => {
                const isActiveRow = activeAttentionIssue?.candidateType === row.candidateType
                return (
                  <article key={row.label} className="dashboard-issue-row">
                    <div>
                      <strong>{row.label}</strong>
                      <p>{row.detail}</p>
                    </div>
                    <div className="dashboard-issue-meta">
                      <span className={`status-pill status-pill-${row.tone}`}>{row.count} open</span>
                      {!hasScreenFilter ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => {
                            setActiveAttentionIssue((current) =>
                              current?.candidateType === row.candidateType ? null : row,
                            )
                            setAttentionCandidates(null)
                            setAttentionCandidatesError('')
                          }}
                        >
                          {isActiveRow ? 'Hide candidates' : 'Open candidates'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
              {!hasScreenFilter && activeAttentionIssue ? (
                <article className="position-card position-card-drilldown">
                  <div className="position-card-head">
                    <div className="position-card-copy">
                      <strong>{activeAttentionIssue.label}</strong>
                      <p>{activeAttentionIssue.detail}</p>
                    </div>
                    <div className="position-card-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onOpenView(activeAttentionIssue.destinationView)}
                      >
                        Open {activeAttentionIssue.destinationView}
                      </button>
                    </div>
                  </div>
                  {attentionCandidatesLoading ? (
                    <div className="skeleton-stack">
                      <div className="skeleton-block" />
                    </div>
                  ) : attentionCandidatesError ? (
                    <div className="empty-state">
                      <strong>Candidate read unavailable</strong>
                      <p>{attentionCandidatesError}</p>
                    </div>
                  ) : attentionCandidates && attentionCandidates.items.length > 0 ? (
                    <div className="position-list">
                      <div className="position-card-copy">
                        <p>{activeAttentionSummary}</p>
                      </div>
                      {attentionCandidates.items.map((candidate) => {
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
                            <span className="entity-chip entity-chip-soft">
                              {formatCommodityClass(candidate.commodity_class)}
                            </span>
                            <span className="entity-chip entity-chip-soft">{candidate.book}</span>
                          </div>
                          <div className="position-card-copy">
                            <p>{summarizeCandidateStatuses(candidate)}</p>
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
                              Delivery {formatDate(candidate.delivery_start)} to {formatDate(candidate.delivery_end)}
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
                  ) : attentionCandidates ? (
                    <div className="empty-state">
                      <strong>No candidate trades</strong>
                      <p>The deterministic candidate read is clear for this attention bucket right now.</p>
                    </div>
                  ) : null}
                </article>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              <strong>{hasScreenFilter ? 'No attention items match the filter' : 'No active operational issues'}</strong>
              <p>
                {hasScreenFilter
                  ? 'Nothing in the filtered live trade set is currently triggering the watchlist.'
                  : 'The live trades are confirmed, scheduled, invoiced, and populated well enough that nothing is currently flagged here.'}
              </p>
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
            <div className="dashboard-tile-action-shell">
              <div className="timeline">
                {appLoading ? (
                  <div className="skeleton-stack">
                    <div className="skeleton-block" />
                  </div>
                ) : visibleEvents.slice(0, 5).length > 0 ? (
                  visibleEvents.slice(0, 5).map((event) => (
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
                    <strong>{hasScreenFilter ? 'No recent events match the filter' : 'No recent events'}</strong>
                    <p>
                      {hasScreenFilter
                        ? 'Try a broader local search to bring more workflow activity back into the dashboard timeline.'
                        : 'Create or amend a trade to start building the operational timeline.'}
                    </p>
                  </div>
                )}
              </div>
              {renderTileActions(timelineActions)}
            </div>
          ),
        },
      ]}
    />
  )
}
