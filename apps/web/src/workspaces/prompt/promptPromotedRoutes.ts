import {
  buildInvoiceIssueCandidateWorkflowHandoff,
  buildTradeAttentionCandidateWorkflowHandoff,
  type CandidateWorkflowHandoff,
} from '../../entities/app/candidateWorkflowHandoffs'
import type {
  InvoiceIssueCandidateRecord,
  TradeAttentionCandidateRecord,
} from '../../entities/app/api'
import type { PromptNavigationIntent } from '../../entities/app/promptNavigationIntent'
import type { AssistantPromptRouteRecommendation } from '../../shared/models'

export type PromptHomePromotedRoute = {
  key: string
  recommendation: AssistantPromptRouteRecommendation
  intent: PromptNavigationIntent
  hasFocusedHandoff: boolean
}

type CandidateRouteOptionSource = 'trade_attention' | 'invoice_issue'

type CandidateRouteOption = {
  handoff: CandidateWorkflowHandoff
  source: CandidateRouteOptionSource
  index: number
  candidateTypes: string[]
  priorityReason: string | null
}

type PromptHomePromotedRouteInputs = {
  recommendations: AssistantPromptRouteRecommendation[]
  tradeAttentionCandidates?: TradeAttentionCandidateRecord[]
  invoiceIssueCandidates?: InvoiceIssueCandidateRecord[]
}

export function buildPromptHomePromotedRoutes(
  inputs: PromptHomePromotedRouteInputs,
): PromptHomePromotedRoute[] {
  return inputs.recommendations.flatMap((recommendation) => {
    const candidateHandoff = matchingCandidateWorkflowHandoff(recommendation, inputs)
    if (candidateHandoff === null && recommendationRequiresLiveMatch(recommendation)) {
      return []
    }

    const intent = candidateHandoff
      ? promptIntentFromCandidateWorkflowHandoff(recommendation, candidateHandoff)
      : promptIntentFromRecommendation(recommendation)

    return [
      {
        key: `${recommendation.target_view}:${recommendation.target_label ?? ''}:${recommendation.focus_type ?? 'workspace'}`,
        recommendation,
        intent,
        hasFocusedHandoff: candidateHandoff !== null,
      },
    ]
  })
}

function matchingCandidateWorkflowHandoff(
  recommendation: AssistantPromptRouteRecommendation,
  inputs: PromptHomePromotedRouteInputs,
): CandidateWorkflowHandoff | null {
  const options = candidateRouteOptionsForRecommendation(recommendation, inputs)
  if (options.length === 0) {
    return null
  }

  return [...options]
    .sort((left, right) => compareCandidateRouteOptions(left, right, recommendation))
    .at(0)?.handoff ?? null
}

function promptIntentFromRecommendation(
  recommendation: AssistantPromptRouteRecommendation,
): PromptNavigationIntent {
  return {
    kind: 'open_workspace',
    targetView: recommendation.target_view,
    label: recommendation.target_label ?? undefined,
    rationale:
      recommendation.target_rationale ??
      recommendation.signal_reasons[0] ??
      'Repeated accepted Prompt Home handoffs made this a proven route.',
  }
}

function promptIntentFromCandidateWorkflowHandoff(
  recommendation: AssistantPromptRouteRecommendation,
  workflowHandoff: CandidateWorkflowHandoff,
): PromptNavigationIntent {
  return {
    kind: 'open_workspace',
    targetView: workflowHandoff.view,
    label: workflowHandoff.label,
    rationale:
      workflowHandoff.handoff.rationale ??
      recommendation.target_rationale ??
      recommendation.signal_reasons[0] ??
      undefined,
    filter: workflowHandoff.handoff.filter ?? undefined,
    focus: {
      type: workflowHandoff.handoff.focus.type,
      id: workflowHandoff.handoff.focus.id,
      label: workflowHandoff.handoff.focus.label ?? undefined,
    },
    inspectorTab: workflowHandoff.handoff.tradeInspectorTab ?? undefined,
  }
}

function candidateRouteOptionsForRecommendation(
  recommendation: AssistantPromptRouteRecommendation,
  inputs: PromptHomePromotedRouteInputs,
): CandidateRouteOption[] {
  const targetView = recommendation.target_view
  const options: CandidateRouteOption[] = []

  for (const [index, candidate] of (inputs.tradeAttentionCandidates ?? []).entries()) {
    const handoff = buildTradeAttentionCandidateWorkflowHandoff(candidate)
    if (handoff.view !== targetView) {
      continue
    }
    options.push({
      handoff,
      source: 'trade_attention',
      index,
      candidateTypes: candidate.candidate_types,
      priorityReason: candidate.priority_reason,
    })
  }

  if (targetView === 'settlement') {
    for (const [index, candidate] of (inputs.invoiceIssueCandidates ?? []).entries()) {
      const handoff = buildInvoiceIssueCandidateWorkflowHandoff(candidate)
      if (handoff.view !== targetView) {
        continue
      }
      options.push({
        handoff,
        source: 'invoice_issue',
        index,
        candidateTypes: ['invoice_issue'],
        priorityReason: candidate.priority_reason,
      })
    }
  }

  return options
}

