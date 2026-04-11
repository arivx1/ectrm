import { lazy, type ReactNode } from 'react'

import type { useAppAppearance } from './useAppAppearance'
import type { useAppTradeCaptureSettings } from './useAppTradeCaptureSettings'
import type { useAppRouteState } from './useAppRouteState'
import type { useAppShellState } from './useAppShellState'
import type { useAppTradeActions } from './useAppTradeActions'
import type { useAppWorkspaceData } from './useAppWorkspaceData'
import type { useAppWorkspaceSummary } from './useAppWorkspaceSummary'
import type { useTradeAmendForm } from '../../features/trades/useTradeAmendForm'
import type { useTradeCaptureForm } from '../../features/trades/useTradeCaptureForm'
import { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'
import {
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  formatNumber,
  statusTone,
} from '../../shared/format'
import {
  allocationStatusOptions,
  confirmationStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionStyleOptions,
  optionTypeOptions,
  paymentStatusOptions,
  pricingStatusOptions,
  pricingTypeOptions,
  settlementStatusOptions,
  tradeInstrumentTypeOptions,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStructureOptions,
} from '../../shared/trading'
import type { ViewKey } from '../../shared/models'
import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'

const DocumentationWorkspace = lazy(() =>
  import('../../workspaces/docs/DocumentationWorkspace').then((module) => ({
    default: module.DocumentationWorkspace,
  })),
)
const DashboardWorkspace = lazy(() =>
  import('../../workspaces/dashboard/DashboardWorkspace').then((module) => ({
    default: module.DashboardWorkspace,
  })),
)
const DemoWorkspace = lazy(() =>
  import('../../workspaces/demo/DemoWorkspace').then((module) => ({
    default: module.DemoWorkspace,
  })),
)
const TradingWorkspace = lazy(() =>
  import('../../workspaces/trading/TradingWorkspace').then((module) => ({
    default: module.TradingWorkspace,
  })),
)
const EventsWorkspace = lazy(() =>
  import('../../workspaces/events/EventsWorkspace').then((module) => ({
    default: module.EventsWorkspace,
  })),
)
const RiskWorkspace = lazy(() =>
  import('../../workspaces/risk/RiskWorkspace').then((module) => ({
    default: module.RiskWorkspace,
  })),
)
const PositionsWorkspace = lazy(() =>
  import('../../workspaces/positions/PositionsWorkspace').then((module) => ({
    default: module.PositionsWorkspace,
  })),
)
const DeliveryWorkspace = lazy(() =>
  import('../../workspaces/shipments/ShipmentWorkspace').then((module) => ({
    default: module.DeliveryWorkspace,
  })),
)
const SchedulingWorkspace = lazy(() =>
  import('../../workspaces/scheduling/SchedulingWorkspace').then((module) => ({
    default: module.SchedulingWorkspace,
  })),
)
const OperationsWorkspace = lazy(() =>
  import('../../workspaces/operations/OperationsWorkspace').then((module) => ({
    default: module.OperationsWorkspace,
  })),
)
const SettlementWorkspace = lazy(() =>
  import('../../workspaces/settlement/SettlementWorkspace').then((module) => ({
    default: module.SettlementWorkspace,
  })),
)
const ReportsWorkspace = lazy(() =>
  import('../../workspaces/reports/ReportsWorkspace').then((module) => ({
    default: module.ReportsWorkspace,
  })),
)
const ReferenceDataWorkspace = lazy(() =>
  import('../../workspaces/reference-data/ReferenceDataWorkspace').then((module) => ({
    default: module.ReferenceDataWorkspace,
  })),
)
const AdminWorkspace = lazy(() =>
  import('../../workspaces/admin/AdminWorkspace').then((module) => ({
    default: module.AdminWorkspace,
  })),
)
const SettingsWorkspace = lazy(() =>
  import('../../workspaces/settings/SettingsWorkspace').then((module) => ({
    default: module.SettingsWorkspace,
  })),
)
const AssistantWorkspace = lazy(() =>
  import('../../workspaces/assistant/AssistantWorkspace').then((module) => ({
    default: module.AssistantWorkspace,
  })),
)

export type AppDataGroup =
  | 'core'
  | 'trades'
  | 'events'
  | 'positions'
  | 'reference'
  | 'risk'
  | 'deliveries'
  | 'operations'
  | 'settlement'
  | 'reports'
  | 'admin'

export type WorkspaceCollectionKey =
  | 'trades'
  | 'positions'
  | 'optionExposures'
  | 'deliveries'
  | 'confirmations'
  | 'operationsWorkItems'
  | 'settlementWorkItems'
  | 'invoices'
  | 'payments'

export type WorkspaceMutationKind =
  | 'trade-event'
  | 'delivery'
  | 'confirmation'
  | 'workflow-item'
  | 'actualization'
  | 'invoice'
  | 'payment'
  | 'admin-external-data'
  | 'admin-counterparty-credit'
  | 'admin-weather-sync'

export type WorkspaceMutationRefreshPlan = {
  groups: AppDataGroup[]
  collections: WorkspaceCollectionKey[]
}

export type WorkspaceWindowNotice = {
  key: string
  label: string
  description: string
  loadedCount: number
  totalCount?: number | null
  hasMore: boolean
  loading: boolean
  error: string
  onLoadMore: () => void
}

type WorkspaceDescriptorConfig = {
  key: ViewKey
  label: string
  kicker: string
  heroTitle: string
  heroBody: string
  dataGroups: readonly AppDataGroup[]
  blockingGroups: readonly AppDataGroup[]
  mutationRefreshPlans?: Partial<Record<WorkspaceMutationKind, WorkspaceMutationRefreshPlan>>
  buildWindowNotices?: (args: WorkspaceWindowNoticeContext) => WorkspaceWindowNotice[]
}

type WorkspaceWindowNoticeContext = {
  summary: ReturnType<typeof useAppWorkspaceSummary>
  workspaceData: ReturnType<typeof useAppWorkspaceData>
}

export type WorkspaceViewRenderContext = {
  activeDocumentationDocumentKey: DocumentationDocumentKey
  captureForm: ReturnType<typeof useTradeCaptureForm>
  amendForm: ReturnType<typeof useTradeAmendForm>
  appearance: Pick<
    ReturnType<typeof useAppAppearance>,
    'appearanceSettings' | 'handleAppearanceSettingsChange' | 'handleAppearanceSettingsReset' | 'resolvedColorMode'
  >
  tradeCapturePreferences: Pick<
    ReturnType<typeof useAppTradeCaptureSettings>,
    'tradeCaptureSettings' | 'handleTradeCaptureSettingsChange' | 'handleTradeCaptureSettingsReset'
  >
  currentView: ReturnType<typeof useAppRouteState>['currentView']
  handleDocumentationDocumentChange: ReturnType<typeof useAppRouteState>['handleDocumentationDocumentChange']
  navigateToTrade: ReturnType<typeof useAppRouteState>['navigateToTrade']
  navigateToView: ReturnType<typeof useAppRouteState>['navigateToView']
  referenceState: ReturnType<typeof useReferenceDataController>
  hrefForView: ReturnType<typeof useAppRouteState>['hrefForView']
  handleRoadmapPublished: ReturnType<typeof useAppShellState>['handleRoadmapPublished']
  roadmapRefreshVersion: ReturnType<typeof useAppShellState>['roadmapRefreshVersion']
  selectedTradeId: ReturnType<typeof useAppRouteState>['selectedTradeId']
  setInspectorTab: ReturnType<typeof useAppShellState>['setInspectorTab']
  setSelectedTradeId: ReturnType<typeof useAppRouteState>['setSelectedTradeId']
  shell: Pick<ReturnType<typeof useAppShellState>, 'eventFilter' | 'inspectorTab' | 'setEventFilter'>
  summary: ReturnType<typeof useAppWorkspaceSummary>
  tradeActions: ReturnType<typeof useAppTradeActions>
  workspaceData: ReturnType<typeof useAppWorkspaceData>
}

type WorkspaceRendererDefinition = {
  usesWindowNotices?: boolean
  render: (context: WorkspaceViewRenderContext) => ReactNode
}

export type WorkspaceDescriptor = WorkspaceDescriptorConfig & WorkspaceRendererDefinition

function buildTradeCaptureFormProps(context: WorkspaceViewRenderContext) {
  const { captureForm, summary, tradeActions, workspaceData } = context
  const referenceDataLoading = workspaceData.groupLoading.reference && !workspaceData.groupLoaded.reference

  return {
    onSubmit: tradeActions.handleCreateTrade,
    onClearForm: tradeActions.handleResetCreateTradeForm,
    tradeIdInput: captureForm.tradeIdInput,
    tradeInstrumentTypeInput: captureForm.tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput: captureForm.setTradeInstrumentTypeInput,
    optionTypeInput: captureForm.optionTypeInput,
    setOptionTypeInput: captureForm.setOptionTypeInput,
    optionStyleInput: captureForm.optionStyleInput,
    setOptionStyleInput: captureForm.setOptionStyleInput,
    optionExpirationDateInput: captureForm.optionExpirationDateInput,
    setOptionExpirationDateInput: captureForm.setOptionExpirationDateInput,
    optionStrikePriceInput: captureForm.optionStrikePriceInput,
    setOptionStrikePriceInput: captureForm.setOptionStrikePriceInput,
    tradeNatureInput: captureForm.tradeNatureInput,
    setTradeNatureInput: captureForm.setTradeNatureInput,
    tradeStructureInput: captureForm.tradeStructureInput,
    setTradeStructureInput: captureForm.setTradeStructureInput,
    tradeSideInput: captureForm.tradeSideInput,
    setTradeSideInput: captureForm.setTradeSideInput,
    bookInput: captureForm.bookInput,
    setBookInput: captureForm.setBookInput,
    bookSearchInput: captureForm.bookSearchInput,
    setBookSearchInput: captureForm.setBookSearchInput,
    activeBooks: summary.activeBooks,
    commodityClassInput: captureForm.commodityClassInput,
    setCommodityClassInput: captureForm.setCommodityClassInput,
    commodityClassOptions: summary.commodityClassOptions,
    commodityInput: captureForm.commodityInput,
    setCommodityInput: captureForm.setCommodityInput,
    createCommodityOptions: captureForm.createCommodityOptions,
    pricingTypeInput: captureForm.pricingTypeInput,
    setPricingTypeInput: captureForm.setPricingTypeInput,
    pricingStatusInput: captureForm.pricingStatusInput,
    setPricingStatusInput: captureForm.setPricingStatusInput,
    priceIndexInput: captureForm.priceIndexInput,
    setPriceIndexInput: captureForm.setPriceIndexInput,
    createPriceIndexOptions: captureForm.createPriceIndexOptions,
    priceInput: captureForm.priceInput,
    setPriceInput: captureForm.setPriceInput,
    volumeInput: captureForm.volumeInput,
    setVolumeInput: captureForm.setVolumeInput,
    qualitySpecInput: captureForm.qualitySpecInput,
    setQualitySpecInput: captureForm.setQualitySpecInput,
    unitInput: captureForm.unitInput,
    setUnitInput: captureForm.setUnitInput,
    createUnitOptions: captureForm.createUnitOptions,
    externalTradeIdInput: captureForm.externalTradeIdInput,
    setExternalTradeIdInput: captureForm.setExternalTradeIdInput,
    sourceSystemInput: captureForm.sourceSystemInput,
    executionTimestampInput: captureForm.executionTimestampInput,
    setExecutionTimestampInput: captureForm.setExecutionTimestampInput,
    tradeDateInput: captureForm.tradeDateInput,
    setTradeDateInput: captureForm.setTradeDateInput,
    effectiveStartDateInput: captureForm.effectiveStartDateInput,
    setEffectiveStartDateInput: captureForm.setEffectiveStartDateInput,
    effectiveEndDateInput: captureForm.effectiveEndDateInput,
    setEffectiveEndDateInput: captureForm.setEffectiveEndDateInput,
    portfolioInput: captureForm.portfolioInput,
    setPortfolioInput: captureForm.setPortfolioInput,
    portfolioSearchInput: captureForm.portfolioSearchInput,
    setPortfolioSearchInput: captureForm.setPortfolioSearchInput,
    createPortfolioOptions: captureForm.createPortfolioOptions,
    counterpartyInput: captureForm.counterpartyInput,
    setCounterpartyInput: captureForm.setCounterpartyInput,
    counterpartySearchInput: captureForm.counterpartySearchInput,
    setCounterpartySearchInput: captureForm.setCounterpartySearchInput,
    createCounterpartyOptions: captureForm.createCounterpartyOptions,
    tradeCurrencyInput: captureForm.tradeCurrencyInput,
    setTradeCurrencyInput: captureForm.setTradeCurrencyInput,
    createCurrencyOptions: captureForm.createCurrencyOptions,
    locationInput: captureForm.locationInput,
    setLocationInput: captureForm.setLocationInput,
    createLocationOptions: captureForm.createLocationOptions,
    deliveryStartInput: captureForm.deliveryStartInput,
    setDeliveryStartInput: captureForm.setDeliveryStartInput,
    deliveryEndInput: captureForm.deliveryEndInput,
    setDeliveryEndInput: captureForm.setDeliveryEndInput,
    priceUnitInput: captureForm.priceUnitInput,
    setPriceUnitInput: captureForm.setPriceUnitInput,
    settlementStatusInput: captureForm.settlementStatusInput,
    setSettlementStatusInput: captureForm.setSettlementStatusInput,
    showOptionFields: captureForm.showOptionDetails,
    showPriceIndexField: captureForm.showPriceIndexField,
    activeRuleMatches: captureForm.activeRuleMatches,
    traderUserInput: captureForm.traderUserInput,
    setTraderUserInput: captureForm.setTraderUserInput,
    duplicateSourceTradeId: captureForm.duplicateSourceTradeId,
    createLegs: captureForm.createLegs,
    activeCommodities: summary.activeCommodities,
    addDraftLeg: captureForm.addDraftLeg,
    removeDraftLeg: captureForm.removeDraftLeg,
    updateDraftLeg: captureForm.updateDraftLeg,
    submitting: tradeActions.submitting,
    referenceDataLoading,
    hasReferenceOptions: summary.hasReferenceOptions,
    createError: tradeActions.createError,
    counterpartyCreditPolicyPreview: tradeActions.createCounterpartyCreditPolicyPreview,
    tradeInstrumentTypeOptions,
    optionTypeOptions,
    optionStyleOptions,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    settlementStatusOptions,
    formatCommodityClass,
  }
}

type WorkspaceSummaryTotals = {
  totalTradeCount: number | null
  totalActiveTradeCount: number | null
  totalPositionCount: number | null
  totalOptionExposureCount: number | null
  totalDeliveryCount: number | null
  totalConfirmationCount: number | null
  totalInvoiceCount: number | null
  totalPaymentCount: number | null
  totalOperationsWorkItemCount: number | null
  totalSettlementWorkItemCount: number | null
}

function workspaceSummaryTotals(
  workspaceData: ReturnType<typeof useAppWorkspaceData>,
): WorkspaceSummaryTotals {
  const summary = workspaceData.workspaceBootstrapSummary

  return {
    totalTradeCount: summary?.trades.total_count ?? null,
    totalActiveTradeCount: summary?.trades.active_count ?? null,
    totalPositionCount: summary?.positions.total_count ?? null,
    totalOptionExposureCount: summary?.option_exposures.total_count ?? null,
    totalDeliveryCount: summary?.deliveries.total_count ?? null,
    totalConfirmationCount: summary?.confirmations.total_count ?? null,
    totalInvoiceCount: summary?.invoices.total_count ?? null,
    totalPaymentCount: summary?.payments.total_count ?? null,
    totalOperationsWorkItemCount: summary?.work_items.operations_queue_count ?? null,
    totalSettlementWorkItemCount: summary?.work_items.settlement_queue_count ?? null,
  }
}

function hasMoreWindowRows(
  loadedCount: number,
  totalCount: number | null | undefined,
  fallback: boolean,
): boolean {
  if (typeof totalCount === 'number') {
    return loadedCount < totalCount
  }

  return fallback
}

function buildWindowNotice(args: {
  key: string
  label: string
  description: string
  loadedCount: number
  totalCount?: number | null
  fallbackHasMore: boolean
  loading: boolean
  error: string
  onLoadMore: () => void
}): WorkspaceWindowNotice {
  return {
    key: args.key,
    label: args.label,
    description: args.description,
    loadedCount: args.loadedCount,
    totalCount: args.totalCount,
    hasMore: hasMoreWindowRows(args.loadedCount, args.totalCount, args.fallbackHasMore),
    loading: args.loading,
    error: args.error,
    onLoadMore: args.onLoadMore,
  }
}

function buildTradesWindowNotices({
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const { totalTradeCount } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'trades',
      label: 'Trades',
      description:
        'This view is intentionally bounded so bigger faux books still feel responsive. Load more to expand the visible trade set.',
      loadedCount: workspaceData.trades.length,
      totalCount: totalTradeCount,
      fallbackHasMore: workspaceData.collectionWindows.trades.hasMore,
      loading: workspaceData.collectionLoadingMore.trades,
      error: workspaceData.collectionErrors.trades,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('trades'),
    }),
  ]
}

