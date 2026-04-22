import type { AssistantAgent, AssistantAgentTokenBudget } from '../../shared/models'

const TOKEN_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

export function formatTokenCount(value: number): string {
  return TOKEN_FORMATTER.format(value)
}

export function assistantBudgetSignalLabel(budget: AssistantAgentTokenBudget | undefined): string {
  if (!budget) {
    return 'Budget pending'
  }
  if (budget.status === 'RED') {
    return 'IN THE RED'
  }
  if (budget.status === 'AMBER') {
    return 'BUDGET WATCH'
  }
  return 'IN THE GREEN'
}

export function assistantBudgetSignalClass(budget: AssistantAgentTokenBudget | undefined): string {
  if (!budget) {
    return 'is-pending'
  }
  if (budget.status === 'RED') {
    return 'is-red'
  }
  if (budget.status === 'AMBER') {
    return 'is-amber'
  }
  return 'is-green'
}

export function isAgentBudgetDepleted(agent: AssistantAgent | null | undefined): boolean {
  return agent?.token_budget?.status === 'RED'
}

export function isAgentBudgetNearLimit(agent: AssistantAgent | null | undefined): boolean {
  return agent?.token_budget?.status === 'AMBER'
}

export function formatBudgetPercent(budget: AssistantAgentTokenBudget | undefined): string {
  if (!budget) {
    return '0%'
  }
  return `${budget.percent_used.toFixed(budget.percent_used % 1 === 0 ? 0 : 1)}%`
}

export function budgetMeterWidth(budget: AssistantAgentTokenBudget | undefined): string {
  if (!budget) {
    return '0%'
  }
  return `${Math.max(0, Math.min(100, budget.percent_used))}%`
}

export function describeAssistantTokenBudget(
  budget: AssistantAgentTokenBudget | undefined,
): string {
  if (!budget) {
    return 'Token allocation has not been reported yet.'
  }

  const allocation = formatTokenCount(budget.allocated_tokens)
  const used = formatTokenCount(budget.used_tokens)
  const remaining = formatTokenCount(budget.remaining_tokens)
  const reset = formatBudgetReset(budget.reset_at)
  const source = budget.allocation_source === 'AGENT' ? 'agent cap' : 'default cap'

  if (budget.status === 'RED') {
    return `No token allocation remains today. ${used} of ${allocation} tokens used from the ${source}; resets ${reset}.`
  }

  if (budget.status === 'AMBER') {
    return `${remaining} tokens left today. ${used} of ${allocation} used from the ${source}; resets ${reset}.`
  }

  return `${remaining} tokens left today. ${used} of ${allocation} used from the ${source}; resets ${reset}.`
}

export function formatBudgetReset(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}
