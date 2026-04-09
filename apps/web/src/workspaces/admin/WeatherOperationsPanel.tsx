import { useEffect, useMemo, useState } from 'react'

import {
  loadWeatherForecastPeriods,
  loadWeatherObservations,
  type CreateWeatherLocationInput,
  type UpdateWeatherLocationInput,
} from '../../entities/weather/api'
import { appConfig } from '../../shared/config'
import type {
  WeatherForecastPeriodRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type WeatherOperationsPanelProps = {
  authSession: StoredAuthSession | null
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
  weatherSyncing: boolean
  weatherSyncError: string
  weatherSyncSuccess: string
  weatherLocationMutationError: string
  weatherLocationMutationPendingCode: string | null
  weatherLocationMutationSuccess: string
  onRunNwsWeatherSync: () => Promise<void>
  onCreateWeatherLocation: (input: Omit<CreateWeatherLocationInput, 'created_by'>) => Promise<void>
  onUpdateWeatherLocation: (
    locationCode: string,
    input: Omit<UpdateWeatherLocationInput, 'updated_by'>,
  ) => Promise<void>
  onDeactivateWeatherLocation: (locationCode: string) => Promise<void>
  onReactivateWeatherLocation: (locationCode: string) => Promise<void>
  formatDate: (value: string | null | undefined) => string
}

type WeatherLocationFormState = {
  code: string
  name: string
  latitude: string
  longitude: string
  referenceLocationCode: string
  timezone: string
  description: string
}

function cadenceLabel(intervalMinutes: number): string {
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60
    return hours === 1 ? 'Hourly' : `Every ${hours}h`
  }

  return `Every ${intervalMinutes}m`
}

function weatherHealthTone(status: string): 'active' | 'blocked' | 'in-progress' | 'cancelled' {
  switch (status) {
    case 'healthy':
      return 'active'
    case 'running':
      return 'in-progress'
    case 'failed':
      return 'cancelled'
    default:
      return 'blocked'
  }
}

function weatherHealthLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'running':
      return 'Running'
    case 'failed':
      return 'Failed'
    case 'stale':
      return 'Stale'
    case 'missing':
      return 'Missing'
    case 'degraded':
      return 'Degraded'
    default:
      return 'Unknown'
  }
}

function formatAgeHours(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'No data'
  }

  if (value < 1) {
    return `${Math.max(1, Math.round(value * 60))}m old`
  }

  if (value < 24) {
    return `${value.toFixed(value >= 10 ? 0 : 1)}h old`
  }

  const days = value / 24
  return `${days.toFixed(days >= 10 ? 0 : 1)}d old`
}

function buildFormState(location?: WeatherLocationRecord | null): WeatherLocationFormState {
  return {
    code: location?.code ?? '',
    name: location?.name ?? '',
    latitude: location ? String(location.latitude) : '',
    longitude: location ? String(location.longitude) : '',
    referenceLocationCode: location?.reference_location_code ?? '',
    timezone: location?.timezone ?? '',
    description: location?.description ?? '',
  }
}

