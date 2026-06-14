import type {
  PositionRow,
  PreTradeRecommendationRunRecord,
  PreTradeScenarioDraft,
  PriceIndexObservationRecord,
  Trade,
} from '../../shared/models'

export type RiskPreTradeTriageTone = 'active' | 'in-progress' | 'blocked'

export type RiskPreTradeMarkStatus = 'FRESH' | 'STALE' | 'MISSING' | 'NO_INDEX'

export type RiskPreTradeTriageCandidate = {
  candidateId: string
  scenarioName: string
  title: string
  thesis: string
  draft: PreTradeScenarioDraft
  tone: RiskPreTradeTriageTone
  markStatus: RiskPreTradeMarkStatus
  markStatusLabel: string
  sourcePosition: {
    commodity: string
    commodityClass: string
    netVolume: number
    updatedAt: string
  }
  sourceTradeIds: string[]
  sourceTradeCount: number
  anchorTradeId: string
  latestMark: PriceIndexObservationRecord | null
  readinessReasons: string[]
}

type PositionedRow = PositionRow & { commodity_class?: string }

const LATEST_MARK_STALE_AFTER_HOURS = 48

function normalizeCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? ''
  return normalized.length > 0 ? normalized : null
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function safeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatSignedVolume(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function exposureDirection(netVolume: number): 'long' | 'short' {
  return netVolume >= 0 ? 'long' : 'short'
}

function hedgeSideForNetVolume(netVolume: number): PreTradeScenarioDraft['trade_side'] {
  return netVolume > 0 ? 'SELL' : 'BUY'
}

function markAgeHours(mark: PriceIndexObservationRecord, asOf: Date): number | null {
  const observedAt = Date.parse(mark.observation_date)
  if (!Number.isFinite(observedAt)) {
    return null
  }
  return Math.max(0, (asOf.getTime() - observedAt) / (1000 * 60 * 60))
}

function resolveMarkStatus(
  priceIndexCode: string | null,
  mark: PriceIndexObservationRecord | null,
  asOf: Date,
): RiskPreTradeMarkStatus {
  if (!priceIndexCode) {
    return 'NO_INDEX'
  }
  if (!mark) {
    return 'MISSING'
  }
  const ageHours = markAgeHours(mark, asOf)
  if (ageHours === null || ageHours > LATEST_MARK_STALE_AFTER_HOURS) {
    return 'STALE'
  }
  return 'FRESH'
}

function markStatusLabel(
  status: RiskPreTradeMarkStatus,
  priceIndexCode: string | null,
  mark: PriceIndexObservationRecord | null,
): string {
  switch (status) {
    case 'FRESH':
      return mark
        ? `${priceIndexCode} ${mark.value.toLocaleString(undefined, { maximumFractionDigits: 4 })} on ${mark.observation_date}`
        : 'Fresh mark captured'
    case 'STALE':
      return mark
        ? `${priceIndexCode} mark is stale from ${mark.observation_date}`
        : `${priceIndexCode} mark is stale`
    case 'MISSING':
      return priceIndexCode ? `${priceIndexCode} mark is missing` : 'Price index mark is missing'
    case 'NO_INDEX':
      return 'No floating price index on anchor trade'
  }
}

function markTone(status: RiskPreTradeMarkStatus): RiskPreTradeTriageTone {
  switch (status) {
    case 'FRESH':
    case 'NO_INDEX':
      return 'active'
    case 'STALE':
    case 'MISSING':
      return 'in-progress'
  }
}

function latestMarkForTrade(
  trade: Trade,
  latestMarksByCode: Record<string, PriceIndexObservationRecord>,
): PriceIndexObservationRecord | null {
  const code = normalizeCode(trade.price_index_code)
  return code ? latestMarksByCode[code] ?? null : null
}

function sortTradesByRiskAnchor(left: Trade, right: Trade): number {
  return Math.abs(right.volume ?? 0) - Math.abs(left.volume ?? 0) || right.updated_at.localeCompare(left.updated_at)
}

function relatedLinearTrades(position: PositionedRow, activeTrades: Trade[]): Trade[] {
  const commodityClass = normalizeCode(position.commodity_class)
  const commodity = normalizeCode(position.commodity)
  return activeTrades
    .filter((trade) => {
      if (trade.instrument_type === 'OPTION') {
        return false
      }
      if (normalizeCode(trade.commodity) !== commodity) {
        return false
      }
      if (commodityClass && normalizeCode(trade.commodity_class) !== commodityClass) {
        return false
      }
      return true
    })
    .sort(sortTradesByRiskAnchor)
}

export function buildRiskPreTradeTriageCandidates(args: {
  positions: PositionedRow[]
  activeTrades: Trade[]
  latestMarksByCode: Record<string, PriceIndexObservationRecord>
  asOf?: Date
}): RiskPreTradeTriageCandidate[] {
  const asOf = args.asOf ?? new Date()

  return args.positions
    .filter((position) => Math.abs(position.net_volume) > 0)
    .map((position): RiskPreTradeTriageCandidate | null => {
      const trades = relatedLinearTrades(position, args.activeTrades)
      const anchorTrade = trades[0] ?? null
      if (!anchorTrade) {
        return null
      }

      const priceIndexCode = normalizeCode(anchorTrade.price_index_code)
      const latestMark = latestMarkForTrade(anchorTrade, args.latestMarksByCode)
      const markStatus = resolveMarkStatus(priceIndexCode, latestMark, asOf)
      const draftSide = hedgeSideForNetVolume(position.net_volume)
      const targetVolume = Math.abs(position.net_volume)
      const markLabel = markStatusLabel(markStatus, priceIndexCode, latestMark)
      const commodityClass = normalizeOptionalText(position.commodity_class) ?? anchorTrade.commodity_class
      const scenarioName = `${position.commodity} ${draftSide} risk review`
      const direction = exposureDirection(position.net_volume)
      const draft: PreTradeScenarioDraft = {
        book: anchorTrade.book,
        portfolio: anchorTrade.portfolio,
        counterparty: anchorTrade.counterparty,
        commodity_class: commodityClass,
        commodity: position.commodity,
        trade_side: draftSide,
        pricing_type: anchorTrade.pricing_type || (priceIndexCode ? 'FLOATING' : 'FIXED'),
        price_index_code: priceIndexCode,
        target_price: latestMark?.value ?? anchorTrade.price,
        target_volume: targetVolume,
        trade_currency_code: latestMark?.currency_code ?? anchorTrade.trade_currency_code,
        unit_of_measure: anchorTrade.unit_of_measure,
        price_unit_code: latestMark?.unit_code ?? anchorTrade.price_unit_code ?? anchorTrade.unit_of_measure,
        location_code: anchorTrade.location_code,
        delivery_start: anchorTrade.delivery_start,
        delivery_end: anchorTrade.delivery_end,
      }
      const sourceTradeIds = trades.slice(0, 5).map((trade) => trade.trade_id)

      return {
        candidateId: `risk-triage-${safeSlug(commodityClass)}-${safeSlug(position.commodity)}-${safeSlug(anchorTrade.book)}`,
        scenarioName,
        title: `${draftSide} ${targetVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${position.commodity}`,
        thesis: `Risk triage proposes a review-only ${draftSide} draft to reduce ${direction} ${position.commodity} exposure from ${formatSignedVolume(position.net_volume)} toward flat. Source position updated ${position.updated_at}; anchor trade ${anchorTrade.trade_id} supplies book, tenor, unit, and pricing context.`,
        draft,
        tone: markTone(markStatus),
        markStatus,
        markStatusLabel: markLabel,
        sourcePosition: {
          commodity: position.commodity,
          commodityClass,
          netVolume: position.net_volume,
          updatedAt: position.updated_at,
        },
        sourceTradeIds,
        sourceTradeCount: trades.length,
        anchorTradeId: anchorTrade.trade_id,
        latestMark,
        readinessReasons: [
          `Source position ${position.commodity} is ${formatSignedVolume(position.net_volume)} ${anchorTrade.unit_of_measure ?? 'units'}.`,
          `Anchor trade ${anchorTrade.trade_id} contributes ${anchorTrade.book}, ${anchorTrade.pricing_type}, and ${anchorTrade.delivery_start ?? 'open'} to ${anchorTrade.delivery_end ?? 'open'} tenor evidence.`,
          markLabel,
          'Creating a review stages a pre-trade scenario and recommendation run; it does not book or execute a hedge.',
        ],
      }
    })
    .filter((candidate): candidate is RiskPreTradeTriageCandidate => candidate !== null)
    .sort((left, right) => Math.abs(right.sourcePosition.netVolume) - Math.abs(left.sourcePosition.netVolume))
}

export function buildRiskPreTradeReviewNotes(
  candidate: RiskPreTradeTriageCandidate,
  recommendationRun: PreTradeRecommendationRunRecord | null,
): string {
  const lines = [
    `Risk workspace triage: ${candidate.title}.`,
    candidate.thesis,
    `Source position: ${candidate.sourcePosition.commodity} ${formatSignedVolume(candidate.sourcePosition.netVolume)} updated ${candidate.sourcePosition.updatedAt}.`,
    `Source trades: ${candidate.sourceTradeIds.join(', ')}.`,
    `Latest mark: ${candidate.markStatusLabel}.`,
  ]

  if (recommendationRun) {
    lines.push(
      `Recommendation: ${recommendationRun.recommendation.stance.replaceAll('_', ' ')} | score ${recommendationRun.recommendation.score} | ${recommendationRun.recommendation.headline}.`,
    )
    if (recommendationRun.recommendation.residual_exposure) {
      lines.push(`Residual exposure: ${recommendationRun.recommendation.residual_exposure.detail}`)
    }
    if (recommendationRun.recommendation.hedge_recommendation) {
      lines.push(
        `Hedge draft: ${recommendationRun.recommendation.hedge_recommendation.instrument_type.replaceAll('_', ' ')} - ${recommendationRun.recommendation.hedge_recommendation.rationale}`,
      )
    }
    if (recommendationRun.recommendation.missing_evidence.length > 0) {
      lines.push(
        `Missing evidence: ${recommendationRun.recommendation.missing_evidence
          .map((item) => `${item.severity}: ${item.detail}`)
          .join('; ')}`,
      )
    }
  }

  lines.push('Manual review is required before any trade capture or hedge execution.')
  return lines.join('\n')
}