function buildRiskWindowNotices({
  summary,
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const {
    totalActiveTradeCount,
    totalOptionExposureCount,
    totalPositionCount,
  } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'risk-trades',
      label: 'Trades',
      description:
        'Risk metrics are currently based on the loaded trade window. Expand it when you want a broader end-to-end demo slice.',
      loadedCount: summary.activeTrades.length,
      totalCount: totalActiveTradeCount,
      fallbackHasMore: workspaceData.collectionWindows.trades.hasMore,
      loading: workspaceData.collectionLoadingMore.trades,
      error: workspaceData.collectionErrors.trades,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('trades'),
    }),
    buildWindowNotice({
      key: 'risk-positions',
      label: 'Positions',
      description:
        'Position coverage is windowed during bootstrap so the workspace stays fast as the faux book grows.',
      loadedCount: workspaceData.collectionWindows.positions.loadedCount,
      totalCount: totalPositionCount,
      fallbackHasMore: workspaceData.collectionWindows.positions.hasMore,
      loading: workspaceData.collectionLoadingMore.positions,
      error: workspaceData.collectionErrors.positions,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('positions'),
    }),
    buildWindowNotice({
      key: 'risk-option-exposures',
      label: 'Option exposures',
      description:
        'Open option exposure rows are loaded in bounded slices. Pull in more when you want a wider operational story.',
      loadedCount: workspaceData.collectionWindows.optionExposures.loadedCount,
      totalCount: totalOptionExposureCount,
      fallbackHasMore: workspaceData.collectionWindows.optionExposures.hasMore,
      loading: workspaceData.collectionLoadingMore.optionExposures,
      error: workspaceData.collectionErrors.optionExposures,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('optionExposures'),
    }),
  ]
}

