import type {
  CounterpartyCreditProfileRecord,
  CounterpartyExternalCreditSnapshotRecord,
  MarketContextRecord,
  PositionRow,
  PreTradeHedgeInstrumentType,
  PreTradeMissingEvidenceSeverity,
  PreTradeNettingCandidateMatchQuality,
  PreTradeOpportunityCategory,
  PreTradeScenarioDraft,
  PreTradeRecommendationFreshness,
  PreTradeRecommendationSourceQuality,
  PreTradeRecommendationSourceType,
  PriceIndexObservationRecord,
  Trade,
  WeatherIntelligenceOverviewRecord,
} from '../../shared/models'

export type PreTradeRecommendationStance = 'PROCEED' | 'PROCEED_WITH_CARE' | 'ESCALATE' | 'WAIT_FOR_DATA'
export type PreTradeCheckStatus = 'good' | 'watch' | 'block'

export type PreTradeRecommendationCheck = {
  key: string
  label: string
  status: PreTradeCheckStatus
  detail: string
}

export type PreTradeRecommendationEvidenceRef = {
  source_key: string
  adapter_key: string | null
  adapter_label: string | null
  source_type: PreTradeRecommendationSourceType
  freshness: PreTradeRecommendationFreshness
  quality_status: PreTradeRecommendationSourceQuality
  record_id: string | null
  summary: string | null
}

