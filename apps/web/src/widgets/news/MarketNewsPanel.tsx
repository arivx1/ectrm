import { useEffect, useState } from 'react'

import { loadMarketNewsHeadlines } from '../../entities/news/api'
import type { MarketNewsHeadlineRecord, MarketNewsRecord } from '../../shared/models'

type MarketNewsPanelProps = {
  apiBase: string
  commodity?: string | null
  query?: string | null
  limit?: number
  lookbackDays?: number
  title?: string
  detail?: string
  formatDate?: (value: string | null | undefined) => string
}

function normalizeOptionalNewsText(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : null
}

function formatFallbackNewsDate(value: string | null | undefined): string {
  if (!value) {
    return 'Time unavailable'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function newsHeadlineSourceLabel(item: MarketNewsHeadlineRecord): string {
  return item.source?.trim() || 'Market news'
}

export function MarketNewsPanel({
  apiBase,
  commodity = null,
  query = null,
  limit = 5,
  lookbackDays = 3,
  title = 'Market News',
  detail = 'Recent headlines matched to this market context.',
  formatDate = formatFallbackNewsDate,
}: MarketNewsPanelProps) {
  const normalizedCommodity = normalizeOptionalNewsText(commodity)
  const normalizedQuery = normalizeOptionalNewsText(query)
  const normalizedLimit = Math.max(1, Math.floor(limit))
  const normalizedLookbackDays = Math.max(1, Math.floor(lookbackDays))
  const [news, setNews] = useState<MarketNewsRecord | null>(null)
  const [loading, setLoading] = useState(Boolean(normalizedCommodity || normalizedQuery))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!normalizedCommodity && !normalizedQuery) {
      setNews(null)
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    async function loadNews() {
      try {
        const payload = await loadMarketNewsHeadlines(apiBase, {
          commodity: normalizedCommodity,
          query: normalizedQuery,
          limit: normalizedLimit,
          lookbackDays: normalizedLookbackDays,
        })
        if (!cancelled) {
          setNews(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setNews(null)
          setError(nextError instanceof Error ? nextError.message : 'Unable to load market news.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadNews()

    return () => {
      cancelled = true
    }
  }, [
    apiBase,
    normalizedCommodity,
    normalizedLimit,
    normalizedLookbackDays,
    normalizedQuery,
  ])

  const generatedAt = news?.generated_at ? formatDate(news.generated_at) : null

  return (
    <div className="market-news-panel">
      <div className="market-news-panel-head">
        <div className="pnl-trend-copy">
          <span>{title}</span>
          <p>{detail}</p>
        </div>
        <div className="market-news-chip-row">
          {normalizedCommodity ? <span className="entity-chip entity-chip-soft">{normalizedCommodity}</span> : null}
          {generatedAt ? <span className="entity-chip entity-chip-soft">Updated {generatedAt}</span> : null}
        </div>
      </div>

      {loading ? (
        <div className="skeleton-stack">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : error ? (
        <div className="empty-state">
          <strong>News unavailable</strong>
          <p>{error}</p>
        </div>
      ) : news && news.items.length > 0 ? (
        <div className="market-news-list">
          {news.items.map((item) => (
            <article key={`${item.link}-${item.title}`} className="market-news-row">
              <div className="market-news-copy">
                <strong>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </strong>
                <div className="market-news-meta">
                  <span>{newsHeadlineSourceLabel(item)}</span>
                  <span>{formatDate(item.published_at)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No recent headlines</strong>
          <p>The current market news search did not return matching headlines.</p>
        </div>
      )}
    </div>
  )
}
