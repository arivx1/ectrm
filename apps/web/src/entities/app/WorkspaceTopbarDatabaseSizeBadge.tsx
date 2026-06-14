import { useEffect, useState, useSyncExternalStore } from 'react'

import {
  getApiThroughputSnapshot,
  refreshApiThroughputSnapshot,
  subscribeApiThroughput,
} from '../../shared/apiThroughput'
import { appConfig } from '../../shared/config'
import { formatBytes } from '../../shared/format'
import { loadPublicRuntimeSettings } from './api'

type WorkspaceTopbarDataMetric = {
  key: 'client-db' | 'server-db' | 'data-out' | 'data-in'
  label: string
  value: string
  detail: string
  ariaLabel: string
}

type WorkspaceTopbarDatabaseSizeBadgeState = WorkspaceTopbarDataMetric[]

const DISCONNECTED_BYTE_COUNT = 0
const API_THROUGHPUT_REFRESH_INTERVAL_MS = 1_000

const LOADING_STATE: WorkspaceTopbarDatabaseSizeBadgeState = [
  {
    key: 'client-db',
    label: 'DB Client',
    value: 'Loading...',
    detail: 'Checking database size on client.',
    ariaLabel: 'Client database size',
  },
  {
    key: 'server-db',
    label: 'DB Server',
    value: formatBytes(DISCONNECTED_BYTE_COUNT),
    detail: 'Remote server database size placeholder until the server connection is wired.',
    ariaLabel: 'Server database size',
  },
  {
    key: 'data-out',
    label: 'Data Out',
    value: formatByteRate(DISCONNECTED_BYTE_COUNT),
    detail: 'Rolling outbound API throughput from this client.',
    ariaLabel: 'Data throughput out',
  },
  {
    key: 'data-in',
    label: 'Data In',
    value: formatByteRate(DISCONNECTED_BYTE_COUNT),
    detail: 'Rolling inbound API throughput to this client.',
    ariaLabel: 'Data throughput in',
  },
]

const DATABASE_SIZE_REFRESH_INTERVAL_MS = 60_000

function formatByteRate(bytesPerSecond: number): string {
  return `${formatBytes(Math.max(0, Math.round(bytesPerSecond)))}/s`
}

export function WorkspaceTopbarDatabaseSizeBadge() {
  const [databaseSummary, setDatabaseSummary] = useState<WorkspaceTopbarDatabaseSizeBadgeState>(
    LOADING_STATE.slice(0, 2),
  )
  const apiThroughput = useSyncExternalStore(
    subscribeApiThroughput,
    getApiThroughputSnapshot,
    getApiThroughputSnapshot,
  )

  const throughputWindowSeconds = Math.round(apiThroughput.sampleWindowMs / 1000)
  const summary: WorkspaceTopbarDatabaseSizeBadgeState = [
    ...databaseSummary,
    {
      key: 'data-out',
      label: 'Data Out',
      value: formatByteRate(apiThroughput.bytesOutPerSecond),
      detail: `Rolling outbound API throughput over the last ${throughputWindowSeconds} seconds.`,
      ariaLabel: 'Data throughput out',
    },
    {
      key: 'data-in',
      label: 'Data In',
      value: formatByteRate(apiThroughput.bytesInPerSecond),
      detail: `Rolling inbound API throughput over the last ${throughputWindowSeconds} seconds.`,
      ariaLabel: 'Data throughput in',
    },
  ]

  useEffect(() => {
    const refreshTimer = window.setInterval(refreshApiThroughputSnapshot, API_THROUGHPUT_REFRESH_INTERVAL_MS)
    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let requestInFlight = false

    async function loadDatabaseSize() {
      if (requestInFlight) {
        return
      }

      requestInFlight = true
      try {
        const settings = await loadPublicRuntimeSettings(appConfig.apiBase)
        if (cancelled) {
          return
        }
        setDatabaseSummary([
          {
            key: 'client-db',
            label: 'DB Client',
            value: formatBytes(settings.database.size_bytes),
            detail: `${settings.database.name} · ${settings.database.table_count} local tables`,
            ariaLabel: 'Client database size',
          },
          {
            key: 'server-db',
            label: 'DB Server',
            value: formatBytes(DISCONNECTED_BYTE_COUNT),
            detail: 'Remote server database size placeholder until the server connection is wired.',
            ariaLabel: 'Server database size',
          },
        ])
      } catch (error) {
        if (cancelled) {
          return
        }
        setDatabaseSummary([
          {
            key: 'client-db',
            label: 'DB Client',
            value: 'Unavailable',
            detail: error instanceof Error ? error.message : 'Could not load client database size.',
            ariaLabel: 'Client database size',
          },
          {
            key: 'server-db',
            label: 'DB Server',
            value: formatBytes(DISCONNECTED_BYTE_COUNT),
            detail: 'Remote server database size placeholder until the server connection is wired.',
            ariaLabel: 'Server database size',
          },
        ])
      } finally {
        requestInFlight = false
      }
    }

    void loadDatabaseSize()
    const refreshTimer = window.setInterval(() => {
      void loadDatabaseSize()
    }, DATABASE_SIZE_REFRESH_INTERVAL_MS)

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void loadDatabaseSize()
      }
    }

    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return (
    <div
      className="workspace-topbar-db-size workspace-topbar-data-metrics"
      aria-label={summary.map((metric) => `${metric.ariaLabel} ${metric.value}`).join(', ')}
      aria-live="polite"
    >
      {summary.map((metric) => (
        <div
          key={metric.key}
          className={`workspace-topbar-data-metric workspace-topbar-data-metric-${metric.key}`}
          title={`${metric.ariaLabel}: ${metric.value}. ${metric.detail}`}
        >
          <span className="workspace-topbar-metric-label">{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </div>
      ))}
    </div>
  )
}