function buildPositionsWindowNotices({
  summary,
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const { totalActiveTradeCount, totalPositionCount } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'positions-trades',
      label: 'Trades',
      description:
        'Trade-backed position context is coming from a bounded workspace slice so larger demo books do not stall the first load.',
      loadedCount: summary.activeTrades.length,
      totalCount: totalActiveTradeCount,
      fallbackHasMore: workspaceData.collectionWindows.trades.hasMore,
      loading: workspaceData.collectionLoadingMore.trades,
      error: workspaceData.collectionErrors.trades,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('trades'),
    }),
    buildWindowNotice({
      key: 'positions-positions',
      label: 'Positions',
      description:
        'This snapshot is intentionally capped during bootstrap. Load more if you want to inspect a bigger aggregate position ladder.',
      loadedCount: workspaceData.collectionWindows.positions.loadedCount,
      totalCount: totalPositionCount,
      fallbackHasMore: workspaceData.collectionWindows.positions.hasMore,
      loading: workspaceData.collectionLoadingMore.positions,
      error: workspaceData.collectionErrors.positions,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('positions'),
    }),
  ]
}

function buildDeliveriesWindowNotices({
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const { totalDeliveryCount } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'deliveries',
      label: 'Deliveries',
      description:
        'Delivery records are windowed on initial load so scheduling and shipment boards stay usable as lifecycle history expands.',
      loadedCount: workspaceData.collectionWindows.deliveries.loadedCount,
      totalCount: totalDeliveryCount,
      fallbackHasMore: workspaceData.collectionWindows.deliveries.hasMore,
      loading: workspaceData.collectionLoadingMore.deliveries,
      error: workspaceData.collectionErrors.deliveries,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('deliveries'),
    }),
  ]
}

function buildOperationsWindowNotices({
  summary,
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const {
    totalActiveTradeCount,
    totalConfirmationCount,
    totalDeliveryCount,
    totalOperationsWorkItemCount,
  } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'operations-trades',
      label: 'Trades',
      description:
        'Operations KPIs and queues are currently tied to the loaded trade slice. Expand it to pull more of the book into this control room.',
      loadedCount: summary.activeTrades.length,
      totalCount: totalActiveTradeCount,
      fallbackHasMore: workspaceData.collectionWindows.trades.hasMore,
      loading: workspaceData.collectionLoadingMore.trades,
      error: workspaceData.collectionErrors.trades,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('trades'),
    }),
    buildWindowNotice({
      key: 'operations-deliveries',
      label: 'Deliveries',
      description:
        'Delivery obligations are loaded in bounded windows so the operations workspace stays responsive as faux lifecycle volume grows.',
      loadedCount: workspaceData.collectionWindows.deliveries.loadedCount,
      totalCount: totalDeliveryCount,
      fallbackHasMore: workspaceData.collectionWindows.deliveries.hasMore,
      loading: workspaceData.collectionLoadingMore.deliveries,
      error: workspaceData.collectionErrors.deliveries,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('deliveries'),
    }),
    buildWindowNotice({
      key: 'operations-confirmations',
      label: 'Confirmations',
      description:
        'Confirmation records are fetched in slices during bootstrap. Load more if you want a fuller downstream ledger.',
      loadedCount: workspaceData.collectionWindows.confirmations.loadedCount,
      totalCount: totalConfirmationCount,
      fallbackHasMore: workspaceData.collectionWindows.confirmations.hasMore,
      loading: workspaceData.collectionLoadingMore.confirmations,
      error: workspaceData.collectionErrors.confirmations,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('confirmations'),
    }),
    buildWindowNotice({
      key: 'operations-work-items',
      label: 'Workflow items',
      description:
        'Operations queue items are intentionally bounded on first load. Expand the slice when you want broader queue coverage.',
      loadedCount: workspaceData.collectionWindows.operationsWorkItems.loadedCount,
      totalCount: totalOperationsWorkItemCount,
      fallbackHasMore: workspaceData.collectionWindows.operationsWorkItems.hasMore,
      loading: workspaceData.collectionLoadingMore.operationsWorkItems,
      error: workspaceData.collectionErrors.operationsWorkItems,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('operationsWorkItems'),
    }),
  ]
}

