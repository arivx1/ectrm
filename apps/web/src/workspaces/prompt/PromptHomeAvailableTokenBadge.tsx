import { useEffect, useState, type MouseEventHandler } from 'react'

import { loadAssistantTokenUsage } from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import { summarizePromptHomeAvailableTokens } from './promptHomeAvailableTokens'

type PromptHomeAvailableTokenBadgeState = {
  value: string
  detail: string
}

type PromptHomeAvailableTokenBadgeProps = {
  href?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

const LOADING_STATE: PromptHomeAvailableTokenBadgeState = {
  value: 'Loading...',
  detail: 'Checking assistant token usage.',
}

const TOKEN_USAGE_REFRESH_INTERVAL_MS = 15_000
const DEFAULT_TOKEN_TRACKER_HREF = '/?view=token-analysis#assistant-token-tracker'

export function PromptHomeAvailableTokenBadge({
  href = DEFAULT_TOKEN_TRACKER_HREF,
  onClick,
}: PromptHomeAvailableTokenBadgeProps = {}) {
  const [summary, setSummary] = useState<PromptHomeAvailableTokenBadgeState>(LOADING_STATE)

  useEffect(() => {
    let cancelled = false
    let requestInFlight = false

    async function loadAssistantTokenUsageForHome() {
      if (requestInFlight) {
        return
      }

      requestInFlight = true
      try {
        const usage = await loadAssistantTokenUsage(appConfig.apiBase)
        if (cancelled) {
          return
        }
        setSummary(
          summarizePromptHomeAvailableTokens({
            usage,
          }),
        )
        return
      } catch (error) {
        if (cancelled) {
          return
        }
        setSummary({
          value: 'Unavailable',
          detail:
            error instanceof Error
              ? error.message
              : 'Could not load assistant token usage.',
        })
      } finally {
        requestInFlight = false
      }
    }

    void loadAssistantTokenUsageForHome()
    const refreshTimer = window.setInterval(() => {
      void loadAssistantTokenUsageForHome()
    }, TOKEN_USAGE_REFRESH_INTERVAL_MS)

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void loadAssistantTokenUsageForHome()
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
    <a
      className="workspace-topbar-token workspace-topbar-token-link"
      href={href}
      onClick={onClick}
      aria-live="polite"
      aria-label={`Open token tracker. Tokens today: ${summary.value}. ${summary.detail}`}
    >
      <span className="workspace-topbar-token-label">Tokens Today</span>
      <strong>{summary.value}</strong>
      {summary.detail ? <small>{summary.detail}</small> : null}
    </a>
  )
}