export type PreTradeRecommendationOpportunitySummary = {
  category: PreTradeOpportunityCategory
  title: string
  detail: string
  driver_keys: string[]
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendationResidualExposure = {
  current_net_position: number | null
  proposed_trade_delta: number | null
  residual_after_trade: number | null
  direction_before: 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN'
  direction_after: 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN'
  exposure_effect: 'OFFSETS' | 'DEEPENS' | 'NEUTRAL' | 'UNKNOWN'
  detail: string
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendationNettingCandidate = {
  candidate_id: string
  label: string
  match_quality: PreTradeNettingCandidateMatchQuality
  matched_quantity: number | null
  residual_quantity: number | null
  constraints: string[]
  rejection_reasons: string[]
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendationHedgeRecommendation = {
  instrument_type: PreTradeHedgeInstrumentType
  rationale: string
  target_delta: number | null
  hedge_ratio: number | null
  policy_stops: string[]
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendationRejectedAlternative = {
  alternative: PreTradeHedgeInstrumentType
  reason: string
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendationMissingEvidence = {
  evidence_key: string
  label: string
  severity: PreTradeMissingEvidenceSeverity
  detail: string
  source_refs: PreTradeRecommendationEvidenceRef[]
}

export type PreTradeRecommendation = {
  stance: PreTradeRecommendationStance
  headline: string
  summary: string
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  estimated_notional: number | null
  projected_credit_utilization_pct: number | null
  current_net_position: number | null
  related_active_trade_count: number
  latest_mark: number | null
  mark_gap_pct: number | null
  explanation: PreTradeRecommendationExplanation
  checks: PreTradeRecommendationCheck[]
  next_actions: string[]
  opportunity_summary: PreTradeRecommendationOpportunitySummary | null
  residual_exposure: PreTradeRecommendationResidualExposure | null
  netting_candidates: PreTradeRecommendationNettingCandidate[]
  hedge_recommendation: PreTradeRecommendationHedgeRecommendation | null
  rejected_alternatives: PreTradeRecommendationRejectedAlternative[]
  missing_evidence: PreTradeRecommendationMissingEvidence[]
}

export type PreTradeRecommendationExplanation = {
  stance_rationale: string
  source_quality_rationale: string
  confidence_rationale: string
  primary_drivers: string[]
  reviewer_focus: string[]
}

type BuildPreTradeRecommendationArgs = {
  draft: PreTradeScenarioDraft
  activeTrades: Trade[]
  positions: Array<PositionRow & { commodity_class?: string }>
  creditProfiles: CounterpartyCreditProfileRecord[]
  externalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  latestMark: PriceIndexObservationRecord | null
  marketContext: MarketContextRecord | null
  weatherOverview: WeatherIntelligenceOverviewRecord | null
}

const STANCE_ORDER: PreTradeRecommendationStance[] = ['PROCEED', 'PROCEED_WITH_CARE', 'ESCALATE', 'WAIT_FOR_DATA']

function maxStance(
  left: PreTradeRecommendationStance,
  right: PreTradeRecommendationStance,
): PreTradeRecommendationStance {
  return STANCE_ORDER.indexOf(right) > STANCE_ORDER.indexOf(left) ? right : left
}

function isBlank(value: string | null | undefined): boolean {
  return (value?.trim() ?? '') === ''
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }
  return (numerator / denominator) * 100
}

function parseIsoDate(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function estimateScenarioNotional(draft: PreTradeScenarioDraft): number | null {
  if (draft.target_price === null || draft.target_volume === null) {
    return null
  }
  return Math.abs(draft.target_price * draft.target_volume)
}

function selectLatestExternalSnapshot(
  snapshots: CounterpartyExternalCreditSnapshotRecord[],
  counterpartyCode: string | null,
): CounterpartyExternalCreditSnapshotRecord | null {
  if (!counterpartyCode) {
    return null
  }

  return snapshots
    .filter((snapshot) => snapshot.counterparty_code === counterpartyCode)
    .sort((left, right) => {
      const leftDate = parseIsoDate(left.as_of_date) ?? 0
      const rightDate = parseIsoDate(right.as_of_date) ?? 0
      return rightDate - leftDate
    })[0] ?? null
}

function bestAvailableMark(
  draft: PreTradeScenarioDraft,
  latestMark: PriceIndexObservationRecord | null,
  marketContext: MarketContextRecord | null,
): number | null {
  if (latestMark) {
    return latestMark.value
  }

  if (!marketContext) {
    return null
  }

  const matchingContextPrice =
    marketContext.price_indices.find((row) => row.price_index_code === draft.price_index_code) ??
    marketContext.price_indices.find((row) => row.commodity_code === draft.commodity)

  return matchingContextPrice?.value ?? null
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value)}%`
}

function liveEvidenceRef(args: {
  sourceKey: string
  label: string
  sourceType: PreTradeRecommendationSourceType
  available: boolean
  summary: string
}): PreTradeRecommendationEvidenceRef {
  return {
    source_key: args.sourceKey,
    adapter_key: args.sourceKey,
    adapter_label: args.label,
    source_type: args.sourceType,
    freshness: args.available ? 'FRESH' : 'UNKNOWN',
    quality_status: args.available ? 'OK' : 'MISSING',
    record_id: null,
    summary: args.summary,
  }
}

function exposureDirection(value: number | null): PreTradeRecommendationResidualExposure['direction_before'] {
  if (value === null) {
    return 'UNKNOWN'
  }
  if (value > 0) {
    return 'LONG'
  }
  if (value < 0) {
    return 'SHORT'
  }
  return 'FLAT'
}

function proposedTradeDelta(draft: PreTradeScenarioDraft): number | null {
  if (draft.target_volume === null) {
    return null
  }
  return draft.trade_side === 'BUY' ? draft.target_volume : -draft.target_volume
}

function exposureEffect(
  currentNetPosition: number | null,
  proposedDelta: number | null,
): PreTradeRecommendationResidualExposure['exposure_effect'] {
  if (currentNetPosition === null || proposedDelta === null) {
    return 'UNKNOWN'
  }
  const before = Math.abs(currentNetPosition)
  const after = Math.abs(currentNetPosition + proposedDelta)
  if (after < before) {
    return 'OFFSETS'
  }
  if (after > before) {
    return 'DEEPENS'
  }
  return 'NEUTRAL'
}

function buildResidualExposure(
  draft: PreTradeScenarioDraft,
  currentNetPosition: number | null,
): PreTradeRecommendationResidualExposure {
  const proposedDelta = proposedTradeDelta(draft)
  const residualAfterTrade =
    currentNetPosition !== null && proposedDelta !== null ? currentNetPosition + proposedDelta : null
  const effect = exposureEffect(currentNetPosition, proposedDelta)
  const detailByEffect: Record<PreTradeRecommendationResidualExposure['exposure_effect'], string> = {
    OFFSETS: 'The proposed trade reduces the absolute open position for the selected commodity.',
    DEEPENS: 'The proposed trade increases the absolute open position for the selected commodity.',
    NEUTRAL: 'The proposed trade leaves the absolute open position broadly unchanged.',
    UNKNOWN: 'Residual exposure cannot be calculated until current position and target size are both available.',
  }

  return {
    current_net_position: currentNetPosition,
    proposed_trade_delta: proposedDelta,
    residual_after_trade: residualAfterTrade,
    direction_before: exposureDirection(currentNetPosition),
    direction_after: exposureDirection(residualAfterTrade),
    exposure_effect: effect,
    detail: detailByEffect[effect],
    source_refs: [
      liveEvidenceRef({
        sourceKey: 'desk-context',
        label: 'Desk exposure context',
        sourceType: 'INTERNAL',
        available: currentNetPosition !== null,
        summary: currentNetPosition === null ? 'Current net position is not loaded.' : 'Current net position is loaded.',
      }),
    ],
  }
}

function buildNettingCandidates(
  draft: PreTradeScenarioDraft,
  residualExposure: PreTradeRecommendationResidualExposure,
): PreTradeRecommendationNettingCandidate[] {
  const current = residualExposure.current_net_position
  const proposed = residualExposure.proposed_trade_delta
  const residual = residualExposure.residual_after_trade
  if (current === null || proposed === null || residual === null) {
    return []
  }

  const constraints = [
    `commodity=${draft.commodity}`,
    `unit=${draft.unit_of_measure ?? 'UNKNOWN'}`,
    `location=${draft.location_code ?? 'UNKNOWN'}`,
  ]
  if (residualExposure.exposure_effect === 'OFFSETS') {
    return [{
      candidate_id: 'current-position-offset',
      label: 'Current net position offset',
      match_quality: residual === 0 ? 'EXACT' : 'PARTIAL',
      matched_quantity: Math.min(Math.abs(current), Math.abs(proposed)),
      residual_quantity: Math.abs(residual),
      constraints,
      rejection_reasons: [],
      source_refs: residualExposure.source_refs,
    }]
  }

  return [{
    candidate_id: 'current-position-offset',
    label: 'Current net position offset',
    match_quality: 'REJECTED',
    matched_quantity: 0,
    residual_quantity: Math.abs(residual),
    constraints,
    rejection_reasons: ['The proposed side does not reduce the current net position.'],
    source_refs: residualExposure.source_refs,
  }]
}

function buildOpportunitySummary(args: {
  stance: PreTradeRecommendationStance
  markGapPct: number | null
  residualExposure: PreTradeRecommendationResidualExposure
  checks: PreTradeRecommendationCheck[]
  sourceRefs: PreTradeRecommendationEvidenceRef[]
}): PreTradeRecommendationOpportunitySummary {
  const driverKeys = args.checks.filter((check) => check.status !== 'good').map((check) => check.key)
  if (args.stance === 'WAIT_FOR_DATA') {
    return {
      category: 'WAIT_FOR_DATA',
      title: 'Wait for required evidence',
      detail: 'Required context or source evidence is missing, so this should not be promoted as an opportunity yet.',
      driver_keys: driverKeys,
      source_refs: args.sourceRefs,
    }
  }
  if (args.markGapPct !== null && args.markGapPct >= 7) {
    return {
      category: 'MARK_GAP',
      title: 'Pricing gap review',
      detail: `Target economics are ${formatPercent(args.markGapPct)} away from the latest available mark.`,
      driver_keys: driverKeys,
      source_refs: args.sourceRefs,
    }
  }
  if (args.residualExposure.exposure_effect === 'OFFSETS') {
    return {
      category: 'EXPOSURE_OFFSET',
      title: 'Exposure offset review',
      detail: 'The draft appears to reduce current net exposure and may be useful for risk reduction.',
      driver_keys: driverKeys,
      source_refs: args.sourceRefs,
    }
  }
  if (args.residualExposure.exposure_effect === 'DEEPENS') {
    return {
      category: 'RISK_INCREASE',
      title: 'Risk-increasing review',
      detail: 'The draft appears to deepen current net exposure, so sizing and hedge intent need review.',
      driver_keys: driverKeys,
      source_refs: args.sourceRefs,
    }
  }
  return {
    category: 'STANDARD_REVIEW',
    title: 'Standard pre-trade review',
    detail: 'No single pricing or exposure driver dominates the recommendation.',
    driver_keys: driverKeys,
    source_refs: args.sourceRefs,
  }
}

function buildHedgeRecommendation(
  draft: PreTradeScenarioDraft,
  stance: PreTradeRecommendationStance,
  residualExposure: PreTradeRecommendationResidualExposure,
  sourceRefs: PreTradeRecommendationEvidenceRef[],
): PreTradeRecommendationHedgeRecommendation {
  const residual = residualExposure.residual_after_trade
  if (stance === 'WAIT_FOR_DATA' || residual === null) {
    return {
      instrument_type: 'WAIT_FOR_DATA',
      rationale: 'Do not select a hedge instrument until residual exposure and required evidence are available.',
      target_delta: null,
      hedge_ratio: null,
      policy_stops: residual === null ? ['Residual exposure is unavailable.'] : [],
      source_refs: sourceRefs,
    }
  }
  if (residual === 0) {
    return {
      instrument_type: 'NO_HEDGE',
      rationale: 'The draft fully offsets the current net position, so no residual hedge delta is suggested.',
      target_delta: 0,
      hedge_ratio: 0,
      policy_stops: [],
      source_refs: residualExposure.source_refs,
    }
  }
  if (draft.pricing_type.toUpperCase() === 'FIXED') {
    return {
      instrument_type: 'FUTURES',
      rationale: 'Review a listed futures hedge for the remaining linear fixed-price delta.',
      target_delta: -residual,
      hedge_ratio: 1,
      policy_stops: [],
      source_refs: sourceRefs,
    }
  }
  return {
    instrument_type: 'SWAP',
    rationale: 'Review an index-linked swap for the remaining floating-price exposure and basis profile.',
    target_delta: -residual,
    hedge_ratio: 1,
    policy_stops: [],
    source_refs: sourceRefs,
  }
}

function buildRejectedAlternatives(
  hedgeRecommendation: PreTradeRecommendationHedgeRecommendation,
  sourceRefs: PreTradeRecommendationEvidenceRef[],
): PreTradeRecommendationRejectedAlternative[] {
  const rejected: PreTradeRecommendationRejectedAlternative[] = []
  if (!['OPTIONS', 'WAIT_FOR_DATA'].includes(hedgeRecommendation.instrument_type)) {
    rejected.push({
      alternative: 'OPTIONS',
      reason: 'No fresh option exposure evidence requires an option hedge in this draft.',
      source_refs: sourceRefs.filter((source) => source.source_key === 'option-exposure'),
    })
  }
  if (!['FUTURES', 'NO_HEDGE', 'WAIT_FOR_DATA'].includes(hedgeRecommendation.instrument_type)) {
    rejected.push({
      alternative: 'FUTURES',
      reason: 'A futures hedge may not match the draft exposure as directly as the selected instrument.',
      source_refs: sourceRefs.filter((source) => source.source_key === 'latest-mark'),
    })
  }
  if (!['PHYSICAL_OFFSET', 'NO_HEDGE', 'WAIT_FOR_DATA'].includes(hedgeRecommendation.instrument_type)) {
    rejected.push({
      alternative: 'PHYSICAL_OFFSET',
      reason: 'No separate physical offset candidate has been validated beyond the draft scenario itself.',
      source_refs: sourceRefs.filter((source) => source.source_key === 'desk-context'),
    })
  }
  return rejected.slice(0, 3)
}

function weatherNeedsCare(overview: WeatherIntelligenceOverviewRecord | null): boolean {
  if (!overview) {
    return false
  }

  return overview.regional_signals.some((signal) =>
    [signal.demand_risk, signal.supply_risk, signal.storm_risk].some((risk) => risk.toUpperCase() === 'HIGH'),
  )
}

function marketFreshnessNeedsCare(marketContext: MarketContextRecord | null): boolean {
  if (!marketContext) {
    return false
  }

  return marketContext.freshness.some(
    (entry) =>
      entry.health_status.toUpperCase() !== 'HEALTHY' ||
      (typeof entry.observation_age_hours === 'number' && entry.observation_age_hours > 24),
  )
}

function buildRecommendationExplanation(args: {
  stance: PreTradeRecommendationStance
  confidence: PreTradeRecommendation['confidence']
  checks: PreTradeRecommendationCheck[]
}): PreTradeRecommendationExplanation {
  const blockingChecks = args.checks.filter((check) => check.status === 'block')
  const watchChecks = args.checks.filter((check) => check.status === 'watch')
  const attentionChecks = blockingChecks.length > 0 ? blockingChecks : watchChecks
  const primaryDrivers =
    attentionChecks.length > 0
      ? attentionChecks.slice(0, 3).map((check) => check.detail)
      : ['All required pricing, credit, and positioning checks are aligned enough for standard controls.']
  const sourceQualityCheck = args.checks.find((check) => check.key === 'source-quality')
  const driverSummary = primaryDrivers[0]
  const stancePrefix: Record<PreTradeRecommendationStance, string> = {
    PROCEED: 'Proceed is supported because',
    PROCEED_WITH_CARE: 'Proceed with care because',
    ESCALATE: 'Escalate because',
    WAIT_FOR_DATA: 'Wait for data because',
  }

  return {
    stance_rationale: `${stancePrefix[args.stance]} ${driverSummary.charAt(0).toLowerCase()}${driverSummary.slice(1)}`,
    source_quality_rationale: sourceQualityCheck?.detail ?? 'Live draft recommendation uses currently loaded workspace evidence.',
    confidence_rationale: `${args.confidence.toLowerCase()} confidence reflects ${blockingChecks.length} blocking check${blockingChecks.length === 1 ? '' : 's'} and ${watchChecks.length} watch check${watchChecks.length === 1 ? '' : 's'}.`,
    primary_drivers: primaryDrivers,
    reviewer_focus: attentionChecks.length > 0
      ? attentionChecks.slice(0, 3).map((check) => check.detail)
      : ['Confirm desk intent, sizing, and standard booking controls before capture.'],
  }
}

export function buildPreTradeRecommendation({
  draft,
  activeTrades,
  positions,
  creditProfiles,
  externalCreditSnapshots,
  latestMark,
  marketContext,
  weatherOverview,
}: BuildPreTradeRecommendationArgs): PreTradeRecommendation {
  const checks: PreTradeRecommendationCheck[] = []
  let stance: PreTradeRecommendationStance = 'PROCEED'

  const relatedTrades = activeTrades.filter(
    (trade) =>
      trade.book === draft.book &&
      trade.commodity_class === draft.commodity_class &&
      trade.commodity === draft.commodity,
  )
  const sameCounterpartyTrades = activeTrades.filter((trade) => trade.counterparty === draft.counterparty)
  const currentNetPosition =
    positions.find((position) => position.commodity === draft.commodity)?.net_volume ?? null
  const estimatedNotional = estimateScenarioNotional(draft)
  const creditProfile =
    creditProfiles.find((profile) => profile.counterparty_code === draft.counterparty) ?? null
  const latestExternalSnapshot = selectLatestExternalSnapshot(externalCreditSnapshots, draft.counterparty)
  const bestMark = bestAvailableMark(draft, latestMark, marketContext)
  const markGapPct =
    bestMark !== null && draft.target_price !== null
      ? safeDivide(Math.abs(draft.target_price - bestMark), Math.abs(bestMark))
      : null

  const currentCounterpartyExposure = sameCounterpartyTrades.reduce(
    (sum, trade) => sum + Math.abs((trade.price ?? 0) * (trade.volume ?? 0)),
    0,
  )
  const projectedCreditUtilizationPct =
    creditProfile?.limit_amount && estimatedNotional !== null
      ? safeDivide(currentCounterpartyExposure + estimatedNotional, creditProfile.limit_amount)
      : null

  if (isBlank(draft.book) || isBlank(draft.commodity_class) || isBlank(draft.commodity) || draft.target_volume === null) {
    stance = maxStance(stance, 'WAIT_FOR_DATA')
    checks.push({
      key: 'required-fields',
      label: 'Required trade context',
      status: 'block',
      detail: 'Book, commodity, and target volume are required before the desk can form a reliable recommendation.',
    })
  } else {
    checks.push({
      key: 'required-fields',
      label: 'Required trade context',
      status: 'good',
      detail: 'Core deal descriptors are present, so downstream checks can be evaluated with live desk context.',
    })
  }

  if (isBlank(draft.counterparty)) {
    stance = maxStance(stance, 'WAIT_FOR_DATA')
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'block',
      detail: 'Counterparty is missing, so credit coverage and exposure concentration cannot be verified yet.',
    })
  } else if (!creditProfile) {
    stance = maxStance(stance, 'ESCALATE')
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'block',
      detail: `No internal credit profile was found for ${draft.counterparty}. Escalate before booking.`,
    })
  } else if (creditProfile.breach_action === 'BLOCK') {
    stance = maxStance(stance, 'ESCALATE')
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'block',
      detail: `${draft.counterparty} is configured to block new activity when credit checks fail.`,
    })
  } else if (
    projectedCreditUtilizationPct !== null &&
    projectedCreditUtilizationPct >= 90
  ) {
    stance = maxStance(stance, 'ESCALATE')
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'block',
      detail: `Projected credit utilization reaches ${formatPercent(projectedCreditUtilizationPct)} of the internal limit.`,
    })
  } else if (
    projectedCreditUtilizationPct !== null &&
    projectedCreditUtilizationPct >= 75
  ) {
    stance = maxStance(stance, 'PROCEED_WITH_CARE')
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'watch',
      detail: `Projected credit utilization reaches ${formatPercent(projectedCreditUtilizationPct)} of the internal limit.`,
    })
  } else {
    const externalRating = latestExternalSnapshot?.rating_value ?? creditProfile.credit_rating ?? 'No rating'
    checks.push({
      key: 'counterparty',
      label: 'Counterparty readiness',
      status: 'good',
      detail: `Internal credit coverage is in place. Latest available rating context: ${externalRating}.`,
    })
  }

  if (draft.pricing_type.toUpperCase() !== 'FIXED' && isBlank(draft.price_index_code)) {
    stance = maxStance(stance, 'WAIT_FOR_DATA')
    checks.push({
      key: 'pricing',
      label: 'Pricing coverage',
      status: 'block',
      detail: 'Floating structures need a price index before the recommendation engine can compare current marks.',
    })
  } else if (bestMark === null) {
    stance = maxStance(stance, 'PROCEED_WITH_CARE')
    checks.push({
      key: 'pricing',
      label: 'Pricing coverage',
      status: 'watch',
      detail: 'No fresh mark was available for the chosen index, so the price view is directional rather than confirmed.',
    })
  } else if (markGapPct !== null && markGapPct >= 15) {
    stance = maxStance(stance, 'ESCALATE')
    checks.push({
      key: 'pricing',
      label: 'Pricing coverage',
      status: 'block',
      detail: `Target pricing is ${formatPercent(markGapPct)} away from the latest available mark.`,
    })
  } else if (markGapPct !== null && markGapPct >= 7) {
    stance = maxStance(stance, 'PROCEED_WITH_CARE')
    checks.push({
      key: 'pricing',
      label: 'Pricing coverage',
      status: 'watch',
      detail: `Target pricing is ${formatPercent(markGapPct)} away from the latest available mark.`,
    })
  } else {
    checks.push({
      key: 'pricing',
      label: 'Pricing coverage',
      status: 'good',
      detail: bestMark === null ? 'Pricing inputs are acceptable.' : 'Target economics are close to current marks.',
    })
  }

  if (marketFreshnessNeedsCare(marketContext) || weatherNeedsCare(weatherOverview)) {
    stance = maxStance(stance, 'PROCEED_WITH_CARE')
    checks.push({
      key: 'external-context',
      label: 'External context',
      status: 'watch',
      detail:
        weatherNeedsCare(weatherOverview)
          ? 'Weather-driven regional risk is elevated for this commodity class.'
          : 'Some external market context is stale or degraded, so conviction should stay measured.',
    })
  } else {
    checks.push({
      key: 'external-context',
      label: 'External context',
      status: 'good',
      detail: 'Market and weather context do not currently add an obvious external blocker.',
    })
  }

  if (currentNetPosition !== null && draft.target_volume !== null) {
    const sameDirection =
      (currentNetPosition >= 0 && draft.trade_side === 'BUY') || (currentNetPosition <= 0 && draft.trade_side === 'SELL')
    if (Math.abs(currentNetPosition) >= draft.target_volume * 3 && sameDirection) {
      stance = maxStance(stance, 'PROCEED_WITH_CARE')
      checks.push({
        key: 'positioning',
        label: 'Positioning impact',
        status: 'watch',
        detail: 'The proposed trade adds to an already concentrated directional position in the same commodity.',
      })
    } else {
      checks.push({
        key: 'positioning',
        label: 'Positioning impact',
        status: 'good',
        detail: 'Current net position does not create an obvious concentration warning for the proposed size.',
      })
    }
  } else {
    checks.push({
      key: 'positioning',
      label: 'Positioning impact',
      status: 'watch',
      detail: 'Position impact is only partially available because net position or target size is missing.',
    })
  }

  const nextActions = checks
    .filter((check) => check.status !== 'good')
    .map((check) => check.detail)
    .slice(0, 3)

  const headlineByStance: Record<PreTradeRecommendationStance, string> = {
    PROCEED: 'Proceed with standard controls.',
    PROCEED_WITH_CARE: 'Proceed, but keep the desk close to pricing and risk drift.',
    ESCALATE: 'Escalate before capture.',
    WAIT_FOR_DATA: 'Wait for missing inputs before recommending action.',
  }

  const summaryByStance: Record<PreTradeRecommendationStance, string> = {
    PROCEED: 'Core trade context, pricing, and credit checks are aligned enough to hand off into capture.',
    PROCEED_WITH_CARE: 'The setup is viable, but one or more checks need tighter operator attention during execution.',
    ESCALATE: 'A material credit or pricing concern needs review before the desk should book the ticket.',
    WAIT_FOR_DATA: 'The recommendation is intentionally blocked until essential trade context is filled in.',
  }

  const watchCount = checks.filter((check) => check.status === 'watch').length
  const blockCount = checks.filter((check) => check.status === 'block').length
  const confidence: PreTradeRecommendation['confidence'] =
    blockCount > 0 ? 'LOW' : watchCount > 1 ? 'MEDIUM' : 'HIGH'
  const explanation = buildRecommendationExplanation({ stance, confidence, checks })
  const sourceRefs: PreTradeRecommendationEvidenceRef[] = [
    liveEvidenceRef({
      sourceKey: 'desk-context',
      label: 'Desk exposure context',
      sourceType: 'INTERNAL',
      available: currentNetPosition !== null,
      summary: currentNetPosition === null ? 'Current net position is not loaded.' : 'Current net position is loaded.',
    }),
    liveEvidenceRef({
      sourceKey: 'latest-mark',
      label: 'Latest price-index mark',
      sourceType: 'EXTERNAL',
      available: bestMark !== null,
      summary: bestMark === null ? 'No current mark is loaded.' : 'A current mark is loaded for comparison.',
    }),
    liveEvidenceRef({
      sourceKey: 'market-context',
      label: 'Market context',
      sourceType: 'EXTERNAL',
      available: marketContext !== null,
      summary: marketContext === null ? 'Market context is not loaded.' : 'Market context is loaded.',
    }),
    liveEvidenceRef({
      sourceKey: 'weather-intelligence',
      label: 'Weather intelligence',
      sourceType: 'EXTERNAL',
      available: weatherOverview !== null,
      summary: weatherOverview === null ? 'Weather intelligence is not loaded.' : 'Weather intelligence is loaded.',
    }),
    liveEvidenceRef({
      sourceKey: 'option-exposure',
      label: 'Option exposure',
      sourceType: 'DERIVED',
      available: false,
      summary: 'Option exposure evidence is not loaded in the local draft helper.',
    }),
  ]
  const residualExposure = buildResidualExposure(draft, currentNetPosition)
  const opportunitySummary = buildOpportunitySummary({
    stance,
    markGapPct,
    residualExposure,
    checks,
    sourceRefs,
  })
  const hedgeRecommendation = buildHedgeRecommendation(draft, stance, residualExposure, sourceRefs)
  const missingEvidence: PreTradeRecommendationMissingEvidence[] = sourceRefs
    .filter((source) => source.quality_status === 'MISSING')
    .map((source) => ({
      evidence_key: source.source_key,
      label: source.adapter_label ?? source.source_key,
      severity:
        source.source_key === 'desk-context' || (source.source_key === 'latest-mark' && draft.pricing_type.toUpperCase() !== 'FIXED')
          ? 'BLOCKING'
          : 'WARNING',
      detail: `${source.adapter_label ?? source.source_key} did not provide usable evidence for this recommendation.`,
      source_refs: [source],
    }))

  return {
    stance,
    headline: headlineByStance[stance],
    summary: summaryByStance[stance],
    confidence,
    estimated_notional: estimatedNotional,
    projected_credit_utilization_pct: projectedCreditUtilizationPct,
    current_net_position: currentNetPosition,
    related_active_trade_count: relatedTrades.length,
    latest_mark: bestMark,
    mark_gap_pct: markGapPct,
    explanation,
    checks,
    next_actions:
      nextActions.length > 0
        ? nextActions
        : ['No blocking gaps were detected. Hand the scenario into trade capture when the desk is ready.'],
    opportunity_summary: opportunitySummary,
    residual_exposure: residualExposure,
    netting_candidates: buildNettingCandidates(draft, residualExposure),
    hedge_recommendation: hedgeRecommendation,
    rejected_alternatives: buildRejectedAlternatives(hedgeRecommendation, sourceRefs),
    missing_evidence: missingEvidence,
  }
}
