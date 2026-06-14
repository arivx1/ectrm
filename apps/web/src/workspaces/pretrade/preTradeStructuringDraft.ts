import type {
  CounterpartyCreditProfileRecord,
  CounterpartyExternalCreditSnapshotRecord,
  PreTradeRecommendationDraftAnalysisRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeScenarioDraft,
} from '../../shared/models'

type LatestMarkSummary = {
  price_index_code: string | null
  value: number | null
  observation_date: string | null
}

export type PreTradeStructuringDraftContext = {
  scenarioName: string
  thesis: string | null
  draft: PreTradeScenarioDraft
  analysis: PreTradeRecommendationDraftAnalysisRecord | null
  relatedTradeCount: number
  relatedPositionNetVolume: number | null
  latestMark: LatestMarkSummary | null
  counterpartyCreditProfile: CounterpartyCreditProfileRecord | null
  externalCreditSnapshot: CounterpartyExternalCreditSnapshotRecord | null
  weatherHeadline: string | null
}

export type PreTradeStructuringDraftPacket = {
  title: string
  structureSummary: string
  reviewSummary: string
  assumptions: string[]
  sourceContext: string[]
  reviewFocus: string[]
  handoffFields: string[]
  guardrails: string[]
  reviewNotes: string
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function formatNumber(value: number | null | undefined, digits = 0): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatListItem(label: string, value: string | null | undefined): string | null {
  const normalizedValue = normalizeOptionalText(value)
  return normalizedValue ? `${label}: ${normalizedValue}` : null
}

function compactLines(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value))
}

function defaultScenarioTitle(draft: PreTradeScenarioDraft): string {
  return `${draft.book || 'Desk'} ${draft.commodity || 'trade'} ${draft.trade_side.toLowerCase()}`
}

function summarizeStructure(draft: PreTradeScenarioDraft): string {
  const priceSummary =
    draft.target_price === null || draft.target_price === undefined
      ? null
      : `${draft.target_price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}${draft.price_unit_code ? ` ${draft.price_unit_code}` : ''}`
  const volumeSummary = formatNumber(draft.target_volume)
  return compactLines([
    `${draft.trade_side} ${volumeSummary ? `${volumeSummary} ` : ''}${draft.commodity}`.trim(),
    draft.book ? `book ${draft.book}` : null,
    draft.portfolio ? `portfolio ${draft.portfolio}` : null,
    draft.counterparty ? `counterparty ${draft.counterparty}` : null,
    draft.pricing_type ? `${draft.pricing_type.toLowerCase()} pricing` : null,
    draft.price_index_code ? `index ${draft.price_index_code}` : null,
    priceSummary ? `indicative ${priceSummary}` : null,
    draft.location_code ? `location ${draft.location_code}` : null,
    draft.delivery_start || draft.delivery_end
      ? `delivery ${draft.delivery_start ?? 'open'} to ${draft.delivery_end ?? 'open'}`
      : null,
  ]).join(' | ')
}

function buildReviewSummary(context: PreTradeStructuringDraftContext): string {
  const recommendation = context.analysis?.recommendation ?? null
  if (!recommendation) {
    return 'Deterministic draft analysis is still pending. Review the scenario fields, evidence freshness, and manual capture assumptions before submission.'
  }
  return [
    recommendation.stance.replaceAll('_', ' '),
    `confidence ${recommendation.confidence}`,
    `score ${recommendation.score}`,
    recommendation.headline,
  ].join(' | ')
}

