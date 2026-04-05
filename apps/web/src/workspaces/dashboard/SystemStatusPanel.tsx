import { useEffect, useState } from 'react'

import { loadSystemOverview, type SystemOverview } from '../../entities/app/api'
import { appConfig } from '../../shared/config'

type StatusTone = 'active' | 'in-progress' | 'blocked' | 'cancelled'

type BrowserNetworkSnapshot = {
  online: boolean
  downlinkMbps: number | null
  effectiveType: string | null
  transportRttMs: number | null
  apiPingMs: number | null
}

type NetworkInformationLike = {
  downlink?: number
  effectiveType?: string
  rtt?: number
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike
  mozConnection?: NetworkInformationLike
  webkitConnection?: NetworkInformationLike
}

type DependencyHealth = SystemOverview['dependencies'][number]

function getBrowserConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  const networkNavigator = navigator as NavigatorWithConnection
  return networkNavigator.connection ?? networkNavigator.mozConnection ?? networkNavigator.webkitConnection
}

function readBrowserNetworkSnapshot(previousPingMs: number | null): BrowserNetworkSnapshot {
  const connection = getBrowserConnection()

  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    downlinkMbps: typeof connection?.downlink === 'number' ? connection.downlink : null,
    effectiveType: connection?.effectiveType ?? null,
    transportRttMs: typeof connection?.rtt === 'number' ? connection.rtt : null,
    apiPingMs: previousPingMs,
  }
}

function formatInteger(value: number | null | undefined): string {
  return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : '--'
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--'
  }

  if (value < 1024) {
    return `${value} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let normalized = value / 1024
  let unitIndex = 0

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024
    unitIndex += 1
  }

  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDatabaseType(value: string | null | undefined): string {
  if (!value) {
    return '--'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'postgresql') {
    return 'PostgreSQL'
  }
  if (normalized === 'sqlite') {
    return 'SQLite'
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatDownlink(value: number | null): string {
  if (value === null) {
    return 'Estimate unavailable'
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} Mbps`
}

