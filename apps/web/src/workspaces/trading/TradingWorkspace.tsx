import { useEffect, useMemo, useState } from 'react'

import { TradeCaptureForm } from '../../features/trades/TradeCaptureForm'
import { TradeAmendForm } from '../../features/trades/TradeAmendForm'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import { useLatestPriceIndexMarks } from '../../entities/market-data/useLatestPriceIndexMarks'
import { loadPreTradeRecommendationRun, loadPreTradeReviewItem } from '../../entities/pretrade/api'
import type { CounterpartyCreditPolicyPreview } from '../../features/trades/counterpartyCredit'
import { appConfig } from '../../shared/config'
import { normalizeAppRouteHandoff, type AppRouteHandoff } from '../../shared/appRouteHandoff'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { formatCurrencyAmount } from '../../shared/format'
import type {
  PreTradeGovernanceAuditExportRecord,
  PreTradeRecommendationRunRecord,
  PreTradeReviewItemRecord,
  TradeCreditExceptionRecord,
  TradeWorkflowItemRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildOpenOptionValuation,
  buildOptionSettlementValuation,
  calculateDaysToExpiration,
  calculatePremiumCashflow,
  calculateUnderlyingEquivalentVolume,
  type OpenOptionValuation,
  type OptionSettlementValuation,
} from '../../shared/optionExposure'
import { DataSheet, type DataSheetColumn } from '../../shared/ui/DataSheet'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import { tradeTooltipCopy } from '../../features/trades/tooltipCopy'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'
import { OperationalBoardController } from '../operations/OperationalBoardController'
import { OperationalInspectorShell } from '../operations/OperationalInspectorShell'
import { resolveOperationalWorkboardDefinition } from '../operations/operationalWorkboardRegistry'
import {
  buildCreditApprovalFreshnessBlockerSummary,
  type OptionLifecycleEventType,
  tradeInstrumentUsesOptionFields,
  tradeStatusIsActive,
} from '../../shared/trading'

type Trade = {
  trade_id: string
  originating_option_trade_id: string | null
  external_trade_id: string | null
  source_system: string | null
  trade_date: string | null
  effective_start_date: string | null
  effective_end_date: string | null
  quality_spec: string | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
  price_unit_code: string | null
  instrument_type: string
  option_type: string | null
  option_style: string | null
  option_strike_price: number | null
  option_expiration_date: string | null
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  pricing_type: string
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  actualization_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  invoice_status: string
  payment_status: string
  execution_timestamp: string | null
  settlement_status: string
  trader_user: string | null
  status: string
  updated_at: string
  active_credit_exception?: TradeCreditExceptionRecord | null
  credit_approval_status?: string
  credit_hold_active?: boolean
  credit_hold_reason?: string | null
  pretrade_review_id?: number | null
  pretrade_recommendation_run_id?: number | null
  pretrade_approval_governance_snapshot?: PreTradeGovernanceAuditExportRecord | null
  pretrade_booking_governance_snapshot?: PreTradeGovernanceAuditExportRecord | null
}

type EventRow = {
  event_id: string
  event_type: string
  recorded_at: string
  payload: Record<string, unknown>
}

type ReferenceRecord = {
  code: string
  name: string
  commodity_class?: string
}

type PortfolioRecord = ReferenceRecord & {
  book_code: string
}

type CounterpartyRecord = ReferenceRecord & {
  credit_status?: string | null
}

type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

type InspectorTab = 'overview' | 'events' | 'amend' | 'risk'
type TradeCaptureFormProps = Parameters<typeof TradeCaptureForm>[0]

const INSPECTOR_TABS: Array<{ key: InspectorTab; label: string; tooltip: string }> = [
  { key: 'overview', label: 'Overview', tooltip: 'Read the current projected state for the selected trade.' },
  { key: 'events', label: 'Events', tooltip: 'Trace the lifecycle records that were loaded for the selected trade.' },
  { key: 'amend', label: 'Amend', tooltip: 'Apply an amendment or cancel the active trade from the current selection context.' },
  { key: 'risk', label: 'Risk', tooltip: 'Show quick risk-oriented calculations derived from the current trade projection.' },
]

const RISK_TOOLTIPS = {
  notional: 'Simple price-times-volume estimate using the currently loaded trade row.',
  lifecycle: 'Count of loaded event records tied to the selected trade in this session.',
  exposureSide: 'Quick directional interpretation based on the sign of the projected volume.',
  projectionState: 'Current lifecycle status on the trade read model, not the raw event stream.',
} as const