function buildSettlementWindowNotices({
  summary,
  workspaceData,
}: WorkspaceWindowNoticeContext): WorkspaceWindowNotice[] {
  const {
    totalActiveTradeCount,
    totalInvoiceCount,
    totalPaymentCount,
    totalSettlementWorkItemCount,
  } = workspaceSummaryTotals(workspaceData)

  return [
    buildWindowNotice({
      key: 'settlement-trades',
      label: 'Trades',
      description:
        'Settlement headline metrics now come from the server summary. Load more trades when you want broader queue and row-level context.',
      loadedCount: summary.activeTrades.length,
      totalCount: totalActiveTradeCount,
      fallbackHasMore: workspaceData.collectionWindows.trades.hasMore,
      loading: workspaceData.collectionLoadingMore.trades,
      error: workspaceData.collectionErrors.trades,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('trades'),
    }),
    buildWindowNotice({
      key: 'settlement-invoices',
      label: 'Invoices',
      description:
        'Invoice records are bounded during bootstrap so the settlement board opens quickly even when faux history gets richer.',
      loadedCount: workspaceData.collectionWindows.invoices.loadedCount,
      totalCount: totalInvoiceCount,
      fallbackHasMore: workspaceData.collectionWindows.invoices.hasMore,
      loading: workspaceData.collectionLoadingMore.invoices,
      error: workspaceData.collectionErrors.invoices,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('invoices'),
    }),
    buildWindowNotice({
      key: 'settlement-payments',
      label: 'Payments',
      description:
        'Payment history is loaded in slices. Expand the window to inspect more of the cash application trail.',
      loadedCount: workspaceData.collectionWindows.payments.loadedCount,
      totalCount: totalPaymentCount,
      fallbackHasMore: workspaceData.collectionWindows.payments.hasMore,
      loading: workspaceData.collectionLoadingMore.payments,
      error: workspaceData.collectionErrors.payments,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('payments'),
    }),
    buildWindowNotice({
      key: 'settlement-work-items',
      label: 'Workflow items',
      description:
        'Settlement queue history is windowed during bootstrap. Load more when you want broader operational context.',
      loadedCount: workspaceData.collectionWindows.settlementWorkItems.loadedCount,
      totalCount: totalSettlementWorkItemCount,
      fallbackHasMore: workspaceData.collectionWindows.settlementWorkItems.hasMore,
      loading: workspaceData.collectionLoadingMore.settlementWorkItems,
      error: workspaceData.collectionErrors.settlementWorkItems,
      onLoadMore: () => void workspaceData.handleLoadMoreWorkspaceCollection('settlementWorkItems'),
    }),
  ]
}

const WORKSPACE_DESCRIPTOR_CONFIG: Record<ViewKey, WorkspaceDescriptorConfig> = {
  dashboard: {
    key: 'dashboard',
    label: 'Dashboard',
    kicker: 'Desk',
    heroTitle: 'Desk overview and market pulse',
    heroBody:
      'Track the desk like a live terminal: health, market marks, positions, and operational attention stay on one screen.',
    dataGroups: ['trades', 'events', 'positions', 'reference'],
    blockingGroups: ['trades', 'events', 'positions', 'reference'],
  },
  guide: {
    key: 'guide',
    label: 'Guide',
    kicker: 'Playbook',
    heroTitle: 'Playbooks inside the console',
    heroBody:
      'Keep the operating model close to the product so onboarding, runbooks, and design notes stay in flow.',
    dataGroups: [],
    blockingGroups: [],
  },
  demo: {
    key: 'demo',
    label: 'Demo',
    kicker: 'Walkthrough',
    heroTitle: 'Scenario-driven trade walkthrough',
    heroBody:
      'Define a commodity, inject realistic lifecycle friction, and walk through the exact workspaces used to manage the trade.',
    dataGroups: [],
    blockingGroups: [],
  },
  trades: {
    key: 'trades',
    label: 'Trading',
    kicker: 'Blotter',
    heroTitle: 'Trade blotter and ticket entry',
    heroBody:
      'Enter tickets, inspect the active trade, and run lifecycle actions without losing the blotter context.',
    dataGroups: ['trades', 'reference', 'operations'],
    blockingGroups: ['trades', 'reference'],
    mutationRefreshPlans: {
      'trade-event': {
        groups: ['core'],
        collections: ['trades', 'positions', 'operationsWorkItems', 'settlementWorkItems'],
      },
    },
    buildWindowNotices: buildTradesWindowNotices,
  },
  events: {
    key: 'events',
    label: 'Events',
    kicker: 'Tape',
    heroTitle: 'Lifecycle tape and chronology',
    heroBody:
      'Read the system as a tape instead of a log table, then narrow to the trade that needs attention.',
    dataGroups: ['events'],
    blockingGroups: ['events'],
  },
  risk: {
    key: 'risk',
    label: 'Risk',
    kicker: 'Exposure',
    heroTitle: 'Exposure concentration and pricing quality',
    heroBody:
      'Focus the desk on concentration, unpriced exposure, and the books carrying the most open risk.',
    dataGroups: ['trades', 'positions', 'reference', 'risk'],
    blockingGroups: ['trades', 'positions', 'risk'],
    buildWindowNotices: buildRiskWindowNotices,
  },
  positions: {
    key: 'positions',
    label: 'Positions',
    kicker: 'Risk',
    heroTitle: 'Risk buckets and net exposure',
    heroBody:
      'Scan class-level risk first, then drop straight into the exact commodity rows carrying exposure.',
    dataGroups: ['trades', 'positions', 'reference'],
    blockingGroups: ['trades', 'positions'],
    buildWindowNotices: buildPositionsWindowNotices,
  },
  shipments: {
    key: 'shipments',
    label: 'Deliveries',
    kicker: 'Execution',
    heroTitle: 'Cross-mode delivery obligations and execution readiness',
    heroBody:
      'Manage logistics moves, pipeline flows, and power schedules from one delivery surface that shows mode-specific blockers without forcing them into the same workflow.',
    dataGroups: ['deliveries'],
    blockingGroups: ['deliveries'],
    mutationRefreshPlans: {
      delivery: {
        groups: ['core'],
        collections: ['deliveries'],
      },
    },
    buildWindowNotices: buildDeliveriesWindowNotices,
  },
  scheduling: {
    key: 'scheduling',
    label: 'Scheduling',
    kicker: 'Scheduler',
    heroTitle: 'Scheduler board and delivery window readiness',
    heroBody:
      'Give commodity schedulers a dedicated screen for open windows, nomination readiness, and blocker clearing instead of burying that work in generalized delivery queues.',
    dataGroups: ['deliveries'],
    blockingGroups: ['deliveries'],
    mutationRefreshPlans: {
      actualization: {
        groups: ['core'],
        collections: ['deliveries'],
      },
      'workflow-item': {
        groups: ['core'],
        collections: ['deliveries'],
      },
    },
    buildWindowNotices: buildDeliveriesWindowNotices,
  },
  operations: {
    key: 'operations',
    label: 'Operations',
    kicker: 'Control',
    heroTitle: 'Operational control and workflow coverage',
    heroBody:
      'Run the operational control loop from workflow queues, delivery blockers, and live platform health on one surface.',
    dataGroups: ['trades', 'deliveries', 'operations', 'admin'],
    blockingGroups: ['trades', 'deliveries', 'operations'],
    mutationRefreshPlans: {
      confirmation: {
        groups: ['core'],
        collections: ['trades', 'deliveries', 'confirmations', 'operationsWorkItems'],
      },
      'workflow-item': {
        groups: ['core'],
        collections: ['trades', 'operationsWorkItems'],
      },
    },
    buildWindowNotices: buildOperationsWindowNotices,
  },
  settlement: {
    key: 'settlement',
    label: 'Settlement',
    kicker: 'Cash',
    heroTitle: 'Invoice, payment, and settlement control',
    heroBody:
      'Keep invoice, payment, and settlement aging visible so post-trade cash workflow is no longer buried in raw trade rows.',
    dataGroups: ['trades', 'operations', 'settlement'],
    blockingGroups: ['trades', 'operations', 'settlement'],
    mutationRefreshPlans: {
      invoice: {
        groups: ['core'],
        collections: ['trades', 'invoices', 'settlementWorkItems'],
      },
      payment: {
        groups: ['core'],
        collections: ['trades', 'invoices', 'payments', 'settlementWorkItems'],
      },
      'workflow-item': {
        groups: ['core'],
        collections: ['trades', 'settlementWorkItems'],
      },
    },
    buildWindowNotices: buildSettlementWindowNotices,
  },
  reports: {
    key: 'reports',
    label: 'Reports',
    kicker: 'Analytics',
    heroTitle: 'Desk reporting and analyst outputs',
    heroBody:
      'Surface curated credit, exposure, and audit outputs for operators who need answers faster than a spreadsheet refresh.',
    dataGroups: ['trades', 'reports'],
    blockingGroups: ['trades', 'reports'],
  },
  reference: {
    key: 'reference',
    label: 'Reference Data',
    kicker: 'Master',
    heroTitle: 'Reference master and mappings',
    heroBody:
      'Maintain the desk registry for books, commodities, locations, and operational master data without leaving the app.',
    dataGroups: ['trades', 'reference'],
    blockingGroups: ['trades', 'reference'],
  },
  admin: {
    key: 'admin',
    label: 'Admin',
    kicker: 'Ops',
    heroTitle: 'Operational controls and governance',
    heroBody:
      'Operate sync jobs, governance flows, and privileged maintenance from one controlled workspace.',
    dataGroups: ['trades', 'events', 'positions', 'reference', 'admin'],
    blockingGroups: ['trades', 'events', 'positions', 'reference', 'admin'],
    mutationRefreshPlans: {
      'admin-external-data': {
        groups: ['admin'],
        collections: [],
      },
      'admin-counterparty-credit': {
        groups: ['admin', 'reference', 'reports', 'operations'],
        collections: [],
      },
      'admin-weather-sync': {
        groups: ['admin'],
        collections: [],
      },
    },
  },
  settings: {
    key: 'settings',
    label: 'Settings',
    kicker: 'Config',
    heroTitle: 'Runtime profile and access',
    heroBody:
      'Adjust runtime behavior, stored credentials, and client overrides without leaving the trading console.',
    dataGroups: [],
    blockingGroups: [],
  },
  assistant: {
    key: 'assistant',
    label: 'Assistant',
    kicker: 'AI',
    heroTitle: 'Analyst copilot for the desk',
    heroBody:
      'Ask for grounded analysis with the desk state already loaded so AI stays anchored to what operations can see.',
    dataGroups: ['trades', 'events', 'positions'],
    blockingGroups: ['trades', 'events', 'positions'],
  },
}

