import type { PnlHistoryReport, PriceIndexObservationRecord } from '../../shared/models'
import {
  buildTerminalQuoteChartModel,
  type TerminalQuoteCurvePriceIndex,
  type TerminalQuoteCurveSeries,
  type TerminalQuoteTone,
} from './terminalQuoteCurve'

export type TerminalInstrumentAnalyticsTrade = {
  price_index_code: string | null
}

export type TerminalInstrumentAnalyticsCurveRow = {
  priceIndex: TerminalQuoteCurvePriceIndex
  latest: PriceIndexObservationRecord | null
  previous: PriceIndexObservationRecord | null
  tone: TerminalQuoteTone
  tradeCount: number
  historyMove: number | null
  movePercent: number | null
  dailyVolatilityPercent: number | null
  annualizedVolatilityPercent: number | null
}

export type TerminalInstrumentBasisPoint = {
  date: string
  spread: number
}

export type TerminalInstrumentBasisAnalytics = {
  primaryCode: string
  comparisonCode: string
  unitCode: string
  currencyCode: string
  latestSpread: number
  averageSpread: number
  lowSpread: number
  highSpread: number
  observationCount: number
  points: TerminalInstrumentBasisPoint[]
}

export type TerminalInstrumentVolatilityAnalytics = {
  priceIndexCode: string
  observationCount: number
  returnCount: number
  dailyVolatilityPercent: number | null
  annualizedVolatilityPercent: number | null
  latestMovePercent: number | null
  tone: TerminalQuoteTone
}

export type TerminalInstrumentPnlAnalytics = {
  totalPnl: number | null
  realizedPnl: number | null
  unrealizedPnl: number | null
  windowChange: number | null
  valuationCount: number
  includedValuationCount: number
  linkedValuationCount: number
  linkedPnl: number | null
}

export type TerminalInstrumentAnalyticsModel = {
  primarySeries: TerminalQuoteCurveSeries | null
  comparisonSeries: TerminalQuoteCurveSeries | null
  curveRows: TerminalInstrumentAnalyticsCurveRow[]
  basis: TerminalInstrumentBasisAnalytics | null
  volatility: TerminalInstrumentVolatilityAnalytics | null
  pnl: TerminalInstrumentPnlAnalytics
  notes: string[]
}

