import { fetchJson } from '../../shared/api'
import type {
  ExternalSeriesDefinitionRecord,
  ExternalSeriesObservationRecord,
  MarketContextRecord,
  PriceIndexObservationRecord,
} from '../../shared/models'

export async function loadLatestPriceIndexObservations(
  apiBase: string,
  priceIndexCodes: string[],
): Promise<PriceIndexObservationRecord[]> {
  if (priceIndexCodes.length === 0) {
    return []
  }

  const params = new URLSearchParams()
  for (const priceIndexCode of priceIndexCodes) {
    params.append('price_index_codes', priceIndexCode)
  }

  return fetchJson<PriceIndexObservationRecord[]>(
    `${apiBase}/market-data/price-indices/observations/latest?${params.toString()}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadPriceIndexObservations(
  apiBase: string,
  priceIndexCode: string,
  limit = 24,
): Promise<PriceIndexObservationRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<PriceIndexObservationRecord[]>(
    `${apiBase}/market-data/price-indices/${encodeURIComponent(priceIndexCode)}/observations?${params.toString()}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadMarketContext(
  apiBase: string,
  options?: { commodity?: string; limit?: number },
): Promise<MarketContextRecord> {
  const params = new URLSearchParams()
  if (options?.commodity) {
    params.set('commodity', options.commodity)
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }

  const queryString = params.toString()
  return fetchJson<MarketContextRecord>(
    `${apiBase}/market-data/context${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadExternalSeriesDefinitions(
  apiBase: string,
  options?: { provider?: string; category?: string; limit?: number; offset?: number },
): Promise<ExternalSeriesDefinitionRecord[]> {
  const params = new URLSearchParams()
  if (options?.provider?.trim()) {
    params.set('provider', options.provider.trim())
  }
  if (options?.category?.trim()) {
    params.set('category', options.category.trim())
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  if (typeof options?.offset === 'number') {
    params.set('offset', String(options.offset))
  }

  const queryString = params.toString()
  return fetchJson<ExternalSeriesDefinitionRecord[]>(
    `${apiBase}/market-data/external-series${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'no-store',
    },
  )
}

export async function loadExternalSeriesObservations(
  apiBase: string,
  seriesCode: string,
  limit = 12,
): Promise<ExternalSeriesObservationRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<ExternalSeriesObservationRecord[]>(
    `${apiBase}/market-data/external-series/${encodeURIComponent(seriesCode)}/observations?${params.toString()}`,
    {
      cache: 'no-store',
    },
  )
}
