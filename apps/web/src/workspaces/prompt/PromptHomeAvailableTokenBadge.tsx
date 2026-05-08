import { useEffect, useState } from 'react'

import { listAssistantAgents, loadAssistantRuntimeSettings } from '../../entities/assistant/api'
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
      const [runtimeSettingsResult, assistantAgentsResult] = await Promise.allSettled([
        loadAssistantRuntimeSettings(appConfig.apiBase),
        listAssistantAgents(appConfig.apiBase),
      ])
      if (cancelled) {
        return
      }

      const defaultDailyTokenAllocation =
        runtimeSettingsResult.status === 'fulfilled'
          ? runtimeSettingsResult.value.default_daily_token_allocation
          : undefined

      if (assistantAgentsResult.status === 'fulfilled') {
        setSummary(
          summarizePromptHomeAvailableTokens({
            agents: assistantAgentsResult.value,
            defaultDailyTokenAllocation,
          }),
        )
        return
      }

      if (typeof defaultDailyTokenAllocation === 'number') {
        setSummary(
          summarizePromptHomeAvailableTokens({
            agents: [],
            defaultDailyTokenAllocation,
          }),
        )
        return
      }

      setSummary({
        value: 'Unavailable',
        detail:
          assistantAgentsResult.reason instanceof Error
            ? assistantAgentsResult.reason.message
            : 'Could not load published assistant budgets.',
      })
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
