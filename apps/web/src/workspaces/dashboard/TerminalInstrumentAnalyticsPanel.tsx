import { useEffect, useMemo, useState } from 'react'

import { loadPriceIndexObservations } from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type { PnlHistoryReport, PriceIndexObservationRecord } from '../../shared/models'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  buildAreaPath,
  buildChartPoints,
  buildLinePath,
} from './chartUtils'
import { selectPriceIndexCandidates } from './marketPriceSelection'
import {
  buildTerminalInstrumentAnalyticsModel,
  type TerminalInstrumentAnalyticsTrade,
  type TerminalInstrumentBasisAnalytics,
} from './terminalInstrumentAnalytics'
import type { TerminalQuoteCurvePriceIndex, TerminalQuoteCurveSeries } from './terminalQuoteCurve'

type TerminalInstrumentAnalyticsPanelProps = {
  appLoading: boolean
  activeTrades: TerminalInstrumentAnalyticsTrade[]
  priceIndices: TerminalQuoteCurvePriceIndex[]
  pnlHistoryReport: PnlHistoryReport | null
  pnlHistoryLoading: boolean
  pnlHistoryError: string
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  onOpenPriceIndexBrief?: (priceIndex: TerminalQuoteCurvePriceIndex) => void
  onOpenReports?: () => void
}

const ANALYTICS_HISTORY_LIMIT = 48
const MAX_ANALYTICS_CURVES = 6

function quoteDigits(observation: PriceIndexObservationRecord | null): number {
  return observation?.unit_code === 'GAL' ? 3 : 2
}

function formatQuoteValue(
  observation: PriceIndexObservationRecord | null,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!observation) {
    return '-'
  }

  return `${observation.currency_code} ${formatNumber(observation.value, quoteDigits(observation))} / ${observation.unit_code}`
}

function formatPercent(
  value: number | null | undefined,
  formatNumber: (value: number | null, digits?: number) => string,
  signed = true,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, 2)}%`
}

function formatBasisValue(
  basis: TerminalInstrumentBasisAnalytics | null,
  value: number | null | undefined,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  if (!basis || typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  return `${basis.currencyCode} ${formatNumber(value, 2)} / ${basis.unitCode}`
}

function formatSignedMoney(value: number | null | undefined, formatMoney: (value: number | null) => string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value)
}

function useTerminalInstrumentAnalyticsSeries(
  appLoading: boolean,
  activeTrades: TerminalInstrumentAnalyticsTrade[],
  priceIndices: TerminalQuoteCurvePriceIndex[],
) {
  const [seriesList, setSeriesList] = useState<TerminalQuoteCurveSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedPriceIndices = useMemo(
    () => selectPriceIndexCandidates(activeTrades, priceIndices).slice(0, MAX_ANALYTICS_CURVES),
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
            observations: await loadPriceIndexObservations(appConfig.apiBase, priceIndex.code, ANALYTICS_HISTORY_LIMIT),
          })),
        )

        if (cancelled) {
          return
        }

        const nextSeriesList = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{
              priceIndex: TerminalQuoteCurvePriceIndex
              observations: PriceIndexObservationRecord[]
            }> => result.status === 'fulfilled',
          )
          .map((result) => result.value)
          .filter((series) => series.observations.length > 0)

        setSeriesList(nextSeriesList)
        setError(results.some((result) => result.status === 'rejected') ? 'Some analytics curves could not be loaded.' : '')
      } catch (nextError) {
        if (cancelled) {
          return
        }

        setSeriesList([])
        setError(nextError instanceof Error ? nextError.message : 'Unable to load instrument analytics.')
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

function BasisSparkline({ basis }: { basis: TerminalInstrumentBasisAnalytics }) {
  const values = basis.points.map((point) => point.spread)
  const points = buildChartPoints(values)
  const linePath = buildLinePath(points)
  const areaPath = buildAreaPath(points)

  return (
    <div className="terminal-analytics-basis-chart market-price-chart market-price-chart-flat">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${basis.primaryCode} versus ${basis.comparisonCode} basis history`}
      >
        <path className="market-price-chart-area" d={areaPath} />
        <path className="market-price-chart-line" d={linePath} />
      </svg>
    </div>
  )
}

