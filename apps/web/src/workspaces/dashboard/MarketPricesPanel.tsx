import { useEffect, useMemo, useState } from 'react'

import { loadPriceIndexObservations } from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type { PriceIndexObservationRecord } from '../../shared/models'
import { CHART_HEIGHT, CHART_WIDTH, buildAreaPath, buildChartPoints, buildLinePath } from './chartUtils'

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
}

const PRICE_HISTORY_LIMIT = 24
const MAX_PRICE_CANDIDATES = 8
const MAX_PRICE_CARDS = 4

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

function selectPriceIndexCandidates(
  activeTrades: DashboardTrade[],
  priceIndices: DashboardPriceIndex[],
): DashboardPriceIndex[] {
  const activeIndexMap = new Map(
    priceIndices.filter((priceIndex) => priceIndex.is_active).map((priceIndex) => [priceIndex.code, priceIndex]),
  )
  const activityByCode = new Map<string, number>()

  for (const trade of activeTrades) {
    if (!trade.price_index_code) {
      continue
    }

    const nextCount = (activityByCode.get(trade.price_index_code) ?? 0) + 1
    activityByCode.set(trade.price_index_code, nextCount)
  }

  const selected: DashboardPriceIndex[] = []
  const seenCodes = new Set<string>()

  const rankedTradeCodes = [...activityByCode.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([code]) => code)

  for (const code of rankedTradeCodes) {
    const priceIndex = activeIndexMap.get(code)
    if (!priceIndex || seenCodes.has(priceIndex.code)) {
      continue
    }

    selected.push(priceIndex)
    seenCodes.add(priceIndex.code)
  }

  const fallbacks = [...activeIndexMap.values()].sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider)
    if (providerCompare !== 0) {
      return providerCompare
    }

    return left.name.localeCompare(right.name)
  })

  for (const priceIndex of fallbacks) {
    if (seenCodes.has(priceIndex.code)) {
      continue
    }

    selected.push(priceIndex)
    seenCodes.add(priceIndex.code)

    if (selected.length >= MAX_PRICE_CANDIDATES) {
      break
    }
  }

  return selected.slice(0, MAX_PRICE_CANDIDATES)
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
}: MarketPricesTileContentProps) {
  const [priceSeries, setPriceSeries] = useState<PriceSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedPriceIndices = useMemo(
    () => selectPriceIndexCandidates(activeTrades, priceIndices),
    [activeTrades, priceIndices],
  )
  const hasPriceSeries = priceSeries.length > 0

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
          .filter((result): result is PromiseFulfilledResult<{ priceIndex: DashboardPriceIndex; observations: PriceIndexObservationRecord[] }> => result.status === 'fulfilled')
          .map((result) => result.value)
        const nextSeries = fulfilledResults
          .filter((result) => result.observations.length > 0)
          .slice(0, MAX_PRICE_CARDS)
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
            {priceSeries.map((series) => {
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
