import { useEffect, useMemo, useState } from 'react'

import { loadAssistantTokenUsageTracker } from '../../entities/assistant/api'
import { formatTokenCount } from '../../entities/assistant/budget'
import { appConfig } from '../../shared/config'
import type {
  AssistantTokenUsageBucket,
  AssistantTokenUsageTracker,
} from '../../shared/models'
import { ASSISTANT_TOKEN_TRACKER_ANCHOR_ID } from './assistantTokenTrackerAnchor'

export type AssistantTokenTrackerPeriod = 'daily' | 'weekly' | 'monthly'

const PERIOD_OPTIONS: {
  key: AssistantTokenTrackerPeriod
  label: string
  summary: string
}[] = [
  { key: 'daily', label: 'Day', summary: 'Last 14 days' },
  { key: 'weekly', label: 'Week', summary: 'Last 8 weeks' },
  { key: 'monthly', label: 'Month', summary: 'Last 12 months' },
]

const UTC_DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
})

const UTC_MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
})

function latestBucket(buckets: AssistantTokenUsageBucket[]): AssistantTokenUsageBucket | null {
  return buckets.length > 0 ? buckets[buckets.length - 1] : null
}

function formatUtcDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return UTC_DAY_FORMATTER.format(date)
}

function formatUtcMonth(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return UTC_MONTH_FORMATTER.format(date)
}

function bucketEndDateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  date.setUTCDate(date.getUTCDate() - 1)
  return UTC_DAY_FORMATTER.format(date)
}

function assistantTokenUsageBucketsForPeriod(
  tracker: AssistantTokenUsageTracker | null,
  period: AssistantTokenTrackerPeriod,
): AssistantTokenUsageBucket[] {
  if (!tracker) {
    return []
  }
  if (period === 'weekly') {
    return tracker.weekly
  }
  if (period === 'monthly') {
    return tracker.monthly
  }
  return tracker.daily
}

function formatAssistantTokenUsageBucketLabel(
  bucket: AssistantTokenUsageBucket,
  period: AssistantTokenTrackerPeriod,
): string {
  if (period === 'monthly') {
    return formatUtcMonth(bucket.bucket_started_at)
  }
  if (period === 'weekly') {
    return `${formatUtcDate(bucket.bucket_started_at)} - ${bucketEndDateLabel(bucket.bucket_ended_at)}`
  }
  return formatUtcDate(bucket.bucket_started_at)
}

function renderRunCount(count: number): string {
  return `${formatTokenCount(count)} ${count === 1 ? 'run' : 'runs'}`
}

function TokenTrackerKpi({
  label,
  bucket,
}: {
  label: string
  bucket: AssistantTokenUsageBucket | null
}) {
  return (
    <div className="assistant-token-tracker-kpi">
      <span>{label}</span>
      <strong>{formatTokenCount(bucket?.used_tokens ?? 0)}</strong>
      <small>{renderRunCount(bucket?.recorded_run_count ?? 0)}</small>
    </div>
  )
}

