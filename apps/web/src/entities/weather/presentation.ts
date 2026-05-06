import type {
  WeatherForecastPeriodRecord,
  WeatherObservationRecord,
} from '../../shared/models'

export function weatherHealthTone(
  status: string,
): 'active' | 'blocked' | 'in-progress' | 'cancelled' {
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

export function weatherHealthLabel(status: string): string {
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

export function formatWeatherAgeHours(value: number | null | undefined): string {
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

export function summarizeWeatherForecast(period: WeatherForecastPeriodRecord): string {
  const parts = [
    period.short_forecast,
    period.temperature !== null && period.temperature_unit ? `${period.temperature}°${period.temperature_unit}` : null,
    period.wind_speed ? `${period.wind_speed} ${period.wind_direction ?? ''}`.trim() : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || 'Forecast details unavailable.'
}

export function summarizeWeatherObservation(observation: WeatherObservationRecord): string {
  const parts = [
    observation.text_description,
    observation.temperature_celsius !== null ? `${Math.round((observation.temperature_celsius * 9) / 5 + 32)}°F` : null,
    observation.wind_speed_kmh !== null ? `${Math.round(observation.wind_speed_kmh)} km/h wind` : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' • ') || 'Observation details unavailable.'
}

export function formatWeatherPeriodWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startAt} to ${endAt}`
  }

  return (
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }).format(start) +
    ` to ${new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(end)}`
  )
}
