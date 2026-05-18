import { useEffect, useMemo, useState } from 'react'

import { loadPriceIndexObservations } from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type { PriceIndexObservationRecord } from '../../shared/models'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  buildAreaPath,
  buildChartPoints,
  buildLinePath,
} from './chartUtils'
import { selectPriceIndexCandidates } from './marketPriceSelection'
import {
  buildTerminalCurveBuckets,
  buildTerminalCurveRows,
  buildTerminalQuoteChartModel,
  type TerminalCurveRow,
  type TerminalQuoteCurvePriceIndex,
  type TerminalQuoteCurveSeries,
  type TerminalQuoteTone,
} from './terminalQuoteCurve'

type DashboardTrade = {
  price_index_code: string | null
}

type TerminalQuoteCurvePanelProps = {
  appLoading: boolean
  activeTrades: DashboardTrade[]
  priceIndices: TerminalQuoteCurvePriceIndex[]
  formatNumber: (value: number | null, digits?: number) => string
  onOpenPriceIndexBrief?: (priceIndex: TerminalQuoteCurvePriceIndex) => void
}

const QUOTE_HISTORY_LIMIT = 36
const MAX_CURVE_ROWS = 8

function parseObservationDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const [, year, month, day] = match
  if (!year || !month || !day) {
    return null
  }

  return new Date(Number(year), Number(month) - 1, Number(day))
}

function formatObservationDate(value: string): string {
  const parsed = parseObservationDate(value)
  if (!parsed) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function quoteDigits(observation: PriceIndexObservationRecord | null): number {
  if (!observation) {
    return 2
  }

  return observation.unit_code === 'GAL' ? 3 : 2
}

function formatQuoteValue(
  observation: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!observation) {
    return '-'
  }

  const currencyPrefix = observation.currency_code ? `${observation.currency_code} ` : ''
  return `${currencyPrefix}${formatNumber(observation.value, quoteDigits(observation))} / ${observation.unit_code}`
}

function formatDelta(
  delta: number | null,
  observation: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (delta === null) {
    return 'Awaiting prior quote'
  }

  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatNumber(delta, quoteDigits(observation))}`
}

function formatDeltaPercent(value: number | null, formatNumber: (value: number | null, digits?: number) => string): string {
  if (value === null) {
    return '-'
  }

  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value * 100, 2)}%`
}