export const WORKSPACE_RENDERERS: Record<
  WorkspaceViewRenderContext['currentView'],
  WorkspaceRendererDefinition
> = {
  guide: {
    render: (context) => (
      <DocumentationWorkspace
        activeDocumentKey={context.activeDocumentationDocumentKey}
        getViewHref={context.hrefForView}
        onDocumentKeyChange={context.handleDocumentationDocumentChange}
        onOpenView={context.navigateToView}
        roadmapRefreshVersion={context.roadmapRefreshVersion}
      />
    ),
  },
  dashboard: {
    render: (context) => (
      <DashboardWorkspace
        authSession={context.workspaceData.authSession}
        appLoading={context.workspaceData.appLoading}
        activeTrades={context.summary.activeTrades}
        dashboardSummary={context.workspaceData.workspaceBootstrapSummary?.dashboard ?? null}
        priceIndices={context.workspaceData.priceIndices}
        positionsWithClass={context.summary.positionsWithClass}
        events={context.workspaceData.events}
        formatCommodityClass={formatCommodityClass}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        formatDate={formatDate}
      />
    ),
  },
  demo: {
    render: (context) => (
      <DemoWorkspace authSession={context.workspaceData.authSession} onOpenView={context.navigateToView} />
    ),
  },
  trades: {
    usesWindowNotices: true,
    render: (context) => (
      <TradingWorkspace
        authSession={context.workspaceData.authSession}
        tradeCaptureFormProps={buildTradeCaptureFormProps(context)}
        trades={context.workspaceData.trades}
        tradeWorkflowItems={context.workspaceData.tradeWorkflowItems}
        activeTradeCount={context.summary.activeTradeCount}
        totalActiveVolume={context.summary.totalActiveVolume}
        pricedActiveTrades={context.summary.pricedActiveTrades}
        pricingCoverage={context.summary.pricingCoverage}
        pendingPricingTrades={context.summary.pendingPricingTrades}
        trackedBooks={context.summary.trackedBooks}
        largestPositionRow={context.summary.largestPositionRow}
        selectedTrade={context.summary.selectedTrade}
        selectedTradeId={context.selectedTradeId}
        selectedTradeEvents={context.summary.selectedTradeEvents}
        inspectorTab={context.shell.inspectorTab}
        setSelectedTradeId={context.setSelectedTradeId}
        setInspectorTab={context.setInspectorTab}
        handleDuplicateTrade={context.tradeActions.handleDuplicateTrade}
        handleAmendTrade={context.tradeActions.handleAmendTrade}
        handleCancelTrade={context.tradeActions.handleCancelTrade}
        handleOptionLifecycleEvent={context.tradeActions.handleOptionLifecycleEvent}
        optionLifecycleSubmittingEvent={context.tradeActions.optionLifecycleSubmittingEvent}
        amendmentPreviewFields={context.tradeActions.amendmentPreview.changedFields}
        cancelImpactSummary={context.tradeActions.cancelImpactSummary}
        amendmentLockedReason={context.tradeActions.amendmentLockedReason}
        amendExternalTradeIdInput={context.amendForm.amendExternalTradeIdInput}
        setAmendExternalTradeIdInput={context.amendForm.setAmendExternalTradeIdInput}
        amendSourceSystemInput={context.amendForm.amendSourceSystemInput}
        amendExecutionTimestampInput={context.amendForm.amendExecutionTimestampInput}
        setAmendExecutionTimestampInput={context.amendForm.setAmendExecutionTimestampInput}
        amendTradeDateInput={context.amendForm.amendTradeDateInput}
        setAmendTradeDateInput={context.amendForm.setAmendTradeDateInput}
        amendEffectiveStartDateInput={context.amendForm.amendEffectiveStartDateInput}
        setAmendEffectiveStartDateInput={context.amendForm.setAmendEffectiveStartDateInput}
        amendEffectiveEndDateInput={context.amendForm.amendEffectiveEndDateInput}
        setAmendEffectiveEndDateInput={context.amendForm.setAmendEffectiveEndDateInput}
        amendQualitySpecInput={context.amendForm.amendQualitySpecInput}
        setAmendQualitySpecInput={context.amendForm.setAmendQualitySpecInput}
        amendUnitInput={context.amendForm.amendUnitInput}
        setAmendUnitInput={context.amendForm.setAmendUnitInput}
        amendUnitOptions={context.amendForm.amendUnitOptions}
        amendTradeCurrencyInput={context.amendForm.amendTradeCurrencyInput}
        setAmendTradeCurrencyInput={context.amendForm.setAmendTradeCurrencyInput}
        amendCurrencyOptions={context.amendForm.amendCurrencyOptions}
        amendLocationInput={context.amendForm.amendLocationInput}
        setAmendLocationInput={context.amendForm.setAmendLocationInput}
        amendLocationOptions={context.amendForm.amendLocationOptions}
        amendDeliveryStartInput={context.amendForm.amendDeliveryStartInput}
        setAmendDeliveryStartInput={context.amendForm.setAmendDeliveryStartInput}
        amendDeliveryEndInput={context.amendForm.amendDeliveryEndInput}
        setAmendDeliveryEndInput={context.amendForm.setAmendDeliveryEndInput}
        amendPriceUnitInput={context.amendForm.amendPriceUnitInput}
        setAmendPriceUnitInput={context.amendForm.setAmendPriceUnitInput}
        amendPriceUnitOptions={context.amendForm.amendPriceUnitOptions}
        amendTradeInstrumentTypeInput={context.amendForm.amendTradeInstrumentTypeInput}
        setAmendTradeInstrumentTypeInput={context.amendForm.setAmendTradeInstrumentTypeInput}
        amendOptionTypeInput={context.amendForm.amendOptionTypeInput}
        setAmendOptionTypeInput={context.amendForm.setAmendOptionTypeInput}
        amendOptionStyleInput={context.amendForm.amendOptionStyleInput}
        setAmendOptionStyleInput={context.amendForm.setAmendOptionStyleInput}
        amendOptionExpirationDateInput={context.amendForm.amendOptionExpirationDateInput}
        setAmendOptionExpirationDateInput={context.amendForm.setAmendOptionExpirationDateInput}
        amendOptionStrikePriceInput={context.amendForm.amendOptionStrikePriceInput}
        setAmendOptionStrikePriceInput={context.amendForm.setAmendOptionStrikePriceInput}
        amendBookInput={context.amendForm.amendBookInput}
        setAmendBookInput={context.amendForm.setAmendBookInput}
        amendBookOptions={context.amendForm.amendBookOptions}
        amendPortfolioInput={context.amendForm.amendPortfolioInput}
        setAmendPortfolioInput={context.amendForm.setAmendPortfolioInput}
        amendPortfolioOptions={context.amendForm.amendPortfolioOptions}
        amendCounterpartyInput={context.amendForm.amendCounterpartyInput}
        setAmendCounterpartyInput={context.amendForm.setAmendCounterpartyInput}
        amendCounterpartyOptions={context.amendForm.amendCounterpartyOptions}
        amendCommodityClassInput={context.amendForm.amendCommodityClassInput}
        setAmendCommodityClassInput={context.amendForm.setAmendCommodityClassInput}
        commodityClassOptions={context.summary.commodityClassOptions}
        amendCommodityInput={context.amendForm.amendCommodityInput}
        setAmendCommodityInput={context.amendForm.setAmendCommodityInput}
        amendCommodityOptions={context.amendForm.amendCommodityOptions}
        amendTradeNatureInput={context.amendForm.amendTradeNatureInput}
        setAmendTradeNatureInput={context.amendForm.setAmendTradeNatureInput}
        amendTradeStructureInput={context.amendForm.amendTradeStructureInput}
        setAmendTradeStructureInput={context.amendForm.setAmendTradeStructureInput}
        amendTradeSideInput={context.amendForm.amendTradeSideInput}
        setAmendTradeSideInput={context.amendForm.setAmendTradeSideInput}
        amendPricingTypeInput={context.amendForm.amendPricingTypeInput}
        setAmendPricingTypeInput={context.amendForm.setAmendPricingTypeInput}
        amendPricingStatusInput={context.amendForm.amendPricingStatusInput}
        setAmendPricingStatusInput={context.amendForm.setAmendPricingStatusInput}
        amendConfirmationStatusInput={context.amendForm.amendConfirmationStatusInput}
        setAmendConfirmationStatusInput={context.amendForm.setAmendConfirmationStatusInput}
        amendNominationStatusInput={context.amendForm.amendNominationStatusInput}
        setAmendNominationStatusInput={context.amendForm.setAmendNominationStatusInput}
        amendAllocationStatusInput={context.amendForm.amendAllocationStatusInput}
        setAmendAllocationStatusInput={context.amendForm.setAmendAllocationStatusInput}
        amendPriceIndexInput={context.amendForm.amendPriceIndexInput}
        setAmendPriceIndexInput={context.amendForm.setAmendPriceIndexInput}
        amendPriceIndexOptions={context.amendForm.amendPriceIndexOptions}
        amendPriceInput={context.amendForm.amendPriceInput}
        setAmendPriceInput={context.amendForm.setAmendPriceInput}
        amendVolumeInput={context.amendForm.amendVolumeInput}
        setAmendVolumeInput={context.amendForm.setAmendVolumeInput}
        amendInvoiceStatusInput={context.amendForm.amendInvoiceStatusInput}
        setAmendInvoiceStatusInput={context.amendForm.setAmendInvoiceStatusInput}
        amendPaymentStatusInput={context.amendForm.amendPaymentStatusInput}
        setAmendPaymentStatusInput={context.amendForm.setAmendPaymentStatusInput}
        amendSettlementStatusInput={context.amendForm.amendSettlementStatusInput}
        setAmendSettlementStatusInput={context.amendForm.setAmendSettlementStatusInput}
        amendTraderUserInput={context.amendForm.amendTraderUserInput}
        setAmendTraderUserInput={context.amendForm.setAmendTraderUserInput}
        amendLegs={context.amendForm.amendLegs}
        activeCommodities={context.summary.activeCommodities}
        addDraftLeg={context.amendForm.addDraftLeg}
        removeDraftLeg={context.amendForm.removeDraftLeg}
        updateDraftLeg={context.amendForm.updateDraftLeg}
        amending={context.tradeActions.amending}
        cancelling={context.tradeActions.cancelling}
        amendError={context.tradeActions.amendError}
        counterpartyCreditPolicyPreview={context.tradeActions.amendCounterpartyCreditPolicyPreview}
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
        formatCommodityClass={formatCommodityClass}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        statusTone={statusTone}
      />
    ),
  },
  events: {
    render: (context) => (
      <EventsWorkspace
        authSession={context.workspaceData.authSession}
        eventFilter={context.shell.eventFilter}
        eventsLoadedCount={context.workspaceData.events.length}
        selectedTradeId={context.selectedTradeId}
        setEventFilter={context.shell.setEventFilter}
        filteredEvents={context.summary.filteredEvents}
        formatDate={formatDate}
        onOpenTrade={context.navigateToTrade}
      />
    ),
  },
  risk: {
    usesWindowNotices: true,
    render: (context) => (
      <RiskWorkspace
        authSession={context.workspaceData.authSession}
        trades={context.workspaceData.trades}
        activeTrades={context.summary.activeTrades}
        positionsByClass={context.summary.positionsByClass}
        positionsWithClass={context.summary.positionsWithClass}
        optionExposures={context.workspaceData.optionExposures}
        formatCommodityClass={formatCommodityClass}
        formatNumber={formatNumber}
        formatMoney={formatMoney}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        onOpenTrade={context.navigateToTrade}
        onOptionLifecycleEvent={context.tradeActions.handleTradeOptionLifecycleEvent}
        optionLifecycleSubmittingEvent={context.tradeActions.optionLifecycleSubmittingEvent}
        optionLifecycleSubmittingTradeId={context.tradeActions.optionLifecycleSubmittingTradeId}
      />
    ),
  },
  positions: {
    usesWindowNotices: true,
    render: (context) => (
      <PositionsWorkspace
        activeTrades={context.summary.activeTrades}
        authSession={context.workspaceData.authSession}
        onOpenRisk={() => context.navigateToView('risk')}
        onOpenTrade={context.navigateToTrade}
        positionsByClass={context.summary.positionsByClass}
        positionsWithClass={context.summary.positionsWithClass}
        formatCommodityClass={formatCommodityClass}
        formatNumber={formatNumber}
        formatDate={formatDate}
      />
    ),
  },
  shipments: {
    usesWindowNotices: true,
    render: (context) => (
      <DeliveryWorkspace
        authSession={context.workspaceData.authSession}
        deliveries={context.workspaceData.deliveries}
        formatCommodityClass={formatCommodityClass}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        formatNumber={formatNumber}
        deliveryMutationError={context.workspaceData.deliveryMutationError}
        deliveryMutationPendingId={context.workspaceData.deliveryMutationPendingId}
        deliverySyncError={context.workspaceData.deliverySyncError}
        deliverySyncSuccess={context.workspaceData.deliverySyncSuccess}
        deliveriesSyncing={context.workspaceData.deliveriesSyncing}
        onOpenTrade={context.navigateToTrade}
        onSyncDeliveriesFromTrades={context.workspaceData.handleSyncDeliveriesFromTrades}
        onSaveDelivery={context.workspaceData.handleUpdateDelivery}
        onSaveDeliveryLogisticsDetails={context.workspaceData.handleUpdateDeliveryLogisticsDetails}
        onSaveDeliveryPipelineDetails={context.workspaceData.handleUpdateDeliveryPipelineDetails}
        onSaveDeliveryPowerDetails={context.workspaceData.handleUpdateDeliveryPowerDetails}
        onCreateDeliveryEvent={context.workspaceData.handleCreateDeliveryEvent}
      />
    ),
  },
  scheduling: {
    usesWindowNotices: true,
    render: (context) => (
      <SchedulingWorkspace
        authSession={context.workspaceData.authSession}
        deliveries={context.workspaceData.deliveries}
        formatCommodityClass={formatCommodityClass}
        formatNumber={formatNumber}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        actualizationMutationError={context.workspaceData.actualizationMutationError}
        actualizationMutationPendingDeliveryId={context.workspaceData.actualizationMutationPendingDeliveryId}
        workflowMutationError={context.workspaceData.workflowMutationError}
        workflowCreationPendingTradeId={context.workspaceData.workflowCreationPendingTradeId}
        workflowMutationPendingId={context.workspaceData.workflowMutationPendingId}
        onCreateWorkflowItem={context.workspaceData.handleCreateWorkflowItem}
        onOpenTrade={context.navigateToTrade}
        onSaveActualization={context.workspaceData.handleSaveDeliveryActualization}
        onSaveWorkflowItem={context.workspaceData.handleSaveWorkflowItem}
      />
    ),
  },
  operations: {
    usesWindowNotices: true,
    render: (context) => (
      <OperationsWorkspace
        authSession={context.workspaceData.authSession}
        activeTrades={context.summary.activeTrades}
        confirmations={context.workspaceData.tradeConfirmations}
        deliveries={context.workspaceData.deliveries}
        workItems={context.workspaceData.tradeWorkflowItems}
        externalDataSyncStatus={context.workspaceData.externalDataSyncStatus}
        weatherSyncStatus={context.workspaceData.weatherSyncStatus}
        tradingSources={context.workspaceData.tradingSources}
        formatCommodityClass={formatCommodityClass}
        formatNumber={formatNumber}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        confirmationMutationError={context.workspaceData.confirmationMutationError}
        confirmationMutationPendingKey={context.workspaceData.confirmationMutationPendingKey}
        workflowMutationError={context.workspaceData.workflowMutationError}
        workflowCreationPendingTradeId={context.workspaceData.workflowCreationPendingTradeId}
        workflowMutationPendingId={context.workspaceData.workflowMutationPendingId}
        onCreateConfirmation={context.workspaceData.handleCreateTradeConfirmation}
        onIssueConfirmation={context.workspaceData.handleIssueTradeConfirmation}
        onRespondConfirmation={context.workspaceData.handleRespondTradeConfirmation}
        onCreateWorkflowItem={context.workspaceData.handleCreateWorkflowItem}
        onOpenTrade={context.navigateToTrade}
        onOptionLifecycleEvent={context.tradeActions.handleTradeOptionLifecycleEvent}
        optionLifecycleSubmittingEvent={context.tradeActions.optionLifecycleSubmittingEvent}
        optionLifecycleSubmittingTradeId={context.tradeActions.optionLifecycleSubmittingTradeId}
        onBookUnderlyingTrade={context.workspaceData.handleBookUnderlyingTrade}
        onSaveConfirmation={context.workspaceData.handleUpdateTradeConfirmation}
        onSaveWorkflowItem={context.workspaceData.handleSaveWorkflowItem}
      />
    ),
  },
  settlement: {
    usesWindowNotices: true,
    render: (context) => (
      <SettlementWorkspace
        authSession={context.workspaceData.authSession}
        activeTrades={context.summary.activeTrades}
        invoices={context.workspaceData.tradeInvoices}
        payments={context.workspaceData.tradePayments}
        settlementSummary={context.workspaceData.workspaceBootstrapSummary?.settlement ?? null}
        workItems={context.workspaceData.tradeWorkflowItems}
        formatCommodityClass={formatCommodityClass}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        invoiceMutationError={context.workspaceData.invoiceMutationError}
        invoiceMutationPendingKey={context.workspaceData.invoiceMutationPendingKey}
        paymentMutationError={context.workspaceData.paymentMutationError}
        paymentMutationPendingKey={context.workspaceData.paymentMutationPendingKey}
        onOpenTrade={context.navigateToTrade}
        onIssueInvoice={context.workspaceData.handleIssueTradeInvoice}
        onSaveInvoice={context.workspaceData.handleUpdateTradeInvoice}
        onCreatePayment={context.workspaceData.handleCreateTradePayment}
        onSavePayment={context.workspaceData.handleUpdateTradePayment}
        onSaveWorkflowItem={context.workspaceData.handleSaveWorkflowItem}
      />
    ),
  },
  reports: {
    render: (context) => (
      <ReportsWorkspace
        activeTrades={context.summary.activeTrades}
        authSession={context.workspaceData.authSession}
        counterpartyCreditReport={context.workspaceData.counterpartyCreditReport}
        portfolios={context.workspaceData.portfolios}
        formatNumber={formatNumber}
        formatMoney={formatMoney}
        formatDate={formatDate}
        formatDateOnly={formatDateOnly}
        onOpenSettlement={() => context.navigateToView('settlement')}
        onOpenTrade={context.navigateToTrade}
      />
    ),
  },
  reference: {
    render: (context) => (
      <ReferenceDataWorkspace
        controller={context.referenceState}
        formatCommodityClass={formatCommodityClass}
        formatDate={formatDate}
      />
    ),
  },
  admin: {
    render: (context) => (
      <AdminWorkspace
        authSession={context.workspaceData.authSession}
        onOpenSettings={() => context.navigateToView('settings')}
        onRoadmapPublished={context.handleRoadmapPublished}
        selectedTrade={context.summary.selectedTrade}
        selectedTradeEvents={context.summary.selectedTradeEvents}
        events={context.workspaceData.events}
        trades={context.workspaceData.trades}
        positions={context.workspaceData.positions}
        activeBooks={context.summary.activeBooks}
        activeCommodities={context.summary.activeCommodities}
        priceIndices={context.workspaceData.priceIndices}
        externalDataRuns={context.workspaceData.externalDataRuns}
        externalDataSyncStatus={context.workspaceData.externalDataSyncStatus}
        tradingSources={context.workspaceData.tradingSources}
        weatherLocations={context.workspaceData.weatherLocations}
        weatherSyncStatus={context.workspaceData.weatherSyncStatus}
        externalDataSyncing={context.workspaceData.externalDataSyncing}
        externalDataSyncingProvider={context.workspaceData.externalDataSyncingProvider}
        externalDataError={context.workspaceData.externalDataError}
        externalDataSuccess={context.workspaceData.externalDataSuccess}
        counterpartyCreditImportDraft={context.workspaceData.counterpartyCreditImportDraft}
        counterpartyCreditPreview={context.workspaceData.counterpartyCreditPreview}
        counterpartyCreditPreviewing={context.workspaceData.counterpartyCreditPreviewing}
        counterpartyCreditPreviewError={context.workspaceData.counterpartyCreditPreviewError}
        counterpartyCreditPreviewSuccess={context.workspaceData.counterpartyCreditPreviewSuccess}
        counterpartyCreditImporting={context.workspaceData.counterpartyCreditImporting}
        counterpartyCreditImportError={context.workspaceData.counterpartyCreditImportError}
        counterpartyCreditImportSuccess={context.workspaceData.counterpartyCreditImportSuccess}
        tradingSourcesSyncing={context.workspaceData.tradingSourcesSyncing}
        tradingSourcesError={context.workspaceData.tradingSourcesError}
        tradingSourcesSuccess={context.workspaceData.tradingSourcesSuccess}
        weatherSyncing={context.workspaceData.weatherSyncing}
        weatherSyncError={context.workspaceData.weatherSyncError}
        weatherSyncSuccess={context.workspaceData.weatherSyncSuccess}
        weatherLocationMutationError={context.workspaceData.weatherLocationMutationError}
        weatherLocationMutationPendingCode={context.workspaceData.weatherLocationMutationPendingCode}
        weatherLocationMutationSuccess={context.workspaceData.weatherLocationMutationSuccess}
        onRunExternalDataSync={context.workspaceData.handleRunExternalDataSync}
        onCounterpartyCreditImportDraftChange={context.workspaceData.handleCounterpartyCreditImportDraftChange}
        onPreviewCounterpartyCreditImport={context.workspaceData.handlePreviewCounterpartyCreditImport}
        onImportCounterpartyCreditSnapshots={context.workspaceData.handleImportCounterpartyCreditSnapshots}
        onCreateWeatherLocation={context.workspaceData.handleCreateWeatherLocation}
        onDeactivateWeatherLocation={context.workspaceData.handleDeactivateWeatherLocation}
        onReactivateWeatherLocation={context.workspaceData.handleReactivateWeatherLocation}
        onRunNwsWeatherSync={context.workspaceData.handleRunNwsWeatherSync}
        onSeedTradingSources={context.workspaceData.handleSeedTradingSources}
        onUpdateWeatherLocation={context.workspaceData.handleUpdateWeatherLocation}
        onRefreshData={context.workspaceData.loadData}
        formatDate={formatDate}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        formatCommodityClass={formatCommodityClass}
      />
    ),
  },
  settings: {
    render: (context) => (
      <SettingsWorkspace
        health={context.workspaceData.health}
        authSession={context.workspaceData.authSession}
        appearanceSettings={context.appearance.appearanceSettings}
        resolvedColorMode={context.appearance.resolvedColorMode}
        bookOptions={context.summary.activeBooks}
        commodityClassOptions={context.summary.commodityClassOptions}
        onAppearanceSettingsChange={context.appearance.handleAppearanceSettingsChange}
        onAppearanceSettingsReset={context.appearance.handleAppearanceSettingsReset}
        tradeCaptureSettings={context.tradeCapturePreferences.tradeCaptureSettings}
        onTradeCaptureSettingsChange={context.tradeCapturePreferences.handleTradeCaptureSettingsChange}
        onTradeCaptureSettingsReset={context.tradeCapturePreferences.handleTradeCaptureSettingsReset}
        onSessionChange={context.workspaceData.handleSessionChange}
      />
    ),
  },
  assistant: {
    render: (context) => (
      <AssistantWorkspace
        authSession={context.workspaceData.authSession}
        health={context.workspaceData.health}
        trades={context.workspaceData.trades}
        events={context.workspaceData.events}
        positions={context.workspaceData.positions}
        selectedTrade={context.summary.selectedTrade}
        selectedTradeEvents={context.summary.selectedTradeEvents}
        onOpenSettings={() => context.navigateToView('settings')}
        onRefreshData={context.workspaceData.loadData}
      />
    ),
  },
}

