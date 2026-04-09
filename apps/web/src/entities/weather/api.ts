import { fetchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type {
  WeatherForecastPeriodRecord,
  WeatherIntelligenceOverviewRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
} from '../../shared/models'

export type CreateWeatherLocationInput = {
  code: string
  name: string
  latitude: number
  longitude: number
  reference_location_code?: string | null
  timezone?: string | null
  description?: string | null
  created_by: string
}

export type UpdateWeatherLocationInput = {
  name?: string | null
  latitude?: number | null
  longitude?: number | null
  reference_location_code?: string | null
  timezone?: string | null
  description?: string | null
  updated_by: string
}

export type UpdateWeatherLocationStatusInput = {
  updated_by: string
}

function weatherMutationHeaders(): Headers {
  return buildMutationHeaders()
}

export async function loadWeatherLocations(
  apiBase: string,
  options?: { isActive?: boolean; query?: string; headers?: HeadersInit | null },
): Promise<WeatherLocationRecord[]> {
  const params = new URLSearchParams()
  if (typeof options?.isActive === 'boolean') {
    params.set('is_active', String(options.isActive))
  }
  if (options?.query?.trim()) {
    params.set('q', options.query.trim())
  }

  const queryString = params.toString()
  return fetchJson<WeatherLocationRecord[]>(
    `${apiBase}/admin/weather/locations${queryString ? `?${queryString}` : ''}`,
    {
      headers: options?.headers ?? undefined,
      cache: 'no-store',
    },
  )
}

export async function createWeatherLocation(
  apiBase: string,
  payload: CreateWeatherLocationInput,
): Promise<WeatherLocationRecord> {
  return postJson<WeatherLocationRecord>(`${apiBase}/admin/weather/locations`, payload, {
    headers: weatherMutationHeaders(),
  })
}

export async function updateWeatherLocation(
  apiBase: string,
  locationCode: string,
  payload: UpdateWeatherLocationInput,
): Promise<WeatherLocationRecord> {
  return putJson<WeatherLocationRecord>(
    `${apiBase}/admin/weather/locations/${encodeURIComponent(locationCode)}`,
    payload,
    {
      headers: weatherMutationHeaders(),
    },
  )
}

export async function deactivateWeatherLocation(
  apiBase: string,
  locationCode: string,
  payload: UpdateWeatherLocationStatusInput,
): Promise<WeatherLocationRecord> {
  return postJson<WeatherLocationRecord>(
    `${apiBase}/admin/weather/locations/${encodeURIComponent(locationCode)}/deactivate`,
    payload,
    {
      headers: weatherMutationHeaders(),
    },
  )
}

export async function reactivateWeatherLocation(
  apiBase: string,
  locationCode: string,
  payload: UpdateWeatherLocationStatusInput,
): Promise<WeatherLocationRecord> {
  return postJson<WeatherLocationRecord>(
    `${apiBase}/admin/weather/locations/${encodeURIComponent(locationCode)}/reactivate`,
    payload,
    {
      headers: weatherMutationHeaders(),
    },
  )
}

export async function loadWeatherIntelligenceOverview(
  apiBase: string,
  options?: { commodityClass?: string; regionCode?: string; asOfDate?: string },
): Promise<WeatherIntelligenceOverviewRecord> {
  const params = new URLSearchParams()
  if (options?.commodityClass?.trim()) {
    params.set('commodity_class', options.commodityClass.trim())
  }
  if (options?.regionCode?.trim()) {
    params.set('region_code', options.regionCode.trim())
  }
  if (options?.asOfDate?.trim()) {
    params.set('as_of_date', options.asOfDate.trim())
  }

  const queryString = params.toString()
  return fetchJson<WeatherIntelligenceOverviewRecord>(
    `${apiBase}/weather/intelligence/overview${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadWeatherForecastPeriods(
  apiBase: string,
  locationCode: string,
  limit = 6,
): Promise<WeatherForecastPeriodRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<WeatherForecastPeriodRecord[]>(
    `${apiBase}/weather/locations/${encodeURIComponent(locationCode)}/forecast-periods?${params.toString()}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadWeatherObservations(
  apiBase: string,
  locationCode: string,
  limit = 6,
): Promise<WeatherObservationRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<WeatherObservationRecord[]>(
    `${apiBase}/weather/locations/${encodeURIComponent(locationCode)}/observations?${params.toString()}`,
    {
      cache: 'no-store',
    },
  )
}