function buildAssumptions(context: PreTradeStructuringDraftContext): string[] {
  const recommendation = context.analysis?.recommendation ?? null
  const latestMark = context.latestMark
  const arbitrageCandidate = recommendation?.arbitrage_candidate ?? null
  return compactLines([
    typeof context.relatedPositionNetVolume === 'number'
      ? `Current net position in this commodity lane is ${formatNumber(context.relatedPositionNetVolume)} before the proposed draft.`
      : null,
    context.relatedTradeCount > 0
      ? `${context.relatedTradeCount} related active trade${context.relatedTradeCount === 1 ? '' : 's'} are already loaded for this commodity.`
      : 'No related active trades are currently loaded for this commodity.',
    latestMark?.value !== null && latestMark?.value !== undefined
      ? `Latest mark ${latestMark.price_index_code ?? 'n/a'} is ${formatNumber(latestMark.value, 2)}${latestMark.observation_date ? ` observed ${latestMark.observation_date}` : ''}.`
      : null,
    context.counterpartyCreditProfile
      ? `Counterparty credit is loaded at ${context.counterpartyCreditProfile.credit_rating ?? 'unrated'}${context.counterpartyCreditProfile.review_due_at ? ` with review due ${context.counterpartyCreditProfile.review_due_at}` : ''}.`
      : context.draft.counterparty
        ? `No internal credit profile is currently loaded for ${context.draft.counterparty}.`
        : null,
    context.externalCreditSnapshot
      ? `External credit snapshot from ${context.externalCreditSnapshot.provider} shows ${context.externalCreditSnapshot.rating_value ?? 'no rating'} as of ${context.externalCreditSnapshot.as_of_date}.`
      : null,
    context.weatherHeadline ? `Weather signal: ${context.weatherHeadline}` : null,
    recommendation?.hedge_recommendation
      ? `If the desk continues, the hedge draft is ${recommendation.hedge_recommendation.instrument_type.replaceAll('_', ' ')}.`
      : null,
    arbitrageCandidate
      ? `Arbitrage ${arbitrageCandidate.family.replaceAll('_', ' ').toLowerCase()} candidate is ${arbitrageCandidate.status.toLowerCase()} with gross spread ${formatNumber(arbitrageCandidate.gross_spread, 2) ?? 'n/a'}, bridge cost ${formatNumber(arbitrageCandidate.bridge_cost, 2) ?? 'n/a'}, and net ${formatNumber(arbitrageCandidate.net_opportunity, 2) ?? 'n/a'}.`
      : null,
  ]).slice(0, 6)
}

function sourceContextLine(snapshot: PreTradeRecommendationSourceSnapshotRecord): string {
  const label = snapshot.adapter_label ?? snapshot.adapter_key ?? snapshot.source_key
  const summary = normalizeOptionalText(snapshot.summary) ?? 'No source summary was captured.'
  return `${label}: ${summary} (${snapshot.quality_status.toLowerCase()}, ${snapshot.freshness.toLowerCase()})`
}

function buildSourceContext(context: PreTradeStructuringDraftContext): string[] {
  const snapshots = context.analysis?.input_snapshots ?? []
  if (snapshots.length > 0) {
    return snapshots.slice(0, 5).map(sourceContextLine)
  }
  const fallbackLines = compactLines([
    context.latestMark?.value !== null && context.latestMark?.value !== undefined
      ? `Latest market mark is available for ${context.latestMark.price_index_code ?? context.draft.commodity}.`
      : null,
    context.counterpartyCreditProfile ? 'Internal credit profile is loaded.' : null,
    context.externalCreditSnapshot ? 'External credit snapshot is loaded.' : null,
    context.weatherHeadline ? `Weather intelligence is loaded: ${context.weatherHeadline}` : null,
    context.relatedTradeCount > 0 ? 'Related trade context is loaded.' : null,
  ])
  return fallbackLines.length > 0 ? fallbackLines : ['No structured source context has been captured yet.']
}

function buildReviewFocus(context: PreTradeStructuringDraftContext): string[] {
  const recommendation = context.analysis?.recommendation ?? null
  if (!recommendation) {
    return [
      'Confirm the structure, pricing basis, and delivery window before promoting this draft into shared review.',
      'Use Save Run or Submit For Review only when the desk is ready to preserve provenance.',
    ]
  }
  const focus = compactLines([
    ...recommendation.explanation.reviewer_focus,
    ...recommendation.next_actions,
    ...(recommendation.arbitrage_candidate?.missing_evidence ?? []),
    ...(recommendation.arbitrage_candidate?.stop_reasons ?? []),
    ...recommendation.missing_evidence.slice(0, 3).map((item) => `${item.severity}: ${item.detail}`),
  ])
  return focus.length > 0 ? focus.slice(0, 6) : ['Review the scenario details and supporting evidence before any capture handoff.']
}