function useTerminalQuoteCurveSeries(
  appLoading: boolean,
  activeTrades: DashboardTrade[],
  priceIndices: TerminalQuoteCurvePriceIndex[],
) {
  const [seriesList, setSeriesList] = useState<TerminalQuoteCurveSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedPriceIndices = useMemo(
    () => selectPriceIndexCandidates(activeTrades, priceIndices),
    [activeTrades, priceIndices],
  )

  useEffect(() => {
    if (appLoading) {
      return
    }

    if (selectedPriceIndices.length === 0) {
      setSeriesList([])
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false

    async function loadSeries() {
      setLoading(true)
      setError('')

      try {
        const results = await Promise.allSettled(
          selectedPriceIndices.map(async (priceIndex) => ({
            priceIndex,
            observations: await loadPriceIndexObservations(appConfig.apiBase, priceIndex.code, QUOTE_HISTORY_LIMIT),
          })),
        )

        if (cancelled) {
          return
        }

        const fulfilledResults = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{
              priceIndex: TerminalQuoteCurvePriceIndex
              observations: PriceIndexObservationRecord[]
            }> => result.status === 'fulfilled',
          )
          .map((result) => result.value)
        const nextSeriesList = fulfilledResults
          .filter((series) => series.observations.length > 0)
          .map((series) => ({
            priceIndex: series.priceIndex,
            observations: series.observations,
          }))

        setSeriesList(nextSeriesList)
        setError(results.some((result) => result.status === 'rejected') ? 'Some quote histories could not be loaded.' : '')
      } catch (nextError) {
        if (cancelled) {
          return
        }

        setSeriesList([])
        setError(nextError instanceof Error ? nextError.message : 'Unable to load quote and curve history.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSeries()

    return () => {
      cancelled = true
    }
  }, [appLoading, selectedPriceIndices])

  return {
    error,
    loading,
    selectedPriceIndices,
    seriesList,
  }
}

function TerminalQuoteChart({
  series,
  tone,
}: {
  series: TerminalQuoteCurveSeries
  tone: TerminalQuoteTone
}) {
  const model = buildTerminalQuoteChartModel(series)
  const points = buildChartPoints(model.values)
  const linePath = buildLinePath(points)
  const areaPath = buildAreaPath(points)
  const lastPoint = points[points.length - 1]

  return (
    <div className={`terminal-quote-chart market-price-chart market-price-chart-${tone}`}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.priceIndex.code} quote history`}
      >
        <path className="market-price-chart-area" d={areaPath} />
        <path className="market-price-chart-line" d={linePath} />
      </svg>
      {lastPoint ? (
        <span
          aria-hidden="true"
          className="market-price-chart-point terminal-quote-chart-point"
          style={{
            left: `${(lastPoint.x / CHART_WIDTH) * 100}%`,
            top: `${(lastPoint.y / CHART_HEIGHT) * 100}%`,
          }}
        />
      ) : null}
    </div>
  )
}

function CurveRow({
  row,
  formatNumber,
  onOpenPriceIndexBrief,
}: {
  row: TerminalCurveRow
  formatNumber: (value: number | null, digits?: number) => string
  onOpenPriceIndexBrief?: (priceIndex: TerminalQuoteCurvePriceIndex) => void
}) {
  return (
    <article className="terminal-curve-row">
      <div className="terminal-curve-row-copy">
        <strong>{row.priceIndex.code}</strong>
        <span>{row.priceIndex.name}</span>
      </div>
      <div className="terminal-curve-row-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(6, row.normalizedLatestValue * 100)}%` }} />
      </div>
      <div className="terminal-curve-row-meta">
        <strong>{formatQuoteValue(row.latest, formatNumber)}</strong>
        <small className={`market-price-change market-price-change-${row.tone}`}>
          {formatDelta(row.delta, row.latest, formatNumber)}
        </small>
      </div>
      {onOpenPriceIndexBrief ? (
        <button
          type="button"
          className="button button-ghost"
          onClick={() => onOpenPriceIndexBrief(row.priceIndex)}
        >
          Brief
        </button>
      ) : null}
    </article>
  )
}

