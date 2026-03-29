import { fetchJson } from '../../shared/api'
import type { PriceIndexObservationRecord } from '../../shared/models'

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
