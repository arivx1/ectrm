import { fetchJson, postJson } from '../../shared/api'
import type { MarketNewsRecord } from '../../shared/models'

export type LoadMarketNewsHeadlinesOptions = {
  commodity?: string | null
  query?: string | null
  limit?: number
  lookbackDays?: number
}

export type MarketNewsTaggingDirection = 'up' | 'down' | 'neutral'
export type MarketNewsTaggingHorizon =
  | 'immediate'
  | 'near_term'
  | 'mid_term'
  | 'long_term'
  | 'very_long_term'
export type MarketNewsTaggingLocationScope =
  | 'region'
  | 'country'
  | 'state'
  | 'province'
  | 'territory'
  | 'city'
  | 'unspecified'

export type MarketNewsTaggingImpact = {
  direction: MarketNewsTaggingDirection
  horizon: MarketNewsTaggingHorizon
}

export type MarketNewsTaggingLocation = {
  label: string
  scope: MarketNewsTaggingLocationScope
}

export type MarketNewsHeadlineTaggingRequestItem = {
  id: string
  title: string
  source: string | null
  published_at: string | null
  deterministic: {
    supply: MarketNewsTaggingImpact
    demand: MarketNewsTaggingImpact
    market_location: MarketNewsTaggingLocation
  }
}

export type MarketNewsHeadlineTaggingRequest = {
  commodity?: string | null
  items: MarketNewsHeadlineTaggingRequestItem[]
}

export type MarketNewsHeadlineTaggingImpactRecord = MarketNewsTaggingImpact & {
  confidence: number
  rationale: string | null
  source: 'ai'
}

export type MarketNewsHeadlineTaggingLocationRecord = MarketNewsTaggingLocation & {
  confidence: number
  rationale: string | null
  source: 'ai'
}

export type MarketNewsHeadlineTaggingItemRecord = {
  id: string
  supply: MarketNewsHeadlineTaggingImpactRecord
  demand: MarketNewsHeadlineTaggingImpactRecord
  market_location: MarketNewsHeadlineTaggingLocationRecord
}

export type MarketNewsHeadlineTaggingRecord = {
  generated_at: string
  provider: string
  model: string | null
  items: MarketNewsHeadlineTaggingItemRecord[]
  warnings: string[]
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

export async function loadMarketNewsHeadlineTags(
  apiBase: string,
  payload: MarketNewsHeadlineTaggingRequest,
): Promise<MarketNewsHeadlineTaggingRecord> {
  return postJson<MarketNewsHeadlineTaggingRecord>(
    `${apiBase}/market-data/news/headlines/tagging`,
    payload,
    { cache: 'no-store' },
  )
}