const MUTATION_GROUPS: Record<WorkspaceMutationKind, AppDataGroup[]> = {
  'trade-event': ['trades', 'positions', 'operations'],
  delivery: ['deliveries'],
  confirmation: ['trades', 'deliveries', 'operations'],
  'workflow-item': ['trades', 'operations', 'settlement'],
  actualization: ['trades', 'deliveries', 'operations'],
  invoice: ['trades', 'settlement'],
  payment: ['trades', 'settlement'],
  'admin-external-data': ['admin', 'operations'],
  'admin-counterparty-credit': ['admin', 'reference', 'reports', 'operations'],
  'admin-weather-sync': ['admin', 'operations'],
}

export const WORKSPACE_DESCRIPTORS: Record<ViewKey, WorkspaceDescriptor> = Object.fromEntries(
  Object.entries(WORKSPACE_DESCRIPTOR_CONFIG).map(([key, descriptor]) => [
    key,
    {
      ...descriptor,
      ...WORKSPACE_RENDERERS[key as ViewKey],
    },
  ]),
) as Record<ViewKey, WorkspaceDescriptor>

function indexByView<T>(project: (descriptor: WorkspaceDescriptor) => T): Record<ViewKey, T> {
  return Object.fromEntries(
    Object.values(WORKSPACE_DESCRIPTORS).map((descriptor) => [descriptor.key, project(descriptor)]),
  ) as Record<ViewKey, T>
}

