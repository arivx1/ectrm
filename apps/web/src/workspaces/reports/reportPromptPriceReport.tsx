import { useMemo } from 'react'

import type {
  LocationRecord,
  PriceIndexObservationRecord,
  PriceIndexRecord,
} from '../../shared/models'
import type { ReportPromptPriceIntent } from './reportPrompt'
import { formatCodeLabel } from './reportUtils'

type ReportPromptPriceCoordinate = {
  latitude: number
  longitude: number
  label: string
}

type ReportPromptPriceSeries = {
  priceIndex: PriceIndexRecord
  location: LocationRecord | null
  locationLabel: string
  coordinates: ReportPromptPriceCoordinate | null
  observations: PriceIndexObservationRecord[]
  latest: PriceIndexObservationRecord | null
  previous: PriceIndexObservationRecord | null
}

type ReportPromptPriceReportProps = {
  intent: ReportPromptPriceIntent
  observations: PriceIndexObservationRecord[]
  locations: LocationRecord[]
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
}

const REPORT_PROMPT_PRICE_COLORS = [
  '#127c6c',
  '#4c78b6',
  '#b45f3f',
  '#6f5aa8',
  '#a07924',
  '#2f7d9a',
  '#9a4265',
  '#4e7c3d',
  '#765c3c',
  '#59626f',
]

const US_MAP_BOUNDS = {
  minLongitude: -125,
  maxLongitude: -66,
  minLatitude: 24,
  maxLatitude: 50,
}

const US_MARKET_FALLBACK_COORDINATES: Record<string, ReportPromptPriceCoordinate> = {
  BPA: { latitude: 47.4235, longitude: -120.3103, label: 'Mid-Columbia' },
  CAISO: { latitude: 36.7783, longitude: -119.4179, label: 'CAISO' },
  ERCOT: { latitude: 31.9686, longitude: -99.9018, label: 'ERCOT' },
  ISO_NE: { latitude: 42.3601, longitude: -71.0589, label: 'ISO New England' },
  MISO: { latitude: 39.7817, longitude: -89.6501, label: 'MISO' },
  NYISO: { latitude: 42.6526, longitude: -73.7562, label: 'NYISO' },
  PJM: { latitude: 40.4406, longitude: -79.9959, label: 'PJM' },
  SPP: { latitude: 35.4676, longitude: -97.5164, label: 'SPP' },
  WECC: { latitude: 39.321, longitude: -111.0937, label: 'WECC' },
}

const PRICE_INDEX_CODE_FALLBACK_COORDINATES: Array<{
  pattern: RegExp
  coordinate: ReportPromptPriceCoordinate
}> = [
  {
    pattern: /ERCOT.*HOUSTON/i,
    coordinate: { latitude: 29.7604, longitude: -95.3698, label: 'ERCOT Houston' },
  },
  {
    pattern: /ERCOT.*SOUTH/i,
    coordinate: { latitude: 29.4241, longitude: -98.4936, label: 'ERCOT South' },
  },
  {
    pattern: /ERCOT.*WEST/i,
    coordinate: { latitude: 31.9973, longitude: -102.0779, label: 'ERCOT West' },
  },
]

function normalizeCode(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ''
}

function priceObservationDigits(observation: PriceIndexObservationRecord | null): number {
  return observation?.unit_code === 'GAL' ? 3 : 2
}

function formatPriceObservationAmount(
  observation: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!observation) {
    return 'No observation'
  }

  const currencyPrefix = observation.currency_code ? `${observation.currency_code} ` : ''
  return `${currencyPrefix}${formatNumber(observation.value, priceObservationDigits(observation))} / ${observation.unit_code}`
}

