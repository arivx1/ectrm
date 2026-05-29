import { fetchJson } from '../../shared/api'
import type { MarketNewsRecord } from '../../shared/models'

export type LoadMarketNewsHeadlinesOptions = {
  commodity?: string | null
  query?: string | null
  limit?: number
  lookbackDays?: number
}

function appendTrimmedTextParam(params: URLSearchParams, key: string, value: string | null | undefined): void {
  const trimmedValue = value?.trim()
  if (trimmedValue) {
    params.set(key, trimmedValue)
  }
}

export async function loadMarketNewsHeadlines(
  apiBase: string,
  options: LoadMarketNewsHeadlinesOptions = {},
): Promise<MarketNewsRecord> {
  const params = new URLSearchParams()
  appendTrimmedTextParam(params, 'commodity', options.commodity)
  appendTrimmedTextParam(params, 'query', options.query)

  if (typeof options.limit === 'number') {
    params.set('limit', String(Math.max(1, Math.floor(options.limit))))
  }
  if (typeof options.lookbackDays === 'number') {
    params.set('lookback_days', String(Math.max(1, Math.floor(options.lookbackDays))))
  }

  const queryString = params.toString()
  return fetchJson<MarketNewsRecord>(
    `${apiBase}/market-data/news/headlines${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'no-store',
    },
  )
}
