import type { PriceIndexObservationRecord } from '../../shared/models'

export type TerminalQuoteCurvePriceIndex = {
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

export type TerminalQuoteCurveTradeLink = {
  price_index_code: string | null
}

export type TerminalQuoteCurveSeries = {
  priceIndex: TerminalQuoteCurvePriceIndex
  observations: PriceIndexObservationRecord[]
}

export type TerminalQuoteTone = 'up' | 'down' | 'flat'

export type TerminalQuoteChartModel = {
  latest: PriceIndexObservationRecord | null
  previous: PriceIndexObservationRecord | null
  orderedObservations: PriceIndexObservationRecord[]
  values: number[]
  tone: TerminalQuoteTone
  delta: number | null
  deltaPercent: number | null
  low: number | null
  high: number | null
  average: number | null
}

export type TerminalCurveRow = {
  priceIndex: TerminalQuoteCurvePriceIndex
  latest: PriceIndexObservationRecord | null
  previous: PriceIndexObservationRecord | null
  tone: TerminalQuoteTone
  delta: number | null
  tradeCount: number
  normalizedLatestValue: number
}

export type TerminalCurveBucket = {
  key: string
  label: string
  rows: TerminalCurveRow[]
  averageLatestValue: number | null
  lowLatestValue: number | null
  highLatestValue: number | null
}

function quoteTone(latest: PriceIndexObservationRecord | null, previous: PriceIndexObservationRecord | null): TerminalQuoteTone {
  if (!latest || !previous || latest.value === previous.value) {
    return 'flat'
  }

  return latest.value > previous.value ? 'up' : 'down'
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function buildTerminalQuoteChartModel(series: TerminalQuoteCurveSeries | null): TerminalQuoteChartModel {
  const observations = series?.observations ?? []
  const orderedObservations = [...observations].reverse()
  const values = orderedObservations.map((observation) => observation.value)
  const latest = observations[0] ?? null
  const previous = observations[1] ?? null
  const delta = latest && previous ? latest.value - previous.value : null
  const deltaPercent = latest && previous && previous.value !== 0 ? (delta ?? 0) / previous.value : null

  return {
    latest,
    previous,
    orderedObservations,
    values,
    tone: quoteTone(latest, previous),
    delta,
    deltaPercent,
    low: values.length > 0 ? Math.min(...values) : null,
    high: values.length > 0 ? Math.max(...values) : null,
    average: average(values),
  }
}

export function buildTerminalCurveRows(
  seriesList: TerminalQuoteCurveSeries[],
  activeTrades: TerminalQuoteCurveTradeLink[],
): TerminalCurveRow[] {
  const tradeCountByIndex = new Map<string, number>()
  for (const trade of activeTrades) {
    if (!trade.price_index_code) {
      continue
    }

    tradeCountByIndex.set(trade.price_index_code, (tradeCountByIndex.get(trade.price_index_code) ?? 0) + 1)
  }

  const latestValues = seriesList
    .map((series) => series.observations[0]?.value)
    .filter((value): value is number => typeof value === 'number')
  const lowLatestValue = latestValues.length > 0 ? Math.min(...latestValues) : null
  const highLatestValue = latestValues.length > 0 ? Math.max(...latestValues) : null
  const latestSpan =
    lowLatestValue !== null && highLatestValue !== null ? Math.max(highLatestValue - lowLatestValue, 0) : 0

  return seriesList
    .map((series) => {
      const latest = series.observations[0] ?? null
      const previous = series.observations[1] ?? null
      const normalizedLatestValue =
        latest && lowLatestValue !== null && latestSpan > 0 ? (latest.value - lowLatestValue) / latestSpan : 0.5

      return {
        priceIndex: series.priceIndex,
        latest,
        previous,
        tone: quoteTone(latest, previous),
        delta: latest && previous ? latest.value - previous.value : null,
        tradeCount: tradeCountByIndex.get(series.priceIndex.code) ?? 0,
        normalizedLatestValue,
      }
    })
    .sort((left, right) => {
      const tradeCompare = right.tradeCount - left.tradeCount
      if (tradeCompare !== 0) {
        return tradeCompare
      }

      const providerCompare = left.priceIndex.provider.localeCompare(right.priceIndex.provider)
      if (providerCompare !== 0) {
        return providerCompare
      }

      return left.priceIndex.name.localeCompare(right.priceIndex.name)
    })
}

export function buildTerminalCurveBuckets(rows: TerminalCurveRow[]): TerminalCurveBucket[] {
  const buckets = new Map<string, TerminalCurveRow[]>()

  for (const row of rows) {
    const key = row.priceIndex.commodity_class?.trim() || row.priceIndex.provider || 'Unclassified'
    buckets.set(key, [...(buckets.get(key) ?? []), row])
  }

  return [...buckets.entries()]
    .map(([key, bucketRows]) => {
      const latestValues = bucketRows
        .map((row) => row.latest?.value)
        .filter((value): value is number => typeof value === 'number')

      return {
        key,
        label: key,
        rows: bucketRows,
        averageLatestValue: average(latestValues),
        lowLatestValue: latestValues.length > 0 ? Math.min(...latestValues) : null,
        highLatestValue: latestValues.length > 0 ? Math.max(...latestValues) : null,
      }
    })
    .sort((left, right) => right.rows.length - left.rows.length || left.label.localeCompare(right.label))
}