function formatPriceObservationDelta(
  latest: PriceIndexObservationRecord | null,
  previous: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!latest || !previous) {
    return 'No prior'
  }

  const delta = latest.value - previous.value
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatNumber(delta, priceObservationDigits(latest))}`
}

function priceObservationDeltaTone(
  latest: PriceIndexObservationRecord | null,
  previous: PriceIndexObservationRecord | null,
): 'active' | 'in-progress' | 'blocked' {
  if (!latest || !previous) {
    return 'in-progress'
  }

  const delta = latest.value - previous.value
  if (Math.abs(delta) < 0.0001) {
    return 'in-progress'
  }

  return delta > 0 ? 'active' : 'blocked'
}

function latestObservationDate(series: ReportPromptPriceSeries[]): string | null {
  return series
    .map((item) => item.latest?.observation_date ?? null)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null
}

function groupObservationsByPriceIndexCode(
  observations: PriceIndexObservationRecord[],
): Map<string, PriceIndexObservationRecord[]> {
  const groupedObservations = new Map<string, PriceIndexObservationRecord[]>()
  for (const observation of observations) {
    const code = normalizeCode(observation.price_index_code)
    const current = groupedObservations.get(code) ?? []
    current.push(observation)
    groupedObservations.set(code, current)
  }

  for (const [code, codeObservations] of groupedObservations) {
    groupedObservations.set(
      code,
      [...codeObservations].sort((left, right) => {
        if (right.observation_date !== left.observation_date) {
          return right.observation_date.localeCompare(left.observation_date)
        }
        return right.id - left.id
      }),
    )
  }

  return groupedObservations
}

function locationLabelForPriceIndex(priceIndex: PriceIndexRecord, location: LocationRecord | null): string {
  if (location?.name) {
    return location.name
  }
  if (priceIndex.location_code) {
    return priceIndex.location_code
  }
  if (priceIndex.market) {
    return priceIndex.market
  }
  return priceIndex.provider
}

function coordinateForPriceIndex(
  priceIndex: PriceIndexRecord,
  location: LocationRecord | null,
): ReportPromptPriceCoordinate | null {
  if (typeof location?.latitude === 'number' && typeof location.longitude === 'number') {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.name || location.code,
    }
  }

  const codeFallback = PRICE_INDEX_CODE_FALLBACK_COORDINATES.find((entry) =>
    entry.pattern.test(priceIndex.code) || entry.pattern.test(priceIndex.name),
  )
  if (codeFallback) {
    return codeFallback.coordinate
  }

  const market = normalizeCode(priceIndex.market)
  return US_MARKET_FALLBACK_COORDINATES[market] ?? null
}

function buildReportPromptPriceSeries({
  priceIndices,
  observations,
  locations,
}: {
  priceIndices: readonly PriceIndexRecord[]
  observations: readonly PriceIndexObservationRecord[]
  locations: readonly LocationRecord[]
}): ReportPromptPriceSeries[] {
  const locationsByCode = new Map(locations.map((location) => [location.code, location]))
  const observationsByCode = groupObservationsByPriceIndexCode([...observations])

  return priceIndices.map((priceIndex) => {
    const location = priceIndex.location_code ? locationsByCode.get(priceIndex.location_code) ?? null : null
    const codeObservations = observationsByCode.get(normalizeCode(priceIndex.code)) ?? []
    return {
      priceIndex,
      location,
      locationLabel: locationLabelForPriceIndex(priceIndex, location),
      coordinates: coordinateForPriceIndex(priceIndex, location),
      observations: codeObservations,
      latest: codeObservations[0] ?? null,
      previous: codeObservations[1] ?? null,
    }
  })
}

function averageLatestPrice(series: ReportPromptPriceSeries[]): number | null {
  const latestObservations = series
    .map((item) => item.latest)
    .filter((observation): observation is PriceIndexObservationRecord => observation !== null)

  if (latestObservations.length === 0) {
    return null
  }

  return latestObservations.reduce((sum, observation) => sum + observation.value, 0) / latestObservations.length
}

function dominantUnit(series: ReportPromptPriceSeries[]): string {
  const unitCounts = new Map<string, number>()
  for (const item of series) {
    const unit = item.latest?.unit_code ?? item.priceIndex.unit_code
    if (!unit) {
      continue
    }
    unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1)
  }

  return [...unitCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'unit'
}

function dominantCurrency(series: ReportPromptPriceSeries[]): string | null {
  const currencyCounts = new Map<string, number>()
  for (const item of series) {
    const currency = item.latest?.currency_code ?? item.priceIndex.currency_code
    if (!currency) {
      continue
    }
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1)
  }

  return [...currencyCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
}

function projectUsMapCoordinate(coordinate: ReportPromptPriceCoordinate): { x: number; y: number } {
  const x =
    ((coordinate.longitude - US_MAP_BOUNDS.minLongitude) /
      (US_MAP_BOUNDS.maxLongitude - US_MAP_BOUNDS.minLongitude)) *
    100
  const y =
    ((US_MAP_BOUNDS.maxLatitude - coordinate.latitude) /
      (US_MAP_BOUNDS.maxLatitude - US_MAP_BOUNDS.minLatitude)) *
    100
  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(92, Math.max(8, y)),
  }
}

function ReportPromptPriceMap({
  series,
  formatNumber,
}: {
  series: ReportPromptPriceSeries[]
  formatNumber: (value: number | null, digits?: number) => string
}) {
  const mappedSeries = series.filter((item) => item.coordinates !== null)
  if (mappedSeries.length === 0) {
    return (
      <div className="empty-state report-prompt-price-map-empty">
        <strong>No mappable price indices</strong>
        <p>The matched price indices do not have map coordinates yet.</p>
      </div>
    )
  }

  return (
    <div className="report-prompt-price-map" aria-label="Prompt price map">
      <svg className="report-prompt-price-map-svg" viewBox="0 0 100 100" role="img">
        <title>Prompt price index map</title>
        <path
          className="report-prompt-price-map-land"
          d="M7 49 C13 36 26 26 39 24 C53 20 67 24 78 31 C86 36 93 46 92 56 C90 68 77 73 62 75 C46 80 28 77 17 67 C10 61 5 56 7 49 Z"
        />
        {[20, 40, 60, 80].map((tick) => (
          <line key={`vertical-${tick}`} className="report-prompt-price-map-grid" x1={tick} x2={tick} y1="12" y2="88" />
        ))}
        {[30, 50, 70].map((tick) => (
          <line key={`horizontal-${tick}`} className="report-prompt-price-map-grid" x1="5" x2="95" y1={tick} y2={tick} />
        ))}
        {mappedSeries.map((item, index) => {
          const coordinate = item.coordinates
          if (!coordinate) {
            return null
          }
          const point = projectUsMapCoordinate(coordinate)
          const latestPrice = item.latest?.value ?? null
          return (
            <g key={item.priceIndex.code}>
              <circle
                className="report-prompt-price-map-point"
                cx={point.x}
                cy={point.y}
                r="2.2"
                style={{
                  fill: REPORT_PROMPT_PRICE_COLORS[index % REPORT_PROMPT_PRICE_COLORS.length],
                }}
              >
                <title>
                  {item.priceIndex.code}: {formatPriceObservationAmount(item.latest, formatNumber)}
                </title>
              </circle>
              <text className="report-prompt-price-map-label" x={point.x + 2.8} y={point.y - 1.8}>
                {item.priceIndex.market || item.priceIndex.provider}
              </text>
              {latestPrice !== null ? (
                <text className="report-prompt-price-map-value" x={point.x + 2.8} y={point.y + 3.4}>
                  {formatNumber(latestPrice, priceObservationDigits(item.latest))}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function chartCoordinate({
  index,
  pointCount,
  value,
  minValue,
  maxValue,
}: {
  index: number
  pointCount: number
  value: number
  minValue: number
  maxValue: number
}): { x: number; y: number } {
  const x = pointCount <= 1 ? 50 : (index / (pointCount - 1)) * 100
  const valueRange = maxValue - minValue
  const y = valueRange <= 0 ? 50 : 92 - ((value - minValue) / valueRange) * 78
  return { x, y }
}

function ReportPromptPriceLineChart({
  series,
  formatNumber,
  formatDateOnly,
}: {
  series: ReportPromptPriceSeries[]
  formatNumber: (value: number | null, digits?: number) => string
  formatDateOnly: (value: string | null | undefined) => string
}) {
  const chartSeries = series.filter((item) => item.observations.length > 0)
  const allObservations = chartSeries.flatMap((item) => item.observations)

  if (chartSeries.length === 0 || allObservations.length === 0) {
    return (
      <div className="empty-state report-prompt-price-chart-empty">
        <strong>No chartable observations</strong>
        <p>Matched price indices do not have loaded observation history yet.</p>
      </div>
    )
  }

  const values = allObservations.map((observation) => observation.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const sortedDates = allObservations
    .map((observation) => observation.observation_date)
    .sort((left, right) => left.localeCompare(right))
  const firstDate = sortedDates[0] ?? null
  const lastDate = sortedDates[sortedDates.length - 1] ?? null

  return (
    <div className="report-prompt-price-chart">
      <div className="report-prompt-price-chart-head">
        <div>
          <span className="eyebrow">Line Chart</span>
          <strong>Power Price Index Lines</strong>
        </div>
        <span>
          {formatNumber(minValue, 2)} to {formatNumber(maxValue, 2)}
        </span>
      </div>
      <svg className="report-prompt-price-chart-svg" viewBox="0 0 100 100" role="img" aria-label="Prompt price index line chart">
        <line className="report-prompt-price-chart-grid" x1="0" x2="100" y1="14" y2="14" />
        <line className="report-prompt-price-chart-grid" x1="0" x2="100" y1="53" y2="53" />
        <line className="report-prompt-price-chart-grid" x1="0" x2="100" y1="92" y2="92" />
        {chartSeries.map((item, index) => {
          const orderedObservations = [...item.observations].reverse()
          const coordinates = orderedObservations.map((observation, pointIndex) =>
            chartCoordinate({
              index: pointIndex,
              pointCount: orderedObservations.length,
              value: observation.value,
              minValue,
              maxValue,
            }),
          )
          const path = coordinates
            .map((coordinate, pathIndex) => `${pathIndex === 0 ? 'M' : 'L'} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`)
            .join(' ')
          const color = REPORT_PROMPT_PRICE_COLORS[index % REPORT_PROMPT_PRICE_COLORS.length]

          return (
            <g key={item.priceIndex.code}>
              {path ? (
                <path
                  className="report-prompt-price-chart-line"
                  d={path}
                  style={{ stroke: color }}
                />
              ) : null}
              {coordinates.at(-1) ? (
                <circle
                  className="report-prompt-price-chart-point"
                  cx={coordinates.at(-1)?.x}
                  cy={coordinates.at(-1)?.y}
                  r="1.7"
                  style={{ fill: color }}
                />
              ) : null}
            </g>
          )
        })}
      </svg>
      <div className="report-prompt-price-chart-axis">
        <span>{firstDate ? formatDateOnly(firstDate) : 'Start'}</span>
        <span>{lastDate ? formatDateOnly(lastDate) : 'Latest'}</span>
      </div>
      <div className="report-prompt-price-legend" aria-label="Power price index legend">
        {chartSeries.map((item, index) => (
          <span key={item.priceIndex.code}>
            <i
              aria-hidden="true"
              style={{
                background: REPORT_PROMPT_PRICE_COLORS[index % REPORT_PROMPT_PRICE_COLORS.length],
              }}
            />
            {item.priceIndex.code}
          </span>
        ))}
      </div>
    </div>
  )
}

function ReportPromptPriceTable({
  series,
  formatNumber,
  formatDate,
  formatDateOnly,
}: {
  series: ReportPromptPriceSeries[]
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
}) {
  return (
    <div className="report-prompt-price-table-shell">
      <table className="report-prompt-price-table" aria-label="Latest prompt price observations">
        <thead>
          <tr>
            <th scope="col">Index</th>
            <th scope="col">Location</th>
            <th scope="col">Latest</th>
            <th scope="col">Change</th>
            <th scope="col">Observed</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.priceIndex.code}>
              <td>
                <strong>{item.priceIndex.code}</strong>
                <span>{item.priceIndex.name}</span>
              </td>
              <td>
                <strong>{item.locationLabel}</strong>
                <span>{item.priceIndex.market ?? item.priceIndex.provider}</span>
              </td>
              <td>{formatPriceObservationAmount(item.latest, formatNumber)}</td>
              <td>
                <span className={`status-pill status-pill-${priceObservationDeltaTone(item.latest, item.previous)}`}>
                  {formatPriceObservationDelta(item.latest, item.previous, formatNumber)}
                </span>
              </td>
              <td>{item.latest ? formatDateOnly(item.latest.observation_date) : 'No date'}</td>
              <td>
                {item.latest ? (
                  <>
                    <strong>{item.latest.source_provider}</strong>
                    <span>
                      {item.latest.source_series_id} · Downloaded {formatDate(item.latest.downloaded_at)}
                    </span>
                  </>
                ) : (
                  <span>No loaded observation</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportPromptPriceReport({
  intent,
  observations,
  locations,
  formatNumber,
  formatDate,
  formatDateOnly,
}: ReportPromptPriceReportProps) {
  const series = useMemo(
    () =>
      buildReportPromptPriceSeries({
        priceIndices: intent.priceIndices,
        observations,
        locations,
      }),
    [intent.priceIndices, locations, observations],
  )
  const latestCount = series.filter((item) => item.latest !== null).length
  const averagePrice = averageLatestPrice(series)
  const averageUnit = dominantUnit(series)
  const averageCurrency = dominantCurrency(series)
  const latestDate = latestObservationDate(series)

  return (
    <div className="report-prompt-price-report">
      <div className="pnl-trend-summary-grid report-prompt-price-summary">
        <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
          <span>Average Price</span>
          <strong>
            {averagePrice === null
              ? 'No average'
              : `${averageCurrency ? `${averageCurrency} ` : ''}${formatNumber(averagePrice, 2)} / ${averageUnit}`}
          </strong>
          <p>Simple average across latest loaded observations.</p>
        </article>
        <article className="pnl-trend-stat-card">
          <span>Matched Indices</span>
          <strong>{formatNumber(series.length, 0)}</strong>
          <p>{intent.commodityCode ? formatCodeLabel(intent.commodityCode) : 'Price index'} reference records.</p>
        </article>
        <article className="pnl-trend-stat-card">
          <span>Latest Marks</span>
          <strong>{formatNumber(latestCount, 0)}</strong>
          <p>{latestDate ? `Latest observation date ${formatDateOnly(latestDate)}.` : 'No loaded marks yet.'}</p>
        </article>
      </div>

      <div className="report-prompt-price-grid">
        <section className="report-prompt-price-panel">
          <div className="report-prompt-price-panel-head">
            <span className="eyebrow">Map</span>
            <strong>{intent.countryCode === 'US' ? 'US Price Map' : 'Price Map'}</strong>
          </div>
          <ReportPromptPriceMap series={series} formatNumber={formatNumber} />
        </section>

        <section className="report-prompt-price-panel">
          <ReportPromptPriceLineChart
            series={series}
            formatNumber={formatNumber}
            formatDateOnly={formatDateOnly}
          />
        </section>
      </div>

      <ReportPromptPriceTable
        series={series}
        formatNumber={formatNumber}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
      />
    </div>
  )
}
