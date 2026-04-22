import { useEffect, useMemo, useState } from 'react'

import { loadMarketContext } from '../../entities/market-data/api'
import { useLatestPriceIndexMarks } from '../../entities/market-data/useLatestPriceIndexMarks'
import {
  createPreTradeRecommendationRun,
  createPreTradeReviewActivity,
  createPreTradeReviewItem,
  createPreTradeScenario,
  deletePreTradeScenario,
  loadPreTradeGovernanceItems,
  loadPreTradeGovernanceSummary,
  loadPreTradeRecommendationRuns,
  loadPreTradeReviewItems,
  loadPreTradeScenarios,
  updatePreTradeReviewItem,
  updatePreTradeScenario,
} from '../../entities/pretrade/api'
import { loadWeatherIntelligenceOverview } from '../../entities/weather/api'
import { appConfig } from '../../shared/config'
import type {
  CounterpartyCreditProfileRecord,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyRecord,
  CurrencyRecord,
  LocationRecord,
  MarketContextRecord,
  PortfolioRecord,
  PositionRow,
  PreTradeGovernanceItemsRecord,
  PreTradeGovernanceSummaryRecord,
  PreTradeRecommendationStance,
  PreTradeRecommendationRunRecord,
  PreTradeRecommendationSourceSnapshotRecord,
  PreTradeReviewCaptureContext,
  PreTradeReviewItemRecord,
  PreTradeReviewStatus,
  PreTradeScenarioDraft,
  PreTradeScenarioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  UnitRecord,
  WeatherIntelligenceOverviewRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { TileLayout, type WorkspaceTile } from '../../shared/ui/TileLayout'
import { buildPreTradeRecommendation } from './preTradeRecommendations'

type PositionedRow = PositionRow & { commodity_class?: string }
type GovernanceBucketKey = 'pending' | 'risky' | 'overrides' | 'stale-evidence' | 'booked-with-override'

const GOVERNANCE_BUCKET_LABELS: Record<GovernanceBucketKey, string> = {
  pending: 'Pending Reviews',
  risky: 'Risky Recommendations',
  overrides: 'Overrides',
  'stale-evidence': 'Stale Evidence',
  'booked-with-override': 'Booked With Override',
}

type PreTradeWorkspaceProps = {
  authSession: StoredAuthSession | null
  activeBooks: ReferenceRecord[]
  activeCommodities: ReferenceRecord[]
  activeCounterparties: CounterpartyRecord[]
  activeCurrencies: CurrencyRecord[]
  activeLocations: LocationRecord[]
  activePortfolios: PortfolioRecord[]
  activeTrades: Trade[]
  activeUnits: UnitRecord[]
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  onOpenTradeCapture: (draft: PreTradeScenarioDraft, reviewContext?: PreTradeReviewCaptureContext | null) => void
  onOpenTrade: (tradeId: string) => void
  positionsWithClass: PositionedRow[]
  priceIndices: PriceIndexRecord[]
  pricingTypeOptions: readonly string[]
}

function uniqueCommodityClasses(activeCommodities: ReferenceRecord[]): string[] {
  return Array.from(
    new Set(
      activeCommodities
        .map((commodity) => commodity.commodity_class?.trim() ?? '')
        .filter((commodityClass) => commodityClass.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

function createEmptyDraft(args: {
  activeBooks: ReferenceRecord[]
  activeCommodities: ReferenceRecord[]
  activeCounterparties: CounterpartyRecord[]
  activeCurrencies: CurrencyRecord[]
  activeLocations: LocationRecord[]
  activePortfolios: PortfolioRecord[]
  activeUnits: UnitRecord[]
  priceIndices: PriceIndexRecord[]
  pricingTypeOptions: readonly string[]
}): PreTradeScenarioDraft {
  const commodityClassOptions = uniqueCommodityClasses(args.activeCommodities)
  const commodityClass = commodityClassOptions[0] ?? ''
  const commodityOptions = args.activeCommodities.filter((commodity) => commodity.commodity_class === commodityClass)
  const commodity = commodityOptions[0]?.code ?? ''
  const book = args.activeBooks[0]?.code ?? ''
  const pricingType = args.pricingTypeOptions.find((value) => value.toUpperCase() === 'FLOATING') ?? args.pricingTypeOptions[0] ?? 'FIXED'
  const priceIndex = args.priceIndices.find((row) => row.commodity_code === commodity)?.code ?? null
  const portfolio = args.activePortfolios.find((row) => row.book_code === book)?.code ?? null
  const unit = args.activeUnits.find((row) => !row.commodity_class || row.commodity_class === commodityClass)?.code ?? null
  const currency = args.activeCurrencies[0]?.code ?? null
  const location = args.activeLocations[0]?.code ?? null

  return {
    book,
    portfolio,
    counterparty: null,
    commodity_class: commodityClass,
    commodity,
    trade_side: 'BUY',
    pricing_type: pricingType,
    price_index_code: pricingType.toUpperCase() === 'FIXED' ? null : priceIndex,
    target_price: null,
    target_volume: null,
    trade_currency_code: currency,
    unit_of_measure: unit,
    price_unit_code: unit,
    location_code: location,
    delivery_start: null,
    delivery_end: null,
  }
}

function normalizeScenarioDraft(
  draft: PreTradeScenarioDraft,
  args: Parameters<typeof createEmptyDraft>[0],
): PreTradeScenarioDraft {
  const defaults = createEmptyDraft(args)
  const commodityClassOptions = uniqueCommodityClasses(args.activeCommodities)
  const commodityClass = commodityClassOptions.includes(draft.commodity_class) ? draft.commodity_class : defaults.commodity_class
  const commodityOptions = args.activeCommodities.filter((commodity) => commodity.commodity_class === commodityClass)
  const commodity = commodityOptions.some((row) => row.code === draft.commodity) ? draft.commodity : (commodityOptions[0]?.code ?? defaults.commodity)
  const book = args.activeBooks.some((row) => row.code === draft.book) ? draft.book : defaults.book
  const portfolioOptions = args.activePortfolios.filter((row) => row.book_code === book)
  const portfolio =
    draft.portfolio && portfolioOptions.some((row) => row.code === draft.portfolio)
      ? draft.portfolio
      : (portfolioOptions[0]?.code ?? null)
  const priceIndexOptions = args.priceIndices.filter((row) => row.commodity_code === commodity)
  const normalizedPricingType = draft.pricing_type || defaults.pricing_type
  const priceIndexCode =
    normalizedPricingType.toUpperCase() === 'FIXED'
      ? null
      : draft.price_index_code && priceIndexOptions.some((row) => row.code === draft.price_index_code)
        ? draft.price_index_code
        : (priceIndexOptions[0]?.code ?? null)
  const unitOptions = args.activeUnits.filter((row) => !row.commodity_class || row.commodity_class === commodityClass)
  const unitOfMeasure =
    draft.unit_of_measure && unitOptions.some((row) => row.code === draft.unit_of_measure)
      ? draft.unit_of_measure
      : (unitOptions[0]?.code ?? null)

  return {
    ...draft,
    book,
    portfolio,
    commodity_class: commodityClass,
    commodity,
    pricing_type: normalizedPricingType,
    price_index_code: priceIndexCode,
    trade_currency_code:
      draft.trade_currency_code && args.activeCurrencies.some((row) => row.code === draft.trade_currency_code)
        ? draft.trade_currency_code
        : defaults.trade_currency_code,
    unit_of_measure: unitOfMeasure,
    price_unit_code:
      draft.price_unit_code && unitOptions.some((row) => row.code === draft.price_unit_code)
        ? draft.price_unit_code
        : unitOfMeasure,
    location_code:
      draft.location_code && args.activeLocations.some((row) => row.code === draft.location_code)
        ? draft.location_code
        : defaults.location_code,
    counterparty:
      draft.counterparty && args.activeCounterparties.some((row) => row.code === draft.counterparty)
        ? draft.counterparty
        : null,
  }
}

function buildScenarioTitle(draft: PreTradeScenarioDraft): string {
  const commodity = draft.commodity || 'trade'
  return `${draft.book || 'desk'} ${commodity} ${draft.trade_side.toLowerCase()}`
}

function buildApprovedReviewCaptureContext(review: PreTradeReviewItemRecord): PreTradeReviewCaptureContext {
  return {
    reviewId: review.review_id,
    reviewName: review.name,
    reviewThesis: review.thesis,
    reviewNotes: review.review_notes,
    reviewOwner: review.owner,
    sourceScenarioId: review.source_scenario_id,
    recommendationRunId: review.recommendation_run_id,
    recommendationHeadline: review.recommendation_summary?.headline ?? null,
    recommendationStance: review.recommendation_summary?.stance ?? null,
    recommendationScore: review.recommendation_summary?.score ?? null,
    recommendationRationale: review.recommendation_summary?.explanation?.stance_rationale ?? null,
    recommendationOverrideReason: review.recommendation_override_reason,
    recommendationOverrideBy: review.recommendation_override_by,
    recommendationOverrideAt: review.recommendation_override_at,
    approvedBy: review.updated_by,
    approvedAt: review.updated_at,
  }
}

function reviewStatusTone(status: PreTradeReviewStatus): 'active' | 'in-progress' | 'blocked' {
  switch (status) {
    case 'APPROVED':
      return 'active'
    case 'IN_REVIEW':
      return 'in-progress'
    case 'OPEN':
    case 'REJECTED':
      return 'blocked'
  }
}

function recommendationTone(stance: ReturnType<typeof buildPreTradeRecommendation>['stance']): 'active' | 'in-progress' | 'blocked' {
  switch (stance) {
    case 'PROCEED':
      return 'active'
    case 'PROCEED_WITH_CARE':
      return 'in-progress'
    case 'ESCALATE':
    case 'WAIT_FOR_DATA':
      return 'blocked'
  }
}

function governanceTone(status: PreTradeGovernanceSummaryRecord['risk_status'] | null | undefined): 'active' | 'in-progress' | 'blocked' {
  switch (status) {
    case 'CLEAR':
      return 'active'
    case 'WATCH':
      return 'in-progress'
    case 'ACTION_REQUIRED':
    default:
      return 'blocked'
  }
}

function governanceStatusLabel(status: PreTradeGovernanceSummaryRecord['risk_status'] | null | undefined): string {
  switch (status) {
    case 'CLEAR':
      return 'Clear'
    case 'WATCH':
      return 'Watch'
    case 'ACTION_REQUIRED':
      return 'Action Required'
    default:
      return 'Not Loaded'
  }
}

function recommendationRequiresOverride(stance: PreTradeRecommendationStance | null | undefined): boolean {
  return stance === 'ESCALATE' || stance === 'WAIT_FOR_DATA'
}

function reviewActivityLabel(action: string): string {
  return action.replaceAll('_', ' ').toLowerCase()
}

function countMarketFreshnessIssues(marketContext: MarketContextRecord | null): number {
  return (
    marketContext?.freshness.filter(
      (entry) =>
        entry.health_status.toUpperCase() !== 'HEALTHY' ||
        (typeof entry.observation_age_hours === 'number' && entry.observation_age_hours > 24),
    ).length ?? 0
  )
}

function countHighWeatherRisks(weatherOverview: WeatherIntelligenceOverviewRecord | null): number {
  return (
    weatherOverview?.regional_signals.filter((signal) =>
      [signal.demand_risk, signal.supply_risk, signal.storm_risk].some((risk) => risk.toUpperCase() === 'HIGH'),
    ).length ?? 0
  )
}

function sourceQualityScore(status: PreTradeRecommendationSourceSnapshotRecord['quality_status']): number {
  switch (status) {
    case 'OK':
      return 100
    case 'STALE':
      return 65
    case 'DEGRADED':
      return 45
    case 'MISSING':
      return 0
  }
}

function sourceProvenance(args: {
  provider: string | null
  dataset: string
  recordId?: string | null
  observedAt?: string | null
  ingestedAt?: string | null
}): PreTradeRecommendationSourceSnapshotRecord['provenance'] {
  return {
    provider: args.provider,
    dataset: args.dataset,
    record_id: args.recordId ?? null,
    observed_at: args.observedAt ?? null,
    ingested_at: args.ingestedAt ?? args.observedAt ?? null,
    captured_by: 'pretrade-workspace',
  }
}

function sourceQualitySummary(snapshots: PreTradeRecommendationSourceSnapshotRecord[]): string {
  const impaired = snapshots.filter((snapshot) => snapshot.quality_status !== 'OK')
  if (impaired.length === 0) {
    return 'all sources clean'
  }
  return `${impaired.length} source${impaired.length === 1 ? '' : 's'} need attention`
}

function formatRecommendationScoreDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export function PreTradeWorkspace({
  authSession,
  activeBooks,
  activeCommodities,
  activeCounterparties,
  activeCurrencies,
  activeLocations,
  activePortfolios,
  activeTrades,
  activeUnits,
  counterpartyCreditProfiles,
  counterpartyExternalCreditSnapshots,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  formatNumber,
  onOpenTradeCapture,
  onOpenTrade,
  positionsWithClass,
  priceIndices,
  pricingTypeOptions,
}: PreTradeWorkspaceProps) {
  const draftArgs = useMemo(
    () => ({
      activeBooks,
      activeCommodities,
      activeCurrencies,
      activeCounterparties,
      activeLocations,
      activePortfolios,
      activeUnits,
      priceIndices,
      pricingTypeOptions,
    }),
    [
      activeBooks,
      activeCommodities,
      activeCounterparties,
      activeCurrencies,
      activeLocations,
      activePortfolios,
      activeUnits,
      priceIndices,
      pricingTypeOptions,
    ],
  )
  const [scenarioName, setScenarioName] = useState('')
  const [scenarioThesis, setScenarioThesis] = useState('')
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null)
  const [draft, setDraft] = useState<PreTradeScenarioDraft>(() => createEmptyDraft(draftArgs))
  const [scenarios, setScenarios] = useState<PreTradeScenarioRecord[]>([])
  const [reviews, setReviews] = useState<PreTradeReviewItemRecord[]>([])
  const [recommendationRuns, setRecommendationRuns] = useState<PreTradeRecommendationRunRecord[]>([])
  const [governanceSummary, setGovernanceSummary] = useState<PreTradeGovernanceSummaryRecord | null>(null)
  const [governanceItems, setGovernanceItems] = useState<PreTradeGovernanceItemsRecord | null>(null)
  const [selectedGovernanceBucket, setSelectedGovernanceBucket] = useState<GovernanceBucketKey>('pending')
  const [reviewCommentDrafts, setReviewCommentDrafts] = useState<Record<number, string>>({})
  const [reviewOverrideDrafts, setReviewOverrideDrafts] = useState<Record<number, string>>({})
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionError, setCollectionError] = useState('')
  const [actionPending, setActionPending] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [marketContext, setMarketContext] = useState<MarketContextRecord | null>(null)
  const [marketContextLoading, setMarketContextLoading] = useState(false)
  const [marketContextError, setMarketContextError] = useState('')
  const [weatherOverview, setWeatherOverview] = useState<WeatherIntelligenceOverviewRecord | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')

  const priceIndexOptions = useMemo(
    () => priceIndices.filter((row) => row.commodity_code === draft.commodity),
    [draft.commodity, priceIndices],
  )
  const portfolioOptions = useMemo(
    () => activePortfolios.filter((row) => row.book_code === draft.book),
    [activePortfolios, draft.book],
  )
  const commodityClassOptions = useMemo(() => uniqueCommodityClasses(activeCommodities), [activeCommodities])
  const commodityOptions = useMemo(
    () => activeCommodities.filter((row) => row.commodity_class === draft.commodity_class),
    [activeCommodities, draft.commodity_class],
  )
  const unitOptions = useMemo(
    () => activeUnits.filter((row) => !row.commodity_class || row.commodity_class === draft.commodity_class),
    [activeUnits, draft.commodity_class],
  )

  useEffect(() => {
    setDraft((current) => normalizeScenarioDraft(current, draftArgs))
  }, [draftArgs])

  async function refreshPersistedState(accessToken: string) {
    setCollectionLoading(true)
    setCollectionError('')
    try {
      const [nextScenarios, nextReviews, nextRecommendationRuns, nextGovernanceSummary, nextGovernanceItems] = await Promise.all([
        loadPreTradeScenarios(appConfig.apiBase, accessToken),
        loadPreTradeReviewItems(appConfig.apiBase, accessToken),
        loadPreTradeRecommendationRuns(appConfig.apiBase, accessToken, { limit: 20 }),
        loadPreTradeGovernanceSummary(appConfig.apiBase, accessToken),
        loadPreTradeGovernanceItems(appConfig.apiBase, accessToken),
      ])
      setScenarios(nextScenarios)
      setReviews(nextReviews)
      setRecommendationRuns(nextRecommendationRuns)
      setGovernanceSummary(nextGovernanceSummary)
      setGovernanceItems(nextGovernanceItems)
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : 'Could not load pre-trade scenarios or review queue.')
    } finally {
      setCollectionLoading(false)
    }
  }

  useEffect(() => {
    if (!authSession?.accessToken) {
      setScenarios([])
      setReviews([])
      setRecommendationRuns([])
      setGovernanceSummary(null)
      setGovernanceItems(null)
      setCollectionError('')
      return
    }

    void refreshPersistedState(authSession.accessToken)
  }, [authSession?.accessToken])

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      if (!draft.commodity) {
        setMarketContext(null)
        setMarketContextError('')
        setMarketContextLoading(false)
        return
      }

      setMarketContextLoading(true)
      setMarketContextError('')
      try {
        const payload = await loadMarketContext(appConfig.apiBase, {
          commodity: draft.commodity,
          limit: 6,
        })
        if (!cancelled) {
          setMarketContext(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setMarketContext(null)
          setMarketContextError(error instanceof Error ? error.message : 'Could not load market context.')
        }
      } finally {
        if (!cancelled) {
          setMarketContextLoading(false)
        }
      }
    }

    void loadContext()
    return () => {
      cancelled = true
    }
  }, [draft.commodity])

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      if (!draft.commodity_class) {
        setWeatherOverview(null)
        setWeatherError('')
        setWeatherLoading(false)
        return
      }

      setWeatherLoading(true)
      setWeatherError('')
      try {
        const payload = await loadWeatherIntelligenceOverview(appConfig.apiBase, {
          commodityClass: draft.commodity_class,
        })
        if (!cancelled) {
          setWeatherOverview(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherOverview(null)
          setWeatherError(error instanceof Error ? error.message : 'Could not load weather intelligence.')
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false)
        }
      }
    }

    void loadWeather()
    return () => {
      cancelled = true
    }
  }, [draft.commodity_class])

  const { latestMarksByCode } = useLatestPriceIndexMarks([draft.price_index_code])
  const latestMark = draft.price_index_code ? latestMarksByCode[draft.price_index_code] ?? null : null
  const selectedCounterpartyProfile =
    counterpartyCreditProfiles.find((row) => row.counterparty_code === draft.counterparty) ?? null
  const selectedExternalSnapshot = useMemo(
    () =>
      counterpartyExternalCreditSnapshots
        .filter((row) => row.counterparty_code === draft.counterparty)
        .sort((left, right) => right.as_of_date.localeCompare(left.as_of_date))[0] ?? null,
    [counterpartyExternalCreditSnapshots, draft.counterparty],
  )
  const relatedTrades = useMemo(
    () =>
      activeTrades.filter(
        (trade) =>
          trade.book === draft.book &&
          trade.commodity_class === draft.commodity_class &&
          trade.commodity === draft.commodity,
    ),
    [activeTrades, draft.book, draft.commodity, draft.commodity_class],
  )
  const sameCounterpartyTrades = useMemo(
    () => activeTrades.filter((trade) => trade.counterparty === draft.counterparty),
    [activeTrades, draft.counterparty],
  )
  const currentCounterpartyExposure = useMemo(
    () => sameCounterpartyTrades.reduce((sum, trade) => sum + Math.abs((trade.price ?? 0) * (trade.volume ?? 0)), 0),
    [sameCounterpartyTrades],
  )
  const currentNetPosition =
    positionsWithClass.find((position) => position.commodity === draft.commodity)?.net_volume ?? null
  const recommendationInputSnapshots = useMemo<PreTradeRecommendationSourceSnapshotRecord[]>(
    () => [
      {
        source_key: 'desk-context',
        adapter_key: 'desk-context',
        adapter_label: 'Desk exposure context',
        source_type: 'INTERNAL',
        source_available: true,
        captured_at: null,
        freshness: 'FRESH',
        quality_status: 'OK',
        quality_score: sourceQualityScore('OK'),
        summary: `${relatedTrades.length} active trade${relatedTrades.length === 1 ? '' : 's'} match the selected book and commodity.`,
        provenance: sourceProvenance({
          provider: 'ECTRM',
          dataset: 'active-trades-and-positions',
          recordId: `${draft.book}:${draft.commodity}`,
        }),
        payload: {
          related_active_trade_count: relatedTrades.length,
          current_net_position: currentNetPosition,
          current_counterparty_exposure: currentCounterpartyExposure,
        },
      },
      {
        source_key: 'counterparty-credit',
        adapter_key: 'counterparty-credit',
        adapter_label: 'Counterparty credit profile',
        source_type: 'INTERNAL',
        source_available: true,
        captured_at: selectedCounterpartyProfile?.updated_at ?? null,
        freshness: selectedCounterpartyProfile ? 'FRESH' : 'UNKNOWN',
        quality_status: selectedCounterpartyProfile ? 'OK' : 'MISSING',
        quality_score: sourceQualityScore(selectedCounterpartyProfile ? 'OK' : 'MISSING'),
        summary: selectedCounterpartyProfile
          ? `Internal credit profile captured for ${selectedCounterpartyProfile.counterparty_code}.`
          : 'No internal credit profile was captured for the selected counterparty.',
        provenance: sourceProvenance({
          provider: 'ECTRM Credit',
          dataset: 'counterparty-credit-profiles',
          recordId: selectedCounterpartyProfile?.counterparty_code ?? draft.counterparty,
          observedAt: selectedCounterpartyProfile?.updated_at ?? null,
        }),
        payload: {
          has_credit_profile: Boolean(selectedCounterpartyProfile),
          credit_limit_amount: selectedCounterpartyProfile?.limit_amount ?? null,
          breach_action: selectedCounterpartyProfile?.breach_action ?? null,
          credit_rating: selectedCounterpartyProfile?.credit_rating ?? null,
          external_rating_value: selectedExternalSnapshot?.rating_value ?? null,
          recommended_limit_amount: selectedExternalSnapshot?.recommended_limit_amount ?? null,
        },
      },
      {
        source_key: 'latest-mark',
        adapter_key: 'latest-mark',
        adapter_label: 'Latest price-index mark',
        source_type: 'EXTERNAL',
        source_available: true,
        captured_at: latestMark?.downloaded_at ?? null,
        freshness: latestMark ? 'FRESH' : 'UNKNOWN',
        quality_status: latestMark ? 'OK' : 'MISSING',
        quality_score: sourceQualityScore(latestMark ? 'OK' : 'MISSING'),
        summary: latestMark
          ? `${latestMark.price_index_code} mark captured for ${latestMark.observation_date}.`
          : 'No compatible latest mark was captured for the selected price index.',
        provenance: sourceProvenance({
          provider: latestMark?.source_provider ?? 'Price index marks',
          dataset: 'price-index-observations',
          recordId: latestMark ? `${latestMark.price_index_code}:${latestMark.observation_date}` : draft.price_index_code,
          observedAt: latestMark?.source_published_at ?? latestMark?.downloaded_at ?? null,
          ingestedAt: latestMark?.downloaded_at ?? null,
        }),
        payload: {
          latest_mark: latestMark?.value ?? null,
          price_index_code: latestMark?.price_index_code ?? draft.price_index_code,
          observation_date: latestMark?.observation_date ?? null,
          source_provider: latestMark?.source_provider ?? null,
          source_series_id: latestMark?.source_series_id ?? null,
        },
      },
      {
        source_key: 'market-context',
        adapter_key: 'market-context',
        adapter_label: 'Market context',
        source_type: 'EXTERNAL',
        source_available: marketContext !== null,
        captured_at: marketContext?.generated_at ?? null,
        freshness: !marketContext ? 'UNKNOWN' : countMarketFreshnessIssues(marketContext) > 0 ? 'DEGRADED' : 'FRESH',
        quality_status: !marketContext ? 'MISSING' : countMarketFreshnessIssues(marketContext) > 0 ? 'DEGRADED' : 'OK',
        quality_score: sourceQualityScore(!marketContext ? 'MISSING' : countMarketFreshnessIssues(marketContext) > 0 ? 'DEGRADED' : 'OK'),
        summary: marketContext
          ? `Captured ${marketContext.fundamentals.length + marketContext.macro.length} market driver row${marketContext.fundamentals.length + marketContext.macro.length === 1 ? '' : 's'}.`
          : 'No market context snapshot was captured.',
        provenance: sourceProvenance({
          provider: 'ECTRM Market Context',
          dataset: 'market-context',
          recordId: draft.commodity,
          observedAt: marketContext?.generated_at ?? null,
        }),
        payload: {
          market_freshness_issue_count: countMarketFreshnessIssues(marketContext),
          fundamental_count: marketContext?.fundamentals.length ?? 0,
          macro_count: marketContext?.macro.length ?? 0,
        },
      },
      {
        source_key: 'weather-intelligence',
        adapter_key: 'weather-intelligence',
        adapter_label: 'Weather intelligence',
        source_type: 'EXTERNAL',
        source_available: weatherOverview !== null,
        captured_at: weatherOverview?.latest_weather_update_at ?? null,
        freshness: weatherOverview ? 'FRESH' : 'UNKNOWN',
        quality_status: weatherOverview ? 'OK' : 'MISSING',
        quality_score: sourceQualityScore(weatherOverview ? 'OK' : 'MISSING'),
        summary: weatherOverview?.headline ?? 'No weather intelligence snapshot was captured.',
        provenance: sourceProvenance({
          provider: 'Weather Intelligence',
          dataset: 'weather-intelligence',
          recordId: draft.commodity_class,
          observedAt: weatherOverview?.latest_weather_update_at ?? null,
        }),
        payload: {
          weather_high_risk_count: countHighWeatherRisks(weatherOverview),
          live_weather_location_count: weatherOverview?.live_weather_location_count ?? 0,
        },
      },
    ],
    [
      currentCounterpartyExposure,
      currentNetPosition,
      draft.book,
      draft.commodity,
      draft.commodity_class,
      draft.counterparty,
      draft.price_index_code,
      latestMark,
      marketContext,
      relatedTrades.length,
      selectedCounterpartyProfile,
      selectedExternalSnapshot,
      weatherOverview,
    ],
  )
  const currentRecommendationRuns = useMemo(
    () =>
      recommendationRuns
        .filter((run) => selectedScenarioId === null || run.source_scenario_id === selectedScenarioId)
        .slice(0, 3),
    [recommendationRuns, selectedScenarioId],
  )
  const recommendation = useMemo(
    () =>
      buildPreTradeRecommendation({
        draft,
        activeTrades,
        positions: positionsWithClass,
        creditProfiles: counterpartyCreditProfiles,
        externalCreditSnapshots: counterpartyExternalCreditSnapshots,
        latestMark,
        marketContext,
        weatherOverview,
      }),
    [
      activeTrades,
      counterpartyCreditProfiles,
      counterpartyExternalCreditSnapshots,
      draft,
      latestMark,
      marketContext,
      positionsWithClass,
      weatherOverview,
    ],
  )

  function patchDraft(changes: Partial<PreTradeScenarioDraft>) {
    setDraft((current) => normalizeScenarioDraft({ ...current, ...changes }, draftArgs))
  }

  function handleStartNew() {
    setSelectedScenarioId(null)
    setScenarioName('')
    setScenarioThesis('')
    setDraft(createEmptyDraft(draftArgs))
    setActionError('')
    setActionMessage('')
  }

  function handleLoadScenario(record: PreTradeScenarioRecord) {
    setSelectedScenarioId(record.scenario_id)
    setScenarioName(record.name)
    setScenarioThesis(record.thesis ?? '')
    setDraft(normalizeScenarioDraft(record.draft, draftArgs))
    setActionError('')
    setActionMessage(`Loaded scenario "${record.name}".`)
  }

  async function withAuthenticatedAction(
    actionKey: string,
    action: (accessToken: string) => Promise<void>,
  ) {
    if (!authSession?.accessToken) {
      setActionError('Sign in to save scenarios or use the shared review queue.')
      setActionMessage('')
      return
    }

    setActionPending(actionKey)
    setActionError('')
    setActionMessage('')
    try {
      await action(authSession.accessToken)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not complete the requested pre-trade action.')
    } finally {
      setActionPending('')
    }
  }

  async function handleSaveScenario() {
    const resolvedName = scenarioName.trim() || buildScenarioTitle(draft)
    await withAuthenticatedAction('save-scenario', async (accessToken) => {
      if (selectedScenarioId !== null) {
        const updated = await updatePreTradeScenario(appConfig.apiBase, accessToken, selectedScenarioId, {
          name: resolvedName,
          thesis: scenarioThesis.trim() || null,
          draft,
        })
        setScenarioName(updated.name)
        setScenarioThesis(updated.thesis ?? '')
      } else {
        const created = await createPreTradeScenario(appConfig.apiBase, accessToken, {
          name: resolvedName,
          thesis: scenarioThesis.trim() || null,
          draft,
        })
        setSelectedScenarioId(created.scenario_id)
        setScenarioName(created.name)
        setScenarioThesis(created.thesis ?? '')
      }
      await refreshPersistedState(accessToken)
      setActionMessage(`Saved scenario "${resolvedName}".`)
    })
  }

  async function handleDeleteSelectedScenario() {
    if (selectedScenarioId === null) {
      setActionError('Load a saved scenario before trying to delete it.')
      setActionMessage('')
      return
    }

    const existingScenario = scenarios.find((row) => row.scenario_id === selectedScenarioId)
    await withAuthenticatedAction('delete-scenario', async (accessToken) => {
      await deletePreTradeScenario(appConfig.apiBase, accessToken, selectedScenarioId)
      await refreshPersistedState(accessToken)
      handleStartNew()
      setActionMessage(existingScenario ? `Deleted scenario "${existingScenario.name}".` : 'Deleted saved scenario.')
    })
  }

  async function handleSubmitReview(sourceScenario: PreTradeScenarioRecord | null = null) {
    const resolvedName = (sourceScenario?.name ?? scenarioName).trim() || buildScenarioTitle(sourceScenario?.draft ?? draft)
    const resolvedThesis = (sourceScenario?.thesis ?? scenarioThesis).trim() || null
    const resolvedDraft = sourceScenario?.draft ?? draft

    await withAuthenticatedAction('submit-review', async (accessToken) => {
      const sourceScenarioId = sourceScenario?.scenario_id ?? selectedScenarioId
      const recommendationRun = await resolveRecommendationRunForReview(accessToken, {
        name: resolvedName,
        thesis: resolvedThesis,
        draft: resolvedDraft,
        sourceScenarioId,
        sourceScenario,
      })
      await createPreTradeReviewItem(appConfig.apiBase, accessToken, {
        name: resolvedName,
        thesis: resolvedThesis,
        draft: resolvedDraft,
        source_scenario_id: sourceScenarioId ?? undefined,
        recommendation_run_id: recommendationRun?.run_id ?? undefined,
      })
      await refreshPersistedState(accessToken)
      setActionMessage(
        recommendationRun
          ? `Submitted "${resolvedName}" with recommendation run ${recommendationRun.run_key.slice(0, 8)}.`
          : `Submitted "${resolvedName}" to the shared review queue.`,
      )
    })
  }

  async function handleSaveRecommendationRun() {
    const resolvedName = `${(scenarioName.trim() || buildScenarioTitle(draft)).slice(0, 92)} recommendation`
    await withAuthenticatedAction('save-recommendation-run', async (accessToken) => {
      const created = await createPreTradeRecommendationRun(appConfig.apiBase, accessToken, {
        name: resolvedName,
        thesis: scenarioThesis.trim() || null,
        draft,
        source_scenario_id: selectedScenarioId,
        input_snapshots: recommendationInputSnapshots,
      })
      await refreshPersistedState(accessToken)
      setActionMessage(`Saved recommendation run ${created.run_key.slice(0, 8)} for "${created.name}".`)
    })
  }

  function latestRecommendationRunForScenario(sourceScenarioId: number | null): PreTradeRecommendationRunRecord | null {
    if (sourceScenarioId === null) {
      return null
    }
    return recommendationRuns.find((run) => run.source_scenario_id === sourceScenarioId) ?? null
  }

  async function resolveRecommendationRunForReview(
    accessToken: string,
    args: {
      name: string
      thesis: string | null
      draft: PreTradeScenarioDraft
      sourceScenarioId: number | null
      sourceScenario: PreTradeScenarioRecord | null
    },
  ): Promise<PreTradeRecommendationRunRecord | null> {
    const existingRun = latestRecommendationRunForScenario(args.sourceScenarioId)
    if (args.sourceScenario !== null) {
      return existingRun
    }
    return createPreTradeRecommendationRun(appConfig.apiBase, accessToken, {
      name: `${args.name.slice(0, 92)} recommendation`,
      thesis: args.thesis,
      draft: args.draft,
      source_scenario_id: args.sourceScenarioId,
      input_snapshots: recommendationInputSnapshots,
    })
  }

  function reviewCommentDraft(reviewId: number): string {
    return reviewCommentDrafts[reviewId] ?? ''
  }

  function setReviewCommentDraft(reviewId: number, value: string) {
    setReviewCommentDrafts((current) => ({
      ...current,
      [reviewId]: value,
    }))
  }

  function clearReviewCommentDraft(reviewId: number) {
    setReviewCommentDrafts((current) => {
      const next = { ...current }
      delete next[reviewId]
      return next
    })
  }

  function reviewOverrideDraft(reviewId: number): string {
    return reviewOverrideDrafts[reviewId] ?? ''
  }

  function setReviewOverrideDraft(reviewId: number, value: string) {
    setReviewOverrideDrafts((current) => ({
      ...current,
      [reviewId]: value,
    }))
  }

  function clearReviewOverrideDraft(reviewId: number) {
    setReviewOverrideDrafts((current) => {
      const next = { ...current }
      delete next[reviewId]
      return next
    })
  }

  async function handleReviewUpdate(
    review: PreTradeReviewItemRecord,
    payload: {
      owner?: string | null
      review_status?: PreTradeReviewStatus
      activity_comment?: string | null
      recommendation_override_reason?: string | null
    },
  ) {
    if (payload.review_status === 'APPROVED' && !payload.activity_comment?.trim()) {
      setActionError('Approval comment is required before a pre-trade review can be approved.')
      setActionMessage('')
      return
    }
    if (
      payload.review_status === 'APPROVED'
      && recommendationRequiresOverride(review.recommendation_summary?.stance)
      && !payload.recommendation_override_reason?.trim()
    ) {
      setActionError('Add an override reason before approving this recommendation stance.')
      setActionMessage('')
      return
    }

    await withAuthenticatedAction(`review-${review.review_id}`, async (accessToken) => {
      await updatePreTradeReviewItem(appConfig.apiBase, accessToken, review.review_id, payload)
      await refreshPersistedState(accessToken)
      clearReviewCommentDraft(review.review_id)
      clearReviewOverrideDraft(review.review_id)
      setActionMessage(`Updated review "${review.name}".`)
    })
  }

  async function handleReviewComment(review: PreTradeReviewItemRecord) {
    const comment = reviewCommentDraft(review.review_id).trim()
    if (!comment) {
      setActionError('Add a comment before posting review activity.')
      setActionMessage('')
      return
    }

    await withAuthenticatedAction(`review-comment-${review.review_id}`, async (accessToken) => {
      await createPreTradeReviewActivity(appConfig.apiBase, accessToken, review.review_id, { comment })
      await refreshPersistedState(accessToken)
      clearReviewCommentDraft(review.review_id)
      setActionMessage(`Added activity to "${review.name}".`)
    })
  }

  const governanceStatus = governanceSummary?.risk_status ?? null
  const governanceTitle = governanceSummary
    ? `Governance ${governanceStatusLabel(governanceSummary.risk_status)}`
    : 'Pre-Trade Governance'
  const governanceReadout = governanceSummary
    ? governanceSummary.unresolved_risky_recommendation_count > 0
      ? `${governanceSummary.unresolved_risky_recommendation_count} risky recommendation${governanceSummary.unresolved_risky_recommendation_count === 1 ? '' : 's'} still need an approval override or final disposition.`
      : governanceSummary.stale_evidence_run_count > 0
        ? `${governanceSummary.stale_evidence_run_count} recommendation run${governanceSummary.stale_evidence_run_count === 1 ? '' : 's'} include stale, degraded, or missing source evidence.`
        : governanceSummary.pending_review_count > 0
          ? `${governanceSummary.pending_review_count} review${governanceSummary.pending_review_count === 1 ? '' : 's'} remain open or in review.`
          : 'No open review queue blockers are visible right now.'
    : 'Sign in to load queue-level controls across reviews, recommendation risk, and booking overrides.'
  const governanceMetricCards: Array<{ bucket: GovernanceBucketKey; label: string; count: number | null }> = [
    { bucket: 'pending', label: GOVERNANCE_BUCKET_LABELS.pending, count: governanceSummary?.pending_review_count ?? null },
    { bucket: 'risky', label: GOVERNANCE_BUCKET_LABELS.risky, count: governanceSummary?.risky_recommendation_count ?? null },
    { bucket: 'overrides', label: GOVERNANCE_BUCKET_LABELS.overrides, count: governanceSummary?.override_count ?? null },
    { bucket: 'stale-evidence', label: GOVERNANCE_BUCKET_LABELS['stale-evidence'], count: governanceSummary?.stale_evidence_run_count ?? null },
    {
      bucket: 'booked-with-override',
      label: GOVERNANCE_BUCKET_LABELS['booked-with-override'],
      count: governanceSummary?.booked_with_override_count ?? null,
    },
  ]
  const selectedGovernanceReviewItems =
    selectedGovernanceBucket === 'pending'
      ? (governanceItems?.pending_reviews ?? [])
      : selectedGovernanceBucket === 'risky'
        ? (governanceItems?.risky_recommendation_reviews ?? [])
        : selectedGovernanceBucket === 'overrides'
          ? (governanceItems?.override_reviews ?? [])
          : selectedGovernanceBucket === 'booked-with-override'
            ? (governanceItems?.booked_with_override_reviews ?? [])
            : []
  const selectedGovernanceStaleEvidenceRuns = selectedGovernanceBucket === 'stale-evidence'
    ? (governanceItems?.stale_evidence_runs ?? [])
    : []
  const selectedGovernanceMetric = governanceMetricCards.find((metric) => metric.bucket === selectedGovernanceBucket)

  const tiles: WorkspaceTile[] = [
    {
      id: 'pretrade-governance',
      eyebrow: 'Governance',
      title: governanceTitle,
      description: 'Queue-level controls for reviews, recommendation risk, source evidence, and override booking.',
      span: 'wide',
      availableSpans: ['full', 'wide', 'half'],
      content: (
        <div className="stack">
          <div className="pretrade-recommendation-head">
            <span className={`status-pill status-pill-${governanceTone(governanceStatus)}`}>
              {governanceStatusLabel(governanceStatus)}
            </span>
            <span className="entity-chip entity-chip-soft">
              {governanceSummary ? `Generated ${formatDate(governanceSummary.generated_at)}` : 'Connect to load controls'}
            </span>
          </div>
          {collectionLoading ? <p className="form-note">Loading governance summary...</p> : null}
          {collectionError ? <p className="form-note">{collectionError}</p> : null}
          <div className="pretrade-metric-grid">
            {governanceMetricCards.map((metric) => (
              <button
                key={metric.bucket}
                type="button"
                className={`pretrade-metric-card pretrade-governance-metric ${selectedGovernanceBucket === metric.bucket ? 'is-selected' : ''}`}
                onClick={() => setSelectedGovernanceBucket(metric.bucket)}
              >
                <span>{metric.label}</span>
                <strong>{metric.count ?? 'n/a'}</strong>
              </button>
            ))}
          </div>
          <div className="surface pretrade-next-actions">
            <span className="eyebrow">Control Readout</span>
            <p>{governanceReadout}</p>
            {governanceSummary ? (
              <p className="form-note">
                {governanceSummary.open_review_count} open | {governanceSummary.in_review_count} in review | {governanceSummary.approved_review_count} approved | {governanceSummary.rejected_review_count} rejected | {governanceSummary.stale_evidence_source_count} impaired source snapshots | {governanceSummary.recommendation_run_count} recommendation runs
              </p>
            ) : null}
          </div>
          <div className="surface pretrade-next-actions">
            <span className="eyebrow">Drill-Through</span>
            <p>
              {selectedGovernanceMetric?.label ?? 'Governance Items'}: {selectedGovernanceMetric?.count ?? 'n/a'} item
              {selectedGovernanceMetric?.count === 1 ? '' : 's'}
            </p>
            {selectedGovernanceBucket === 'stale-evidence' ? (
              <div className="pretrade-card-list">
                {selectedGovernanceStaleEvidenceRuns.map((item) => (
                  <article key={item.run.run_id} className="pretrade-record-card pretrade-record-static">
                    <div>
                      <strong>{item.run.name}</strong>
                      <span>
                        {item.run.recommendation.stance.replaceAll('_', ' ')} | score {item.run.recommendation.score} | saved {formatDate(item.run.created_at)}
                      </span>
                    </div>
                    <p>{item.run.comparison?.summary ?? item.run.recommendation.explanation.source_quality_rationale}</p>
                    <div className="pretrade-card-list">
                      {item.impaired_snapshots.map((snapshot) => (
                        <div key={`${item.run.run_id}-${snapshot.adapter_key ?? snapshot.source_key}`} className="pretrade-record-card pretrade-record-static">
                          <div>
                            <strong>{snapshot.adapter_label ?? snapshot.source_key}</strong>
                            <span>
                              {snapshot.quality_status} | {snapshot.freshness}
                            </span>
                          </div>
                          <small>
                            {snapshot.provenance.provider ?? 'Unknown provider'} | {snapshot.provenance.dataset ?? 'Unknown dataset'}
                            {snapshot.provenance.observed_at ? ` | observed ${formatDate(snapshot.provenance.observed_at)}` : ''}
                          </small>
                          <p>{snapshot.summary ?? 'No source summary was captured.'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="pretrade-inline-actions">
                      <button type="button" className="button button-secondary" onClick={() => onOpenTradeCapture(item.run.draft)}>
                        Open Draft
                      </button>
                    </div>
                  </article>
                ))}
                {!collectionLoading && selectedGovernanceStaleEvidenceRuns.length === 0 ? (
                  <p className="form-note">No impaired latest recommendation evidence is currently visible for this bucket.</p>
                ) : null}
              </div>
            ) : (
              <div className="pretrade-card-list">
                {selectedGovernanceReviewItems.map((review) => (
                  <article key={review.review_id} className="pretrade-record-card pretrade-record-static">
                    <div className="pretrade-review-head">
                      <div>
                        <strong>{review.name}</strong>
                        <span>{review.draft.book} | {review.draft.commodity} | {review.created_by}</span>
                      </div>
                      <span className={`status-pill status-pill-${reviewStatusTone(review.review_status)}`}>{review.review_status.replaceAll('_', ' ')}</span>
                    </div>
                    <p>{review.thesis ?? review.review_notes ?? 'No review notes captured yet.'}</p>
                    <small>
                      Owner {review.owner ?? 'unassigned'} | updated {formatDate(review.updated_at)}
                    </small>
                    {review.recommendation_summary ? (
                      <small>
                        Recommendation {review.recommendation_summary.stance.replaceAll('_', ' ')} | score {review.recommendation_summary.score}
                      </small>
                    ) : null}
                    {review.recommendation_override_reason ? (
                      <p className="form-note">
                        Override by {review.recommendation_override_by ?? 'reviewer'}
                        {review.recommendation_override_at ? ` on ${formatDate(review.recommendation_override_at)}` : ''}: {review.recommendation_override_reason}
                      </p>
                    ) : null}
                    {review.linked_trade_id ? (
                      <small>
                        Booked as {review.linked_trade_id}
                        {review.linked_trade_status ? ` | ${review.linked_trade_status}` : ''}
                        {review.booked_at ? ` | ${formatDate(review.booked_at)}` : ''}
                        {review.booked_by ? ` | by ${review.booked_by}` : ''}
                      </small>
                    ) : null}
                    <div className="pretrade-inline-actions">
                      {review.linked_trade_id ? (
                        <button type="button" className="button button-secondary" onClick={() => onOpenTrade(review.linked_trade_id!)}>
                          View Trade
                        </button>
                      ) : review.review_status === 'APPROVED' ? (
                        <button type="button" className="button button-secondary" onClick={() => onOpenTradeCapture(review.draft, buildApprovedReviewCaptureContext(review))}>
                          Open Ticket
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!collectionLoading && selectedGovernanceReviewItems.length === 0 ? (
                  <p className="form-note">No review items are currently visible for this bucket.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'pretrade-brief',
      eyebrow: 'Scenario',
      title: selectedScenarioId ? 'Edit Scenario' : 'Build Scenario',
      description: 'Assemble the proposed deal, then persist it or push it into the shared desk queue.',
      span: 'wide',
      availableSpans: ['full', 'wide', 'half'],
      content: (
        <div className="stack">
          <div className="pretrade-form-grid">
            <label className="field field-wide">
              <span>Scenario Name</span>
              <input
                className="input"
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
                placeholder={buildScenarioTitle(draft)}
              />
            </label>
            <label className="field field-full">
              <span>Thesis</span>
              <textarea
                className="input pretrade-textarea"
                value={scenarioThesis}
                onChange={(event) => setScenarioThesis(event.target.value)}
                placeholder="Capture why the desk wants this trade, what should validate it, and what could break it."
              />
            </label>
            <label className="field">
              <span>Book</span>
              <select className="input" value={draft.book} onChange={(event) => patchDraft({ book: event.target.value })}>
                {activeBooks.map((book) => (
                  <option key={book.code} value={book.code}>
                    {book.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Portfolio</span>
              <select
                className="input"
                value={draft.portfolio ?? ''}
                onChange={(event) => patchDraft({ portfolio: event.target.value || null })}
              >
                <option value="">Unassigned</option>
                {portfolioOptions.map((portfolio) => (
                  <option key={portfolio.code} value={portfolio.code}>
                    {portfolio.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Counterparty</span>
              <select
                className="input"
                value={draft.counterparty ?? ''}
                onChange={(event) => patchDraft({ counterparty: event.target.value || null })}
              >
                <option value="">Select counterparty</option>
                {activeCounterparties.map((counterparty) => (
                  <option key={counterparty.code} value={counterparty.code}>
                    {counterparty.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Side</span>
              <select
                className="input"
                value={draft.trade_side}
                onChange={(event) => patchDraft({ trade_side: event.target.value as PreTradeScenarioDraft['trade_side'] })}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label className="field">
              <span>Commodity Class</span>
              <select
                className="input"
                value={draft.commodity_class}
                onChange={(event) => patchDraft({ commodity_class: event.target.value, commodity: '' })}
              >
                {commodityClassOptions.map((commodityClass) => (
                  <option key={commodityClass} value={commodityClass}>
                    {formatCommodityClass(commodityClass)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Commodity</span>
              <select
                className="input"
                value={draft.commodity}
                onChange={(event) => patchDraft({ commodity: event.target.value, price_index_code: null })}
              >
                {commodityOptions.map((commodity) => (
                  <option key={commodity.code} value={commodity.code}>
                    {commodity.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Pricing Type</span>
              <select
                className="input"
                value={draft.pricing_type}
                onChange={(event) => patchDraft({ pricing_type: event.target.value })}
              >
                {pricingTypeOptions.map((pricingType) => (
                  <option key={pricingType} value={pricingType}>
                    {pricingType}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Price Index</span>
              <select
                className="input"
                value={draft.price_index_code ?? ''}
                onChange={(event) => patchDraft({ price_index_code: event.target.value || null })}
              >
                <option value="">No index</option>
                {priceIndexOptions.map((priceIndex) => (
                  <option key={priceIndex.code} value={priceIndex.code}>
                    {priceIndex.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Indicative Price</span>
              <input
                className="input"
                type="number"
                value={draft.target_price ?? ''}
                onChange={(event) =>
                  patchDraft({ target_price: event.target.value === '' ? null : Number(event.target.value) })
                }
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span>Target Volume</span>
              <input
                className="input"
                type="number"
                value={draft.target_volume ?? ''}
                onChange={(event) =>
                  patchDraft({ target_volume: event.target.value === '' ? null : Number(event.target.value) })
                }
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>Currency</span>
              <select
                className="input"
                value={draft.trade_currency_code ?? ''}
                onChange={(event) => patchDraft({ trade_currency_code: event.target.value || null })}
              >
                <option value="">Select currency</option>
                {activeCurrencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Unit</span>
              <select
                className="input"
                value={draft.unit_of_measure ?? ''}
                onChange={(event) => patchDraft({ unit_of_measure: event.target.value || null, price_unit_code: event.target.value || null })}
              >
                <option value="">Select unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Price Unit</span>
              <select
                className="input"
                value={draft.price_unit_code ?? ''}
                onChange={(event) => patchDraft({ price_unit_code: event.target.value || null })}
              >
                <option value="">Select unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Location</span>
              <select
                className="input"
                value={draft.location_code ?? ''}
                onChange={(event) => patchDraft({ location_code: event.target.value || null })}
              >
                <option value="">Select location</option>
                {activeLocations.map((location) => (
                  <option key={location.code} value={location.code}>
                    {location.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Delivery Start</span>
              <input
                className="input"
                type="date"
                value={draft.delivery_start ?? ''}
                onChange={(event) => patchDraft({ delivery_start: event.target.value || null })}
              />
            </label>
            <label className="field">
              <span>Delivery End</span>
              <input
                className="input"
                type="date"
                value={draft.delivery_end ?? ''}
                onChange={(event) => patchDraft({ delivery_end: event.target.value || null })}
              />
            </label>
          </div>

          <div className="pretrade-action-row">
            <button type="button" className="button" onClick={() => void handleSaveScenario()} disabled={actionPending !== ''}>
              {selectedScenarioId !== null ? 'Update Scenario' : 'Save Scenario'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => void handleSubmitReview()} disabled={actionPending !== ''}>
              Submit For Review
            </button>
            <button type="button" className="button button-secondary" onClick={() => onOpenTradeCapture(draft)}>
              Open In Trade Capture
            </button>
            <button type="button" className="button button-secondary" onClick={handleStartNew}>
              Start New
            </button>
            {selectedScenarioId !== null ? (
              <button type="button" className="button button-secondary" onClick={() => void handleDeleteSelectedScenario()} disabled={actionPending !== ''}>
                Delete Selected
              </button>
            ) : null}
          </div>

          {actionError ? <p className="form-note">{actionError}</p> : null}
          {actionMessage ? <p className="form-note">{actionMessage}</p> : null}
          {!authSession ? (
            <p className="form-note">Sign in to save personal scenarios or collaborate through the shared pre-trade review queue.</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'pretrade-recommendation',
      eyebrow: 'Recommendation',
      title: recommendation.headline,
      description: recommendation.summary,
      span: 'half',
      availableSpans: ['wide', 'half', 'side'],
      content: (
        <div className="stack">
          <div className="pretrade-recommendation-head">
            <span className={`status-pill status-pill-${recommendationTone(recommendation.stance)}`}>
              {recommendation.stance.replaceAll('_', ' ')}
            </span>
            <span className="entity-chip entity-chip-soft">Confidence {recommendation.confidence}</span>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleSaveRecommendationRun()}
              disabled={actionPending !== '' || !authSession}
            >
              Save Run
            </button>
          </div>
          <div className="surface pretrade-next-actions">
            <span className="eyebrow">Why This Stance</span>
            <p>{recommendation.explanation.stance_rationale}</p>
            <p className="form-note">{recommendation.explanation.confidence_rationale}</p>
          </div>
          <div className="pretrade-metric-grid">
            <article className="pretrade-metric-card">
              <span>Estimated Notional</span>
              <strong>{formatMoney(recommendation.estimated_notional)}</strong>
            </article>
            <article className="pretrade-metric-card">
              <span>Credit Utilization</span>
              <strong>
                {recommendation.projected_credit_utilization_pct === null
                  ? 'n/a'
                  : `${Math.round(recommendation.projected_credit_utilization_pct)}%`}
              </strong>
            </article>
            <article className="pretrade-metric-card">
              <span>Current Net Position</span>
              <strong>{formatNumber(recommendation.current_net_position, 0)}</strong>
            </article>
            <article className="pretrade-metric-card">
              <span>Mark Gap</span>
              <strong>
                {recommendation.mark_gap_pct === null ? 'n/a' : `${Math.round(recommendation.mark_gap_pct)}%`}
              </strong>
            </article>
          </div>
          <div className="pretrade-check-list">
            {recommendation.checks.map((check) => (
              <article key={check.key} className={`pretrade-check-card pretrade-check-card-${check.status}`}>
                <div className="pretrade-check-head">
                  <strong>{check.label}</strong>
                  <span>{check.status.toUpperCase()}</span>
                </div>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
          <div className="surface pretrade-next-actions">
            <span className="eyebrow">Next Actions</span>
            <ul className="pretrade-bullet-list">
              {recommendation.next_actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
          <div className="surface pretrade-next-actions">
            <span className="eyebrow">Saved Provenance</span>
            {currentRecommendationRuns.length > 0 ? (
              <div className="pretrade-card-list">
                {currentRecommendationRuns.map((run) => (
                  <article key={run.run_id} className="pretrade-record-card pretrade-record-static">
                    <div>
                      <strong>{run.name}</strong>
                      <span>{run.recommendation.headline}</span>
                    </div>
                    <p>{run.recommendation.explanation.stance_rationale}</p>
                    <small>
                      {run.recommendation.stance.replaceAll('_', ' ')} | score {run.recommendation.score} | {run.input_snapshots.length} sources | {sourceQualitySummary(run.input_snapshots)} | saved {formatDate(run.created_at)}
                    </small>
                    {run.comparison ? (
                      <div className="surface pretrade-next-actions">
                        <span className="eyebrow">Changed Since Prior Run</span>
                        <p>{run.comparison.summary}</p>
                        <small>
                          Previous #{run.comparison.previous_run_id} | {run.comparison.previous_stance.replaceAll('_', ' ')} | score {run.comparison.previous_score} | delta {formatRecommendationScoreDelta(run.comparison.score_delta)}
                        </small>
                        {run.comparison.added_primary_drivers.length > 0 ? (
                          <p className="form-note">New driver: {run.comparison.added_primary_drivers[0]}</p>
                        ) : null}
                        {run.comparison.source_quality_changes.length > 0 ? (
                          <p className="form-note">
                            Source quality: {run.comparison.source_quality_changes.map((change) => `${change.adapter_label} ${change.previous_quality_status ?? 'n/a'} to ${change.current_quality_status ?? 'n/a'}`).join('; ')}
                          </p>
                        ) : null}
                        {run.comparison.input_snapshot_changes.length > 0 ? (
                          <p className="form-note">
                            Inputs: {run.comparison.input_snapshot_changes.slice(0, 3).map((change) => `${change.adapter_label} ${change.change_type.toLowerCase()}`).join('; ')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="form-note">No recommendation runs have been saved for this scenario yet.</p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'pretrade-context',
      eyebrow: 'Context',
      title: 'Desk, Market, And Weather',
      description: 'Mix internal exposure with live external context so recommendations stay explainable.',
      span: 'wide',
      availableSpans: ['full', 'wide', 'half'],
      content: (
        <div className="stack">
          <div className="pretrade-context-grid">
            <article className="pretrade-context-card">
              <span className="eyebrow">Desk Context</span>
              <strong>{relatedTrades.length} related active trades</strong>
              <p>
                {relatedTrades.length === 0
                  ? 'No currently loaded trades match this book and commodity.'
                  : `The loaded book already has ${relatedTrades.length} matching trade${relatedTrades.length === 1 ? '' : 's'} in play.`}
              </p>
            </article>
            <article className="pretrade-context-card">
              <span className="eyebrow">Counterparty</span>
                <strong>{draft.counterparty ?? 'Not selected'}</strong>
                <p>
                  {selectedCounterpartyProfile
                  ? `Rating ${selectedCounterpartyProfile.credit_rating ?? 'n/a'} | review due ${formatDateOnly(selectedCounterpartyProfile.review_due_at)}`
                  : 'Credit profile not yet available for the selected counterparty.'}
                </p>
            </article>
            <article className="pretrade-context-card">
              <span className="eyebrow">Market Mark</span>
              <strong>{latestMark ? formatMoney(latestMark.value) : 'No fresh mark'}</strong>
              <p>
                {latestMark
                  ? `${latestMark.price_index_code} observed ${formatDateOnly(latestMark.observation_date)}`
                  : marketContextLoading
                    ? 'Loading market context.'
                    : marketContextError || 'Waiting on a compatible price index.'}
              </p>
            </article>
            <article className="pretrade-context-card">
              <span className="eyebrow">Weather View</span>
              <strong>{weatherOverview?.headline ?? 'No weather headline'}</strong>
              <p>{weatherLoading ? 'Loading weather intelligence.' : weatherError || weatherOverview?.summary || 'No weather signal available yet.'}</p>
            </article>
          </div>

          <div className="pretrade-signal-grid">
            <article className="surface pretrade-signal-card">
              <span className="eyebrow">Related Trades</span>
              <div className="pretrade-card-list">
                {relatedTrades.slice(0, 4).map((trade) => (
                  <button
                    key={trade.trade_id}
                    type="button"
                    className="pretrade-record-card"
                    onClick={() => onOpenTradeCapture({
                      ...draft,
                      book: trade.book,
                      portfolio: trade.portfolio,
                      counterparty: trade.counterparty,
                      commodity_class: trade.commodity_class,
                      commodity: trade.commodity,
                      trade_side: (trade.trade_side as PreTradeScenarioDraft['trade_side']) ?? draft.trade_side,
                      pricing_type: trade.pricing_type,
                      price_index_code: trade.price_index_code,
                      target_price: trade.price,
                      target_volume: trade.volume,
                      trade_currency_code: trade.trade_currency_code,
                      unit_of_measure: trade.unit_of_measure,
                      price_unit_code: trade.price_unit_code,
                      location_code: trade.location_code,
                      delivery_start: trade.delivery_start,
                      delivery_end: trade.delivery_end,
                    })}
                  >
                    <div>
                      <strong>{trade.trade_id}</strong>
                      <span>
                        {trade.trade_side ?? 'LEG'} {formatNumber(trade.volume, 0)} {trade.commodity}
                      </span>
                    </div>
                    <small>{trade.counterparty ?? 'No counterparty'}</small>
                  </button>
                ))}
                {relatedTrades.length === 0 ? <p className="form-note">No related trades are loaded for this scenario.</p> : null}
              </div>
            </article>

            <article className="surface pretrade-signal-card">
              <span className="eyebrow">Market Drivers</span>
              <div className="pretrade-card-list">
                {(marketContext?.fundamentals ?? [])
                  .concat(marketContext?.macro ?? [])
                  .slice(0, 4)
                  .map((series) => (
                    <div key={`${series.series_code}-${series.observation_date}`} className="pretrade-record-card pretrade-record-static">
                      <div>
                        <strong>{series.name}</strong>
                        <span>{series.series_code}</span>
                      </div>
                      <small>
                        {formatNumber(series.value, 2)} {series.unit_code}
                      </small>
                    </div>
                  ))}
                {!marketContextLoading && (marketContext?.fundamentals.length ?? 0) === 0 && (marketContext?.macro.length ?? 0) === 0 ? (
                  <p className="form-note">{marketContextError || 'No market driver rows are available for the selected commodity.'}</p>
                ) : null}
              </div>
            </article>

            <article className="surface pretrade-signal-card">
              <span className="eyebrow">Weather Signals</span>
              <div className="pretrade-card-list">
                {(weatherOverview?.regional_signals ?? []).slice(0, 4).map((signal) => (
                  <div key={signal.region_code} className="pretrade-record-card pretrade-record-static">
                    <div>
                      <strong>{signal.region_name}</strong>
                      <span>{signal.primary_driver}</span>
                    </div>
                    <small>
                      Demand {signal.demand_risk} | Supply {signal.supply_risk} | Storm {signal.storm_risk}
                    </small>
                  </div>
                ))}
                {!weatherLoading && (weatherOverview?.regional_signals.length ?? 0) === 0 ? (
                  <p className="form-note">{weatherError || 'No weather signal rows are available for this commodity class.'}</p>
                ) : null}
              </div>
            </article>

            <article className="surface pretrade-signal-card">
              <span className="eyebrow">External Credit Snapshot</span>
              {selectedExternalSnapshot ? (
                <div className="pretrade-record-card pretrade-record-static">
                  <div>
                    <strong>{selectedExternalSnapshot.rating_value ?? 'No rating'}</strong>
                    <span>{selectedExternalSnapshot.provider}</span>
                  </div>
                  <small>
                    {selectedExternalSnapshot.rating_outlook ?? 'No outlook'} | as of {formatDateOnly(selectedExternalSnapshot.as_of_date)}
                  </small>
                </div>
              ) : (
                <p className="form-note">No external rating snapshot is currently loaded for the selected counterparty.</p>
              )}
            </article>
          </div>
        </div>
      ),
    },
    {
      id: 'pretrade-scenarios',
      eyebrow: 'Saved',
      title: 'Personal Scenario Library',
      description: 'Persist your own theses so the desk can reload, revise, or push them into review later.',
      span: 'half',
      availableSpans: ['wide', 'half', 'side'],
      content: (
        <div className="stack">
          {collectionLoading ? <p className="form-note">Loading saved scenarios and review queue...</p> : null}
          {collectionError ? <p className="form-note">{collectionError}</p> : null}
          <div className="pretrade-card-list">
            {scenarios.map((scenario) => (
              <article key={scenario.scenario_id} className={`pretrade-record-card pretrade-record-static ${selectedScenarioId === scenario.scenario_id ? 'is-selected' : ''}`}>
                <div>
                  <strong>{scenario.name}</strong>
                  <span>{scenario.draft.book} | {scenario.draft.commodity} | {scenario.draft.trade_side}</span>
                </div>
                <small>Updated {formatDate(scenario.updated_at)}</small>
                <p>{scenario.thesis ?? 'No thesis captured yet.'}</p>
                <div className="pretrade-inline-actions">
                  <button type="button" className="button button-secondary" onClick={() => handleLoadScenario(scenario)}>
                    Load
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => onOpenTradeCapture(scenario.draft)}>
                    Open Ticket
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => void handleSubmitReview(scenario)} disabled={actionPending !== ''}>
                    Submit
                  </button>
                </div>
              </article>
            ))}
            {!collectionLoading && scenarios.length === 0 ? (
              <p className="form-note">No personal scenarios yet. Save the current draft to start a reusable library.</p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: 'pretrade-reviews',
      eyebrow: 'Queue',
      title: 'Shared Review Queue',
      description: 'Make the pre-trade conversation visible before anything is booked into the blotter.',
      span: 'half',
      availableSpans: ['wide', 'half', 'side'],
      content: (
        <div className="stack">
          <div className="pretrade-card-list">
            {reviews.map((review) => {
              const commentDraft = reviewCommentDraft(review.review_id)
              const overrideDraft = reviewOverrideDraft(review.review_id)
              const existingOverrideReason = review.recommendation_override_reason?.trim() ?? ''
              const overrideRequired = recommendationRequiresOverride(review.recommendation_summary?.stance)
              const approvalOverrideReason = overrideDraft.trim() || existingOverrideReason
              const approvalBlocked = (
                actionPending !== ''
                || review.linked_trade_id !== null
                || commentDraft.trim().length === 0
                || (overrideRequired && approvalOverrideReason.length === 0)
              )

              return (
                <article key={review.review_id} className="pretrade-record-card pretrade-record-static">
                  <div className="pretrade-review-head">
                    <div>
                      <strong>{review.name}</strong>
                      <span>{review.draft.book} | {review.draft.commodity} | {review.created_by}</span>
                    </div>
                    <span className={`status-pill status-pill-${reviewStatusTone(review.review_status)}`}>{review.review_status.replaceAll('_', ' ')}</span>
                  </div>
                  <p>{review.thesis ?? review.review_notes ?? 'No review notes captured yet.'}</p>
                  <small>
                    Owner {review.owner ?? 'unassigned'} | updated {formatDate(review.updated_at)}
                  </small>
                  {review.linked_trade_id ? (
                    <small>
                      Booked as {review.linked_trade_id}
                      {review.linked_trade_status ? ` • ${review.linked_trade_status}` : ''}
                      {review.booked_at ? ` • ${formatDate(review.booked_at)}` : ''}
                      {review.booked_by ? ` • by ${review.booked_by}` : ''}
                    </small>
                  ) : null}
                  {review.recommendation_summary ? (
                    <div className="pretrade-record-card pretrade-record-static">
                      <div>
                        <strong>{review.recommendation_summary.headline}</strong>
                        <span>{review.recommendation_summary.name}</span>
                      </div>
                      <small>
                        {review.recommendation_summary.stance.replaceAll('_', ' ')} | score {review.recommendation_summary.score} | {review.recommendation_summary.input_snapshot_count} sources
                      </small>
                      {review.recommendation_summary.explanation ? (
                        <p>{review.recommendation_summary.explanation.stance_rationale}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="form-note">No saved recommendation run is attached to this review yet.</p>
                  )}
                  {review.recommendation_override_reason ? (
                    <p className="form-note">
                      Override logged by {review.recommendation_override_by ?? 'reviewer'}
                      {review.recommendation_override_at ? ` on ${formatDate(review.recommendation_override_at)}` : ''}: {review.recommendation_override_reason}
                    </p>
                  ) : null}
                  {overrideRequired && !review.linked_trade_id && review.review_status !== 'APPROVED' ? (
                    <div className="feedback-banner feedback-banner-error">
                      <strong>Override required before approval</strong>
                      <p>This recommendation says {review.recommendation_summary?.stance.replaceAll('_', ' ')}. Capture why the desk is proceeding before approving.</p>
                      <textarea
                        className="input pretrade-textarea"
                        value={overrideDraft}
                        onChange={(event) => setReviewOverrideDraft(review.review_id, event.target.value)}
                        placeholder="Explain the override, escalation outcome, or data caveat."
                        disabled={actionPending !== '' || review.linked_trade_id !== null}
                      />
                    </div>
                  ) : null}
                  <textarea
                    className="input pretrade-textarea"
                    value={commentDraft}
                    onChange={(event) => setReviewCommentDraft(review.review_id, event.target.value)}
                    placeholder="Add a reviewer note. Approval requires a comment."
                    disabled={actionPending !== '' || review.linked_trade_id !== null}
                  />
                  <div className="pretrade-inline-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleReviewUpdate(review, {
                        owner: authSession?.user.user_id ?? review.owner,
                        review_status: 'IN_REVIEW',
                        activity_comment: commentDraft.trim() || null,
                      })}
                      disabled={actionPending !== '' || review.linked_trade_id !== null}
                    >
                      Claim
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleReviewUpdate(review, {
                        review_status: 'APPROVED',
                        activity_comment: commentDraft.trim(),
                        ...(overrideRequired ? { recommendation_override_reason: approvalOverrideReason } : {}),
                      })}
                      disabled={approvalBlocked}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleReviewUpdate(review, { review_status: 'REJECTED', activity_comment: commentDraft.trim() || null })}
                      disabled={actionPending !== '' || review.linked_trade_id !== null}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleReviewComment(review)}
                      disabled={actionPending !== '' || review.linked_trade_id !== null || commentDraft.trim().length === 0}
                    >
                      Add Comment
                    </button>
                    {review.linked_trade_id ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onOpenTrade(review.linked_trade_id!)}
                      >
                        View Trade
                      </button>
                    ) : review.review_status === 'APPROVED' ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onOpenTradeCapture(review.draft, buildApprovedReviewCaptureContext(review))}
                      >
                        Open Ticket
                      </button>
                    ) : null}
                  </div>
                  {review.activity.length > 0 ? (
                    <div className="timeline">
                      {review.activity.slice(-5).map((activity) => (
                        <article key={activity.activity_id} className="timeline-item">
                          <div className="timeline-dot" />
                          <div className="timeline-body">
                            <div className="timeline-head">
                              <strong>{reviewActivityLabel(activity.action)}</strong>
                              <span>{formatDate(activity.occurred_at)}</span>
                            </div>
                            <p>{activity.comment ?? `${activity.actor_id} updated this review.`}</p>
                            <p>{activity.actor_id}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              )
            })}
            {!collectionLoading && reviews.length === 0 ? (
              <p className="form-note">The shared review queue is empty. Submit the current draft when you want desk review before capture.</p>
            ) : null}
          </div>
        </div>
      ),
    },
  ]

  return (
    <TileLayout
      workspaceId="pretrade"
      workspaceLabel="Pre-Trade"
      authSession={authSession}
      toolbarDescription="Build a trade thesis from internal desk state plus external context, then push it into shared review or straight into trade capture."
      tiles={tiles}
    />
  )
}