function buildHandoffFields(draft: PreTradeScenarioDraft): string[] {
  return compactLines([
    formatListItem('Book', draft.book),
    formatListItem('Portfolio', draft.portfolio),
    formatListItem('Counterparty', draft.counterparty),
    formatListItem('Commodity class', draft.commodity_class),
    formatListItem('Commodity', draft.commodity),
    formatListItem('Trade side', draft.trade_side),
    formatListItem('Pricing type', draft.pricing_type),
    formatListItem('Price index', draft.price_index_code),
    draft.target_price !== null && draft.target_price !== undefined
      ? `Indicative price: ${draft.target_price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}`
      : null,
    draft.target_volume !== null && draft.target_volume !== undefined
      ? `Target volume: ${formatNumber(draft.target_volume)}`
      : null,
    formatListItem('Trade currency', draft.trade_currency_code),
    formatListItem('Unit', draft.unit_of_measure),
    formatListItem('Price unit', draft.price_unit_code),
    formatListItem('Location', draft.location_code),
    draft.delivery_start || draft.delivery_end
      ? `Delivery window: ${draft.delivery_start ?? 'open'} to ${draft.delivery_end ?? 'open'}`
      : null,
  ])
}

function trimReviewNotes(value: string): string {
  return value.length <= 4000 ? value : `${value.slice(0, 3997)}...`
}

export function buildPreTradeStructuringDraftPacket(
  context: PreTradeStructuringDraftContext,
): PreTradeStructuringDraftPacket {
  const title = normalizeOptionalText(context.scenarioName) ?? defaultScenarioTitle(context.draft)
  const structureSummary = summarizeStructure(context.draft)
  const reviewSummary = buildReviewSummary(context)
  const assumptions = buildAssumptions(context)
  const sourceContext = buildSourceContext(context)
  const reviewFocus = buildReviewFocus(context)
  const handoffFields = buildHandoffFields(context.draft)
  const recommendation = context.analysis?.recommendation ?? null
  const rationale = recommendation?.explanation.stance_rationale ?? null
  const comparisonSummary = context.analysis?.comparison?.summary ?? null
  const guardrails = [
    'Submitting for review stages a shared review item only; it does not book a trade.',
    'Opening Trade Capture from this workspace opens a manual draft form for a human to finish.',
    'Recommendation runs preserve provenance, but they are not booking approvals on their own.',
  ]

  const reviewNotes = trimReviewNotes(
    compactLines([
      'Structuring draft prepared for shared pre-trade review.',
      `Scenario: ${title}`,
      `Structure: ${structureSummary}`,
      context.thesis ? `Thesis: ${context.thesis}` : null,
      `Recommendation: ${reviewSummary}`,
      rationale ? `Rationale: ${rationale}` : null,
      comparisonSummary ? `Latest comparison: ${comparisonSummary}` : null,
      'Working assumptions:',
      ...(assumptions.length > 0 ? assumptions : ['Review the scenario inputs manually; deterministic assumptions are not available yet.']).map(
        (line) => `- ${line}`,
      ),
      'Source context:',
      ...(sourceContext.length > 0 ? sourceContext : ['No structured source context has been captured yet.']).map(
        (line) => `- ${line}`,
      ),
      'Review focus:',
      ...reviewFocus.map((line) => `- ${line}`),
      'Trade capture handoff fields:',
      ...handoffFields.map((line) => `- ${line}`),
      'Guardrails:',
      ...guardrails.map((line) => `- ${line}`),
    ]).join('\n'),
  )

  return {
    title,
    structureSummary,
    reviewSummary,
    assumptions,
    sourceContext,
    reviewFocus,
    handoffFields,
    guardrails,
    reviewNotes,
  }
}
