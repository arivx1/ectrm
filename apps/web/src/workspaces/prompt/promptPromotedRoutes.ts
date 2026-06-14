import {
  buildInvoiceIssueCandidateWorkflowHandoff,
  buildTradeAttentionCandidateWorkflowHandoff,
  type CandidateWorkflowHandoff,
} from '../../entities/app/candidateWorkflowHandoffs'
import type {
  InvoiceIssueCandidateRecord,
  TradeAttentionCandidateRecord,
} from '../../entities/app/api'
import {
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
  type PromptNavigationIntent,
} from '../../entities/app/promptNavigationIntent'
import type { AssistantPromptRouteRecommendation } from '../../shared/models'

export type PromptHomePromotedRoute = {
  key: string
  recommendation: AssistantPromptRouteRecommendation
  intent: PromptNavigationIntent
  displayLabel: string
  displayDetail: string
  displayFocusLabel: string | null
  hasFocusedHandoff: boolean
  recordOutcomeOnOpen: boolean
  readiness: 'ready' | 'waiting' | 'cooling_off'
  readinessLabel: string
  readinessTone: 'active' | 'planned' | 'in-progress'
  ageLabel: string | null
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
  now?: Date | string | null
}

export function buildPromptHomePromotedRoutes(
  inputs: PromptHomePromotedRouteInputs,
): PromptHomePromotedRoute[] {
  const generatedAt = coercePromotedRouteDate(inputs.now) ?? new Date()
  return inputs.recommendations
    .map<PromptHomePromotedRoute>((recommendation) => {
    const candidateHandoff = matchingCandidateWorkflowHandoff(recommendation, inputs)
    const requiresLiveMatch = recommendationRequiresLiveMatch(recommendation)
    const ageLabel = promotedRouteAgeLabel(recommendation, generatedAt)

    if (candidateHandoff !== null) {
      const intent = promptIntentFromCandidateWorkflowHandoff(recommendation, candidateHandoff)
      return {
        key: `${recommendation.target_view}:${recommendation.target_label ?? ''}:${recommendation.focus_type ?? 'workspace'}`,
        recommendation,
        intent,
        displayLabel: promptNavigationIntentLabel(intent),
        displayDetail: promptNavigationIntentDetail(intent),
        displayFocusLabel: formatPromotedRouteFocusLabel(intent),
        hasFocusedHandoff: true,
        recordOutcomeOnOpen: true,
        readiness: 'ready' as const,
        readinessLabel: 'Ready',
        readinessTone: 'active' as const,
        ageLabel,
      }
    }

    const fallbackIntent = fallbackWorkspaceIntentFromRecommendation(recommendation)
    if (!requiresLiveMatch) {
      return {
        key: `${recommendation.target_view}:${recommendation.target_label ?? ''}:${recommendation.focus_type ?? 'workspace'}`,
        recommendation,
        intent: fallbackIntent,
        displayLabel: promptNavigationIntentLabel(fallbackIntent),
        displayDetail: promptNavigationIntentDetail(fallbackIntent),
        displayFocusLabel: null,
        hasFocusedHandoff: false,
        recordOutcomeOnOpen: true,
        readiness: 'ready' as const,
        readinessLabel: 'Ready',
        readinessTone: 'active' as const,
        ageLabel,
      }
    }

    const readiness = promotedRouteReadinessWithoutLiveMatch(recommendation, generatedAt)
    const readinessTone: PromptHomePromotedRoute['readinessTone'] =
      readiness === 'cooling_off' ? 'in-progress' : 'planned'
    return {
      key: `${recommendation.target_view}:${recommendation.target_label ?? ''}:${recommendation.focus_type ?? 'workspace'}`,
      recommendation,
      intent: fallbackIntent,
      displayLabel: recommendation.target_label?.trim() || promptNavigationIntentLabel(fallbackIntent),
      displayDetail:
        readiness === 'cooling_off'
          ? 'No current live match has returned for this promoted route recently. It is cooling off until the same pattern shows up again.'
          : 'No current live match is available for this promoted route right now. It will return as soon as the same pattern appears again.',
      displayFocusLabel: null,
      hasFocusedHandoff: false,
      recordOutcomeOnOpen: false,
      readiness,
      readinessLabel: readiness === 'cooling_off' ? 'Cooling off' : 'Not ready right now',
      readinessTone,
      ageLabel,
    }
  })
    .sort((left, right) => comparePromotedRoutes(left, right))
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

function fallbackWorkspaceIntentFromRecommendation(
  recommendation: AssistantPromptRouteRecommendation,
): PromptNavigationIntent {
  return {
    kind: 'open_workspace',
    targetView: recommendation.target_view,
    rationale:
      recommendation.target_rationale ??
      recommendation.signal_reasons[0] ??
      'Repeated accepted Home handoffs made this a proven route.',
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

function formatPromotedRouteFocusLabel(intent: PromptNavigationIntent): string | null {
  if (!intent.focus) {
    return null
  }

  const label = intent.focus.label ?? intent.focus.id
  switch (intent.focus.type) {
    case 'trade':
      return `Trade: ${label}`
    case 'workflow_item':
      return `Workflow item: ${label}`
    case 'invoice':
      return `Invoice: ${label}`
    case 'payment':
      return `Payment: ${label}`
    case 'document':
      return `Document: ${label}`
    case 'reference_record':
      return `Reference: ${label}`
    case 'report':
      return `Report: ${label}`
    default:
      return label
  }
}

function comparePromotedRoutes(
  left: PromptHomePromotedRoute,
  right: PromptHomePromotedRoute,
): number {
  const readinessDelta = promotedRouteReadinessPriority(left.readiness) - promotedRouteReadinessPriority(right.readiness)
  if (readinessDelta !== 0) {
    return readinessDelta
  }

  const rightAcceptedAt = coercePromotedRouteDate(right.recommendation.last_accepted_at)
  const leftAcceptedAt = coercePromotedRouteDate(left.recommendation.last_accepted_at)
  const recencyDelta = (rightAcceptedAt?.getTime() ?? 0) - (leftAcceptedAt?.getTime() ?? 0)
  if (recencyDelta !== 0) {
    return recencyDelta
  }

  const acceptedDelta = right.recommendation.accepted_count - left.recommendation.accepted_count
  if (acceptedDelta !== 0) {
    return acceptedDelta
  }

  return left.displayLabel.localeCompare(right.displayLabel)
}

function promotedRouteReadinessPriority(
  readiness: PromptHomePromotedRoute['readiness'],
): number {
  switch (readiness) {
    case 'ready':
      return 0
    case 'waiting':
      return 1
    case 'cooling_off':
      return 2
    default:
      return 3
  }
}

function promotedRouteReadinessWithoutLiveMatch(
  recommendation: AssistantPromptRouteRecommendation,
  generatedAt: Date,
): 'waiting' | 'cooling_off' {
  const lastAcceptedAt = coercePromotedRouteDate(recommendation.last_accepted_at)
  if (lastAcceptedAt === null) {
    return 'waiting'
  }

  const ageInDays = Math.floor((generatedAt.getTime() - lastAcceptedAt.getTime()) / DAY_IN_MILLISECONDS)
  return ageInDays >= PROMOTED_ROUTE_COOLING_OFF_AFTER_DAYS ? 'cooling_off' : 'waiting'
}

function promotedRouteAgeLabel(
  recommendation: AssistantPromptRouteRecommendation,
  generatedAt: Date,
): string | null {
  const lastAcceptedAt = coercePromotedRouteDate(recommendation.last_accepted_at)
  if (lastAcceptedAt === null) {
    return null
  }

  const ageInDays = Math.max(0, Math.floor((generatedAt.getTime() - lastAcceptedAt.getTime()) / DAY_IN_MILLISECONDS))
  if (ageInDays === 0) {
    return 'Last accepted today.'
  }
  if (ageInDays === 1) {
    return 'Last accepted yesterday.'
  }
  return `Last accepted ${ageInDays} days ago.`
}

function coercePromotedRouteDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000
const PROMOTED_ROUTE_COOLING_OFF_AFTER_DAYS = 7

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
