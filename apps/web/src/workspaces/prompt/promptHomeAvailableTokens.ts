import { formatTokenCount } from '../../entities/assistant/budget'
import type { AssistantTokenUsageSummary } from '../../shared/models'

type PromptHomeAvailableTokenSummary = {
  value: string
  detail: string
}

export function summarizePromptHomeAvailableTokens(
  args: {
    usage: AssistantTokenUsageSummary
  },
): PromptHomeAvailableTokenSummary {
  if (args.usage.used_tokens <= 0) {
    return {
      value: formatTokenCount(0),
      detail: '',
    }
  }

  return {
    value: formatTokenCount(args.usage.used_tokens),
    detail: `${formatTokenCount(args.usage.input_tokens)} input / ${formatTokenCount(args.usage.output_tokens)} output across ${formatTokenCount(args.usage.recorded_run_count)} run${args.usage.recorded_run_count === 1 ? '' : 's'}.`,
  }
}
