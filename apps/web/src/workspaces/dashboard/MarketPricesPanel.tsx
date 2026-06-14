import { useEffect, useMemo, useState } from 'react'

import { loadPriceIndexObservations } from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type { PriceIndexObservationRecord } from '../../shared/models'
import { CHART_HEIGHT, CHART_WIDTH, buildAreaPath, buildChartPoints, buildLinePath } from './chartUtils'
import { selectPriceIndexCandidates } from './marketPriceSelection'

type DashboardTrade = {
  price_index_code: string | null
}

type DashboardPriceIndex = {
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

type PriceSeries = {
  priceIndex: DashboardPriceIndex
  observations: PriceIndexObservationRecord[]
}

type MarketPricesTileContentProps = {
  appLoading: boolean
  activeTrades: DashboardTrade[]
  priceIndices: DashboardPriceIndex[]
  formatNumber: (value: number | null, digits?: number) => string
  onOpenPriceIndexBrief?: (priceIndex: DashboardPriceIndex) => void
}

const PRICE_HISTORY_LIMIT = 24
const MAX_PRICE_CARDS = 4
const MAX_PRICE_STRIP_CARDS = 6

function parseObservationDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(year, month - 1, day)
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

function formatObservationWindow(observations: PriceIndexObservationRecord[]): string {
  if (observations.length === 0) {
    return 'No observations'
  }

  const newest = observations[0]
  const oldest = observations[observations.length - 1]
  if (oldest.observation_date === newest.observation_date) {
    return formatObservationDate(newest.observation_date)
  }

  return `${formatObservationDate(oldest.observation_date)} - ${formatObservationDate(newest.observation_date)}`
}

function observationDigits(observation: PriceIndexObservationRecord | null): number {
  if (!observation) {
    return 2
  }

  return observation.unit_code === 'GAL' ? 3 : 2
}

function formatObservationValue(
  observation: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!observation) {
    return '—'
  }

  const currencyPrefix = observation.currency_code ? `${observation.currency_code} ` : ''
  return `${currencyPrefix}${formatNumber(observation.value, observationDigits(observation))} / ${observation.unit_code}`
}

