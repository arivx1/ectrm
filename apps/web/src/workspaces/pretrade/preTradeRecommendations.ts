import type {
  CounterpartyCreditProfileRecord,
  CounterpartyExternalCreditSnapshotRecord,
  MarketContextRecord,
  PositionRow,
  PreTradeScenarioDraft,
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
  checks: PreTradeRecommendationCheck[]
  next_actions: string[]
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
    checks,
    next_actions:
      nextActions.length > 0
        ? nextActions
        : ['No blocking gaps were detected. Hand the scenario into trade capture when the desk is ready.'],
  }
}