function formatPing(value: number | null): string {
  return value === null ? 'Pending' : `${Math.round(value)} ms`
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number') {
    return '--'
  }

  const totalMinutes = Math.max(0, Math.floor(seconds / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatRelativeTime(value: string | null, emptyLabel = 'Unavailable'): string {
  if (!value) {
    return emptyLabel
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'Unknown'
  }

  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (deltaSeconds < 60) {
    return 'Just now'
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`
  }

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) {
    return `${deltaHours}h ago`
  }

  const deltaDays = Math.floor(deltaHours / 24)
  return `${deltaDays}d ago`
}

function formatWindow(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number') {
    return '--'
  }
  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))}m`
  }
  return `${Math.round(seconds / 3600)}h`
}

function networkTone(snapshot: BrowserNetworkSnapshot): StatusTone {
  if (!snapshot.online) {
    return 'cancelled'
  }
  if (snapshot.apiPingMs !== null && snapshot.apiPingMs > 1200) {
    return 'blocked'
  }
  if (snapshot.apiPingMs !== null && snapshot.apiPingMs > 450) {
    return 'in-progress'
  }
  return 'active'
}

function serverTone(overview: SystemOverview | null, error: string): StatusTone {
  if (error && !overview) {
    return 'cancelled'
  }
  if (!overview) {
    return 'in-progress'
  }
  return overview.server_status === 'ok' && overview.database_status === 'ok' ? 'active' : 'cancelled'
}

function databaseTone(overview: SystemOverview | null, error: string): StatusTone {
  if (error && !overview) {
    return 'cancelled'
  }
  if (!overview) {
    return 'in-progress'
  }
  return overview.database_status === 'ok' ? 'active' : 'cancelled'
}

function usersTone(overview: SystemOverview | null): StatusTone {
  if (!overview) {
    return 'in-progress'
  }
  return overview.active_user_count > 0 ? 'active' : 'blocked'
}

function activityTone(overview: SystemOverview | null): StatusTone {
  if (!overview) {
    return 'in-progress'
  }
  return overview.events_last_hour > 0 ? 'active' : 'blocked'
}

function dependencyTone(dependency: DependencyHealth): StatusTone {
  switch (dependency.health_status) {
    case 'healthy':
      return 'active'
    case 'running':
      return 'in-progress'
    case 'failed':
      return 'cancelled'
    case 'stale':
      return 'blocked'
    default:
      return 'blocked'
  }
}

function dependencyHeadline(dependency: DependencyHealth): string {
  switch (dependency.health_status) {
    case 'healthy':
      return 'Healthy'
    case 'running':
      return 'Running'
    case 'failed':
      return 'Attention'
    case 'stale':
      return 'Stale'
    default:
      return 'Unknown'
  }
}

function dependencySummary(dependency: DependencyHealth): string {
  switch (dependency.health_status) {
    case 'healthy':
      return `Latest successful run is within the ${dependency.success_sla_hours}h freshness target.`
    case 'running':
      return 'A sync is currently running, so dependency status is being refreshed now.'
    case 'failed':
      return dependency.error_summary?.trim() || 'The latest dependency run failed and needs operator attention.'
    case 'stale':
      return `No successful run has landed within the ${dependency.success_sla_hours}h freshness target.`
    default:
      return 'No dependency telemetry has been recorded yet for this feed.'
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="system-status-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function SystemStatusPanel() {
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [network, setNetwork] = useState<BrowserNetworkSnapshot>(() => readBrowserNetworkSnapshot(null))

  useEffect(() => {
    function updateNetworkSnapshot() {
      setNetwork((current) => readBrowserNetworkSnapshot(current.apiPingMs))
    }

    updateNetworkSnapshot()
    window.addEventListener('online', updateNetworkSnapshot)
    window.addEventListener('offline', updateNetworkSnapshot)

    const connection = getBrowserConnection()
    connection?.addEventListener?.('change', updateNetworkSnapshot)

    return () => {
      window.removeEventListener('online', updateNetworkSnapshot)
      window.removeEventListener('offline', updateNetworkSnapshot)
      connection?.removeEventListener?.('change', updateNetworkSnapshot)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function refreshOverview() {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

      try {
        const payload = await loadSystemOverview(appConfig.apiBase)
        const completedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

        if (cancelled) {
          return
        }

        setOverview(payload)
        setError('')
        setLastUpdatedAt(new Date().toISOString())
        setNetwork(readBrowserNetworkSnapshot(completedAt - startedAt))
      } catch (nextError) {
        if (cancelled) {
          return
        }

        setError(nextError instanceof Error ? nextError.message : 'System telemetry is unavailable right now.')
        setNetwork((current) => readBrowserNetworkSnapshot(current.apiPingMs))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    refreshOverview()
    const intervalId = window.setInterval(refreshOverview, 30000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const refreshNote = error
    ? overview
      ? `Showing the last successful snapshot. Refresh issue: ${error}`
      : error
    : lastUpdatedAt
      ? `Auto-refresh every 30 seconds. Last updated ${formatRelativeTime(lastUpdatedAt)}.`
      : 'Fetching live system telemetry.'

  return (
    <article className="surface system-overview-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Operations</span>
          <h3>System Dashboard</h3>
        </div>
        <p>Browser connectivity, API health, database profile, live user presence, and event flow in one operating snapshot.</p>
      </div>

      {loading && !overview ? (
        <div className="skeleton-stack">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : (
        <div className="system-status-grid">
          <article className={`system-status-card tone-${networkTone(network)}`}>
            <div className="system-status-card-head">
              <div>
                <span>Internet Link</span>
                <strong>{network.online ? formatDownlink(network.downlinkMbps) : 'Offline'}</strong>
              </div>
              <span className={`status-pill status-pill-${networkTone(network)}`}>
                {network.online ? 'Connected' : 'Offline'}
              </span>
            </div>
            <p>
              {network.downlinkMbps === null
                ? 'Using browser connectivity hints and API ping because the device does not expose a downlink estimate.'
                : 'Browser-reported downlink estimate paired with the live API round-trip time.'}
            </p>
            <div className="system-status-detail-list">
              <DetailRow label="API ping" value={formatPing(network.apiPingMs)} />
              <DetailRow label="Network type" value={network.effectiveType ?? 'Unknown'} />
              <DetailRow label="Transport RTT" value={formatPing(network.transportRttMs)} />
            </div>
          </article>

          <article className={`system-status-card tone-${serverTone(overview, error)}`}>
            <div className="system-status-card-head">
              <div>
                <span>Server Health</span>
                <strong>{overview?.server_status === 'ok' ? 'Healthy' : overview ? 'Attention' : '--'}</strong>
              </div>
              <span className={`status-pill status-pill-${serverTone(overview, error)}`}>
                {!overview ? 'Loading' : overview.database_status === 'ok' ? 'DB Ready' : 'Check DB'}
              </span>
            </div>
            <p>API uptime and database reachability pulled from the live operations endpoint.</p>
            <div className="system-status-detail-list">
              <DetailRow label="Uptime" value={formatDuration(overview?.uptime_seconds)} />
              <DetailRow label="Database" value={overview?.database_status ?? '--'} />
              <DetailRow
                label="Dependencies"
                value={
                  overview
                    ? `${formatInteger(overview.healthy_dependency_count)}/${formatInteger(overview.dependency_count)} healthy`
                    : '--'
                }
              />
              <DetailRow label="Open trades" value={formatInteger(overview?.open_trade_count)} />
            </div>
          </article>

          <article className={`system-status-card tone-${databaseTone(overview, error)}`}>
            <div className="system-status-card-head">
              <div>
                <span>Database Profile</span>
                <strong>{formatDatabaseType(overview?.database.dialect)}</strong>
              </div>
              <span className={`status-pill status-pill-${databaseTone(overview, error)}`}>
                {!overview ? 'Loading' : overview.database_status === 'ok' ? 'Live DB' : 'Check DB'}
              </span>
            </div>
            <p>Connection metadata and app-table footprint captured from the live database session.</p>
            <div className="system-status-detail-list">
              <DetailRow label="Name" value={overview?.database.name ?? '--'} />
              <DetailRow label="Size" value={formatBytes(overview?.database.size_bytes)} />
              <DetailRow label="App tables" value={formatInteger(overview?.database.table_count)} />
              <DetailRow label="Records" value={formatInteger(overview?.database.record_count)} />
            </div>
          </article>

          <article className={`system-status-card tone-${usersTone(overview)}`}>
            <div className="system-status-card-head">
              <div>
                <span>Users In System</span>
                <strong>{formatInteger(overview?.active_user_count)}</strong>
              </div>
              <span className={`status-pill status-pill-${usersTone(overview)}`}>
                {!overview ? 'Loading' : overview.active_user_count ? 'Live users' : 'No live users'}
              </span>
            </div>
            <p>
              Counts are based on distinct users seen within the last {formatWindow(overview?.presence_window_seconds)} via
              authenticated session heartbeats.
            </p>
            <div className="system-status-detail-list">
              <DetailRow label="Active sessions" value={formatInteger(overview?.active_session_count)} />
              <DetailRow label="Presence window" value={formatWindow(overview?.presence_window_seconds)} />
              <DetailRow label="Registered users" value={formatInteger(overview?.registered_user_count)} />
              <DetailRow label="Active accounts" value={formatInteger(overview?.active_account_count)} />
            </div>
          </article>

          <article className={`system-status-card tone-${activityTone(overview)}`}>
            <div className="system-status-card-head">
              <div>
                <span>Event Flow</span>
                <strong>{formatInteger(overview?.events_last_hour)}</strong>
              </div>
              <span className={`status-pill status-pill-${activityTone(overview)}`}>
                {!overview ? 'Loading' : overview.events_last_hour ? 'Flowing' : 'Quiet'}
              </span>
            </div>
            <p>Recent event traffic gives the dashboard a quick read on whether activity is still moving.</p>
            <div className="system-status-detail-list">
              <DetailRow
                label="Last event"
                value={formatRelativeTime(overview?.last_event_recorded_at ?? null, 'No events recorded')}
              />
              <DetailRow label="Snapshot time" value={formatRelativeTime(overview?.generated_at ?? null)} />
              <DetailRow label="Telemetry" value={overview ? 'Live' : 'Unavailable'} />
            </div>
          </article>
        </div>
      )}

      {overview?.dependencies.length ? (
        <div className="dependency-status-section">
          <div className="system-subhead">
            <div>
              <span className="eyebrow">Dependencies</span>
              <h4>Feed Health</h4>
            </div>
            <p>
              {formatInteger(overview.healthy_dependency_count)} of {formatInteger(overview.dependency_count)} monitored
              feeds are inside their freshness targets.
            </p>
          </div>

          <div className="dependency-status-grid">
            {overview.dependencies.map((dependency) => (
              <article key={dependency.key} className={`system-status-card tone-${dependencyTone(dependency)}`}>
                <div className="system-status-card-head">
                  <div>
                    <span>{dependency.label}</span>
                    <strong>{dependencyHeadline(dependency)}</strong>
                  </div>
                  <span className={`status-pill status-pill-${dependencyTone(dependency)}`}>{dependency.run_status}</span>
                </div>
                <p>{dependencySummary(dependency)}</p>
                <div className="system-status-detail-list">
                  <DetailRow label="Last run" value={formatRelativeTime(dependency.last_run_at)} />
                  <DetailRow label="Last success" value={formatRelativeTime(dependency.last_success_at)} />
                  <DetailRow label="Freshness target" value={`${dependency.success_sla_hours}h`} />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <p className="system-panel-note">{refreshNote}</p>
    </article>
  )
}