export const APP_VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> =
  Object.values(WORKSPACE_DESCRIPTORS).map(({ key, label, kicker }) => ({ key, label, kicker }))

const WORKSPACE_LABEL_BY_VIEW = indexByView((descriptor) => descriptor.label)
export const HERO_TITLE_BY_VIEW = indexByView((descriptor) => descriptor.heroTitle)
export const HERO_BODY_BY_VIEW = indexByView((descriptor) => descriptor.heroBody)
export const VIEW_DATA_GROUPS = indexByView((descriptor) => [...descriptor.dataGroups])
export const VIEW_BLOCKING_GROUPS = indexByView((descriptor) => [...descriptor.blockingGroups])

export function workspaceLabel(view: ViewKey): string {
  return WORKSPACE_LABEL_BY_VIEW[view] ?? 'Workspace'
}

export function buildWorkspaceWindowNotices(args: {
  currentView: ViewKey
  summary: ReturnType<typeof useAppWorkspaceSummary>
  workspaceData: ReturnType<typeof useAppWorkspaceData>
}): WorkspaceWindowNotice[] {
  const descriptor = WORKSPACE_DESCRIPTORS[args.currentView]

  return descriptor.buildWindowNotices?.({
    summary: args.summary,
    workspaceData: args.workspaceData,
  }) ?? []
}

