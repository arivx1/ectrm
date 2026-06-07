import { useEffect, useState } from 'react'

import { appConfig } from '../../shared/config'
import { formatBytes } from '../../shared/format'
import { loadPublicRuntimeSettings } from './api'

type WorkspaceTopbarDatabaseSizeBadgeState = {
  value: string
  detail: string
}

const LOADING_STATE: WorkspaceTopbarDatabaseSizeBadgeState = {
  value: 'Loading...',
  detail: 'Checking database size.',
}

const DATABASE_SIZE_REFRESH_INTERVAL_MS = 60_000

export function WorkspaceTopbarDatabaseSizeBadge() {
  const [summary, setSummary] = useState<WorkspaceTopbarDatabaseSizeBadgeState>(LOADING_STATE)

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
        setSummary({
          value: formatBytes(settings.database.size_bytes),
          detail: `${settings.database.name} · ${settings.database.table_count} tables`,
        })
      } catch (error) {
        if (cancelled) {
          return
        }
        setSummary({
          value: 'Unavailable',
          detail: error instanceof Error ? error.message : 'Could not load database size.',
        })
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
      className="workspace-topbar-db-size"
      aria-label={`DB Size ${summary.value}`}
      aria-live="polite"
      title={summary.detail ? `DB Size: ${summary.value}. ${summary.detail}` : `DB Size: ${summary.value}`}
    >
      <span className="workspace-topbar-metric-label">DB Size</span>
      <strong>{summary.value}</strong>
      {summary.detail ? <small>{summary.detail}</small> : null}
    </div>
  )
}