function compareCandidateRouteOptions(
  left: CandidateRouteOption,
  right: CandidateRouteOption,
  recommendation: AssistantPromptRouteRecommendation,
): number {
  const cueDelta = candidateCueScore(right, recommendation) - candidateCueScore(left, recommendation)
  if (cueDelta !== 0) {
    return cueDelta
  }

  const urgencyDelta = candidateUrgencyScore(right) - candidateUrgencyScore(left)
  if (urgencyDelta !== 0) {
    return urgencyDelta
  }

  const specificityDelta = candidateSpecificityScore(right) - candidateSpecificityScore(left)
  if (specificityDelta !== 0) {
    return specificityDelta
  }

  const sourceDelta = candidateSourceScore(right) - candidateSourceScore(left)
  if (sourceDelta !== 0) {
    return sourceDelta
  }

  return left.index - right.index
}

function candidateCueScore(
  option: CandidateRouteOption,
  recommendation: AssistantPromptRouteRecommendation,
): number {
  const recommendationText = `${recommendation.target_label ?? ''} ${recommendation.target_rationale ?? ''}`.toLowerCase()
  const recommendationTokens = routeTokens(recommendationText)
  const optionTokens = routeTokens(
    [
      option.handoff.label,
      option.handoff.handoff.rationale ?? '',
      option.priorityReason ?? '',
      option.candidateTypes.join(' '),
    ].join(' '),
  )

  let score = 0
  for (const token of recommendationTokens) {
    if (optionTokens.has(token)) {
      score += 3
    }
  }

  const lowerHandoffLabel = option.handoff.label.toLowerCase()
  const lowerRecommendationLabel = (recommendation.target_label ?? '').trim().toLowerCase()
  if (lowerRecommendationLabel && lowerRecommendationLabel === lowerHandoffLabel) {
    score += 8
  }

  if (
    recommendationHasAny(recommendationText, ['confirm', 'confirmation']) &&
    optionMatchesAnyCandidateType(option, ['confirmation_backlog'])
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['payment', 'cash', 'overdue', 'due']) &&
    optionMatchesAnyCandidateType(option, ['overdue_payment', 'payment_due'])
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['invoice', 'issuance', 'issued', 'ledger']) &&
    (option.source === 'invoice_issue' || optionMatchesAnyCandidateType(option, ['invoice_backlog']))
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['exception', 'dispute']) &&
    optionMatchesAnyCandidateType(option, ['settlement_exception'])
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['pricing', 'price']) &&
    optionMatchesAnyCandidateType(option, ['stale_pricing'])
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['allocation']) &&
    optionMatchesAnyCandidateType(option, ['allocation_backlog'])
  ) {
    score += 8
  }
  if (
    recommendationHasAny(recommendationText, ['nomination']) &&
    optionMatchesAnyCandidateType(option, ['nomination_backlog'])
  ) {
    score += 8
  }

  if (recommendation.focus_type && recommendation.focus_type === option.handoff.handoff.focus.type) {
    score += 4
  }

  return score
}

function candidateUrgencyScore(option: CandidateRouteOption): number {
  return Math.max(
    0,
    ...option.candidateTypes.map((candidateType) => CANDIDATE_TYPE_URGENCY[candidateType] ?? 0),
  )
}

function candidateSpecificityScore(option: CandidateRouteOption): number {
  switch (option.handoff.handoff.focus.type) {
    case 'workflow_item':
    case 'invoice':
    case 'payment':
    case 'document':
    case 'reference_record':
    case 'report':
      return 2
    case 'trade':
    default:
      return 1
  }
}

function candidateSourceScore(option: CandidateRouteOption): number {
  switch (option.source) {
    case 'trade_attention':
      return 2
    case 'invoice_issue':
      return 1
    default:
      return 0
  }
}

function optionMatchesAnyCandidateType(
  option: CandidateRouteOption,
  candidateTypes: string[],
): boolean {
  return candidateTypes.some((candidateType) => option.candidateTypes.includes(candidateType))
}

function recommendationHasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function recommendationRequiresLiveMatch(
  recommendation: AssistantPromptRouteRecommendation,
): boolean {
  return recommendation.focus_type !== null && recommendation.focus_type !== undefined
}

const GENERIC_ROUTE_TOKENS = new Set([
  'open',
  'the',
  'and',
  'for',
  'to',
  'use',
  'this',
  'that',
  'with',
  'from',
  'into',
  'your',
  'route',
  'routes',
  'workspace',
  'workspaces',
  'prompt',
  'home',
  'accepted',
  'handoff',
  'handoffs',
  'repeated',
  'proven',
  'destination',
  'destinations',
  'follow',
  'through',
  'review',
  'queue',
  'trade',
  'trades',
])

const CANDIDATE_TYPE_URGENCY: Record<string, number> = {
  confirmation_backlog: 90,
  nomination_backlog: 82,
  allocation_backlog: 78,
  stale_pricing: 76,
  incomplete_ops_data: 72,
  settlement_exception: 95,
  overdue_payment: 92,
  payment_due: 84,
  pending_settlement: 80,
  invoice_backlog: 74,
  invoice_issue: 68,
}

function routeTokens(value: string): Set<string> {
  const matches = value.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const tokens = new Set<string>()

  for (const match of matches) {
    if (GENERIC_ROUTE_TOKENS.has(match)) {
      continue
    }
    tokens.add(match)
  }

  return tokens
}
