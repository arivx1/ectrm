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
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type { StoredAuthSession } from '../../shared/mutation'
import { loadDashboardPnlHistory } from './pnlHistoryLoader'
import { ExternalSeriesTileContent } from './ExternalSeriesPanel'
import { MarketContextTileContent } from './MarketContextPanel'
import { MarketPricesTileContent } from './MarketPricesPanel'
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
}

type DashboardWorkspaceProps = {
  authSession: StoredAuthSession | null
  globalFilter: string
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
  onOpenTrade: (tradeId: string) => void
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
    globalFilter,
    onOpenView,
    onOpenTrade,
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

  return (
    <TileLayout
      workspaceId="dashboard"
      workspaceLabel="Live Desk"
      authSession={authSession}
      headerContent={
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
      }
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
            <WeatherIntelligenceTileContent
              appLoading={appLoading}
              formatDate={formatDate}
              formatNumber={formatNumber}
            />
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
          availableSpans: ['full', 'wide'],
          content: (
            <MarketPricesTileContent
              appLoading={appLoading}
              activeTrades={visibleActiveTrades}
              priceIndices={visiblePriceIndices}
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
                  <MetricValue value={formatNumber(row.netVolume, 0)} unit={row.unitLabel} />
                  <p>
                    {row.commodityCount} commodit{row.commodityCount === 1 ? 'y' : 'ies'} contributing to this
                    reporting bucket.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>{hasScreenFilter ? 'No exposure matches the filter' : 'No open exposure'}</strong>
              <p>
                {hasScreenFilter
                  ? 'Try a broader local search to bring more commodity exposure back into the dashboard.'
                  : 'The system is healthy, but there are no active trades contributing exposure yet.'}
              </p>
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
          ),
        },
      ]}
    />
  )
}