const TRADING_DAYS_PER_YEAR = 252

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number | null {
  const mean = average(values)
  if (mean === null) {
    return null
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function orderedObservations(observations: PriceIndexObservationRecord[]): PriceIndexObservationRecord[] {
  return [...observations].sort((left, right) => left.observation_date.localeCompare(right.observation_date))
}

function percentageReturns(observations: PriceIndexObservationRecord[]): number[] {
  const orderedValues = orderedObservations(observations).map((observation) => observation.value)
  const returns: number[] = []

  for (let index = 1; index < orderedValues.length; index += 1) {
    const previousValue = orderedValues[index - 1]
    const nextValue = orderedValues[index]
    if (previousValue === 0) {
      continue
    }

    returns.push((nextValue - previousValue) / previousValue)
  }

  return returns
}

function tradeCountByPriceIndex(activeTrades: readonly TerminalInstrumentAnalyticsTrade[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const trade of activeTrades) {
    if (!trade.price_index_code) {
      continue
    }

    counts.set(trade.price_index_code, (counts.get(trade.price_index_code) ?? 0) + 1)
  }

  return counts
}

function buildCurveRow(
  series: TerminalQuoteCurveSeries,
  tradeCount: number,
): TerminalInstrumentAnalyticsCurveRow {
  const model = buildTerminalQuoteChartModel(series)
  const returns = percentageReturns(series.observations)
  const dailyVolatility = standardDeviation(returns)
  const firstObservation = model.orderedObservations[0] ?? null
  const historyMove = model.latest && firstObservation ? model.latest.value - firstObservation.value : null
  const movePercent =
    historyMove !== null && firstObservation && firstObservation.value !== 0 ? historyMove / firstObservation.value : null

  return {
    priceIndex: series.priceIndex,
    latest: model.latest,
    previous: model.previous,
    tone: model.tone,
    tradeCount,
    historyMove,
    movePercent,
    dailyVolatilityPercent: dailyVolatility === null ? null : dailyVolatility * 100,
    annualizedVolatilityPercent: dailyVolatility === null
      ? null
      : dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
  }
}

function compatibleBasisSeries(
  primarySeries: TerminalQuoteCurveSeries | null,
  seriesList: readonly TerminalQuoteCurveSeries[],
): TerminalQuoteCurveSeries | null {
  if (!primarySeries) {
    return null
  }

  return (
    seriesList.find(
      (series) =>
        series.priceIndex.code !== primarySeries.priceIndex.code &&
        series.priceIndex.currency_code === primarySeries.priceIndex.currency_code &&
        series.priceIndex.unit_code === primarySeries.priceIndex.unit_code &&
        series.priceIndex.commodity_class === primarySeries.priceIndex.commodity_class,
    ) ??
    seriesList.find(
      (series) =>
        series.priceIndex.code !== primarySeries.priceIndex.code &&
        series.priceIndex.currency_code === primarySeries.priceIndex.currency_code &&
        series.priceIndex.unit_code === primarySeries.priceIndex.unit_code,
    ) ??
    null
  )
}

function buildBasisAnalytics(
  primarySeries: TerminalQuoteCurveSeries | null,
  comparisonSeries: TerminalQuoteCurveSeries | null,
): TerminalInstrumentBasisAnalytics | null {
  if (
    !primarySeries ||
    !comparisonSeries ||
    primarySeries.priceIndex.currency_code !== comparisonSeries.priceIndex.currency_code ||
    primarySeries.priceIndex.unit_code !== comparisonSeries.priceIndex.unit_code
  ) {
    return null
  }

  const comparisonByDate = new Map(
    comparisonSeries.observations.map((observation) => [observation.observation_date, observation]),
  )
  const points = orderedObservations(primarySeries.observations)
    .map((observation) => {
      const comparison = comparisonByDate.get(observation.observation_date)
      return comparison
        ? {
            date: observation.observation_date,
            spread: observation.value - comparison.value,
          }
        : null
    })
    .filter((point): point is TerminalInstrumentBasisPoint => point !== null)

  if (points.length === 0) {
    return null
  }

  const spreadValues = points.map((point) => point.spread)

  return {
    primaryCode: primarySeries.priceIndex.code,
    comparisonCode: comparisonSeries.priceIndex.code,
    unitCode: primarySeries.priceIndex.unit_code,
    currencyCode: primarySeries.priceIndex.currency_code,
    latestSpread: points[points.length - 1].spread,
    averageSpread: average(spreadValues) ?? 0,
    lowSpread: Math.min(...spreadValues),
    highSpread: Math.max(...spreadValues),
    observationCount: points.length,
    points,
  }
}

function buildVolatilityAnalytics(series: TerminalQuoteCurveSeries | null): TerminalInstrumentVolatilityAnalytics | null {
  if (!series) {
    return null
  }

  const model = buildTerminalQuoteChartModel(series)
  const returns = percentageReturns(series.observations)
  const dailyVolatility = standardDeviation(returns)

  return {
    priceIndexCode: series.priceIndex.code,
    observationCount: series.observations.length,
    returnCount: returns.length,
    dailyVolatilityPercent: dailyVolatility === null ? null : dailyVolatility * 100,
    annualizedVolatilityPercent: dailyVolatility === null
      ? null
      : dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    latestMovePercent: model.deltaPercent === null ? null : model.deltaPercent * 100,
    tone: model.tone,
  }
}

function buildPnlAnalytics(
  pnlHistoryReport: PnlHistoryReport | null,
  selectedPriceIndexCodes: Set<string>,
): TerminalInstrumentPnlAnalytics {
  if (!pnlHistoryReport) {
    return {
      totalPnl: null,
      realizedPnl: null,
      unrealizedPnl: null,
      windowChange: null,
      valuationCount: 0,
      includedValuationCount: 0,
      linkedValuationCount: 0,
      linkedPnl: null,
    }
  }

  const linkedValuations = pnlHistoryReport.valuations.filter(
    (valuation) => valuation.price_index_code !== null && selectedPriceIndexCodes.has(valuation.price_index_code),
  )
  const linkedPnlValues = linkedValuations
    .map((valuation) => valuation.pnl_contribution)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const firstPoint = pnlHistoryReport.points[0] ?? null
  const lastPoint = pnlHistoryReport.points[pnlHistoryReport.points.length - 1] ?? null

  return {
    totalPnl: pnlHistoryReport.summary.total_pnl,
    realizedPnl: pnlHistoryReport.summary.realized_pnl,
    unrealizedPnl: pnlHistoryReport.summary.unrealized_pnl,
    windowChange: firstPoint && lastPoint ? lastPoint.total_pnl - firstPoint.total_pnl : null,
    valuationCount: pnlHistoryReport.valuations.length,
    includedValuationCount: pnlHistoryReport.valuations.filter((valuation) => valuation.included_in_totals).length,
    linkedValuationCount: linkedValuations.length,
    linkedPnl: linkedPnlValues.length > 0 ? linkedPnlValues.reduce((sum, value) => sum + value, 0) : null,
  }
}

export function buildTerminalInstrumentAnalyticsModel({
  seriesList,
  activeTrades,
  pnlHistoryReport,
}: {
  seriesList: readonly TerminalQuoteCurveSeries[]
  activeTrades: readonly TerminalInstrumentAnalyticsTrade[]
  pnlHistoryReport: PnlHistoryReport | null
}): TerminalInstrumentAnalyticsModel {
  const tradeCounts = tradeCountByPriceIndex(activeTrades)
  const curveRows = seriesList
    .map((series) => buildCurveRow(series, tradeCounts.get(series.priceIndex.code) ?? 0))
    .sort((left, right) => {
      const tradeCompare = right.tradeCount - left.tradeCount
      if (tradeCompare !== 0) {
        return tradeCompare
      }

      return left.priceIndex.name.localeCompare(right.priceIndex.name)
    })
  const primarySeries = curveRows[0]
    ? seriesList.find((series) => series.priceIndex.code === curveRows[0].priceIndex.code) ?? null
    : null
  const comparisonSeries = compatibleBasisSeries(primarySeries, seriesList)
  const selectedPriceIndexCodes = new Set(seriesList.map((series) => series.priceIndex.code))
  const notes: string[] = []

  if (!primarySeries) {
    notes.push('No stored price-index history is available for curve, basis, or volatility analytics.')
  }
  if (primarySeries && !comparisonSeries) {
    notes.push('Basis analytics require a second compatible curve with the same currency and unit.')
  }
  if (!pnlHistoryReport) {
    notes.push('P&L attribution is waiting on the existing P&L history report.')
  }

  return {
    primarySeries,
    comparisonSeries,
    curveRows,
    basis: buildBasisAnalytics(primarySeries, comparisonSeries),
    volatility: buildVolatilityAnalytics(primarySeries),
    pnl: buildPnlAnalytics(pnlHistoryReport, selectedPriceIndexCodes),
    notes,
  }
}