export function TerminalQuoteCurvePanel({
  appLoading,
  activeTrades,
  priceIndices,
  formatNumber,
  onOpenPriceIndexBrief,
}: TerminalQuoteCurvePanelProps) {
  const { error, loading, selectedPriceIndices, seriesList } = useTerminalQuoteCurveSeries(
    appLoading,
    activeTrades,
    priceIndices,
  )
  const [selectedPriceIndexCode, setSelectedPriceIndexCode] = useState<string | null>(null)
  const selectedSeries =
    seriesList.find((series) => series.priceIndex.code === selectedPriceIndexCode) ?? seriesList[0] ?? null
  const quoteModel = buildTerminalQuoteChartModel(selectedSeries)
  const curveRows = buildTerminalCurveRows(seriesList, activeTrades)
  const curveBuckets = buildTerminalCurveBuckets(curveRows)
  const visibleCurveRows = curveRows.slice(0, MAX_CURVE_ROWS)

  if (appLoading || loading) {
    return (
      <div className="terminal-quote-panel">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }

  if (seriesList.length === 0 && error) {
    return (
      <div className="empty-state">
        <strong>Quote chart unavailable</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (!selectedSeries) {
    return (
      <div className="empty-state">
        <strong>No quote curves in view</strong>
        <p>Run a price sync or add active desk indices to populate the quote chart and curve panel.</p>
      </div>
    )
  }

  return (
    <div className="terminal-quote-panel">
      {error ? <p className="system-panel-note">{error}</p> : null}

      <div className="terminal-quote-layout">
        <aside className="terminal-quote-selector" aria-label="Quote curve selector">
          <div className="terminal-quote-selector-head">
            <span className="eyebrow">Curves</span>
            <strong>{selectedPriceIndices.length} tracked</strong>
          </div>
          <div className="terminal-quote-selector-list">
            {seriesList.map((series) => {
              const isSelected = selectedSeries.priceIndex.code === series.priceIndex.code
              const model = buildTerminalQuoteChartModel(series)

              return (
                <button
                  key={series.priceIndex.code}
                  type="button"
                  className={`terminal-quote-selector-row ${isSelected ? 'is-active' : ''}`.trim()}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPriceIndexCode(series.priceIndex.code)}
                >
                  <span>{series.priceIndex.code}</span>
                  <strong>{formatQuoteValue(model.latest, formatNumber)}</strong>
                  <small className={`market-price-change market-price-change-${model.tone}`}>
                    {formatDelta(model.delta, model.latest, formatNumber)}
                  </small>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="terminal-quote-chart-card">
          <div className="terminal-quote-card-head">
            <div>
              <span className="eyebrow">Quote Chart</span>
              <strong>{selectedSeries.priceIndex.name}</strong>
              <p>
                {selectedSeries.priceIndex.code} • {selectedSeries.priceIndex.provider}
                {selectedSeries.priceIndex.market ? ` • ${selectedSeries.priceIndex.market}` : ''}
              </p>
            </div>
            <div className="terminal-quote-latest">
              <span>{quoteModel.latest ? formatObservationDate(quoteModel.latest.observation_date) : '-'}</span>
              <strong>{formatQuoteValue(quoteModel.latest, formatNumber)}</strong>
              <small className={`market-price-change market-price-change-${quoteModel.tone}`}>
                {formatDelta(quoteModel.delta, quoteModel.latest, formatNumber)} ·{' '}
                {formatDeltaPercent(quoteModel.deltaPercent, formatNumber)}
              </small>
            </div>
          </div>

          <TerminalQuoteChart series={selectedSeries} tone={quoteModel.tone} />

          <div className="terminal-quote-stat-grid">
            <article>
              <span>Low</span>
              <strong>{formatNumber(quoteModel.low, quoteDigits(quoteModel.latest))}</strong>
            </article>
            <article>
              <span>High</span>
              <strong>{formatNumber(quoteModel.high, quoteDigits(quoteModel.latest))}</strong>
            </article>
            <article>
              <span>Average</span>
              <strong>{formatNumber(quoteModel.average, quoteDigits(quoteModel.latest))}</strong>
            </article>
            <article>
              <span>History</span>
              <strong>{formatNumber(quoteModel.orderedObservations.length, 0)}</strong>
            </article>
          </div>

          {onOpenPriceIndexBrief ? (
            <div className="workflow-item-button-row dashboard-tile-action-row">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => onOpenPriceIndexBrief(selectedSeries.priceIndex)}
              >
                Open Brief
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section className="terminal-curve-card">
        <div className="terminal-quote-card-head">
          <div>
            <span className="eyebrow">Curve Panel</span>
            <strong>Latest curve strip</strong>
            <p>Desk-linked curves ranked by active trade usage, with latest mark and prior-observation move.</p>
          </div>
          <div className="terminal-quote-latest">
            <span>Buckets</span>
            <strong>{formatNumber(curveBuckets.length, 0)}</strong>
            <small>{formatNumber(curveRows.length, 0)} quoted curve{curveRows.length === 1 ? '' : 's'}</small>
          </div>
        </div>

        <div className="terminal-curve-row-list">
          {visibleCurveRows.map((row) => (
            <CurveRow
              key={row.priceIndex.code}
              row={row}
              formatNumber={formatNumber}
              onOpenPriceIndexBrief={onOpenPriceIndexBrief}
            />
          ))}
        </div>

        {curveBuckets.length > 0 ? (
          <div className="terminal-curve-bucket-grid">
            {curveBuckets.slice(0, 4).map((bucket) => (
              <article key={bucket.key} className="terminal-curve-bucket">
                <span>{bucket.label}</span>
                <strong>{formatNumber(bucket.averageLatestValue, 2)}</strong>
                <p>
                  {bucket.rows.length} curve{bucket.rows.length === 1 ? '' : 's'} • low{' '}
                  {formatNumber(bucket.lowLatestValue, 2)} / high {formatNumber(bucket.highLatestValue, 2)}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
