import { useEffect, useState } from 'react'

import { listAssistantAgents } from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import { summarizePromptHomeAvailableTokens } from './promptHomeAvailableTokens'

type PromptHomeAvailableTokenBadgeState = {
  value: string
  detail: string
}

const LOADING_STATE: PromptHomeAvailableTokenBadgeState = {
  value: 'Loading...',
  detail: 'Checking published assistant budgets.',
}

export function PromptHomeAvailableTokenBadge() {
  const [summary, setSummary] = useState<PromptHomeAvailableTokenBadgeState>(LOADING_STATE)

  useEffect(() => {
    let cancelled = false

    async function loadAssistantBudgetsForHome() {
      try {
        const payload = await listAssistantAgents(appConfig.apiBase)
        if (cancelled) {
          return
        }

        setSummary(summarizePromptHomeAvailableTokens(payload))
      } catch (error) {
        if (cancelled) {
          return
        }

        setSummary({
          value: 'Unavailable',
          detail: error instanceof Error ? error.message : 'Could not load published assistant budgets.',
        })
      }
    }

    void loadAssistantBudgetsForHome()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="workspace-topbar-token" aria-live="polite">
      <span className="workspace-topbar-token-label">Available Token Count</span>
      <strong>{summary.value}</strong>
      <small>{summary.detail}</small>
    </div>
  )
}