export function TerminalInstrumentAnalyticsPanel({
  appLoading,
  activeTrades,
  priceIndices,
  pnlHistoryReport,
  pnlHistoryLoading,
  pnlHistoryError,
  formatNumber,
  formatMoney,
  onOpenPriceIndexBrief,
  onOpenReports,
}: TerminalInstrumentAnalyticsPanelProps) {
  const { error, loading, seriesList } = useTerminalInstrumentAnalyticsSeries(appLoading, activeTrades, priceIndices)
  const model = useMemo(
    () =>
      buildTerminalInstrumentAnalyticsModel({
        seriesList,
        activeTrades,
        pnlHistoryReport,
      }),
    [activeTrades, pnlHistoryReport, seriesList],
  )
  const visibleCurveRows = model.curveRows.slice(0, MAX_ANALYTICS_CURVES)
  const hasAnalyticsData = seriesList.length > 0 || pnlHistoryReport !== null

  if (appLoading || (loading && pnlHistoryLoading)) {
    return (
      <div className="terminal-analytics-panel">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }

  if (!hasAnalyticsData) {
    return (
      <div className="empty-state">
        <strong>No instrument analytics available</strong>
        <p>Load price-index history or P&amp;L history to populate curve, basis, volatility, and attribution analytics.</p>
      </div>
    )
  }

  return (
    <div className="terminal-analytics-panel">
      {error ? <p className="system-panel-note">{error}</p> : null}
      {pnlHistoryError ? <p className="system-panel-note">{pnlHistoryError}</p> : null}

      <section className="terminal-analytics-hero">
        <div className="terminal-analytics-copy">
          <span className="eyebrow">Analytics</span>
          <strong>{model.primarySeries?.priceIndex.name ?? 'Desk instrument analytics'}</strong>
          <p>
            Deterministic curve, compatible-basis, realized-volatility, and P&amp;L attribution context from stored
            observations and the existing reporting model.
          </p>
        </div>
        <div className="terminal-analytics-latest">
          <span>Primary Curve</span>
          <strong>{model.primarySeries?.priceIndex.code ?? 'No curve'}</strong>
          <small>{model.primarySeries ? formatQuoteValue(model.primarySeries.observations[0] ?? null, formatNumber) : '-'}</small>
        </div>
      </section>

      <div className="terminal-analytics-stat-grid">
        <article>
          <span>Annualized Vol</span>
          <strong>{formatPercent(model.volatility?.annualizedVolatilityPercent, formatNumber, false)}</strong>
          <p>{model.volatility ? `${formatNumber(model.volatility.returnCount, 0)} return observations` : 'Awaiting curve history'}</p>
        </article>
        <article>
          <span>Latest Basis</span>
          <strong>{formatBasisValue(model.basis, model.basis?.latestSpread, formatNumber)}</strong>
          <p>{model.basis ? `${model.basis.primaryCode} minus ${model.basis.comparisonCode}` : 'No compatible basis pair'}</p>
        </article>
        <article>
          <span>Linked P&amp;L</span>
          <strong>{formatSignedMoney(model.pnl.linkedPnl, formatMoney)}</strong>
          <p>{formatNumber(model.pnl.linkedValuationCount, 0)} linked valuation(s)</p>
        </article>
        <article>
          <span>P&amp;L Window</span>
          <strong>{formatSignedMoney(model.pnl.windowChange, formatMoney)}</strong>
          <p>{formatNumber(model.pnl.includedValuationCount, 0)} included valuation(s)</p>
        </article>
      </div>

      <div className="terminal-analytics-grid">
        <section className="terminal-analytics-card">
          <div className="terminal-analytics-section-head">
            <div>
              <span className="eyebrow">Curve</span>
              <strong>Curve Diagnostics</strong>
            </div>
            <small>{formatNumber(visibleCurveRows.length, 0)} visible curve(s)</small>
          </div>
          <div className="terminal-analytics-row-list">
            {visibleCurveRows.map((row) => (
              <article key={row.priceIndex.code} className="terminal-analytics-row">
                <div className="terminal-analytics-row-copy">
                  <strong>{row.priceIndex.code}</strong>
                  <span>
                    {row.priceIndex.provider} · {formatNumber(row.tradeCount, 0)} linked trade(s)
                  </span>
                </div>
                <div className="terminal-analytics-row-meta">
                  <strong>{formatQuoteValue(row.latest, formatNumber)}</strong>
                  <small className={`market-price-change market-price-change-${row.tone}`}>
                    {formatPercent(row.movePercent === null ? null : row.movePercent * 100, formatNumber)}
                  </small>
                </div>
                <div className="terminal-analytics-row-meta">
                  <span>Ann. vol</span>
                  <strong>{formatPercent(row.annualizedVolatilityPercent, formatNumber, false)}</strong>
                </div>
                {onOpenPriceIndexBrief ? (
                  <button type="button" className="button button-ghost" onClick={() => onOpenPriceIndexBrief(row.priceIndex)}>
                    Brief
                  </button>
                ) : null}
              </article>
            ))}
            {visibleCurveRows.length === 0 ? (
              <div className="empty-state">
                <strong>No curve rows</strong>
                <p>Stored observations are required before curve analytics can be calculated.</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="terminal-analytics-card">
          <div className="terminal-analytics-section-head">
            <div>
              <span className="eyebrow">Basis &amp; Volatility</span>
              <strong>Compatible Curve Pair</strong>
            </div>
            <small>{model.basis ? `${model.basis.observationCount} spread points` : 'No spread'}</small>
          </div>
          {model.basis ? (
            <>
              <BasisSparkline basis={model.basis} />
              <div className="terminal-analytics-stat-grid terminal-analytics-stat-grid-compact">
                <article>
                  <span>Average</span>
                  <strong>{formatBasisValue(model.basis, model.basis.averageSpread, formatNumber)}</strong>
                </article>
                <article>
                  <span>Low</span>
                  <strong>{formatBasisValue(model.basis, model.basis.lowSpread, formatNumber)}</strong>
                </article>
                <article>
                  <span>High</span>
                  <strong>{formatBasisValue(model.basis, model.basis.highSpread, formatNumber)}</strong>
                </article>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>No compatible basis pair</strong>
              <p>Basis analytics require two stored curves with matching currency and unit.</p>
            </div>
          )}
        </section>
      </div>

      <section className="terminal-analytics-card">
        <div className="terminal-analytics-section-head">
          <div>
            <span className="eyebrow">P&amp;L</span>
            <strong>Attribution Context</strong>
          </div>
          {onOpenReports ? (
            <button type="button" className="button button-secondary" onClick={onOpenReports}>
              Open Reports
            </button>
          ) : null}
        </div>
        <div className="terminal-analytics-stat-grid">
          <article>
            <span>Total P&amp;L</span>
            <strong>{formatMoney(model.pnl.totalPnl)}</strong>
            <p>Existing report summary total.</p>
          </article>
          <article>
            <span>Realized</span>
            <strong>{formatMoney(model.pnl.realizedPnl)}</strong>
            <p>Settled or realized report bucket.</p>
          </article>
          <article>
            <span>Unrealized</span>
            <strong>{formatMoney(model.pnl.unrealizedPnl)}</strong>
            <p>Open valuation bucket.</p>
          </article>
          <article>
            <span>Valuations</span>
            <strong>{formatNumber(model.pnl.valuationCount, 0)}</strong>
            <p>Report valuation rows in scope.</p>
          </article>
        </div>
      </section>

      {model.notes.length > 0 ? (
        <div className="terminal-analytics-note-list">
          {model.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
