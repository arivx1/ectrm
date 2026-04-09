import { useEffect, useMemo, useState } from 'react'

import { loadWeatherIntelligenceOverview } from '../../entities/weather/api'
import { appConfig } from '../../shared/config'
import type {
  WeatherCommodityExposureRecord,
  WeatherIntelligenceOverviewRecord,
  WeatherRegionalSignalRecord,
} from '../../shared/models'

type WeatherIntelligenceTileContentProps = {
  appLoading: boolean
  formatDate: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
}

function riskTone(value: string): 'active' | 'blocked' | 'in-progress' | 'planned' {
  switch (value.trim().toUpperCase()) {
    case 'HIGH':
    case 'ELEVATED':
      return 'blocked'
    case 'WATCH':
    case 'MODERATE':
      return 'in-progress'
    case 'LOW':
      return 'active'
    default:
      return 'planned'
  }
}

function summarizeExposure(exposure: WeatherCommodityExposureRecord): string {
  return `${exposure.directional_bias.replaceAll('_', ' ')} bias • ${exposure.active_trade_count} active trade${exposure.active_trade_count === 1 ? '' : 's'}`
}

function summarizeRegionalSignal(signal: WeatherRegionalSignalRecord): string {
  const parts = [
    signal.current_temperature_f !== null ? `${Math.round(signal.current_temperature_f)}°F now` : null,
    signal.forecast_average_temperature_f !== null
      ? `${Math.round(signal.forecast_average_temperature_f)}°F forecast`
      : null,
    signal.tracked_location_count !== null ? `${signal.tracked_location_count} locations` : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || signal.primary_driver
}

export function WeatherIntelligenceTileContent({
  appLoading,
  formatDate,
  formatNumber,
}: WeatherIntelligenceTileContentProps) {
  const [overview, setOverview] = useState<WeatherIntelligenceOverviewRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await loadWeatherIntelligenceOverview(appConfig.apiBase)
        if (!cancelled) {
          setOverview(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load weather intelligence.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const topExposures = useMemo(() => overview?.exposures.slice(0, 4) ?? [], [overview])
  const topSignals = useMemo(() => overview?.regional_signals.slice(0, 3) ?? [], [overview])

  if (appLoading || loading) {
    return (
      <div className="skeleton-stack">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <strong>Weather intelligence unavailable</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="empty-state">
        <strong>No weather intelligence yet</strong>
        <p>Load active trades and weather data to generate a desk-facing weather intelligence overview.</p>
      </div>
    )
  }

  return (
    <div className="weather-intelligence-panel">
      <div className="dashboard-report-grid">
        <article className="dashboard-report-card">
          <span>Headline</span>
          <strong>{overview.headline}</strong>
          <p>{overview.seasonal_regime.replaceAll('_', ' ')}</p>
        </article>
        <article className="dashboard-report-card">
          <span>Live Locations</span>
          <strong>{formatNumber(overview.live_weather_location_count, 0)}</strong>
          <p>Tracked weather points currently feeding the intelligence blend.</p>
        </article>
        <article className="dashboard-report-card">
          <span>Sensitive Exposures</span>
          <strong>{formatNumber(overview.weather_sensitive_exposure_count, 0)}</strong>
          <p>{formatNumber(overview.weather_sensitive_gross_volume, 0)} gross volume across weather-sensitive positions.</p>
        </article>
        <article className="dashboard-report-card">
          <span>Updated</span>
          <strong>{formatDate(overview.latest_weather_update_at ?? overview.latest_position_update_at)}</strong>
          <p>As of {overview.as_of_date} in {overview.analysis_mode.replaceAll('_', ' ').toLowerCase()} mode.</p>
        </article>
      </div>

      <article className="market-context-section weather-intelligence-summary">
        <div className="market-context-section-head">
          <div>
            <span className="eyebrow">Weather View</span>
            <strong>{overview.headline}</strong>
          </div>
          <p>{overview.summary}</p>
        </div>
        {overview.focus_areas.length > 0 ? (
          <div className="chip-row">
            {overview.focus_areas.map((focusArea) => (
              <span key={focusArea} className="entity-chip entity-chip-soft">
                {focusArea}
              </span>
            ))}
          </div>
        ) : null}
      </article>

      <div className="weather-intelligence-grid">
        <article className="market-context-section">
          <div className="market-context-section-head">
            <div>
              <span className="eyebrow">Exposure Watch</span>
              <strong>{topExposures.length} desk exposures in focus</strong>
            </div>
            <p>The most weather-sensitive positions based on active trades and the current regime blend.</p>
          </div>
          {topExposures.length > 0 ? (
            <div className="market-context-list">
              {topExposures.map((exposure) => (
                <article key={`${exposure.commodity_code}-${exposure.primary_driver}`} className="market-context-row">
                  <div className="market-context-row-copy">
                    <strong>{exposure.commodity_name}</strong>
                    <p>{summarizeExposure(exposure)}</p>
                  </div>
                  <div className="market-context-row-value">
                    <strong>{formatNumber(exposure.weather_sensitivity_score, 1)}</strong>
                    <span>{exposure.suggested_watch}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No weather-sensitive exposures</strong>
              <p>The desk does not currently have enough weather-linked exposure to populate this watchlist.</p>
            </div>
          )}
        </article>

        <article className="market-context-section">
          <div className="market-context-section-head">
            <div>
              <span className="eyebrow">Regional Signals</span>
              <strong>{topSignals.length} regions in focus</strong>
            </div>
            <p>Demand, supply, and storm risk signals inferred from the stored weather footprint.</p>
          </div>
          {topSignals.length > 0 ? (
            <div className="weather-intelligence-signal-list">
              {topSignals.map((signal) => (
                <article key={signal.region_code} className="weather-intelligence-signal">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{signal.region_name}</strong>
                      <span>{summarizeRegionalSignal(signal)}</span>
                    </div>
                    <span className={`status-pill status-pill-${riskTone(signal.storm_risk)}`}>
                      Storm {signal.storm_risk}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className={`entity-chip entity-chip-soft weather-risk-chip weather-risk-chip-${riskTone(signal.demand_risk)}`}>
                      Demand {signal.demand_risk}
                    </span>
                    <span className={`entity-chip entity-chip-soft weather-risk-chip weather-risk-chip-${riskTone(signal.supply_risk)}`}>
                      Supply {signal.supply_risk}
                    </span>
                    <span className="entity-chip entity-chip-soft">{signal.primary_driver}</span>
                  </div>
                  <p>{signal.narrative}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No regional signals</strong>
              <p>Regional weather signals will appear here once active coverage and exposure overlap enough to score.</p>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