export function buildTargetedMutationRefreshPlan(args: {
  currentView: ViewKey
  mutation: WorkspaceMutationKind
}): WorkspaceMutationRefreshPlan | null {
  const plan = WORKSPACE_DESCRIPTORS[args.currentView].mutationRefreshPlans?.[args.mutation]
  if (!plan) {
    return null
  }

  return {
    groups: Array.from(new Set(plan.groups)),
    collections: Array.from(new Set(plan.collections)),
  }
}

export function buildMutationRefreshGroups(args: {
  currentView: ViewKey
  groupLoaded: Record<AppDataGroup, boolean>
  mutation: WorkspaceMutationKind
}): AppDataGroup[] {
  const { currentView, groupLoaded, mutation } = args
  const loadedGroups = (Object.entries(groupLoaded) as Array<[AppDataGroup, boolean]>)
    .filter(([, loaded]) => loaded)
    .map(([group]) => group)

  return Array.from(
    new Set<AppDataGroup>([
      'core',
      ...WORKSPACE_DESCRIPTORS[currentView].dataGroups,
      ...loadedGroups,
      ...MUTATION_GROUPS[mutation],
    ]),
  )
}

export function renderWorkspaceByView(context: WorkspaceViewRenderContext): ReactNode {
  return WORKSPACE_DESCRIPTORS[context.currentView].render(context)
}
