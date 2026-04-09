import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { loadPnlHistoryReport } from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import type { PnlHistoryPoint, PnlHistoryReport, Trade as TradeRecord } from '../../shared/models'
import { buildUnitLabelByCommodity, summarizeUnitLabels } from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'
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
  const [pnlHistoryReport, setPnlHistoryReport] = useState<PnlHistoryReport | null>(null)
  const [pnlHistoryLoading, setPnlHistoryLoading] = useState(true)
  const [pnlHistoryError, setPnlHistoryError] = useState('')
  const [selectedBookFilter, setSelectedBookFilter] = useState('')
  const [selectedCommodityClassFilter, setSelectedCommodityClassFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')

  const bookFilterOptions = useMemo(
    () => [...new Set(activeTrades.map((trade) => trade.book).filter((value) => value.trim() !== ''))].sort(),
    [activeTrades],
  )
  const commodityClassFilterOptions = useMemo(
    () =>
      [...new Set(activeTrades.map((trade) => trade.commodity_class).filter((value) => value.trim() !== ''))].sort(),
    [activeTrades],
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
        const nextReport = await loadPnlHistoryReport(appConfig.apiBase, {
          book: selectedBookFilter || undefined,
          commodityClass: selectedCommodityClassFilter || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        })
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
    selectedBookFilter,
    selectedCommodityClassFilter,
    dateFromFilter,
    dateToFilter,
    pnlFilterError,
  ])

  const unitLabelByCommodity = useMemo(() => buildUnitLabelByCommodity(activeTrades), [activeTrades])

  const exposureByClass = useMemo(() => {
    const totals = new Map<string, { commodityClass: string; unitLabel: string; netVolume: number; commodityCount: number }>()
    for (const position of positionsWithClass) {
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
  }, [positionsWithClass, unitLabelByCommodity])

  const grossExposureUnitLabel = useMemo(
    () => summarizeUnitLabels(activeTrades.map((trade) => trade.unit_of_measure)),
    [activeTrades],
  )

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
  const currentPnlProxy = reportSummary?.total_pnl ?? markedPnlProxy
  const currentPricedTradeCount = reportSummary?.priced_trade_count ?? pricedTradeCount
  const activeDatePreset =
    datePresets.find((preset) => preset.dateFrom === dateFromFilter && preset.dateTo === dateToFilter)?.id ?? null
  const visibleDateWindowLabel =
    pnlTrendStart && pnlTrendEnd
      ? formatDateWindowLabel(pnlTrendStart.date, pnlTrendEnd.date)
      : formatDateWindowLabel(dateFromFilter, dateToFilter)
  const pnlTrendSubtitle = pnlHistoryError
    ? pnlHistoryError
    : pnlTrendPoints.length > 0
      ? `${countLabel(pnlTrendPoints.length, 'marked day')} across ${countLabel(currentPricedTradeCount, 'priced trade')} in view.`
      : hasActivePnlFilters
        ? 'No marked history matches the current filter scope yet.'
        : activeTrades.length > 0
          ? 'Mark-to-market daily history will fill in as priced trades and observations arrive.'
          : 'Create active trades to start building desk P&L history.'
  const activeFilterLabels = [
    selectedBookFilter ? `Book · ${selectedBookFilter}` : null,
    selectedCommodityClassFilter ? `Class · ${formatCommodityClass(selectedCommodityClassFilter)}` : null,
    dateFromFilter || dateToFilter ? `Window · ${formatDateWindowLabel(dateFromFilter, dateToFilter)}` : null,
  ].filter((value): value is string => Boolean(value))

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
    const confirmationBacklog = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 1 && trade.confirmation_status !== 'CONFIRMED'
    })
    const nominationBacklog = activeTrades.filter((trade) => {
      const daysUntilDelivery = daysUntilDate(trade.delivery_start)
      return (
        trade.trade_nature === 'PHYSICAL' &&
        daysUntilDelivery !== null &&
        daysUntilDelivery <= 3 &&
        !['NOT_REQUIRED', 'SCHEDULED', 'NOMINATED', 'COMPLETED'].includes(trade.nomination_status)
      )
    })
    const allocationBacklog = activeTrades.filter(
      (trade) =>
        trade.trade_nature === 'PHYSICAL' &&
        ['NOMINATED', 'COMPLETED'].includes(trade.nomination_status) &&
        !['NOT_REQUIRED', 'ALLOCATED', 'COMPLETED'].includes(trade.allocation_status),
    )
    const invoiceBacklog = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return (
        trade.trade_nature === 'PHYSICAL' &&
        ageDays !== null &&
        ageDays >= 5 &&
        !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(trade.invoice_status)
      )
    })
    const overduePayments = activeTrades.filter((trade) => {
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
    const stalePricing = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 2 && ['PENDING', 'PARTIALLY_PRICED'].includes(trade.pricing_status)
    })
    const incompleteOperationalData = activeTrades.filter(
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
        },
        {
          label: 'Nomination backlog',
          count: nominationBacklog.length,
          detail: 'Physical trades nearing delivery that still need nomination or scheduling completion.',
          tone: nominationBacklog.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Allocation backlog',
          count: allocationBacklog.length,
          detail: 'Nominated flows that have not reached an allocated or completed state yet.',
          tone: allocationBacklog.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Invoice backlog',
          count: invoiceBacklog.length,
          detail: 'Physical trades aging 5+ days without an issued or approved invoice workflow state.',
          tone: invoiceBacklog.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Overdue payments',
          count: overduePayments.length,
          detail: 'Trades with overdue payment state or aging invoices that still are not paid.',
          tone: overduePayments.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Stale pricing',
          count: stalePricing.length,
          detail: 'Trades still marked pending or partial pricing 2+ days after execution.',
          tone: stalePricing.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Incomplete ops data',
          count: incompleteOperationalData.length,
          detail: 'Active trades missing core execution, counterparty, quantity, or physical delivery attributes.',
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
                          : activeTrades.length > 0
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
                    Based on {currentPricedTradeCount} priced trade{currentPricedTradeCount === 1 ? '' : 's'} from the
                    reporting service using market marks, stored price differentials, and settlement history.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <MetricValue value={formatNumber(grossExposure, 0)} unit={grossExposureUnitLabel} />
                  <p>
                    Across {positionsWithClass.length} commodity position{positionsWithClass.length === 1 ? '' : 's'} and{' '}
                    {exposureByClass.length} reporting bucket{exposureByClass.length === 1 ? '' : 's'} with UOM coverage.
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
              <strong>No open exposure</strong>
              <p>The system is healthy, but there are no active trades contributing exposure yet.</p>
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
              <p>The live trades are confirmed, scheduled, invoiced, and populated well enough that nothing is currently flagged here.</p>
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