function formatDelta(
  latest: PriceIndexObservationRecord | null,
  previous: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!latest || !previous) {
    return 'Awaiting prior observation'
  }

  const delta = latest.value - previous.value
  const digits = observationDigits(latest)
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatNumber(delta, digits)} vs prior obs`
}

function changeTone(
  latest: PriceIndexObservationRecord | null,
  previous: PriceIndexObservationRecord | null,
): 'up' | 'down' | 'flat' {
  if (!latest || !previous) {
    return 'flat'
  }

  if (latest.value > previous.value) {
    return 'up'
  }

  if (latest.value < previous.value) {
    return 'down'
  }

  return 'flat'
}

function useMarketPriceSeries(
  appLoading: boolean,
  activeTrades: DashboardTrade[],
  priceIndices: DashboardPriceIndex[],
) {
  const [priceSeries, setPriceSeries] = useState<PriceSeries[]>([])
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
      setPriceSeries([])
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
            observations: await loadPriceIndexObservations(appConfig.apiBase, priceIndex.code, PRICE_HISTORY_LIMIT),
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
              priceIndex: DashboardPriceIndex
              observations: PriceIndexObservationRecord[]
            }> => result.status === 'fulfilled',
          )
          .map((result) => result.value)
        const nextSeries = fulfilledResults
          .filter((result) => result.observations.length > 0)
          .map((result) => ({
            priceIndex: result.priceIndex,
            observations: result.observations,
          }))

        setPriceSeries(nextSeries)
        setError(results.some((result) => result.status === 'rejected') ? 'Some price series could not be loaded.' : '')
      } catch (nextError) {
        if (cancelled) {
          return
        }

        setPriceSeries([])
        setError(nextError instanceof Error ? nextError.message : 'Unable to load recent market prices.')
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
    priceSeries,
    selectedPriceIndices,
  }
}

function Sparkline({
  observations,
  tone,
}: {
  observations: PriceIndexObservationRecord[]
  tone: 'up' | 'down' | 'flat'
}) {
  const orderedValues = [...observations]
    .reverse()
    .map((observation) => observation.value)
  const points = buildChartPoints(orderedValues)
  const linePath = buildLinePath(points)
  const areaPath = buildAreaPath(points)
  const lastPoint = points[points.length - 1]

  return (
    <div className={`market-price-chart market-price-chart-${tone}`}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Historical price line graph"
      >
        <path className="market-price-chart-area" d={areaPath} />
        <path className="market-price-chart-line" d={linePath} />
      </svg>
      {lastPoint ? (
        <span
          aria-hidden="true"
          className="market-price-chart-point"
          style={{
            left: `${(lastPoint.x / CHART_WIDTH) * 100}%`,
            top: `${(lastPoint.y / CHART_HEIGHT) * 100}%`,
          }}
        />
      ) : null}
    </div>
  )
}

export function MarketPricesTileContent({
  appLoading,
  activeTrades,
  priceIndices,
  formatNumber,
  onOpenPriceIndexBrief,
}: MarketPricesTileContentProps) {
  const { error, loading, priceSeries } = useMarketPriceSeries(appLoading, activeTrades, priceIndices)
  const visibleSeries = priceSeries.slice(0, MAX_PRICE_CARDS)
  const hasPriceSeries = visibleSeries.length > 0

  return (
    <>
      {appLoading || loading ? (
        <div className="market-price-grid">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : !hasPriceSeries && error ? (
        <div className="empty-state">
          <strong>Market prices unavailable</strong>
          <p>{error}</p>
        </div>
      ) : hasPriceSeries ? (
        <>
          {error && <p className="system-panel-note">{error}</p>}
          <div className="market-price-grid">
            {visibleSeries.map((series) => {
              const latest = series.observations[0] ?? null
              const previous = series.observations[1] ?? null
              const tone = changeTone(latest, previous)
              const historyCount = series.observations.length
              const low = series.observations.reduce(
                (current, observation) => Math.min(current, observation.value),
                series.observations[0]?.value ?? 0,
              )
              const high = series.observations.reduce(
                (current, observation) => Math.max(current, observation.value),
                series.observations[0]?.value ?? 0,
              )

              return (
                <article key={series.priceIndex.code} className="market-price-card">
                  <div className="market-price-card-head">
                    <div>
                      <span>{series.priceIndex.code}</span>
                      <strong>{series.priceIndex.name}</strong>
                    </div>
                    <b>{latest ? formatObservationDate(latest.observation_date) : '—'}</b>
                  </div>

                  <div className="market-price-value-row">
                    <strong>{formatObservationValue(latest, formatNumber)}</strong>
                    <small className={`market-price-change market-price-change-${tone}`}>
                      {formatDelta(latest, previous, formatNumber)}
                    </small>
                  </div>

                  <Sparkline observations={series.observations} tone={tone} />

                  <div className="market-price-meta">
                    <span>{formatObservationWindow(series.observations)}</span>
                    <span>{historyCount} observation{historyCount === 1 ? '' : 's'}</span>
                  </div>

                  <div className="market-price-range">
                    <strong>Low {formatNumber(low, observationDigits(latest))}</strong>
                    <strong>High {formatNumber(high, observationDigits(latest))}</strong>
                  </div>

                  {onOpenPriceIndexBrief ? (
                    <div className="workflow-item-button-row dashboard-tile-action-row">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => onOpenPriceIndexBrief(series.priceIndex)}
                      >
                        Open Brief
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>No market prices yet</strong>
          <p>Run a price sync or add tracked price indices to start populating the dashboard chart cards.</p>
        </div>
      )}
    </>
  )
}

export function MarketMonitorStripTileContent({
  appLoading,
  activeTrades,
  priceIndices,
  formatNumber,
  onOpenPriceIndexBrief,
}: MarketPricesTileContentProps) {
  const { error, loading, priceSeries, selectedPriceIndices } = useMarketPriceSeries(
    appLoading,
    activeTrades,
    priceIndices,
  )
  const visibleSeries = priceSeries.slice(0, MAX_PRICE_STRIP_CARDS)
  const hasPriceSeries = visibleSeries.length > 0

  if (appLoading || loading) {
    return (
      <div className="market-monitor-strip-grid">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }

  if (!hasPriceSeries && error) {
    return (
      <div className="empty-state">
        <strong>Market monitor unavailable</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (!hasPriceSeries) {
    return (
      <div className="empty-state">
        <strong>No tracked curves in view</strong>
        <p>Run a price sync or add active desk indices to populate the compact market strip.</p>
      </div>
    )
  }

  return (
    <div className="market-monitor-strip">
      {error ? <p className="system-panel-note">{error}</p> : null}
      <div className="market-monitor-strip-grid">
        {visibleSeries.map((series) => {
          const latest = series.observations[0] ?? null
          const previous = series.observations[1] ?? null
          const tone = changeTone(latest, previous)

          return (
            <article key={series.priceIndex.code} className="market-monitor-strip-card">
              <div className="market-monitor-strip-head">
                <strong>{series.priceIndex.code}</strong>
                <span>{latest ? formatObservationDate(latest.observation_date) : '—'}</span>
              </div>
              <div className="market-monitor-strip-value">
                <strong>{formatObservationValue(latest, formatNumber)}</strong>
                <small className={`market-price-change market-price-change-${tone}`}>
                  {formatDelta(latest, previous, formatNumber)}
                </small>
              </div>
              <div className="market-monitor-strip-sparkline">
                <Sparkline observations={series.observations} tone={tone} />
              </div>
              <div className="market-monitor-strip-meta">
                <span>{series.priceIndex.name}</span>
                <span>{series.priceIndex.provider}</span>
              </div>
              {onOpenPriceIndexBrief ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => onOpenPriceIndexBrief(series.priceIndex)}
                >
                  Open Brief
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
      <div className="market-monitor-strip-footer">
        <span>
          Showing {visibleSeries.length} of {selectedPriceIndices.length} tracked curve
          {selectedPriceIndices.length === 1 ? '' : 's'}.
        </span>
        <span>Use the Market Prices tile for the fuller history and range view.</span>
      </div>
    </div>
  )
}