function TradingMetricTileContent({
  value,
  detail,
}: {
  value: string
  detail: string
}) {
  return (
    <div className="trading-metric-tile">
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function creditApprovalLabel(value: string | undefined): string {
  return (value || 'NOT_REQUIRED').replaceAll('_', ' ')
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function snapshotNumber(snapshot: Record<string, unknown>, key: string): number | null {
  const value = snapshot[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function creditDecisionExposureSummary(decision: TradeWorkflowItemRecord['credit_decision_history'][number]): string | null {
  const currency = snapshotText(decision.breach_snapshot, 'limit_currency_code')
  const projected = snapshotNumber(decision.breach_snapshot, 'projected_exposure_amount')
  const limit = snapshotNumber(decision.breach_snapshot, 'limit_amount')
  const utilization = snapshotNumber(decision.breach_snapshot, 'projected_utilization_percent')
  if (currency && projected !== null && limit !== null) {
    const utilizationText = utilization !== null ? ` at ${utilization.toFixed(1)}% utilization` : ''
    return `Projected ${currency} ${projected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} versus limit ${currency} ${limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${utilizationText}.`
  }
  const comparisonReason = snapshotText(decision.breach_snapshot, 'comparison_reason')
  return comparisonReason ? `Snapshot basis: ${comparisonReason.replaceAll('_', ' ')}.` : null
}

function creditExceptionReasonLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized.replaceAll('_', ' ') : null
}

function settlementCashflowLabel(
  value: number | null,
  formatMoney: (value: number | null) => string,
): string {
  if (value === null) {
    return '—'
  }
  if (value > 0) {
    return `Paid ${formatMoney(Math.abs(value))}`
  }
  if (value < 0) {
    return `Received ${formatMoney(Math.abs(value))}`
  }
  return formatMoney(0)
}

function settlementUnitPriceLabel(
  valuation: OptionSettlementValuation,
): string {
  if (valuation.effectiveUnitPrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.effectiveUnitPrice, valuation.referenceCurrencyCode)} ${
    (valuation.underlyingDirection ?? 'BUY').trim().toUpperCase() === 'SELL' ? 'received/unit' : 'paid/unit'
  }`
}

function settlementReferenceMarkLabel(
  valuation: OptionSettlementValuation,
): string {
  if (valuation.referencePrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.referencePrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionReferenceMarkLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.referencePrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.referencePrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionIntrinsicExposureLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.intrinsicExposure === null) {
    return '—'
  }
  if (valuation.intrinsicExposure < 0) {
    return `Liability ${formatCurrencyAmount(Math.abs(valuation.intrinsicExposure), valuation.referenceCurrencyCode)}`
  }
  if (valuation.intrinsicExposure > 0) {
    return `Value ${formatCurrencyAmount(valuation.intrinsicExposure, valuation.referenceCurrencyCode)}`
  }
  return formatCurrencyAmount(0, valuation.referenceCurrencyCode)
}

function openOptionBreakEvenLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.breakEvenPrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.breakEvenPrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionExpiryPnlLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.expiryPnlAtMark === null) {
    return '—'
  }
  if (valuation.expiryPnlAtMark > 0) {
    return `Gain ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  if (valuation.expiryPnlAtMark < 0) {
    return `Loss ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  return 'Break-even'
}

function openOptionExpiryStateLabel(
  valuation: OpenOptionValuation,
): string {
  switch (valuation.expiryState) {
    case 'PAST_EXPIRY_UNRESOLVED':
      return 'Past expiry unresolved'
    case 'EXPIRING_TODAY':
      return 'Expiring today'
    case 'EXPIRING_SOON':
      return 'Expiring soon'
    default:
      return 'Open'
  }
}

function matchesTradeScreenFilter(trade: Trade, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.originating_option_trade_id,
    trade.external_trade_id,
    trade.source_system,
    trade.trade_date,
    trade.effective_start_date,
    trade.effective_end_date,
    trade.quality_spec,
    trade.unit_of_measure,
    trade.trade_currency_code,
    trade.location_code,
    trade.delivery_start,
    trade.delivery_end,
    trade.price_unit_code,
    trade.instrument_type,
    trade.option_type,
    trade.option_style,
    trade.trade_nature,
    trade.trade_structure,
    trade.trade_side,
    trade.book,
    trade.portfolio,
    trade.counterparty,
    trade.commodity_class,
    trade.commodity,
    trade.pricing_type,
    trade.pricing_status,
    trade.confirmation_status,
    trade.nomination_status,
    trade.allocation_status,
    trade.actualization_status,
    trade.price_index_code,
    trade.invoice_status,
    trade.payment_status,
    trade.settlement_status,
    trade.trader_user,
    trade.status,
    trade.credit_approval_status,
    trade.credit_hold_reason,
  ])
}

function optionLifecycleActionLabel(
  action: OptionLifecycleEventType | null,
): string {
  switch (action) {
    case 'OptionExercised':
      return 'Exercise'
    case 'OptionAssigned':
      return 'Assign'
    case 'OptionExpired':
      return 'Expire'
    default:
      return 'Monitor'
  }
}

function settlementMarkToMarketLabel(
  value: number | null,
  currencyCode: string | null | undefined,
): string {
  if (value === null) {
    return '—'
  }
  if (value > 0) {
    return `Gain ${formatCurrencyAmount(Math.abs(value), currencyCode)}`
  }
  if (value < 0) {
    return `Loss ${formatCurrencyAmount(Math.abs(value), currencyCode)}`
  }
  return formatCurrencyAmount(0, currencyCode)
}

function parsePreTradeReviewId(selectedTradeEvents: EventRow[]): number | null {
  const tradeCreatedEvent = selectedTradeEvents.find((event) => event.event_type === 'TradeCreated')
  const candidate = tradeCreatedEvent?.payload.pretrade_review_id
  return typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0 ? candidate : null
}

function governanceRiskStatusLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function governanceAuditSummary(snapshot: PreTradeGovernanceAuditExportRecord): string {
  return [
    governanceRiskStatusLabel(snapshot.summary.risk_status),
    `${snapshot.audit_rows.length} audit rows`,
    `${snapshot.summary.override_count} overrides`,
    `${snapshot.summary.stale_evidence_run_count} stale runs`,
  ].join(' | ')
}

type TradingWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
  operationalResourceDescriptors: OperationalResourceDescriptor[]
  tradeMetadataSource: 'server' | 'fallback'
  tradeMetadataError: string
  tradeCaptureFormProps: TradeCaptureFormProps
  trades: Trade[]
  tradeWorkflowItems: TradeWorkflowItemRecord[]
  activeTradeCount: number
  totalActiveVolume: number
  pricedActiveTrades: number
  pricingCoverage: number | null
  pendingPricingTrades: number
  trackedBooks: number
  largestPositionRow: { commodity: string; net_volume: number } | null
  selectedTrade: Trade | null
  selectedTradeId: string | null
  selectedTradeEvents: EventRow[]
  inspectorTab: InspectorTab
  setSelectedTradeId: (tradeId: string | null) => void
  setInspectorTab: (tab: InspectorTab) => void
  onClearHandoff: () => void
  handleDuplicateTrade: () => void
  handleAmendTrade: (event: React.FormEvent) => void
  handleCancelTrade: (reason: string) => void
  handleOptionLifecycleEvent: (eventType: OptionLifecycleEventType) => void
  optionLifecycleSubmittingEvent: OptionLifecycleEventType | null
  amendmentPreviewFields: string[]
  cancelImpactSummary: string
  amendmentLockedReason: string
  amendExternalTradeIdInput: string
  setAmendExternalTradeIdInput: (value: string) => void
  amendSourceSystemInput: string
  amendExecutionTimestampInput: string
  setAmendExecutionTimestampInput: (value: string) => void
  amendTradeDateInput: string
  setAmendTradeDateInput: (value: string) => void
  amendEffectiveStartDateInput: string
  setAmendEffectiveStartDateInput: (value: string) => void
  amendEffectiveEndDateInput: string
  setAmendEffectiveEndDateInput: (value: string) => void
  amendQualitySpecInput: string
  setAmendQualitySpecInput: (value: string) => void
  amendUnitInput: string
  setAmendUnitInput: (value: string) => void
  amendUnitOptions: ReferenceRecord[]
  amendTradeCurrencyInput: string
  setAmendTradeCurrencyInput: (value: string) => void
  amendCurrencyOptions: ReferenceRecord[]
  amendLocationInput: string
  setAmendLocationInput: (value: string) => void
  amendLocationOptions: ReferenceRecord[]
  amendDeliveryStartInput: string
  setAmendDeliveryStartInput: (value: string) => void
  amendDeliveryEndInput: string
  setAmendDeliveryEndInput: (value: string) => void
  amendPriceUnitInput: string
  setAmendPriceUnitInput: (value: string) => void
  amendPriceUnitOptions: ReferenceRecord[]
  amendTradeInstrumentTypeInput: string
  setAmendTradeInstrumentTypeInput: (value: string) => void
  amendOptionTypeInput: string
  setAmendOptionTypeInput: (value: string) => void
  amendOptionStyleInput: string
  setAmendOptionStyleInput: (value: string) => void
  amendOptionExpirationDateInput: string
  setAmendOptionExpirationDateInput: (value: string) => void
  amendOptionStrikePriceInput: string
  setAmendOptionStrikePriceInput: (value: string) => void
  amendBookInput: string
  setAmendBookInput: (value: string) => void
  amendBookOptions: ReferenceRecord[]
  amendPortfolioInput: string
  setAmendPortfolioInput: (value: string) => void
  amendPortfolioOptions: PortfolioRecord[]
  amendCounterpartyInput: string
  setAmendCounterpartyInput: (value: string) => void
  amendCounterpartyOptions: CounterpartyRecord[]
  amendCommodityClassInput: string
  setAmendCommodityClassInput: (value: string) => void
  commodityClassOptions: string[]
  amendCommodityInput: string
  setAmendCommodityInput: (value: string) => void
  amendCommodityOptions: ReferenceRecord[]
  amendTradeNatureInput: string
  setAmendTradeNatureInput: (value: string) => void
  amendTradeStructureInput: string
  setAmendTradeStructureInput: (value: string) => void
  amendTradeSideInput: string
  setAmendTradeSideInput: (value: string) => void
  amendPricingTypeInput: string
  setAmendPricingTypeInput: (value: string) => void
  amendPricingStatusInput: string
  setAmendPricingStatusInput: (value: string) => void
  amendConfirmationStatusInput: string
  setAmendConfirmationStatusInput: (value: string) => void
  amendNominationStatusInput: string
  setAmendNominationStatusInput: (value: string) => void
  amendAllocationStatusInput: string
  setAmendAllocationStatusInput: (value: string) => void
  amendPriceIndexInput: string
  setAmendPriceIndexInput: (value: string) => void
  amendPriceIndexOptions: ReferenceRecord[]
  amendPriceInput: string
  setAmendPriceInput: (value: string) => void
  amendVolumeInput: string
  setAmendVolumeInput: (value: string) => void
  amendInvoiceStatusInput: string
  setAmendInvoiceStatusInput: (value: string) => void
  amendPaymentStatusInput: string
  setAmendPaymentStatusInput: (value: string) => void
  amendSettlementStatusInput: string
  setAmendSettlementStatusInput: (value: string) => void
  amendTraderUserInput: string
  setAmendTraderUserInput: (value: string) => void
  amendLegs: TradeLegDraft[]
  activeCommodities: ReferenceRecord[]
  addDraftLeg: () => void
  removeDraftLeg: (index: number) => void
  updateDraftLeg: (index: number, field: keyof TradeLegDraft, value: string) => void
  amending: boolean
  cancelling: boolean
  amendError: string
  counterpartyCreditPolicyPreview: CounterpartyCreditPolicyPreview | null
  tradeInstrumentTypeOptions: readonly string[]
  optionTypeOptions: readonly string[]
  optionStyleOptions: readonly string[]
  tradeNatureOptions: readonly string[]
  tradeStructureOptions: readonly string[]
  tradeSideOptions: readonly string[]
  pricingTypeOptions: readonly string[]
  pricingStatusOptions: readonly string[]
  confirmationStatusOptions: readonly string[]
  nominationStatusOptions: readonly string[]
  allocationStatusOptions: readonly string[]
  invoiceStatusOptions: readonly string[]
  paymentStatusOptions: readonly string[]
  settlementStatusOptions: readonly string[]
  pricingTypesRequiringExplicitPrice: readonly string[]
  pricingTypesRequiringPriceIndex: readonly string[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  statusTone: (status: string) => 'active' | 'cancelled'
}

export function TradingWorkspace(props: TradingWorkspaceProps) {
  const {
    authSession,
    routeHandoff,
    globalFilter,
    operationalResourceDescriptors,
    tradeMetadataSource,
    tradeMetadataError,
    tradeCaptureFormProps,
    trades,
    tradeWorkflowItems,
    activeTradeCount,
    totalActiveVolume,
    pricedActiveTrades,
    pricingCoverage,
    pendingPricingTrades,
    trackedBooks,
    largestPositionRow,
    selectedTrade,
    selectedTradeId,
    selectedTradeEvents,
    inspectorTab,
    setSelectedTradeId,
    setInspectorTab,
    onClearHandoff,
    handleDuplicateTrade,
    handleAmendTrade,
    handleCancelTrade,
    handleOptionLifecycleEvent,
    optionLifecycleSubmittingEvent,
    amendmentPreviewFields,
    cancelImpactSummary,
    amendmentLockedReason,
    amendExternalTradeIdInput,
    setAmendExternalTradeIdInput,
    amendSourceSystemInput,
    amendExecutionTimestampInput,
    setAmendExecutionTimestampInput,
    amendTradeDateInput,
    setAmendTradeDateInput,
    amendEffectiveStartDateInput,
    setAmendEffectiveStartDateInput,
    amendEffectiveEndDateInput,
    setAmendEffectiveEndDateInput,
    amendQualitySpecInput,
    setAmendQualitySpecInput,
    amendUnitInput,
    setAmendUnitInput,
    amendUnitOptions,
    amendTradeCurrencyInput,
    setAmendTradeCurrencyInput,
    amendCurrencyOptions,
    amendLocationInput,
    setAmendLocationInput,
    amendLocationOptions,
    amendDeliveryStartInput,
    setAmendDeliveryStartInput,
    amendDeliveryEndInput,
    setAmendDeliveryEndInput,
    amendPriceUnitInput,
    setAmendPriceUnitInput,
    amendPriceUnitOptions,
    amendTradeInstrumentTypeInput,
    setAmendTradeInstrumentTypeInput,
    amendOptionTypeInput,
    setAmendOptionTypeInput,
    amendOptionStyleInput,
    setAmendOptionStyleInput,
    amendOptionExpirationDateInput,
    setAmendOptionExpirationDateInput,
    amendOptionStrikePriceInput,
    setAmendOptionStrikePriceInput,
    amendBookInput,
    setAmendBookInput,
    amendBookOptions,
    amendPortfolioInput,
    setAmendPortfolioInput,
    amendPortfolioOptions,
    amendCounterpartyInput,
    setAmendCounterpartyInput,
    amendCounterpartyOptions,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    commodityClassOptions,
    amendCommodityInput,
    setAmendCommodityInput,
    amendCommodityOptions,
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendPricingTypeInput,
    setAmendPricingTypeInput,
    amendPricingStatusInput,
    setAmendPricingStatusInput,
    amendConfirmationStatusInput,
    setAmendConfirmationStatusInput,
    amendNominationStatusInput,
    setAmendNominationStatusInput,
    amendAllocationStatusInput,
    setAmendAllocationStatusInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceIndexOptions,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendInvoiceStatusInput,
    setAmendInvoiceStatusInput,
    amendPaymentStatusInput,
    setAmendPaymentStatusInput,
    amendSettlementStatusInput,
    setAmendSettlementStatusInput,
    amendTraderUserInput,
    setAmendTraderUserInput,
    amendLegs,
    activeCommodities,
    addDraftLeg,
    removeDraftLeg,
    updateDraftLeg,
    amending,
    cancelling,
    amendError,
    counterpartyCreditPolicyPreview,
    tradeInstrumentTypeOptions,
    optionTypeOptions,
    optionStyleOptions,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    confirmationStatusOptions,
    nominationStatusOptions,
    allocationStatusOptions,
    invoiceStatusOptions,
    paymentStatusOptions,
    settlementStatusOptions,
    pricingTypesRequiringExplicitPrice,
    pricingTypesRequiringPriceIndex,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
    formatDateOnly,
    statusTone,
  } = props
  const [linkedPreTradeReview, setLinkedPreTradeReview] = useState<PreTradeReviewItemRecord | null>(null)
  const [linkedPreTradeReviewLoading, setLinkedPreTradeReviewLoading] = useState(false)
  const [linkedPreTradeReviewError, setLinkedPreTradeReviewError] = useState('')
  const [linkedPreTradeRecommendationRun, setLinkedPreTradeRecommendationRun] = useState<PreTradeRecommendationRunRecord | null>(null)
  const [linkedPreTradeRecommendationRunError, setLinkedPreTradeRecommendationRunError] = useState('')
  const linkedPreTradeReviewId = useMemo(
    () => selectedTrade?.pretrade_review_id ?? parsePreTradeReviewId(selectedTradeEvents),
    [selectedTrade?.pretrade_review_id, selectedTradeEvents],
  )
  const linkedPreTradeReviewAccessToken = authSession?.accessToken ?? null
  const linkedPreTradeRecommendationRunId = (
    linkedPreTradeReview?.recommendation_run_id
    ?? selectedTrade?.pretrade_recommendation_run_id
    ?? null
  )
  const linkedPreTradeApprovalGovernanceSnapshot = (
    selectedTrade?.pretrade_approval_governance_snapshot
    ?? linkedPreTradeReview?.approval_governance_snapshot
    ?? null
  )
  const linkedPreTradeBookingGovernanceSnapshot = (
    selectedTrade?.pretrade_booking_governance_snapshot
    ?? linkedPreTradeReview?.booking_governance_snapshot
    ?? null
  )

  useEffect(() => {
    if (!linkedPreTradeReviewAccessToken || linkedPreTradeReviewId === null) {
      setLinkedPreTradeReview(null)
      setLinkedPreTradeReviewLoading(false)
      setLinkedPreTradeReviewError('')
      return
    }

    const accessToken = linkedPreTradeReviewAccessToken
    const reviewId = linkedPreTradeReviewId
    let cancelled = false
    setLinkedPreTradeReviewLoading(true)
    setLinkedPreTradeReviewError('')

    async function loadReview() {
      try {
        const review = await loadPreTradeReviewItem(appConfig.apiBase, accessToken, reviewId)
        if (!cancelled) {
          setLinkedPreTradeReview(review)
          setLinkedPreTradeReviewError('')
        }
      } catch (error) {
        if (!cancelled) {
          setLinkedPreTradeReview(null)
          setLinkedPreTradeReviewError(error instanceof Error ? error.message : 'Could not load the originating pre-trade review.')
        }
      } finally {
        if (!cancelled) {
          setLinkedPreTradeReviewLoading(false)
        }
      }
    }

    void loadReview()

    return () => {
      cancelled = true
    }
  }, [linkedPreTradeReviewAccessToken, linkedPreTradeReviewId])

  useEffect(() => {
    if (!linkedPreTradeReviewAccessToken || linkedPreTradeRecommendationRunId === null) {
      setLinkedPreTradeRecommendationRun(null)
      setLinkedPreTradeRecommendationRunError('')
      return
    }

    const accessToken = linkedPreTradeReviewAccessToken
    const runId = linkedPreTradeRecommendationRunId
    let cancelled = false
    setLinkedPreTradeRecommendationRunError('')

    async function loadRecommendationRun() {
      try {
        const run = await loadPreTradeRecommendationRun(appConfig.apiBase, accessToken, runId)
        if (!cancelled) {
          setLinkedPreTradeRecommendationRun(run)
        }
      } catch (error) {
        if (!cancelled) {
          setLinkedPreTradeRecommendationRun(null)
          setLinkedPreTradeRecommendationRunError(error instanceof Error ? error.message : 'Could not load the attached recommendation run.')
        }
      }
    }

    void loadRecommendationRun()

    return () => {
      cancelled = true
    }
  }, [linkedPreTradeReviewAccessToken, linkedPreTradeRecommendationRunId])

  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const normalizedRouteHandoff = normalizeAppRouteHandoff(routeHandoff)
  const routeHandoffInspectorTab = normalizedRouteHandoff?.tradeInspectorTab ?? null
  function clearWorkspaceHandoff() {
    setScreenFilter('')
    setSelectedTradeId(null)
    onClearHandoff()
  }
  const visibleTrades = useMemo(
    () => trades.filter((trade) => matchesTradeScreenFilter(trade, effectiveScreenFilter)),
    [effectiveScreenFilter, trades],
  )
  const hasScreenFilter = effectiveScreenFilter.trim().length > 0
  const visibleActiveTrades = useMemo(
    () => visibleTrades.filter((trade) => tradeStatusIsActive(trade.status)),
    [visibleTrades],
  )
  const visibleActiveTradeCount = hasScreenFilter ? visibleActiveTrades.length : activeTradeCount
  const visibleTotalActiveVolume = hasScreenFilter
    ? visibleActiveTrades.reduce((sum, trade) => sum + (trade.volume ?? 0), 0)
    : totalActiveVolume
  const visiblePricedActiveTrades = hasScreenFilter
    ? visibleActiveTrades.filter((trade) => trade.price !== null).length
    : pricedActiveTrades
  const visiblePendingPricingTrades = hasScreenFilter
    ? visibleActiveTrades.filter((trade) => trade.pricing_status === 'PENDING').length
    : pendingPricingTrades
  const visibleTrackedBooks = hasScreenFilter
    ? new Set(visibleActiveTrades.map((trade) => trade.book)).size
    : trackedBooks
  const visiblePricingCoverage = hasScreenFilter
    ? visibleActiveTradeCount === 0
      ? null
      : Math.round((visiblePricedActiveTrades / visibleActiveTradeCount) * 100)
    : pricingCoverage
  const selectedTradeHiddenByFilter =
    hasScreenFilter &&
    selectedTrade !== null &&
    !visibleTrades.some((trade) => trade.trade_id === selectedTrade.trade_id)
  const selectedTradeIsOption = selectedTrade
    ? tradeInstrumentUsesOptionFields(selectedTrade.instrument_type)
    : false
  const selectedTradeIsActive = selectedTrade ? tradeStatusIsActive(selectedTrade.status) : false
  const selectedTradePriceLabel = selectedTradeIsOption ? 'Premium' : 'Price'
  const selectedTradeVolumeLabel = selectedTradeIsOption ? 'Contracts' : 'Volume'
  const selectedTradePremiumCashflow = selectedTrade
    ? calculatePremiumCashflow(selectedTrade.trade_side, selectedTrade.price, selectedTrade.volume)
    : null
  const selectedTradeUnderlyingEquivalent = selectedTrade
    ? calculateUnderlyingEquivalentVolume(
        selectedTrade.trade_side,
        selectedTrade.option_type,
        selectedTrade.volume,
      )
    : 0
  const selectedTradeDaysToExpiration = selectedTrade
    ? calculateDaysToExpiration(selectedTrade.option_expiration_date)
    : null
  const canExpireOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTradeDaysToExpiration !== null &&
    selectedTradeDaysToExpiration <= 0
  const canExerciseOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTrade?.trade_side === 'BUY' &&
    selectedTradeDaysToExpiration !== null &&
    ((selectedTrade.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? selectedTradeDaysToExpiration === 0
      : selectedTradeDaysToExpiration >= 0)
  const canAssignOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTrade?.trade_side === 'SELL' &&
    selectedTradeDaysToExpiration !== null &&
    ((selectedTrade.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? selectedTradeDaysToExpiration === 0
      : selectedTradeDaysToExpiration >= 0)
  const optionLifecycleGuidance = selectedTradeIsOption
    ? (selectedTrade?.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? 'European options can only be exercised or assigned on expiration day. Expiry can be recorded once the expiration date is reached.'
      : 'American options can be exercised or assigned any time up to expiration. Expiry can be recorded once the expiration date is reached.'
    : ''
  const selectedTradeCreditWorkflowItem = selectedTrade
    ? tradeWorkflowItems.find(
        (item) => item.trade_id === selectedTrade.trade_id && item.workflow_type === 'CREDIT_APPROVAL',
      ) ?? null
    : null
  const selectedTradeCreditFreshness = selectedTradeCreditWorkflowItem?.credit_approval_freshness ?? null
  const selectedTradeCreditFreshnessSummary = buildCreditApprovalFreshnessBlockerSummary(
    selectedTradeCreditFreshness,
  )
  const selectedTradeOptionSettlementItem = selectedTrade
    ? tradeWorkflowItems.find(
        (item) => item.trade_id === selectedTrade.trade_id && item.workflow_type === 'OPTION_SETTLEMENT',
      ) ?? null
    : null
  const selectedTradeLinkedUnderlying = selectedTrade
    ? trades.find((trade) => trade.originating_option_trade_id === selectedTrade.trade_id) ?? null
    : null
  const selectedTradeOriginatingOption = selectedTrade?.originating_option_trade_id
    ? trades.find((trade) => trade.trade_id === selectedTrade.originating_option_trade_id) ?? null
    : null
  const {
    latestMarksByCode: selectedTradeLatestMarksByCode,
    loading: selectedTradeMarksLoading,
    error: selectedTradeMarksError,
  } = useLatestPriceIndexMarks([
    selectedTrade?.price_index_code,
    selectedTradeLinkedUnderlying?.price_index_code,
    selectedTradeOriginatingOption?.price_index_code,
  ])
  const selectedTradeSettlementValuation =
    selectedTrade && selectedTradeIsOption && selectedTradeLinkedUnderlying
      ? buildOptionSettlementValuation(
          selectedTrade,
          selectedTradeLinkedUnderlying,
          selectedTradeLatestMarksByCode,
        )
      : selectedTrade && selectedTradeOriginatingOption
        ? buildOptionSettlementValuation(
            selectedTradeOriginatingOption,
            selectedTrade,
            selectedTradeLatestMarksByCode,
          )
        : null
  const selectedTradeOpenOptionValuation =
    selectedTrade && selectedTradeIsOption && selectedTradeIsActive
      ? buildOpenOptionValuation(selectedTrade, selectedTradeLatestMarksByCode)
      : null
  const tradeOperationalProjectionWorkboard = resolveOperationalWorkboardDefinition(
    'tradeOperationalProjection',
    operationalResourceDescriptors,
  )
  const tradeMetadataFallbackNotice =
    tradeMetadataSource === 'fallback' && tradeMetadataError
      ? `Using built-in trade metadata fallback while the server metadata contract is unavailable: ${tradeMetadataError}`
      : null

  const tradeBoardColumns: DataSheetColumn<Trade>[] = [
    {
      id: 'trade',
      label: 'Trade',
      width: '12rem',
      renderCell: (trade) => trade.trade_id,
    },
    {
      id: 'instrument',
      label: 'Instrument',
      width: '9rem',
      renderCell: (trade) => trade.instrument_type,
    },
    {
      id: 'nature',
      label: 'Nature',
      width: '9rem',
      renderCell: (trade) => trade.trade_nature,
    },
    {
      id: 'structure',
      label: 'Structure',
      width: '9rem',
      renderCell: (trade) => trade.trade_structure,
    },
    {
      id: 'book',
      label: 'Book',
      width: '9rem',
      renderCell: (trade) => trade.book,
    },
    {
      id: 'class',
      label: 'Class',
      width: '10rem',
      renderCell: (trade) => formatCommodityClass(trade.commodity_class),
    },
    {
      id: 'commodity',
      label: 'Commodity',
      width: '12rem',
      renderCell: (trade) => trade.commodity,
    },
    {
      id: 'price',
      label: 'Price Differential',
      align: 'end',
      width: '10rem',
      renderCell: (trade) => formatMoney(trade.price),
    },
    {
      id: 'volume',
      label: 'Volume',
      align: 'end',
      width: '8rem',
      renderCell: (trade) => formatNumber(trade.volume, 0),
    },
    {
      id: 'status',
      label: 'Status',
      width: '10rem',
      renderCell: (trade) => (
        <Tooltip content={tradeStatusIsActive(trade.status) ? tradeTooltipCopy.activeTrade : tradeTooltipCopy.closedTrade}>
          <span className={`status-pill status-pill-${statusTone(trade.status)} tooltip-trigger-hint`}>{trade.status}</span>
        </Tooltip>
      ),
    },
    {
      id: 'credit',
      label: 'Credit',
      width: '12rem',
      renderCell: (trade) =>
        trade.credit_hold_active ? (
          <span className="status-pill status-pill-blocked">{creditApprovalLabel(trade.credit_approval_status)}</span>
        ) : (
          <span className="entity-chip entity-chip-soft">
            {trade.credit_approval_status === 'APPROVED' ? 'APPROVED' : 'CLEAR'}
          </span>
        ),
    },
    {
      id: 'updated',
      label: 'Updated',
      align: 'end',
      width: '12rem',
      renderCell: (trade) => formatDate(trade.updated_at),
    },
  ]

  return (
    <TileLayout
      workspaceId="trades"
      workspaceLabel="Trading"
      authSession={authSession}
      headerContent={
        <>
          <WorkspaceHandoffFocusBanner
            handoff={routeHandoff}
            currentView="trades"
            clearLabel="Show Full Blotter"
            onClear={clearWorkspaceHandoff}
            actions={
              routeHandoffInspectorTab && routeHandoffInspectorTab !== inspectorTab
                ? [
                    {
                      label: `Open ${routeHandoffInspectorTab} Tab`,
                      onClick: () => setInspectorTab(routeHandoffInspectorTab),
                    },
                  ]
                : []
            }
          />
          <WorkspaceLocalFilterBar
            value={screenFilter}
            onChange={setScreenFilter}
            placeholder="Trade ID, counterparty, commodity, book, lifecycle status, or trader"
            description="Keep the blotter filter local to trade capture so you can narrow this screen without shifting anything in the rest of the console."
            totalCount={trades.length}
            matchedCount={visibleTrades.length}
            resultLabel="trades"
            globalValue={globalFilter}
            note={
              selectedTradeHiddenByFilter
                ? `Selected trade ${selectedTrade?.trade_id} is still open in the inspector, but it is outside the current trade filters.`
                : undefined
            }
          />
        </>
      }
      tiles={[
        {
          id: 'create-trade',
          eyebrow: 'Ticket Entry',
          title: 'Create Trade',
          description: 'Enter a ticket on the left and keep the blotter plus inspector docked beside it while you work.',
          span: 'wide',
          availableSpans: ['full', 'wide'],
          content: (
            <>
              {tradeMetadataFallbackNotice ? <p className="form-note">{tradeMetadataFallbackNotice}</p> : null}
              <TradeCaptureForm {...tradeCaptureFormProps} />
            </>
          ),
        },
        {
          id: 'trade-inspector',
          eyebrow: 'Inspector',
          title: selectedTrade ? selectedTrade.trade_id : 'No Selection',
          description: selectedTrade
            ? `${selectedTrade.instrument_type} • ${selectedTrade.trade_nature} • ${selectedTrade.trade_structure} • ${selectedTrade.book}`
            : 'Pick a blotter row to inspect state, event history, and amendment controls.',
          span: 'side',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <OperationalInspectorShell
              actions={
                selectedTrade ? (
                <div className="stack-actions">
                  <button type="button" className="button button-secondary" onClick={handleDuplicateTrade}>
                    Duplicate Into Form
                  </button>
                  {selectedTradeIsOption && selectedTradeIsActive ? (
                    <>
                      {selectedTrade.trade_side === 'BUY' ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOptionLifecycleEvent('OptionExercised')}
                          disabled={!canExerciseOption || optionLifecycleSubmittingEvent !== null}
                        >
                          {optionLifecycleSubmittingEvent === 'OptionExercised' ? 'Exercising...' : 'Exercise Option'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOptionLifecycleEvent('OptionAssigned')}
                          disabled={!canAssignOption || optionLifecycleSubmittingEvent !== null}
                        >
                          {optionLifecycleSubmittingEvent === 'OptionAssigned' ? 'Assigning...' : 'Assign Option'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleOptionLifecycleEvent('OptionExpired')}
                        disabled={!canExpireOption || optionLifecycleSubmittingEvent !== null}
                      >
                        {optionLifecycleSubmittingEvent === 'OptionExpired' ? 'Expiring...' : 'Expire Option'}
                      </button>
                    </>
                  ) : null}
                </div>
                ) : null
              }
              eyebrow={selectedTrade ? 'Active Ticket' : undefined}
              title={selectedTrade ? selectedTrade.commodity : null}
              subtitle={
                selectedTrade
                  ? `${selectedTrade.trade_side ?? 'LEG-DEFINED'} • ${selectedTrade.instrument_type} • ${selectedTrade.trade_nature} • ${selectedTrade.book}`
                  : undefined
              }
              statusRow={
                selectedTrade ? (
                  <>
                    <span className={`status-pill status-pill-${statusTone(selectedTrade.status)}`}>{selectedTrade.status}</span>
                    {selectedTrade.credit_hold_active ? (
                      <span className="status-pill status-pill-blocked">
                        Credit {creditApprovalLabel(selectedTrade.credit_approval_status)}
                      </span>
                    ) : null}
                    {selectedTrade.active_credit_exception ? (
                      <span className="entity-chip entity-chip-soft">
                        Exception to {formatDateOnly(selectedTrade.active_credit_exception.expires_at)}
                      </span>
                    ) : null}
                    {selectedTradeCreditFreshness?.approval_blocked ? (
                      <span className="status-pill status-pill-blocked">Stale Credit Data</span>
                    ) : null}
                    <span className="entity-chip entity-chip-soft">Pricing {selectedTrade.pricing_status}</span>
                    <span className="entity-chip entity-chip-soft">Confirmation {selectedTrade.confirmation_status}</span>
                    <span className="entity-chip entity-chip-soft">Nomination {selectedTrade.nomination_status}</span>
                    <span className="entity-chip entity-chip-soft">
                      Actualization {selectedTrade.actualization_status.replaceAll('_', ' ')}
                    </span>
                    <span className="entity-chip entity-chip-soft">Settlement {selectedTrade.settlement_status}</span>
                    <span className="entity-chip entity-chip-soft">Payment {selectedTrade.payment_status}</span>
                  </>
                ) : null
              }
              workboard={selectedTrade ? tradeOperationalProjectionWorkboard : null}
              notices={
                selectedTrade ? (
                  <>
                    {selectedTrade.credit_hold_active ? (
                      <p className="field-error">
                        {selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}
                      </p>
                    ) : null}
                    {selectedTrade.active_credit_exception?.revalidation_required ? (
                      <p className="field-error">
                        Credit exception needs fresh review: {creditExceptionReasonLabel(selectedTrade.active_credit_exception.revalidation_reason) ?? 'revalidation required'}.
                      </p>
                    ) : null}
                    {selectedTradeCreditFreshnessSummary ? (
                      <p className="field-error">
                        Credit approval is blocked until fresh credit data is loaded: {selectedTradeCreditFreshnessSummary}
                      </p>
                    ) : null}
                    {selectedTradeIsOption ? (
                      <p className="form-note">
                        {selectedTradeIsActive ? optionLifecycleGuidance : `This option is already closed as ${selectedTrade.status}.`}
                      </p>
                    ) : null}
                    {selectedTradeIsOption && selectedTradeOpenOptionValuation ? (
                      <p className={selectedTradeOpenOptionValuation.decisionTone === 'blocked' ? 'field-error' : 'form-note'}>
                        {selectedTradeOpenOptionValuation.decisionLabel}: {selectedTradeOpenOptionValuation.decisionReason}
                      </p>
                    ) : null}
                    {selectedTradeOptionSettlementItem ? (
                      <p className="form-note">
                        Operations workflow: {selectedTradeOptionSettlementItem.status.replaceAll('_', ' ')}
                        {selectedTradeOptionSettlementItem.due_at
                          ? ` due ${formatDateOnly(selectedTradeOptionSettlementItem.due_at)}.`
                          : '.'}{' '}
                        {selectedTradeOptionSettlementItem.notes ?? 'Book the resulting underlying handoff from this lifecycle event.'}
                        {selectedTradeOptionSettlementItem.linked_trade_id
                          ? ` Linked trade ${selectedTradeOptionSettlementItem.linked_trade_id} is ${selectedTradeOptionSettlementItem.linked_trade_status ?? 'ACTIVE'}.`
                          : ''}
                      </p>
                    ) : null}
                    {linkedPreTradeReviewLoading && linkedPreTradeReviewId !== null ? (
                      <p className="form-note">Loading the originating pre-trade review...</p>
                    ) : null}
                    {linkedPreTradeReviewError ? (
                      <p className="field-error">{linkedPreTradeReviewError}</p>
                    ) : null}
                    {linkedPreTradeReview ? (
                      <p className="form-note">
                        Originated from approved pre-trade review #{linkedPreTradeReview.review_id} {linkedPreTradeReview.name}.
                        {linkedPreTradeReview.booked_at ? ` Booked ${formatDate(linkedPreTradeReview.booked_at)}.` : ''}
                      </p>
                    ) : null}
                  </>
                ) : null
              }
              related={
                selectedTrade ? (
                  <>
                    {selectedTradeLinkedUnderlying ? (
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">
                          Linked Underlying {selectedTradeLinkedUnderlying.trade_id}
                        </span>
                        <span className="entity-chip entity-chip-soft">{selectedTradeLinkedUnderlying.status}</span>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setSelectedTradeId(selectedTradeLinkedUnderlying.trade_id)}
                        >
                          Open Underlying
                        </button>
                      </div>
                    ) : null}
                    {selectedTradeOriginatingOption ? (
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">
                          Originating Option {selectedTradeOriginatingOption.trade_id}
                        </span>
                        <span className="entity-chip entity-chip-soft">{selectedTradeOriginatingOption.status}</span>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setSelectedTradeId(selectedTradeOriginatingOption.trade_id)}
                        >
                          Open Option
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null
              }
              metrics={
                selectedTrade
                  ? [
                      { label: selectedTradePriceLabel, value: formatMoney(selectedTrade.price) },
                      { label: selectedTradeVolumeLabel, value: formatNumber(selectedTrade.volume, 0) },
                      {
                        label: 'Notional',
                        value:
                          selectedTrade.price !== null && selectedTrade.volume !== null
                            ? formatMoney(selectedTrade.price * selectedTrade.volume)
                            : '—',
                      },
                      { label: 'Trader', value: selectedTrade.trader_user ?? 'TBD' },
                    ]
                  : []
              }
            >

              <div className="tab-row">
                {INSPECTOR_TABS.map((tab) => (
                  <Tooltip key={tab.key} content={tab.tooltip} placement="bottom">
                    <button
                      type="button"
                      className={`tab-pill ${inspectorTab === tab.key ? 'is-active' : ''}`}
                      onClick={() => setInspectorTab(tab.key)}
                      disabled={!selectedTrade}
                    >
                      {tab.label}
                    </button>
                  </Tooltip>
                ))}
              </div>

              {!selectedTrade && (
                <div className="empty-state empty-state-tall">
                  <strong>No trade selected</strong>
                  <p>Select a blotter row to inspect economics, lifecycle history, and next actions for a single trade.</p>
                </div>
              )}

              {selectedTrade && inspectorTab === 'overview' && (
                <div className="detail-list">
                  <div className="detail-row">
                    <span>External Trade ID</span>
                    <strong>{selectedTrade.external_trade_id ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Source System</span>
                    <strong>{selectedTrade.source_system ?? '—'}</strong>
                  </div>
                  {linkedPreTradeReview ? (
                    <>
                      <div className="detail-row">
                        <span>Pre-Trade Review</span>
                        <strong>{`#${linkedPreTradeReview.review_id} ${linkedPreTradeReview.name}`}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Review Approval</span>
                        <strong>{linkedPreTradeReview.review_status}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Review Booked</span>
                        <strong>{formatDate(linkedPreTradeReview.booked_at)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Review Booked By</span>
                        <strong>{linkedPreTradeReview.booked_by ?? '—'}</strong>
                      </div>
                      {linkedPreTradeApprovalGovernanceSnapshot ? (
                        <div className="detail-row">
                          <span>Approval Audit</span>
                          <strong>{formatDate(linkedPreTradeApprovalGovernanceSnapshot.generated_at)}</strong>
                        </div>
                      ) : null}
                      {linkedPreTradeBookingGovernanceSnapshot ? (
                        <div className="detail-row">
                          <span>Booking Audit</span>
                          <strong>{formatDate(linkedPreTradeBookingGovernanceSnapshot.generated_at)}</strong>
                        </div>
                      ) : null}
                      {linkedPreTradeReview.recommendation_summary ? (
                        <div className="detail-row">
                          <span>Recommendation</span>
                          <strong>
                            {linkedPreTradeReview.recommendation_summary.stance.replaceAll('_', ' ')}
                            {` / ${linkedPreTradeReview.recommendation_summary.score}`}
                          </strong>
                        </div>
                      ) : null}
                      {linkedPreTradeReview.recommendation_override_reason ? (
                        <div className="detail-row">
                          <span>Recommendation Override</span>
                          <strong>{linkedPreTradeReview.recommendation_override_by ?? 'Logged'}</strong>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="detail-row">
                    <span>Execution Time</span>
                    <strong>{formatDate(selectedTrade.execution_timestamp)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Date</span>
                    <strong>{formatDateOnly(selectedTrade.trade_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Effective Start</span>
                    <strong>{formatDateOnly(selectedTrade.effective_start_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Effective End</span>
                    <strong>{formatDateOnly(selectedTrade.effective_end_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Quality Spec</span>
                    <strong>{selectedTrade.quality_spec ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Quantity Unit</span>
                    <strong>{selectedTrade.unit_of_measure ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Currency</span>
                    <strong>{selectedTrade.trade_currency_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Price Unit</span>
                    <strong>{selectedTrade.price_unit_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Location</span>
                    <strong>{selectedTrade.location_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Delivery Start</span>
                    <strong>{formatDateOnly(selectedTrade.delivery_start)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Delivery End</span>
                    <strong>{formatDateOnly(selectedTrade.delivery_end)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Instrument</span>
                    <strong>{selectedTrade.instrument_type}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Nature</span>
                    <strong>{selectedTrade.trade_nature}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Structure</span>
                    <strong>{selectedTrade.trade_structure}</strong>
                  </div>
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Lifecycle</span>
                      <strong>{selectedTrade.status}</strong>
                    </div>
                  )}
                  {selectedTradeOptionSettlementItem && (
                    <div className="detail-row">
                      <span>Option Settlement Workflow</span>
                      <strong>{selectedTradeOptionSettlementItem.status}</strong>
                    </div>
                  )}
                  {selectedTradeLinkedUnderlying && (
                    <div className="detail-row">
                      <span>Linked Underlying Trade</span>
                      <strong>{selectedTradeLinkedUnderlying.trade_id}</strong>
                    </div>
                  )}
                  {selectedTradeOriginatingOption && (
                    <div className="detail-row">
                      <span>Originating Option Trade</span>
                      <strong>{selectedTradeOriginatingOption.trade_id}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Type</span>
                      <strong>{selectedTrade.option_type ?? '—'}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Style</span>
                      <strong>{selectedTrade.option_style ?? '—'}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Expiration</span>
                      <strong>{formatDateOnly(selectedTrade.option_expiration_date)}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Strike Price</span>
                      <strong>{formatMoney(selectedTrade.option_strike_price)}</strong>
                    </div>
                  )}
                  <div className="detail-row">
                    <span>Trade Side</span>
                    <strong>{selectedTrade.trade_side ?? 'Leg-defined'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Commodity Class</span>
                    <strong>{formatCommodityClass(selectedTrade.commodity_class)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Commodity</span>
                    <strong>{selectedTrade.commodity}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Book</span>
                    <strong>{selectedTrade.book}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Portfolio</span>
                    <strong>{selectedTrade.portfolio ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Counterparty</span>
                    <strong>{selectedTrade.counterparty ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Pricing Type</span>
                    <strong>{selectedTrade.pricing_type}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Pricing Status</span>
                    <strong>{selectedTrade.pricing_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Confirmation Status</span>
                    <strong>{selectedTrade.confirmation_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Nomination Status</span>
                    <strong>{selectedTrade.nomination_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Allocation Status</span>
                    <strong>{selectedTrade.allocation_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Actualization Status</span>
                    <strong>{selectedTrade.actualization_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Price Index</span>
                    <strong>{selectedTrade.price_index_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{selectedTradePriceLabel}</span>
                    <strong>{formatMoney(selectedTrade.price)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{selectedTradeVolumeLabel}</span>
                    <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Invoice Status</span>
                    <strong>{selectedTrade.invoice_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Payment Status</span>
                    <strong>{selectedTrade.payment_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Settlement Status</span>
                    <strong>{selectedTrade.settlement_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Credit Approval</span>
                    <strong>{creditApprovalLabel(selectedTrade.credit_approval_status)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Credit Hold</span>
                    <strong>{selectedTrade.credit_hold_active ? 'ACTIVE' : 'CLEARED'}</strong>
                  </div>
                  {selectedTrade.credit_hold_active ? (
                    <div className="detail-row">
                      <span>Credit Hold Reason</span>
                      <strong>{selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}</strong>
                    </div>
                  ) : null}
                  {selectedTradeCreditFreshness ? (
                    <>
                      <div className="detail-row">
                        <span>Credit Review Due</span>
                        <strong>{formatDateOnly(selectedTradeCreditFreshness.review_due_at)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Latest External Snapshot</span>
                        <strong>
                          {selectedTradeCreditFreshness.latest_external_snapshot_provider
                            ? `${selectedTradeCreditFreshness.latest_external_snapshot_provider} · ${formatDateOnly(selectedTradeCreditFreshness.latest_external_snapshot_as_of_date)}`
                            : '—'}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Snapshot Age</span>
                        <strong>
                          {selectedTradeCreditFreshness.latest_external_snapshot_age_days !== null
                            ? `${selectedTradeCreditFreshness.latest_external_snapshot_age_days} days`
                            : '—'}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Approval Freshness</span>
                        <strong>
                          {selectedTradeCreditFreshness.approval_blocked
                            ? 'BLOCKED'
                            : 'CURRENT'}
                        </strong>
                      </div>
                      {selectedTradeCreditFreshnessSummary ? (
                        <div className="detail-row">
                          <span>Freshness Blocker</span>
                          <strong>{selectedTradeCreditFreshnessSummary}</strong>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {selectedTrade.active_credit_exception ? (
                    <>
                      <div className="detail-row">
                        <span>Credit Exception Expires</span>
                        <strong>{formatDate(selectedTrade.active_credit_exception.expires_at)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Approved Exception Ceiling</span>
                        <strong>
                          {selectedTrade.active_credit_exception.limit_currency_code}{' '}
                          {formatNumber(selectedTrade.active_credit_exception.approved_projected_exposure_amount, 2)}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Remaining Exception Headroom</span>
                        <strong>
                          {selectedTrade.active_credit_exception.remaining_headroom_amount !== null
                            ? `${selectedTrade.active_credit_exception.limit_currency_code} ${formatNumber(selectedTrade.active_credit_exception.remaining_headroom_amount, 2)}`
                            : '—'}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Exception Approved By</span>
                        <strong>{selectedTrade.active_credit_exception.approved_by}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Exception Revalidation</span>
                        <strong>
                          {selectedTrade.active_credit_exception.revalidation_required
                            ? creditExceptionReasonLabel(selectedTrade.active_credit_exception.revalidation_reason) ?? 'REQUIRED'
                            : 'WITHIN APPROVED ENVELOPE'}
                        </strong>
                      </div>
                    </>
                  ) : null}
                  {selectedTradeCreditWorkflowItem?.credit_decision_history.length ? (
                    <div className="stack">
                      <span className="eyebrow">Credit Decisions</span>
                      <div className="timeline">
                        {selectedTradeCreditWorkflowItem.credit_decision_history.map((decision) => (
                          <article key={decision.decision_id} className="timeline-item">
                            <div className="timeline-dot" />
                            <div className="timeline-body">
                              <div className="timeline-head">
                                <strong>{creditApprovalLabel(decision.decision)}</strong>
                                <span>{formatDate(decision.decided_at)}</span>
                              </div>
                              <p>{decision.decision_comment}</p>
                              <p>
                                {decision.decided_by}
                                {creditDecisionExposureSummary(decision)
                                  ? ` • ${creditDecisionExposureSummary(decision)}`
                                  : ''}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {linkedPreTradeReview?.review_notes || linkedPreTradeReview?.thesis ? (
                    <div className="stack">
                      <span className="eyebrow">Pre-Trade Rationale</span>
                      <p>{linkedPreTradeReview.review_notes ?? linkedPreTradeReview.thesis}</p>
                    </div>
                  ) : null}
                  {linkedPreTradeReview?.recommendation_summary ? (
                    <div className="stack">
                      <span className="eyebrow">Pre-Trade Recommendation</span>
                      <p>{linkedPreTradeReview.recommendation_summary.headline}</p>
                      <p>
                        {linkedPreTradeReview.recommendation_summary.stance.replaceAll('_', ' ')}
                        {` | score ${linkedPreTradeReview.recommendation_summary.score}`}
                        {` | ${linkedPreTradeReview.recommendation_summary.input_snapshot_count} source snapshots`}
                      </p>
                      {linkedPreTradeReview.recommendation_summary.explanation ? (
                        <p>{linkedPreTradeReview.recommendation_summary.explanation.stance_rationale}</p>
                      ) : null}
                      {linkedPreTradeReview.recommendation_override_reason ? (
                        <p>
                          Override: {linkedPreTradeReview.recommendation_override_reason}
                          {linkedPreTradeReview.recommendation_override_by ? ` | ${linkedPreTradeReview.recommendation_override_by}` : ''}
                          {linkedPreTradeReview.recommendation_override_at ? ` | ${formatDate(linkedPreTradeReview.recommendation_override_at)}` : ''}
                        </p>
                      ) : null}
                      {linkedPreTradeRecommendationRunError ? (
                        <p className="field-error">{linkedPreTradeRecommendationRunError}</p>
                      ) : null}
                      {linkedPreTradeRecommendationRun ? (
                        <>
                          {linkedPreTradeRecommendationRun.comparison ? (
                            <div className="surface pretrade-next-actions">
                              <span className="eyebrow">Recommendation Audit</span>
                              <p>{linkedPreTradeRecommendationRun.comparison.summary}</p>
                              <small>
                                Previous #{linkedPreTradeRecommendationRun.comparison.previous_run_id}
                                {` | ${linkedPreTradeRecommendationRun.comparison.previous_stance.replaceAll('_', ' ')}`}
                                {` | score delta ${linkedPreTradeRecommendationRun.comparison.score_delta > 0 ? '+' : ''}${linkedPreTradeRecommendationRun.comparison.score_delta}`}
                              </small>
                            </div>
                          ) : null}
                          <div className="pretrade-card-list">
                            {linkedPreTradeRecommendationRun.input_snapshots.slice(0, 4).map((snapshot) => (
                              <article key={snapshot.source_key} className="pretrade-record-card pretrade-record-static">
                                <div>
                                  <strong>{snapshot.source_key.replaceAll('-', ' ')}</strong>
                                  <span>{snapshot.source_type} | {snapshot.freshness} | {snapshot.quality_status}</span>
                                </div>
                                <small>
                                  {snapshot.summary ?? 'No source summary captured.'}
                                  {snapshot.provenance.provider ? ` | ${snapshot.provenance.provider}` : ''}
                                </small>
                              </article>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {linkedPreTradeApprovalGovernanceSnapshot || linkedPreTradeBookingGovernanceSnapshot ? (
                    <div className="stack">
                      <span className="eyebrow">Decision-Time Audit</span>
                      {linkedPreTradeApprovalGovernanceSnapshot ? (
                        <div className="surface pretrade-next-actions">
                          <strong>Approval Snapshot</strong>
                          <p>
                            {formatDate(linkedPreTradeApprovalGovernanceSnapshot.generated_at)}
                            {` | ${linkedPreTradeApprovalGovernanceSnapshot.exported_by}`}
                          </p>
                          <small>{governanceAuditSummary(linkedPreTradeApprovalGovernanceSnapshot)}</small>
                        </div>
                      ) : null}
                      {linkedPreTradeBookingGovernanceSnapshot ? (
                        <div className="surface pretrade-next-actions">
                          <strong>Booking Snapshot</strong>
                          <p>
                            {formatDate(linkedPreTradeBookingGovernanceSnapshot.generated_at)}
                            {` | ${linkedPreTradeBookingGovernanceSnapshot.exported_by}`}
                          </p>
                          <small>{governanceAuditSummary(linkedPreTradeBookingGovernanceSnapshot)}</small>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {linkedPreTradeReview?.activity.length ? (
                    <div className="stack">
                      <span className="eyebrow">Pre-Trade Review Activity</span>
                      <div className="timeline">
                        {linkedPreTradeReview.activity.map((activity) => (
                          <article key={activity.activity_id} className="timeline-item">
                            <div className="timeline-dot" />
                            <div className="timeline-body">
                              <div className="timeline-head">
                                <strong>{activity.action.replaceAll('_', ' ').toLowerCase()}</strong>
                                <span>{formatDate(activity.occurred_at)}</span>
                              </div>
                              <p>{activity.comment ?? `${activity.actor_id} updated the pre-trade review.`}</p>
                              <p>{activity.actor_id}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="detail-row">
                    <span>Trader User</span>
                    <strong>{selectedTrade.trader_user ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Updated</span>
                    <strong>{formatDate(selectedTrade.updated_at)}</strong>
                  </div>
                </div>
              )}

              {selectedTrade && inspectorTab === 'events' && (
                <div className="timeline">
                  {selectedTradeEvents.map((event) => (
                    <article key={event.event_id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>{event.event_type}</strong>
                          <span>{formatDate(event.recorded_at)}</span>
                        </div>
                        <p>{event.event_id}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {selectedTrade && inspectorTab === 'amend' && (
                <TradeAmendForm
                  key={selectedTrade.trade_id}
                  onSubmit={handleAmendTrade}
                  handleCancelTrade={handleCancelTrade}
                  selectedTradeId={selectedTrade.trade_id}
                  amendmentPreviewFields={amendmentPreviewFields}
                  cancelImpactSummary={cancelImpactSummary}
                  amendmentLockedReason={amendmentLockedReason}
                  amendExternalTradeIdInput={amendExternalTradeIdInput}
                  setAmendExternalTradeIdInput={setAmendExternalTradeIdInput}
                  amendSourceSystemInput={amendSourceSystemInput}
                  amendExecutionTimestampInput={amendExecutionTimestampInput}
                  setAmendExecutionTimestampInput={setAmendExecutionTimestampInput}
                  amendTradeDateInput={amendTradeDateInput}
                  setAmendTradeDateInput={setAmendTradeDateInput}
                  amendEffectiveStartDateInput={amendEffectiveStartDateInput}
                  setAmendEffectiveStartDateInput={setAmendEffectiveStartDateInput}
                  amendEffectiveEndDateInput={amendEffectiveEndDateInput}
                  setAmendEffectiveEndDateInput={setAmendEffectiveEndDateInput}
                  amendQualitySpecInput={amendQualitySpecInput}
                  setAmendQualitySpecInput={setAmendQualitySpecInput}
                  amendUnitInput={amendUnitInput}
                  setAmendUnitInput={setAmendUnitInput}
                  amendUnitOptions={amendUnitOptions}
                  amendTradeCurrencyInput={amendTradeCurrencyInput}
                  setAmendTradeCurrencyInput={setAmendTradeCurrencyInput}
                  amendCurrencyOptions={amendCurrencyOptions}
                  amendLocationInput={amendLocationInput}
                  setAmendLocationInput={setAmendLocationInput}
                  amendLocationOptions={amendLocationOptions}
                  amendDeliveryStartInput={amendDeliveryStartInput}
                  setAmendDeliveryStartInput={setAmendDeliveryStartInput}
                  amendDeliveryEndInput={amendDeliveryEndInput}
                  setAmendDeliveryEndInput={setAmendDeliveryEndInput}
                  amendPriceUnitInput={amendPriceUnitInput}
                  setAmendPriceUnitInput={setAmendPriceUnitInput}
                  amendPriceUnitOptions={amendPriceUnitOptions}
                  amendTradeInstrumentTypeInput={amendTradeInstrumentTypeInput}
                  setAmendTradeInstrumentTypeInput={setAmendTradeInstrumentTypeInput}
                  amendOptionTypeInput={amendOptionTypeInput}
                  setAmendOptionTypeInput={setAmendOptionTypeInput}
                  amendOptionStyleInput={amendOptionStyleInput}
                  setAmendOptionStyleInput={setAmendOptionStyleInput}
                  amendOptionExpirationDateInput={amendOptionExpirationDateInput}
                  setAmendOptionExpirationDateInput={setAmendOptionExpirationDateInput}
                  amendOptionStrikePriceInput={amendOptionStrikePriceInput}
                  setAmendOptionStrikePriceInput={setAmendOptionStrikePriceInput}
                  amendTradeNatureInput={amendTradeNatureInput}
                  setAmendTradeNatureInput={setAmendTradeNatureInput}
                  amendTradeStructureInput={amendTradeStructureInput}
                  setAmendTradeStructureInput={setAmendTradeStructureInput}
                  amendTradeSideInput={amendTradeSideInput}
                  setAmendTradeSideInput={setAmendTradeSideInput}
                  amendBookInput={amendBookInput}
                  setAmendBookInput={setAmendBookInput}
                  amendBookOptions={amendBookOptions}
                  amendPortfolioInput={amendPortfolioInput}
                  setAmendPortfolioInput={setAmendPortfolioInput}
                  amendPortfolioOptions={amendPortfolioOptions}
                  amendCounterpartyInput={amendCounterpartyInput}
                  setAmendCounterpartyInput={setAmendCounterpartyInput}
                  amendCounterpartyOptions={amendCounterpartyOptions}
                  amendCommodityClassInput={amendCommodityClassInput}
                  setAmendCommodityClassInput={setAmendCommodityClassInput}
                  commodityClassOptions={commodityClassOptions}
                  amendCommodityInput={amendCommodityInput}
                  setAmendCommodityInput={setAmendCommodityInput}
                  amendCommodityOptions={amendCommodityOptions}
                  amendPricingTypeInput={amendPricingTypeInput}
                  setAmendPricingTypeInput={setAmendPricingTypeInput}
                  amendPricingStatusInput={amendPricingStatusInput}
                  setAmendPricingStatusInput={setAmendPricingStatusInput}
                  amendConfirmationStatusInput={amendConfirmationStatusInput}
                  setAmendConfirmationStatusInput={setAmendConfirmationStatusInput}
                  amendNominationStatusInput={amendNominationStatusInput}
                  setAmendNominationStatusInput={setAmendNominationStatusInput}
                  amendAllocationStatusInput={amendAllocationStatusInput}
                  setAmendAllocationStatusInput={setAmendAllocationStatusInput}
                  amendPriceIndexInput={amendPriceIndexInput}
                  setAmendPriceIndexInput={setAmendPriceIndexInput}
                  amendPriceIndexOptions={amendPriceIndexOptions}
                  amendPriceInput={amendPriceInput}
                  setAmendPriceInput={setAmendPriceInput}
                  amendVolumeInput={amendVolumeInput}
                  setAmendVolumeInput={setAmendVolumeInput}
                  amendInvoiceStatusInput={amendInvoiceStatusInput}
                  setAmendInvoiceStatusInput={setAmendInvoiceStatusInput}
                  amendPaymentStatusInput={amendPaymentStatusInput}
                  setAmendPaymentStatusInput={setAmendPaymentStatusInput}
                  amendSettlementStatusInput={amendSettlementStatusInput}
                  setAmendSettlementStatusInput={setAmendSettlementStatusInput}
                  amendTraderUserInput={amendTraderUserInput}
                  setAmendTraderUserInput={setAmendTraderUserInput}
                  amendLegs={amendLegs}
                  activeCommodities={activeCommodities}
                  addDraftLeg={addDraftLeg}
                  removeDraftLeg={removeDraftLeg}
                  updateDraftLeg={updateDraftLeg}
                  amending={amending}
                  cancelling={cancelling}
                  amendError={amendError}
                  counterpartyCreditPolicyPreview={counterpartyCreditPolicyPreview}
                  tradeInstrumentTypeOptions={tradeInstrumentTypeOptions}
                  optionTypeOptions={optionTypeOptions}
                  optionStyleOptions={optionStyleOptions}
                  tradeNatureOptions={tradeNatureOptions}
                  tradeStructureOptions={tradeStructureOptions}
                  tradeSideOptions={tradeSideOptions}
                  pricingTypeOptions={pricingTypeOptions}
                  pricingStatusOptions={pricingStatusOptions}
                  confirmationStatusOptions={confirmationStatusOptions}
                  nominationStatusOptions={nominationStatusOptions}
                  allocationStatusOptions={allocationStatusOptions}
                  invoiceStatusOptions={invoiceStatusOptions}
                  paymentStatusOptions={paymentStatusOptions}
                  settlementStatusOptions={settlementStatusOptions}
                  pricingTypesRequiringExplicitPrice={pricingTypesRequiringExplicitPrice}
                  pricingTypesRequiringPriceIndex={pricingTypesRequiringPriceIndex}
                  formatCommodityClass={formatCommodityClass}
                />
              )}

              {selectedTrade && inspectorTab === 'risk' && (
                <div className="detail-list">
                  {selectedTradeIsOption &&
                  (selectedTradeSettlementValuation || selectedTradeOpenOptionValuation) ? (
                    selectedTradeMarksError ? (
                      <p className="field-error">Live marks unavailable: {selectedTradeMarksError}</p>
                    ) : selectedTradeMarksLoading ? (
                      <p className="form-note">
                        Refreshing latest price index mark for this option reference.
                      </p>
                    ) : null
                  ) : null}
                  {selectedTradeIsOption ? (
                    <>
                      <div className="detail-row">
                        <InlineTooltipLabel tooltip={RISK_TOOLTIPS.notional} tooltipLabel="More information about notional">
                          Premium Cashflow
                        </InlineTooltipLabel>
                        <strong>
                          {selectedTradePremiumCashflow === null
                            ? '—'
                            : `${selectedTrade.trade_side === 'SELL' ? 'Received' : 'Paid'} ${formatMoney(Math.abs(selectedTradePremiumCashflow))}`}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Contracts</span>
                        <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Underlying Equivalent</span>
                        <strong>{formatNumber(selectedTradeUnderlyingEquivalent, 0)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Strike</span>
                        <strong>{formatMoney(selectedTrade.option_strike_price)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Expiration</span>
                        <strong>
                          {selectedTrade.option_expiration_date
                            ? `${formatDateOnly(selectedTrade.option_expiration_date)}${selectedTradeDaysToExpiration === null ? '' : ` · ${selectedTradeDaysToExpiration}d`}`
                            : '—'}
                        </strong>
                      </div>
                      {selectedTradeSettlementValuation ? (
                        <>
                          <div className="detail-row">
                            <span>Linked Underlying</span>
                            <strong>{selectedTradeSettlementValuation.linkedTradeId}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Reference Price Index</span>
                            <strong>{selectedTradeSettlementValuation.referencePriceIndexCode ?? '—'}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Booked Underlying Price</span>
                            <strong>
                              {formatCurrencyAmount(
                                selectedTradeSettlementValuation.linkedPrice,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Live Reference Mark</span>
                            <strong>{settlementReferenceMarkLabel(selectedTradeSettlementValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Underlying Cashflow</span>
                            <strong>
                              {settlementCashflowLabel(
                                selectedTradeSettlementValuation.underlyingCashflow,
                                formatMoney,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Package Cashflow</span>
                            <strong>
                              {settlementCashflowLabel(
                                selectedTradeSettlementValuation.netPackageCashflow,
                                formatMoney,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Underlying MTM</span>
                            <strong>
                              {settlementMarkToMarketLabel(
                                selectedTradeSettlementValuation.underlyingMarkToMarket,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Package MTM</span>
                            <strong>
                              {settlementMarkToMarketLabel(
                                selectedTradeSettlementValuation.packageMarkToMarket,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Effective Package Price</span>
                            <strong>{settlementUnitPriceLabel(selectedTradeSettlementValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Moneyness at Market Mark</span>
                            <strong>{selectedTradeSettlementValuation.moneyness ?? '—'}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Intrinsic Value at Mark</span>
                            <strong>
                              {formatCurrencyAmount(
                                selectedTradeSettlementValuation.intrinsicValue,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          {selectedTradeSettlementValuation.markStatus !== 'VALUED' ? (
                            <div className="detail-row">
                              <span>Mark Status</span>
                              <strong>{selectedTradeSettlementValuation.markStatusReason ?? 'Awaiting mark'}</strong>
                            </div>
                          ) : null}
                        </>
                      ) : selectedTradeOpenOptionValuation ? (
                        <>
                          <div className="detail-row">
                            <span>Expiry State</span>
                            <strong>{openOptionExpiryStateLabel(selectedTradeOpenOptionValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Recommended Action</span>
                            <strong>{optionLifecycleActionLabel(selectedTradeOpenOptionValuation.recommendedAction)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Decision Cue</span>
                            <strong>{selectedTradeOpenOptionValuation.decisionLabel}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Decision Reason</span>
                            <strong>{selectedTradeOpenOptionValuation.decisionReason}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Reference Price Index</span>
                            <strong>{selectedTradeOpenOptionValuation.referencePriceIndexCode ?? '—'}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Live Reference Mark</span>
                            <strong>{openOptionReferenceMarkLabel(selectedTradeOpenOptionValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Moneyness at Market Mark</span>
                            <strong>{selectedTradeOpenOptionValuation.moneyness ?? '—'}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Intrinsic Value at Mark</span>
                            <strong>
                              {formatCurrencyAmount(
                                selectedTradeOpenOptionValuation.intrinsicValue,
                                selectedTradeOpenOptionValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Intrinsic Exposure</span>
                            <strong>{openOptionIntrinsicExposureLabel(selectedTradeOpenOptionValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Break-even at Expiry</span>
                            <strong>{openOptionBreakEvenLabel(selectedTradeOpenOptionValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Expiry P&L @ Market Mark</span>
                            <strong>{openOptionExpiryPnlLabel(selectedTradeOpenOptionValuation)}</strong>
                          </div>
                          {selectedTradeOpenOptionValuation.markStatus !== 'VALUED' ? (
                            <div className="detail-row">
                              <span>Mark Status</span>
                              <strong>{selectedTradeOpenOptionValuation.markStatusReason ?? 'Awaiting mark'}</strong>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="detail-row">
                        <InlineTooltipLabel tooltip={RISK_TOOLTIPS.notional} tooltipLabel="More information about notional">
                          Notional
                        </InlineTooltipLabel>
                        <strong>
                          {selectedTrade.price !== null && selectedTrade.volume !== null
                            ? formatMoney(selectedTrade.price * selectedTrade.volume)
                            : '—'}
                        </strong>
                      </div>
                      {selectedTradeSettlementValuation ? (
                        <>
                          <div className="detail-row">
                            <span>Originating Option</span>
                            <strong>{selectedTradeSettlementValuation.optionTradeId}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Reference Price Index</span>
                            <strong>{selectedTradeSettlementValuation.referencePriceIndexCode ?? '—'}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Live Reference Mark</span>
                            <strong>{settlementReferenceMarkLabel(selectedTradeSettlementValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Option Premium</span>
                            <strong>
                              {settlementCashflowLabel(
                                selectedTradeSettlementValuation.premiumCashflow,
                                formatMoney,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Package Cashflow</span>
                            <strong>
                              {settlementCashflowLabel(
                                selectedTradeSettlementValuation.netPackageCashflow,
                                formatMoney,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Underlying MTM</span>
                            <strong>
                              {settlementMarkToMarketLabel(
                                selectedTradeSettlementValuation.underlyingMarkToMarket,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Package MTM</span>
                            <strong>
                              {settlementMarkToMarketLabel(
                                selectedTradeSettlementValuation.packageMarkToMarket,
                                selectedTradeSettlementValuation.referenceCurrencyCode,
                              )}
                            </strong>
                          </div>
                          <div className="detail-row">
                            <span>Effective Package Price</span>
                            <strong>{settlementUnitPriceLabel(selectedTradeSettlementValuation)}</strong>
                          </div>
                          <div className="detail-row">
                            <span>Option Moneyness</span>
                            <strong>{selectedTradeSettlementValuation.moneyness ?? '—'}</strong>
                          </div>
                          {selectedTradeSettlementValuation.markStatus !== 'VALUED' ? (
                            <div className="detail-row">
                              <span>Mark Status</span>
                              <strong>{selectedTradeSettlementValuation.markStatusReason ?? 'Awaiting mark'}</strong>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                  <div className="detail-row">
                    <InlineTooltipLabel tooltip={RISK_TOOLTIPS.lifecycle} tooltipLabel="More information about lifecycle">
                      Lifecycle
                    </InlineTooltipLabel>
                    <strong>{selectedTradeEvents.length} events</strong>
                  </div>
                  <div className="detail-row">
                    <InlineTooltipLabel
                      tooltip={RISK_TOOLTIPS.exposureSide}
                      tooltipLabel="More information about exposure side"
                    >
                      Exposure Side
                    </InlineTooltipLabel>
                    <strong>
                      {selectedTradeIsOption
                        ? selectedTradeUnderlyingEquivalent >= 0
                          ? 'Long Underlying Proxy'
                          : 'Short Underlying Proxy'
                        : (selectedTrade.volume ?? 0) >= 0
                          ? 'Long'
                          : 'Short'}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <InlineTooltipLabel
                      tooltip={RISK_TOOLTIPS.projectionState}
                      tooltipLabel="More information about projection state"
                    >
                      Projection State
                    </InlineTooltipLabel>
                    <strong>{selectedTrade.status}</strong>
                  </div>
                </div>
              )}
            </OperationalInspectorShell>
          ),
        },
        {
          id: 'trade-open-count',
          eyebrow: 'Snapshot',
          title: 'Open Trades',
          description: 'The number of tickets currently carrying live exposure in the blotter.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={formatNumber(visibleActiveTradeCount, 0)}
              detail="Trades currently carrying exposure"
            />
          ),
        },
        {
          id: 'trade-gross-volume',
          eyebrow: 'Snapshot',
          title: 'Gross Volume',
          description: 'The total active volume rolled up across uncancelled trade tickets.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={formatNumber(visibleTotalActiveVolume, 0)}
              detail="Total active volume across uncancelled trades"
            />
          ),
        },
        {
          id: 'trade-pricing-coverage',
          eyebrow: 'Snapshot',
          title: 'Pricing Coverage',
          description: 'How much of the active blotter is already carrying an explicit stored price.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={visiblePricingCoverage === null ? '0%' : `${visiblePricingCoverage}%`}
              detail={`${visiblePricedActiveTrades} of ${visibleActiveTradeCount} active ticket${visibleActiveTradeCount === 1 ? '' : 's'} priced`}
            />
          ),
        },
        {
          id: 'trade-pending-pricing',
          eyebrow: 'Snapshot',
          title: 'Pending Pricing',
          description: 'Active tickets still waiting on an explicit pricing status to clear.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={formatNumber(visiblePendingPricingTrades, 0)}
              detail="Trades still waiting on explicit pricing state"
            />
          ),
        },
        {
          id: 'trade-books-in-play',
          eyebrow: 'Snapshot',
          title: 'Books in Play',
          description: 'Distinct books that currently carry active exposure in the projected trade set.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={formatNumber(visibleTrackedBooks, 0)}
              detail="Distinct books carrying active exposure"
            />
          ),
        },
        {
          id: 'trade-largest-line',
          eyebrow: 'Snapshot',
          title: 'Largest Line',
          description: 'The largest projected commodity line by absolute open position across the current desk view.',
          span: 'half',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <TradingMetricTileContent
              value={largestPositionRow ? formatNumber(largestPositionRow.net_volume, 0) : 'Flat'}
              detail={largestPositionRow ? largestPositionRow.commodity : 'Waiting for open positions'}
            />
          ),
        },
        {
          id: 'trade-board',
          eyebrow: 'Blotter',
          title: 'Open and Historical Trades',
          description: 'Select a row to keep the inspector and ticket entry anchored to the same live blotter context.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <OperationalBoardController
              workboard={tradeOperationalProjectionWorkboard}
              bannerVariant="chips"
              isEmpty={visibleTrades.length === 0}
              emptyStateTitle={hasScreenFilter ? 'No trades match the current view' : 'No trade blotter yet'}
              emptyStateDetail={
                hasScreenFilter
                  ? 'Clear the local filter to reopen the broader blotter and resync the inspector with active rows.'
                  : 'Book a trade or open the walkthrough to seed the blotter and inspector with live-looking trade context.'
              }
            >
              <DataSheet
                label="Trade Blotter"
                description="Browse the live trade projection like a terminal blotter. Arrow between cells to keep the inspector synced to the active row."
                columns={tradeBoardColumns}
                rows={visibleTrades}
                getRowId={(trade) => trade.trade_id}
                getRowLabel={(trade) => `${trade.trade_id} ${trade.commodity} ${trade.trade_structure}`}
                selectedRowId={selectedTradeId}
                onSelectRow={(trade) => {
                  setSelectedTradeId(trade.trade_id)
                  setInspectorTab('overview')
                }}
                emptyMessage={
                  hasScreenFilter
                    ? 'No trades match the current local filter.'
                    : 'Book a trade or open the walkthrough to seed the blotter and inspector with trade context.'
                }
              />
            </OperationalBoardController>
          ),
        },
      ]}
    />
  )
}
