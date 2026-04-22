import { useEffect, useMemo, useState } from 'react'

import { loadMarketContext } from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type {
  MarketContextFreshnessRecord,
  MarketContextPriceRecord,
  MarketContextRecord,
  MarketContextSeriesRecord,
} from '../../shared/models'

type MarketContextTileContentProps = {
  appLoading: boolean
  formatDate: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
}

type ContextSection = {
  key: string
  label: string
  description: string
  items: Array<MarketContextPriceRecord | MarketContextSeriesRecord>
}

const MARKET_CONTEXT_LIMIT = 6

function providerHealthTone(status: string): 'active' | 'blocked' | 'in-progress' | 'planned' {
  switch (status) {
    case 'healthy':
      return 'active'
    case 'running':
      return 'in-progress'
    case 'failed':
    case 'stale':
      return 'blocked'
    default:
      return 'planned'
  }
}

function providerHealthLabel(status: string): string {
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
    default:
      return 'Unknown'
  }
}

function formatObservationDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function sectionValueDigits(item: MarketContextPriceRecord | MarketContextSeriesRecord): number {
  if ('currency_code' in item) {
    return item.unit_code === 'GAL' ? 3 : 2
  }

  if (item.unit_code === 'PCT' || item.unit_code === 'PROB') {
    return 2
  }

  if (item.unit_code === 'USD_MWH') {
    return 2
  }

  return 0
}

function formatContextValue(
  item: MarketContextPriceRecord | MarketContextSeriesRecord,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  const digits = sectionValueDigits(item)
  const prefix = 'currency_code' in item && item.currency_code ? `${item.currency_code} ` : ''
  return `${prefix}${formatNumber(item.value, digits)} / ${item.unit_code}`
}

function summarizeFreshness(
  freshness: MarketContextFreshnessRecord[],
  status: 'healthy' | 'running' | 'failed' | 'stale',
): number {
  return freshness.filter((row) => row.health_status === status).length
}

export function MarketContextTileContent({
  appLoading,
  formatDate,
  formatNumber,
}: MarketContextTileContentProps) {
  const [context, setContext] = useState<MarketContextRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await loadMarketContext(appConfig.apiBase, { limit: MARKET_CONTEXT_LIMIT })
        if (!cancelled) {
          setContext(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load market context.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const sections = useMemo<ContextSection[]>(
    () => [
      {
        key: 'price',
        label: 'Prices',
        description: 'Tracked desk marks and reference indices.',
        items: context?.price_indices ?? [],
      },
      {
        key: 'fundamentals',
        label: 'Fundamentals',
        description: 'Storage, production, and implied demand reads from public energy data.',
        items: context?.fundamentals ?? [],
      },
      {
        key: 'power',
        label: 'Power',
        description: 'Latest ISO price context for power coverage already wired into the platform.',
        items: context?.power ?? [],
      },
      {
        key: 'macro',
        label: 'Macro',
        description: 'Rates, inflation, and cross-asset regime signals.',
        items: context?.macro ?? [],
      },
      {
        key: 'positioning',
        label: 'Positioning',
        description: 'Managed-money and market-structure positioning context.',
        items: context?.positioning ?? [],
      },
    ],
    [context],
  )

  const healthyProviderCount = summarizeFreshness(context?.freshness ?? [], 'healthy')
  const staleProviderCount = summarizeFreshness(context?.freshness ?? [], 'stale')
  const failedProviderCount = summarizeFreshness(context?.freshness ?? [], 'failed')
  const runningProviderCount = summarizeFreshness(context?.freshness ?? [], 'running')

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
        <strong>Market context unavailable</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="empty-state">
        <strong>No market context loaded</strong>
        <p>Sync the external feeds to populate desk context across prices, fundamentals, power, and macro.</p>
      </div>
    )
  }

  return (
    <div className="market-context-panel">
      <div className="dashboard-report-grid">
        <article className="dashboard-report-card">
          <span>Coverage</span>
          <strong>{sections.reduce((sum, section) => sum + section.items.length, 0)}</strong>
          <p>Signals currently visible across pricing, fundamentals, power, macro, and positioning.</p>
        </article>
        <article className="dashboard-report-card">
          <span>Fresh Feeds</span>
          <strong>
            {healthyProviderCount} / {context.freshness.length}
          </strong>
          <p>
            {failedProviderCount} failed, {staleProviderCount} stale, and {runningProviderCount} currently syncing.
          </p>
        </article>
        <article className="dashboard-report-card">
          <span>Fundamental Depth</span>
          <strong>{context.fundamentals.length}</strong>
          <p>Public `EIA` storage, production, and demand series now enrich the desk-level market read.</p>
        </article>
        <article className="dashboard-report-card">
          <span>Generated</span>
          <strong>{formatDate(context.generated_at)}</strong>
          <p>The combined payload timestamp for the current market snapshot.</p>
        </article>
      </div>

      <div className="market-context-section-grid">
        {sections.map((section) => (
          <article key={section.key} className="market-context-section">
            <div className="market-context-section-head">
              <div>
                <span className="eyebrow">{section.label}</span>
                <strong>{section.items.length} loaded</strong>
              </div>
              <p>{section.description}</p>
            </div>
            {section.items.length > 0 ? (
              <div className="market-context-list">
                {section.items.slice(0, 4).map((item) => (
                  <article
                    key={'price_index_code' in item ? item.price_index_code : item.series_code}
                    className="market-context-row"
                  >
                    <div className="market-context-row-copy">
                      <strong>{item.name}</strong>
                      <p>
                        {'price_index_code' in item ? item.price_index_code : item.series_code} •{' '}
                        {formatObservationDate(item.observation_date)}
                      </p>
                    </div>
                    <div className="market-context-row-meta">
                      <strong>{formatContextValue(item, formatNumber)}</strong>
                      <span>{item.source_provider}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No {section.label.toLowerCase()} context yet</strong>
                <p>{section.description}</p>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="market-context-freshness">
        {context.freshness.map((provider) => (
          <article key={provider.provider} className="market-context-freshness-card">
            <div className="market-context-freshness-head">
              <strong>{provider.label}</strong>
              <span className={`status-pill status-pill-${providerHealthTone(provider.health_status)}`}>
                {providerHealthLabel(provider.health_status)}
              </span>
            </div>
            <p>
              {provider.latest_observation_at
                ? `Latest data ${formatDate(provider.latest_observation_at)}`
                : 'No observation loaded yet.'}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