export function AssistantTokenTrackerPanel() {
  const [tracker, setTracker] = useState<AssistantTokenUsageTracker | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<AssistantTokenTrackerPeriod>('daily')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadTracker() {
      setLoading(true)
      setError('')
      try {
        const payload = await loadAssistantTokenUsageTracker(appConfig.apiBase)
        if (!cancelled) {
          setTracker(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load assistant token tracker.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadTracker()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.location.hash !== `#${ASSISTANT_TOKEN_TRACKER_ANCHOR_ID}`
    ) {
      return
    }
    window.requestAnimationFrame(() => {
      document.getElementById(ASSISTANT_TOKEN_TRACKER_ANCHOR_ID)?.scrollIntoView({
        block: 'start',
      })
    })
  }, [])

  const selectedBuckets = useMemo(
    () => assistantTokenUsageBucketsForPeriod(tracker, selectedPeriod),
    [selectedPeriod, tracker],
  )
  const latestDailyBucket = latestBucket(tracker?.daily ?? [])
  const latestWeeklyBucket = latestBucket(tracker?.weekly ?? [])
  const latestMonthlyBucket = latestBucket(tracker?.monthly ?? [])
  const maxSelectedTokens = Math.max(1, ...selectedBuckets.map((bucket) => bucket.used_tokens))
  const tableBuckets = [...selectedBuckets].reverse()

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    try {
      setTracker(await loadAssistantTokenUsageTracker(appConfig.apiBase))
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Could not refresh assistant token tracker.',
      )
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  return (
    <section
      id={ASSISTANT_TOKEN_TRACKER_ANCHOR_ID}
      className="surface assistant-token-tracker"
      aria-labelledby="assistant-token-tracker-heading"
    >
      <div className="section-head">
        <div>
          <span className="eyebrow">Token Tracker</span>
          <h3 id="assistant-token-tracker-heading">Usage by period</h3>
        </div>
        <button
          type="button"
          className="button button-ghost assistant-budget-refresh-button"
          onClick={() => void handleRefresh()}
          disabled={loading || refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="empty-state assistant-empty-state">
          <strong>Loading token tracker</strong>
          <p>Fetching assistant usage buckets from the API.</p>
        </div>
      ) : error && !tracker ? (
        <div className="empty-state assistant-empty-state">
          <strong>Token tracker unavailable</strong>
          <p>{error}</p>
        </div>
      ) : tracker ? (
        <>
          <div className="assistant-token-tracker-kpis">
            <TokenTrackerKpi label="Today" bucket={latestDailyBucket} />
            <TokenTrackerKpi label="This week" bucket={latestWeeklyBucket} />
            <TokenTrackerKpi label="This month" bucket={latestMonthlyBucket} />
          </div>

          <div className="assistant-token-tracker-controls" aria-label="Token usage period">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={selectedPeriod === option.key}
                className={selectedPeriod === option.key ? 'is-selected' : ''}
                onClick={() => setSelectedPeriod(option.key)}
              >
                <span>{option.label}</span>
                <small>{option.summary}</small>
              </button>
            ))}
          </div>

          {error ? <p className="assistant-token-tracker-error">{error}</p> : null}

          <div className="assistant-token-tracker-bars" aria-label="Token usage trend">
            {selectedBuckets.map((bucket) => {
              const width =
                bucket.used_tokens > 0
                  ? `${Math.max(4, Math.round((bucket.used_tokens / maxSelectedTokens) * 100))}%`
                  : '0%'
              return (
                <div
                  key={`${bucket.period}-${bucket.bucket_started_at}`}
                  className="assistant-token-tracker-bar-row"
                >
                  <span>{formatAssistantTokenUsageBucketLabel(bucket, selectedPeriod)}</span>
                  <div className="assistant-token-tracker-bar" aria-hidden="true">
                    <span style={{ width }} />
                  </div>
                  <strong>{formatTokenCount(bucket.used_tokens)}</strong>
                </div>
              )
            })}
          </div>

          <div className="assistant-token-tracker-table-wrap">
            <table className="assistant-token-tracker-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Managed</th>
                  <th scope="col">Default</th>
                </tr>
              </thead>
              <tbody>
                {tableBuckets.map((bucket) => (
                  <tr key={`table-${bucket.period}-${bucket.bucket_started_at}`}>
                    <th scope="row">{formatAssistantTokenUsageBucketLabel(bucket, selectedPeriod)}</th>
                    <td>{formatTokenCount(bucket.used_tokens)}</td>
                    <td>{formatTokenCount(bucket.input_tokens)}</td>
                    <td>{formatTokenCount(bucket.output_tokens)}</td>
                    <td>{formatTokenCount(bucket.recorded_run_count)}</td>
                    <td>{formatTokenCount(bucket.managed_agent_tokens)}</td>
                    <td>{formatTokenCount(bucket.unassigned_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
