import { fetchJson } from '../../shared/api'
import type { MarketContextRecord, PriceIndexObservationRecord } from '../../shared/models'

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
