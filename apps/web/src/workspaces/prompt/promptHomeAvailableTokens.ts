import { formatTokenCount } from '../../entities/assistant/budget'
import type { AssistantAgent } from '../../shared/models'

type PromptHomeAvailableTokenSummary = {
  value: string
  detail: string
}

export function summarizePromptHomeAvailableTokens(
  agents: AssistantAgent[],
): PromptHomeAvailableTokenSummary {
  const assistantScopedAgents = agents.filter((agent) => agent.allowed_workspaces.includes('assistant'))
  if (assistantScopedAgents.length === 0) {
    return {
      value: 'Not tracked',
      detail: 'No published assistant budget is currently available on Home.',
    }
  }

  if (assistantScopedAgents.length === 1) {
    const [agent] = assistantScopedAgents
    return {
      value: formatTokenCount(agent.token_budget?.remaining_tokens ?? 0),
      detail: `${agent.name} remaining today.`,
    }
  }

  return {
    value: formatTokenCount(
      assistantScopedAgents.reduce((total, agent) => total + (agent.token_budget?.remaining_tokens ?? 0), 0),
    ),
    detail: `Combined across ${assistantScopedAgents.length} published assistant budgets.`,
  }
}