function normalizedOptionalText(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

function summarizeForecast(period: WeatherForecastPeriodRecord): string {
  const parts = [
    period.short_forecast,
    period.temperature !== null && period.temperature_unit ? `${period.temperature}°${period.temperature_unit}` : null,
    period.wind_speed ? `${period.wind_speed} ${period.wind_direction ?? ''}`.trim() : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || 'Forecast details unavailable.'
}

function summarizeObservation(observation: WeatherObservationRecord): string {
  const parts = [
    observation.text_description,
    observation.temperature_celsius !== null ? `${Math.round((observation.temperature_celsius * 9) / 5 + 32)}°F` : null,
    observation.wind_speed_kmh !== null ? `${Math.round(observation.wind_speed_kmh)} km/h wind` : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || 'Observation details unavailable.'
}

function formatPeriodWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startAt} to ${endAt}`
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  }).format(start) + ` to ${new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(end)}`
}

export function WeatherOperationsPanel({
  authSession,
  weatherLocations,
  weatherSyncStatus,
  weatherSyncing,
  weatherSyncError,
  weatherSyncSuccess,
  weatherLocationMutationError,
  weatherLocationMutationPendingCode,
  weatherLocationMutationSuccess,
  onRunNwsWeatherSync,
  onCreateWeatherLocation,
  onUpdateWeatherLocation,
  onDeactivateWeatherLocation,
  onReactivateWeatherLocation,
  formatDate,
}: WeatherOperationsPanelProps) {
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formState, setFormState] = useState<WeatherLocationFormState>(() => buildFormState())
  const [formError, setFormError] = useState('')
  const [forecastPeriods, setForecastPeriods] = useState<WeatherForecastPeriodRecord[]>([])
  const [observations, setObservations] = useState<WeatherObservationRecord[]>([])
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false)
  const [locationPreviewError, setLocationPreviewError] = useState('')

  const syncLocationByCode = useMemo(
    () => new Map((weatherSyncStatus?.locations ?? []).map((location) => [location.code, location])),
    [weatherSyncStatus],
  )

  const orderedLocations = useMemo(
    () =>
      [...weatherLocations].sort((left, right) => {
        if (left.is_active !== right.is_active) {
          return left.is_active ? -1 : 1
        }
        return left.code.localeCompare(right.code)
      }),
    [weatherLocations],
  )

  useEffect(() => {
    if (orderedLocations.length === 0) {
      setSelectedLocationCode(null)
      return
    }

    if (!selectedLocationCode || !orderedLocations.some((location) => location.code === selectedLocationCode)) {
      setSelectedLocationCode(orderedLocations[0].code)
    }
  }, [orderedLocations, selectedLocationCode])

  const selectedLocation =
    orderedLocations.find((location) => location.code === selectedLocationCode) ?? orderedLocations[0] ?? null
  const latestNwsRun = weatherSyncStatus?.latest_run ?? null
  const latestNwsSuccess = weatherSyncStatus?.latest_success ?? null

  useEffect(() => {
    if (formMode === 'edit') {
      setFormState(buildFormState(selectedLocation))
      setFormError('')
    }
  }, [formMode, selectedLocation])

  useEffect(() => {
    if (!selectedLocation) {
      setForecastPeriods([])
      setObservations([])
      setLocationPreviewError('')
      return
    }

    let cancelled = false

    async function loadLocationPreview() {
      setLocationPreviewLoading(true)
      setLocationPreviewError('')

      try {
        const [forecastResult, observationResult] = await Promise.all([
          loadWeatherForecastPeriods(appConfig.apiBase, selectedLocation.code, 4),
          loadWeatherObservations(appConfig.apiBase, selectedLocation.code, 4),
        ])

        if (!cancelled) {
          setForecastPeriods(forecastResult)
          setObservations(observationResult)
        }
      } catch (nextError) {
        if (!cancelled) {
          setForecastPeriods([])
          setObservations([])
          setLocationPreviewError(
            nextError instanceof Error ? nextError.message : 'Unable to load weather location preview.',
          )
        }
      } finally {
        if (!cancelled) {
          setLocationPreviewLoading(false)
        }
      }
    }

    void loadLocationPreview()

    return () => {
      cancelled = true
    }
  }, [selectedLocation])

  function resetCreateForm() {
    setFormMode('create')
    setFormState(buildFormState())
    setFormError('')
  }

  async function handleSubmitLocationForm() {
    const code = formState.code.trim().toUpperCase()
    const name = formState.name.trim()
    const latitude = Number(formState.latitude)
    const longitude = Number(formState.longitude)

    if (!code) {
      setFormError('Location code is required.')
      return
    }
    if (!name) {
      setFormError('Location name is required.')
      return
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setFormError('Latitude must be between -90 and 90.')
      return
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setFormError('Longitude must be between -180 and 180.')
      return
    }

    setFormError('')

    const basePayload = {
      name,
      latitude,
      longitude,
      reference_location_code: normalizedOptionalText(formState.referenceLocationCode),
      timezone: normalizedOptionalText(formState.timezone),
      description: normalizedOptionalText(formState.description),
    }

    if (formMode === 'edit' && selectedLocation) {
      await onUpdateWeatherLocation(selectedLocation.code, basePayload)
      return
    }

    await onCreateWeatherLocation({
      code,
      ...basePayload,
    })
    setSelectedLocationCode(code)
  }

  return (
    <div className="admin-sync-panel">
      <div className="admin-sync-head">
        <div>
          <span className="eyebrow">Weather Operations</span>
          <h3>NWS Sync Health</h3>
        </div>
        <div className="admin-sync-head-actions">
          {weatherSyncStatus ? (
            <span className={`status-pill status-pill-${weatherHealthTone(weatherSyncStatus.health_status)}`}>
              {weatherHealthLabel(weatherSyncStatus.health_status)}
            </span>
          ) : null}
          <button
            type="button"
            className="button button-primary"
            onClick={() => void onRunNwsWeatherSync()}
            disabled={weatherSyncing}
          >
            {weatherSyncing ? 'Running Weather Sync...' : 'Run NWS Sync'}
          </button>
        </div>
      </div>
      <p>Monitor the NOAA ingest loop, maintain the tracked weather footprint, and inspect live forecast and observation context for each location.</p>

      <div className="admin-sync-status-grid">
        <article className="admin-card">
          <strong>Coverage</strong>
          <p>
            {weatherSyncStatus
              ? `${weatherSyncStatus.healthy_location_count} of ${weatherSyncStatus.active_location_count} active locations are currently healthy.`
              : 'Weather sync status has not been loaded yet.'}
          </p>
          <span>
            {weatherSyncStatus
              ? `${weatherSyncStatus.stale_location_count} stale · ${weatherSyncStatus.missing_location_count} missing`
              : 'Awaiting first status snapshot'}
          </span>
        </article>
        <article className="admin-card">
          <strong>Scheduler</strong>
          <p>
            {weatherSyncStatus
              ? `${cadenceLabel(weatherSyncStatus.scheduler_interval_minutes)} cadence with ${weatherSyncStatus.success_sla_hours}h run SLA.`
              : 'Scheduler cadence is not available yet.'}
          </p>
          <span>
            {weatherSyncStatus
              ? `Forecast target ${weatherSyncStatus.forecast_freshness_hours}h · observations ${weatherSyncStatus.observation_freshness_hours}h`
              : 'No freshness target loaded'}
          </span>
        </article>
        <article className="admin-card">
          <strong>Latest Run</strong>
          <p>
            {latestNwsRun
              ? `Run #${latestNwsRun.id} ${latestNwsRun.status} with ${latestNwsRun.series_count} series and ${latestNwsRun.observation_count} observations.`
              : 'No NWS sync has been recorded yet.'}
          </p>
          <span>{latestNwsRun ? formatDate(latestNwsRun.finished_at ?? latestNwsRun.started_at) : 'Awaiting first sync'}</span>
        </article>
        <article className="admin-card">
          <strong>Latest Healthy Data</strong>
          <p>
            {weatherSyncStatus?.latest_data_at
              ? `Latest weather payload landed ${formatDate(weatherSyncStatus.latest_data_at)}.`
              : 'No forecast or observation data is stored yet.'}
          </p>
          <span>{latestNwsSuccess ? `Last success run #${latestNwsSuccess.id}` : 'No successful run recorded yet'}</span>
        </article>
      </div>

      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to add, edit, deactivate, or reactivate tracked weather locations.</p>
      ) : null}
      {weatherSyncError ? <div className="feedback-banner feedback-banner-error">{weatherSyncError}</div> : null}
      {weatherSyncSuccess ? <div className="feedback-banner feedback-banner-success">{weatherSyncSuccess}</div> : null}
      {weatherSyncStatus?.error_summary ? (
        <div className="feedback-banner feedback-banner-error">{weatherSyncStatus.error_summary}</div>
      ) : null}
      {weatherLocationMutationError ? (
        <div className="feedback-banner feedback-banner-error">{weatherLocationMutationError}</div>
      ) : null}
      {weatherLocationMutationSuccess ? (
        <div className="feedback-banner feedback-banner-success">{weatherLocationMutationSuccess}</div>
      ) : null}

      <div className="admin-weather-grid">
        <article className="admin-card admin-weather-form-card">
          <div className="shipment-card-head">
            <div className="shipment-card-copy">
              <strong>{formMode === 'edit' ? 'Edit Weather Location' : 'Add Weather Location'}</strong>
              <span>Maintain the tracked footprint the weather intelligence layer can refresh and summarize.</span>
            </div>
            <div className="workflow-item-button-row">
              {formMode === 'edit' ? (
                <button type="button" className="button button-ghost" onClick={resetCreateForm}>
                  New Location
                </button>
              ) : null}
            </div>
          </div>

          {formError ? <p className="field-error">{formError}</p> : null}

          <div className="admin-weather-form-grid">
            <label className="field">
              <span>Code</span>
              <input
                className="control control-compact"
                value={formState.code}
                onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))}
                placeholder="HOUSTON_GC"
                disabled={formMode === 'edit' || weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                className="control control-compact"
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                placeholder="Houston Gulf Coast"
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field">
              <span>Latitude</span>
              <input
                className="control control-compact"
                inputMode="decimal"
                value={formState.latitude}
                onChange={(event) => setFormState((current) => ({ ...current, latitude: event.target.value }))}
                placeholder="29.7604"
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input
                className="control control-compact"
                inputMode="decimal"
                value={formState.longitude}
                onChange={(event) => setFormState((current) => ({ ...current, longitude: event.target.value }))}
                placeholder="-95.3698"
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field">
              <span>Reference Location</span>
              <input
                className="control control-compact"
                value={formState.referenceLocationCode}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, referenceLocationCode: event.target.value }))
                }
                placeholder="Optional master location code"
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field">
              <span>Timezone</span>
              <input
                className="control control-compact"
                value={formState.timezone}
                onChange={(event) => setFormState((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="America/Chicago"
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
            <label className="field field-wide">
              <span>Description</span>
              <textarea
                className="control control-textarea"
                value={formState.description}
                onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                placeholder="Desk rationale, region context, or operational notes."
                disabled={weatherLocationMutationPendingCode !== null}
              />
            </label>
          </div>

          <div className="shipment-card-actions workflow-item-actions">
            <span>
              {formMode === 'edit' && selectedLocation
                ? `Editing ${selectedLocation.code} last updated ${formatDate(selectedLocation.updated_at)}`
                : 'New locations become part of the sync footprint on the next weather refresh.'}
            </span>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleSubmitLocationForm()}
              disabled={!authSession || weatherLocationMutationPendingCode !== null}
            >
              {weatherLocationMutationPendingCode === (formMode === 'edit' ? selectedLocation?.code ?? null : formState.code.trim().toUpperCase())
                ? formMode === 'edit'
                  ? 'Saving…'
                  : 'Creating…'
                : formMode === 'edit'
                  ? 'Save Location'
                  : 'Create Location'}
            </button>
          </div>
        </article>

        <article className="admin-card admin-weather-preview-card">
          <div className="shipment-card-head">
            <div className="shipment-card-copy">
              <strong>{selectedLocation ? `${selectedLocation.code} Weather Preview` : 'Weather Preview'}</strong>
              <span>
                {selectedLocation
                  ? `${selectedLocation.name} forecast and recent observations from the stored weather feed.`
                  : 'Select a tracked location to inspect the live weather preview.'}
              </span>
            </div>
            {selectedLocation ? (
              <span className={`status-pill status-pill-${weatherHealthTone(syncLocationByCode.get(selectedLocation.code)?.health_status ?? 'missing')}`}>
                {weatherHealthLabel(syncLocationByCode.get(selectedLocation.code)?.health_status ?? 'missing')}
              </span>
            ) : null}
          </div>

          {locationPreviewError ? <p className="field-error">{locationPreviewError}</p> : null}

          {selectedLocation ? (
            <div className="admin-weather-preview">
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">
                  Forecast {formatAgeHours(syncLocationByCode.get(selectedLocation.code)?.forecast_age_hours)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Observation {formatAgeHours(syncLocationByCode.get(selectedLocation.code)?.observation_age_hours)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {selectedLocation.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {locationPreviewLoading ? (
                <div className="skeleton-stack">
                  <div className="skeleton-block" />
                  <div className="skeleton-block" />
                </div>
              ) : (
                <>
                  <div className="admin-weather-preview-section">
                    <strong>Forecast Periods</strong>
                    {forecastPeriods.length > 0 ? (
                      <div className="detail-list">
                        {forecastPeriods.map((period) => (
                          <article key={period.id} className="detail-row">
                            <span>{formatPeriodWindow(period.start_at, period.end_at)}</span>
                            <strong>{summarizeForecast(period)}</strong>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="workflow-editor-note">No current forecast periods are stored for this location yet.</p>
                    )}
                  </div>

                  <div className="admin-weather-preview-section">
                    <strong>Recent Observations</strong>
                    {observations.length > 0 ? (
                      <div className="detail-list">
                        {observations.map((observation) => (
                          <article key={observation.id} className="detail-row">
                            <span>{formatDate(observation.observed_at)}</span>
                            <strong>{summarizeObservation(observation)}</strong>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="workflow-editor-note">No recent observations are stored for this location yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No tracked locations</strong>
              <p>Create a weather location to start previewing stored forecast and observation data.</p>
            </div>
          )}
        </article>
      </div>

      <div className="admin-run-list">
        {orderedLocations.length === 0 ? (
          <div className="detail-row">
            <span>No tracked weather locations are loaded yet.</span>
          </div>
        ) : (
          orderedLocations.map((location) => {
            const syncLocation = syncLocationByCode.get(location.code)
            const mutationPending = weatherLocationMutationPendingCode === location.code
            const isSelected = selectedLocation?.code === location.code

            return (
              <article
                key={location.code}
                className={`admin-run-row admin-weather-row ${isSelected ? 'admin-weather-row-selected' : ''}`.trim()}
              >
                <div className="admin-weather-row-main">
                  <div>
                    <strong>{location.name}</strong>
                    <p>
                      {location.code}
                      {location.reference_location_code ? ` · ref ${location.reference_location_code}` : ''}
                      {location.station_id ? ` · station ${location.station_id}` : ''}
                      {!location.is_active ? ' · inactive' : ''}
                    </p>
                  </div>
                  <div className="admin-weather-row-detail">
                    <span>Forecast {formatAgeHours(syncLocation?.forecast_age_hours)}</span>
                    <span>Observation {formatAgeHours(syncLocation?.observation_age_hours)}</span>
                    <span>{location.timezone ?? 'Timezone TBD'}</span>
                  </div>
                </div>
                <div className="admin-run-meta">
                  <span className={`status-pill status-pill-${weatherHealthTone(syncLocation?.health_status ?? 'missing')}`}>
                    {weatherHealthLabel(syncLocation?.health_status ?? 'missing')}
                  </span>
                  <span>{syncLocation?.last_observation_at ? `Observed ${formatDate(syncLocation.last_observation_at)}` : 'No observation yet'}</span>
                  <div className="workflow-item-button-row">
                    <button type="button" className="button button-ghost" onClick={() => setSelectedLocationCode(location.code)}>
                      {isSelected ? 'Inspecting' : 'Inspect'}
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => {
                        setSelectedLocationCode(location.code)
                        setFormMode('edit')
                        setFormState(buildFormState(location))
                        setFormError('')
                      }}
                      disabled={!authSession || mutationPending}
                    >
                      Edit
                    </button>
                    {location.is_active ? (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void onDeactivateWeatherLocation(location.code)}
                        disabled={!authSession || mutationPending}
                      >
                        {mutationPending ? 'Working…' : 'Deactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void onReactivateWeatherLocation(location.code)}
                        disabled={!authSession || mutationPending}
                      >
                        {mutationPending ? 'Working…' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
