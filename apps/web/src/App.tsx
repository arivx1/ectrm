import { Suspense, lazy, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import './App.css'
import './appearance.css'
import {
  MOBILE_NAV_MEDIA_QUERY,
  MOBILE_NAVIGATION_PANEL_ID,
  mobileNavigationToggleLabel,
  shouldHandleClientSideNavigation,
  shouldHideMobileNavigation,
} from './app/navigation'
import type { DocumentationDocumentKey } from './workspaces/docs/DocumentationWorkspace'
import {
  deriveWorkspaceStatus,
  VIEW_DATA_GROUPS,
} from './entities/app/workspaceLoading'
import { buildMutationRefreshGroups } from './entities/app/workspaceRefresh'
import { useAppWorkspaceData } from './entities/app/useAppWorkspaceData'
import { submitTradeEvent } from './entities/trade/api'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { fetchJson } from './shared/api'
import {
  applyAppearanceSettingsToDocument,
  clearAppearanceSettingsSnapshot,
  detectSystemPrefersDark,
  getAppearanceSettingsSnapshot,
  resolveColorMode,
  saveAppearanceSettingsSnapshot,
} from './shared/appearance'
import { appConfig, bootstrapQueryLimits } from './shared/config'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import {
  buildCounterpartyCreditPolicyPreview,
  buildCounterpartyCreditRestrictionMessage,
} from './features/trades/counterpartyCredit'
import {
  buildAmendTradeSubmission,
  buildCreateTradeSubmission,
  previewTradeAmendment,
} from './features/trades/tradeEventPayloads'
import { tradeTooltipCopy } from './features/trades/tooltipCopy'
import {
  type EventRow,
  type InspectorTab,
  type PositionRow,
  type ViewKey,
} from './shared/models'
import {
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  formatNumber,
  statusTone,
} from './shared/format'
import { classForCommodity } from './shared/reference'
import {
  allocationStatusOptions,
  commodityClassOrder,
  confirmationStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionStyleOptions,
  optionTypeOptions,
  paymentStatusOptions,
  pricingTypeOptions,
  pricingStatusOptions,
  settlementStatusOptions,
  tradeAggregateType,
  tradeInstrumentTypeOptions,
  tradeNatureOptions,
  tradeSideOptions,
  type OptionLifecycleEventType,
  tradeStatusIsActive,
  tradeStatusValues,
  tradeStructureOptions,
} from './shared/trading'
import { Tooltip } from './shared/ui/Tooltip'

const DocumentationWorkspace = lazy(() =>
  import('./workspaces/docs/DocumentationWorkspace').then((module) => ({
    default: module.DocumentationWorkspace,
  })),
)
const DashboardWorkspace = lazy(() =>
  import('./workspaces/dashboard/DashboardWorkspace').then((module) => ({
    default: module.DashboardWorkspace,
  })),
)
const TradingWorkspace = lazy(() =>
  import('./workspaces/trading/TradingWorkspace').then((module) => ({
    default: module.TradingWorkspace,
  })),
)
const EventsWorkspace = lazy(() =>
  import('./workspaces/events/EventsWorkspace').then((module) => ({
    default: module.EventsWorkspace,
  })),
)
const RiskWorkspace = lazy(() =>
  import('./workspaces/risk/RiskWorkspace').then((module) => ({
    default: module.RiskWorkspace,
  })),
)
const PositionsWorkspace = lazy(() =>
  import('./workspaces/positions/PositionsWorkspace').then((module) => ({
    default: module.PositionsWorkspace,
  })),
)
const DeliveryWorkspace = lazy(() =>
  import('./workspaces/shipments/ShipmentWorkspace').then((module) => ({
    default: module.DeliveryWorkspace,
  })),
)
const SchedulingWorkspace = lazy(() =>
  import('./workspaces/scheduling/SchedulingWorkspace').then((module) => ({
    default: module.SchedulingWorkspace,
  })),
)
const OperationsWorkspace = lazy(() =>
  import('./workspaces/operations/OperationsWorkspace').then((module) => ({
    default: module.OperationsWorkspace,
  })),
)
const SettlementWorkspace = lazy(() =>
  import('./workspaces/settlement/SettlementWorkspace').then((module) => ({
    default: module.SettlementWorkspace,
  })),
)
const ReportsWorkspace = lazy(() =>
  import('./workspaces/reports/ReportsWorkspace').then((module) => ({
    default: module.ReportsWorkspace,
  })),
)
const ReferenceDataWorkspace = lazy(() =>
  import('./workspaces/reference-data/ReferenceDataWorkspace').then((module) => ({
    default: module.ReferenceDataWorkspace,
  })),
)
const AdminWorkspace = lazy(() =>
  import('./workspaces/admin/AdminWorkspace').then((module) => ({
    default: module.AdminWorkspace,
  })),
)
const SettingsWorkspace = lazy(() =>
  import('./workspaces/settings/SettingsWorkspace').then((module) => ({
    default: module.SettingsWorkspace,
  })),
)
const AssistantWorkspace = lazy(() =>
  import('./workspaces/assistant/AssistantWorkspace').then((module) => ({
    default: module.AssistantWorkspace,
  })),
)

const VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> = [
  { key: 'dashboard', label: 'Dashboard', kicker: 'Desk' },
  { key: 'guide', label: 'Guide', kicker: 'Playbook' },
  { key: 'trades', label: 'Trading', kicker: 'Blotter' },
  { key: 'events', label: 'Events', kicker: 'Tape' },
  { key: 'risk', label: 'Risk', kicker: 'Exposure' },
  { key: 'positions', label: 'Positions', kicker: 'Risk' },
  { key: 'shipments', label: 'Deliveries', kicker: 'Execution' },
  { key: 'scheduling', label: 'Scheduling', kicker: 'Scheduler' },
  { key: 'operations', label: 'Operations', kicker: 'Control' },
  { key: 'settlement', label: 'Settlement', kicker: 'Cash' },
  { key: 'reports', label: 'Reports', kicker: 'Analytics' },
  { key: 'reference', label: 'Reference Data', kicker: 'Master' },
  { key: 'admin', label: 'Admin', kicker: 'Ops' },
  { key: 'settings', label: 'Settings', kicker: 'Config' },
  { key: 'assistant', label: 'Assistant', kicker: 'AI' },
]

const DEFAULT_DOCUMENTATION_DOCUMENT_KEY: DocumentationDocumentKey = 'guide'

type AppRouteState = {
  view: ViewKey
  docsDocumentKey: DocumentationDocumentKey
  tradeId: string | null
}

const VIEW_KEYS = new Set<ViewKey>(VIEWS.map((view) => view.key))

function isViewKey(value: string | null): value is ViewKey {
  return value !== null && VIEW_KEYS.has(value as ViewKey)
}

function isDocumentationDocumentKey(value: string | null): value is DocumentationDocumentKey {
  return value === 'guide' || value === 'roadmap'
}

function readAppRouteState(): AppRouteState {
  if (typeof window === 'undefined') {
    return {
      view: 'dashboard',
      docsDocumentKey: DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
      tradeId: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const viewParam = params.get('view')
  const docsParam = params.get('doc')
  const view: ViewKey = isViewKey(viewParam) ? viewParam : 'dashboard'

  return {
    view,
    docsDocumentKey:
      view === 'guide' && isDocumentationDocumentKey(docsParam)
        ? docsParam
        : DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
    tradeId: view === 'trades' ? params.get('trade')?.trim() || null : null,
  }
}

function currentAppUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function buildAppRouteUrl(route: AppRouteState, hash: string): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  const params = new URLSearchParams()
  params.set('view', route.view)

  if (route.view === 'guide') {
    params.set('doc', route.docsDocumentKey)
  }

  if (route.view === 'trades' && route.tradeId) {
    params.set('trade', route.tradeId)
  }

  const search = params.toString()
  return `${window.location.pathname}${search ? `?${search}` : ''}${hash}`
}

function detectMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_NAV_MEDIA_QUERY).matches
  }

  return window.innerWidth <= 960
}

function parseOptionalTradeNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function workspaceLabel(view: ViewKey): string {
  return VIEWS.find((entry) => entry.key === view)?.label ?? 'Workspace'
}

function WorkspaceLoadState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <section className="surface empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  )
}

function WorkspaceErrorState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <section className="surface empty-state">
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" className="button button-secondary" onClick={onRetry}>
        Retry workspace load
      </button>
    </section>
  )
}

export default function App() {
  const initialRoute = useMemo(() => readAppRouteState(), [])
  const [currentView, setCurrentView] = useState<ViewKey>(initialRoute.view)
  const [activeDocumentationDocumentKey, setActiveDocumentationDocumentKey] =
    useState<DocumentationDocumentKey>(initialRoute.docsDocumentKey)
  const [roadmapRefreshVersion, setRoadmapRefreshVersion] = useState(0)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => detectMobileViewport())
  const [createError, setCreateError] = useState<string>('')
  const [amendError, setAmendError] = useState<string>('')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(initialRoute.tradeId)
  const [selectedTradeEvents, setSelectedTradeEvents] = useState<EventRow[]>([])
  const [eventFilter, setEventFilter] = useState('ALL')
  const [appearanceSettings, setAppearanceSettings] = useState(() => getAppearanceSettingsSnapshot())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => detectSystemPrefersDark())

  const [submitting, setSubmitting] = useState(false)

  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [optionLifecycleSubmittingEvent, setOptionLifecycleSubmittingEvent] =
    useState<OptionLifecycleEventType | null>(null)

  const {
    authSession,
    appLoading,
    books,
    commodities,
    counterparties,
    counterpartyCreditImportDraft,
    counterpartyCreditImportError,
    counterpartyCreditImporting,
    counterpartyCreditImportSuccess,
    counterpartyCreditPreview,
    counterpartyCreditPreviewError,
    counterpartyCreditPreviewing,
    counterpartyCreditPreviewSuccess,
    counterpartyCreditProfiles,
    counterpartyCreditReport,
    counterpartyExternalCreditSnapshots,
    counterpartyStandards,
    currencies,
    deliveries,
    error,
    events,
    externalDataError,
    externalDataRuns,
    externalDataSuccess,
    externalDataSyncStatus,
    externalDataSyncing,
    externalDataSyncingProvider,
    groupErrors,
    groupLoaded,
    groupLoading,
    handleCounterpartyCreditImportDraftChange,
    handleCreateTradePayment,
    handleImportCounterpartyCreditSnapshots,
    handleIssueTradeInvoice,
    handlePreviewCounterpartyCreditImport,
    handleRunExternalDataSync,
    handleRunNwsWeatherSync,
    handleSaveWorkflowItem,
    handleSeedTradingSources,
    handleSessionChange,
    handleUpdateTradeInvoice,
    handleUpdateTradePayment,
    health,
    invoiceMutationError,
    invoiceMutationPendingKey,
    loadData,
    locationStandards,
    locations,
    optionExposures,
    paymentMutationError,
    paymentMutationPendingKey,
    portfolios,
    positions,
    priceIndices,
    setError,
    tradeInvoices,
    tradePayments,
    tradeWorkflowItems,
    trades,
    tradingSources,
    tradingSourcesError,
    tradingSourcesSuccess,
    tradingSourcesSyncing,
    units,
    weatherSyncError,
    weatherSyncStatus,
    weatherSyncSuccess,
    weatherSyncing,
    workflowMutationError,
    workflowMutationPendingId,
  } = useAppWorkspaceData(currentView)

  const referenceDataLoading = groupLoading.reference && !groupLoaded.reference
  const resolvedColorMode = useMemo(
    () => resolveColorMode(appearanceSettings.colorMode, systemPrefersDark),
    [appearanceSettings.colorMode, systemPrefersDark],
  )

  function handleRoadmapPublished() {
    setRoadmapRefreshVersion((current) => current + 1)
  }

  useEffect(() => {
    function handlePopState() {
      const nextRoute = readAppRouteState()
      setCurrentView(nextRoute.view)
      if (nextRoute.view === 'guide') {
        setActiveDocumentationDocumentKey(nextRoute.docsDocumentKey)
      }
      if (nextRoute.view === 'trades') {
        setSelectedTradeId(nextRoute.tradeId)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [currentView])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (typeof window.matchMedia !== 'function') {
      function handleResize() {
        setIsMobileViewport(detectMobileViewport())
      }

      handleResize()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }

    const mediaQuery = window.matchMedia(MOBILE_NAV_MEDIA_QUERY)

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMobileViewport(event.matches)
    }

    setIsMobileViewport(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange)
      return () => {
        mediaQuery.removeEventListener('change', handleViewportChange)
      }
    }

    mediaQuery.addListener(handleViewportChange)

    return () => {
      mediaQuery.removeListener(handleViewportChange)
    }
  }, [])

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileNavOpen(false)
    }
  }, [isMobileViewport])

  useEffect(() => {
    if (!isMobileViewport || !mobileNavOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobileViewport, mobileNavOpen])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function handlePreferenceChange(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handlePreferenceChange)
      return () => {
        mediaQuery.removeEventListener('change', handlePreferenceChange)
      }
    }

    mediaQuery.addListener(handlePreferenceChange)

    return () => {
      mediaQuery.removeListener(handlePreferenceChange)
    }
  }, [])

  useEffect(() => {
    applyAppearanceSettingsToDocument(appearanceSettings, systemPrefersDark)
  }, [appearanceSettings, systemPrefersDark])

  useEffect(() => {
    if (trades.length === 0) {
      if (selectedTradeId !== null) {
        setSelectedTradeId(null)
      }
      return
    }

    if (selectedTradeId && trades.some((trade) => trade.trade_id === selectedTradeId)) {
      return
    }

    setSelectedTradeId(trades[0].trade_id)
  }, [selectedTradeId, trades])

  useEffect(() => {
    if (!selectedTradeId) {
      setSelectedTradeEvents([])
      return
    }

    const tradeId = selectedTradeId
    let cancelled = false

    async function loadSelectedTradeEvents() {
      try {
        const rows = await fetchJson<EventRow[]>(
          `${appConfig.apiBase}/events?aggregate_type=${tradeAggregateType}&aggregate_id=${encodeURIComponent(tradeId)}&limit=${bootstrapQueryLimits.selectedTradeEvents}`,
        )
        if (!cancelled) {
          setSelectedTradeEvents(rows)
        }
      } catch {
        if (!cancelled) {
          setSelectedTradeEvents([])
        }
      }
    }

    loadSelectedTradeEvents()

    return () => {
      cancelled = true
    }
  }, [selectedTradeId])

  const activeBooks = useMemo(() => books.filter((book) => book.is_active), [books])
  const activeCommodities = useMemo(() => commodities.filter((commodity) => commodity.is_active), [commodities])
  const activeCounterparties = useMemo(() => counterparties.filter((counterparty) => counterparty.is_active), [counterparties])
  const activeCurrencies = useMemo(() => currencies.filter((currency) => currency.is_active), [currencies])
  const activeUnits = useMemo(() => units.filter((unit) => unit.is_active), [units])
  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations])
  const activePortfolios = useMemo(() => portfolios.filter((portfolio) => portfolio.is_active), [portfolios])
  const hasReferenceOptions = activeBooks.length > 0 && activeCommodities.length > 0

  function findCounterpartyCreditRestriction(counterpartyCode: string): string | null {
    const normalizedCode = counterpartyCode.trim().toUpperCase()
    if (!normalizedCode) {
      return null
    }

    return buildCounterpartyCreditRestrictionMessage(
      counterparties.find((counterparty) => counterparty.code === normalizedCode) ?? null,
    )
  }

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  const activeTrades = useMemo(
    () => trades.filter((trade) => tradeStatusIsActive(trade.status)),
    [trades],
  )

  function syncRouteState(route: AppRouteState, historyMode: 'push' | 'replace', preserveHash = false) {
    const nextHash = preserveHash ? window.location.hash : ''
    const nextUrl = buildAppRouteUrl(route, nextHash)
    if (nextUrl === currentAppUrl()) {
      return
    }

    const historyMethod = historyMode === 'push' ? 'pushState' : 'replaceState'
    window.history[historyMethod](null, '', nextUrl)
  }

  function navigateToView(view: ViewKey) {
    syncRouteState(
      {
        view,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
      view === 'settings',
    )
    setCurrentView(view)
  }

  function hrefForView(view: ViewKey) {
    return buildAppRouteUrl(
      {
        view,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      view === 'settings' ? window.location.hash : '',
    )
  }

  function handleViewLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, view: ViewKey) {
    if (!shouldHandleClientSideNavigation(event)) {
      return
    }

    event.preventDefault()
    navigateToView(view)
    setMobileNavOpen(false)
  }

  function navigateToTrade(tradeId: string) {
    syncRouteState(
      {
        view: 'trades',
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId,
      },
      'push',
    )
    setSelectedTradeId(tradeId)
    setCurrentView('trades')
    setInspectorTab('overview')
  }

  function handleDocumentationDocumentChange(nextDocumentKey: DocumentationDocumentKey) {
    if (currentView === 'guide' && activeDocumentationDocumentKey === nextDocumentKey) {
      return
    }

    syncRouteState(
      {
        view: 'guide',
        docsDocumentKey: nextDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
      currentView === 'guide' && nextDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
    )
    setActiveDocumentationDocumentKey(nextDocumentKey)
    setCurrentView('guide')
  }

  function handleAppearanceSettingsChange(nextSettings: Parameters<typeof saveAppearanceSettingsSnapshot>[0]) {
    const savedSettings = saveAppearanceSettingsSnapshot(nextSettings)
    setAppearanceSettings(savedSettings)
    return savedSettings
  }

  function handleAppearanceSettingsReset() {
    const defaultSettings = clearAppearanceSettingsSnapshot()
    setAppearanceSettings(defaultSettings)
    return defaultSettings
  }

  function handleToggleColorMode() {
    const nextColorMode = resolvedColorMode === 'dark' ? 'light' : 'dark'
    handleAppearanceSettingsChange({
      ...appearanceSettings,
      colorMode: nextColorMode,
    })
  }

  const themeToggleLabel = resolvedColorMode === 'dark' ? 'Dark mode' : 'Light mode'
  const themeToggleActionLabel = resolvedColorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const mobileNavHidden = shouldHideMobileNavigation({ isMobileViewport, mobileNavOpen })
  const mobileNavToggleActionLabel = mobileNavigationToggleLabel(mobileNavOpen)

  useEffect(() => {
    syncRouteState(
      {
        view: currentView,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'replace',
      currentView === 'settings' ||
        (currentView === 'guide' && activeDocumentationDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY),
    )
  }, [currentView, activeDocumentationDocumentKey, selectedTradeId])

  const totalActiveVolume = useMemo(
    () => activeTrades.reduce((sum, trade) => sum + (trade.volume ?? 0), 0),
    [activeTrades],
  )

  const pricedActiveTrades = useMemo(
    () => activeTrades.filter((trade) => trade.price !== null).length,
    [activeTrades],
  )

  const pendingPricingTrades = useMemo(
    () => activeTrades.filter((trade) => trade.pricing_status === 'PENDING').length,
    [activeTrades],
  )

  const pendingSettlementTrades = useMemo(
    () => activeTrades.filter((trade) => trade.settlement_status !== 'SETTLED').length,
    [activeTrades],
  )

  const trackedBooks = useMemo(
    () => new Set(activeTrades.map((trade) => trade.book)).size,
    [activeTrades],
  )

  const commodityClassOptions = useMemo(
    () =>
      commodityClassOrder.filter((commodityClass) =>
        activeCommodities.some((commodity) => commodity.commodity_class === commodityClass),
      ),
    [activeCommodities],
  )

  const positionsWithClass = useMemo(
    () =>
      positions.map((position) => ({
        ...position,
        commodity_class: classForCommodity(commodities, position.commodity),
      })),
    [commodities, positions],
  )

  const positionsByClass = useMemo(() => {
    const totals = new Map<string, number>()

    for (const position of positionsWithClass) {
      const current = totals.get(position.commodity_class) ?? 0
      totals.set(position.commodity_class, current + position.net_volume)
    }

    return commodityClassOrder.map((commodityClass) => ({
      commodityClass,
      netVolume: totals.get(commodityClass) ?? 0,
    })).filter((row) => row.netVolume !== 0)
  }, [positionsWithClass])

  const pricingCoverage = useMemo(() => {
    if (activeTrades.length === 0) {
      return null
    }

    return Math.round((pricedActiveTrades / activeTrades.length) * 100)
  }, [activeTrades.length, pricedActiveTrades])

  const largestPositionRow = useMemo(
    () =>
      positionsWithClass.reduce<PositionRow | null>(
        (current, position) =>
          current === null || Math.abs(position.net_volume) > Math.abs(current.net_volume) ? position : current,
        null,
      ),
    [positionsWithClass],
  )

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'ALL') {
      return events
    }

    if (eventFilter === 'SELECTED') {
      return selectedTradeEvents
    }

    return events.filter((event) => event.event_type === eventFilter)
  }, [eventFilter, events, selectedTradeEvents])

  const captureForm = useTradeCaptureForm(
    activeBooks,
    commodityClassOptions,
    activeCommodities,
    priceIndices,
    activeCounterparties,
    activePortfolios,
    activeUnits,
    activeCurrencies,
    activeLocations,
  )
  const amendForm = useTradeAmendForm(
    selectedTrade,
    selectedTradeEvents,
    activeBooks,
    commodityClassOptions,
    activeCommodities,
    priceIndices,
    activeCounterparties,
    activePortfolios,
    activeUnits,
    activeCurrencies,
    activeLocations,
  )

  const {
    tradeIdInput,
    setTradeIdInput,
    tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput,
    optionTypeInput,
    setOptionTypeInput,
    optionStyleInput,
    setOptionStyleInput,
    optionExpirationDateInput,
    setOptionExpirationDateInput,
    optionStrikePriceInput,
    setOptionStrikePriceInput,
    tradeNatureInput,
    setTradeNatureInput,
    tradeStructureInput,
    setTradeStructureInput,
    tradeSideInput,
    setTradeSideInput,
    bookInput,
    setBookInput,
    commodityClassInput,
    setCommodityClassInput,
    commodityInput,
    setCommodityInput,
    pricingTypeInput,
    setPricingTypeInput,
    priceIndexInput,
    setPriceIndexInput,
    priceInput,
    setPriceInput,
    volumeInput,
    setVolumeInput,
    qualitySpecInput,
    setQualitySpecInput,
    unitInput,
    setUnitInput,
    externalTradeIdInput,
    setExternalTradeIdInput,
    sourceSystemInput,
    executionTimestampInput,
    setExecutionTimestampInput,
    tradeDateInput,
    setTradeDateInput,
    effectiveStartDateInput,
    setEffectiveStartDateInput,
    effectiveEndDateInput,
    setEffectiveEndDateInput,
    portfolioInput,
    setPortfolioInput,
    counterpartyInput,
    setCounterpartyInput,
    tradeCurrencyInput,
    setTradeCurrencyInput,
    createCurrencyOptions,
    locationInput,
    setLocationInput,
    createLocationOptions,
    deliveryStartInput,
    setDeliveryStartInput,
    deliveryEndInput,
    setDeliveryEndInput,
    priceUnitInput,
    setPriceUnitInput,
    pricingStatusInput,
    setPricingStatusInput,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    duplicateSourceTradeId,
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    createUnitOptions,
    createPortfolioOptions,
    createCounterpartyOptions,
    updateDraftLeg: updateCreateDraftLeg,
    addDraftLeg: addCreateDraftLeg,
    removeDraftLeg: removeCreateDraftLeg,
    duplicateFromTrade,
    reset: resetCreateForm,
  } = captureForm

  const {
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
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendBookInput,
    setAmendBookInput,
    amendPortfolioInput,
    setAmendPortfolioInput,
    amendCounterpartyInput,
    setAmendCounterpartyInput,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    amendCommodityInput,
    setAmendCommodityInput,
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
    amendBookOptions,
    amendPortfolioOptions,
    amendCounterpartyOptions,
    amendCommodityOptions,
    amendPriceIndexOptions,
    amendUnitOptions,
    amendPriceUnitOptions,
    updateDraftLeg: updateAmendDraftLeg,
    addDraftLeg: addAmendDraftLeg,
    removeDraftLeg: removeAmendDraftLeg,
  } = amendForm

  const createCounterpartyCreditPolicyPreview = useMemo(
    () =>
      buildCounterpartyCreditPolicyPreview({
        profiles: counterpartyCreditProfiles,
        trades,
        counterpartyCode: counterpartyInput,
        tradeCurrencyCode: tradeCurrencyInput,
        price: parseOptionalTradeNumber(priceInput),
        volume: parseOptionalTradeNumber(volumeInput),
      }),
    [
      counterpartyCreditProfiles,
      counterpartyInput,
      priceInput,
      tradeCurrencyInput,
      trades,
      volumeInput,
    ],
  )

  const amendCounterpartyCreditPolicyPreview = useMemo(
    () =>
      buildCounterpartyCreditPolicyPreview({
        profiles: counterpartyCreditProfiles,
        trades,
        tradeId: selectedTrade?.trade_id ?? null,
        counterpartyCode: amendCounterpartyInput,
        tradeCurrencyCode: amendTradeCurrencyInput,
        price: parseOptionalTradeNumber(amendPriceInput),
        volume: parseOptionalTradeNumber(amendVolumeInput),
      }),
    [
      amendCounterpartyInput,
      amendPriceInput,
      amendTradeCurrencyInput,
      amendVolumeInput,
      counterpartyCreditProfiles,
      selectedTrade?.trade_id,
      trades,
    ],
  )

  const amendmentPreview = useMemo(() => {
    if (!selectedTrade) {
      return {
        payload: {},
        changedFields: [],
        validationError: null,
      }
    }

    return previewTradeAmendment(selectedTrade, selectedTradeEvents, {
      externalTradeId: amendExternalTradeIdInput,
      sourceSystem: amendSourceSystemInput,
      executionTimestamp: amendExecutionTimestampInput,
      tradeDate: amendTradeDateInput,
      effectiveStartDate: amendEffectiveStartDateInput,
      effectiveEndDate: amendEffectiveEndDateInput,
      qualitySpec: amendQualitySpecInput,
      unitOfMeasure: amendUnitInput,
      tradeCurrencyCode: amendTradeCurrencyInput,
      locationCode: amendLocationInput,
      deliveryStart: amendDeliveryStartInput,
      deliveryEnd: amendDeliveryEndInput,
      priceUnitCode: amendPriceUnitInput,
      instrumentType: amendTradeInstrumentTypeInput,
      optionType: amendOptionTypeInput,
      optionStyle: amendOptionStyleInput,
      optionExpirationDate: amendOptionExpirationDateInput,
      optionStrikePriceInput: amendOptionStrikePriceInput,
      tradeNature: amendTradeNatureInput,
      tradeStructure: amendTradeStructureInput,
      tradeSide: amendTradeSideInput,
      book: amendBookInput,
      portfolio: amendPortfolioInput,
      counterparty: amendCounterpartyInput,
      commodityClass: amendCommodityClassInput,
      commodity: amendCommodityInput,
      pricingType: amendPricingTypeInput,
      pricingStatus: amendPricingStatusInput,
      confirmationStatus: amendConfirmationStatusInput,
      nominationStatus: amendNominationStatusInput,
      allocationStatus: amendAllocationStatusInput,
      priceIndexCode: amendPriceIndexInput,
      priceInput: amendPriceInput,
      volumeInput: amendVolumeInput,
      invoiceStatus: amendInvoiceStatusInput,
      paymentStatus: amendPaymentStatusInput,
      settlementStatus: amendSettlementStatusInput,
      traderUser: amendTraderUserInput,
      legs: amendLegs,
    })
  }, [
    amendAllocationStatusInput,
    amendBookInput,
    amendCommodityClassInput,
    amendCommodityInput,
    amendConfirmationStatusInput,
    amendCounterpartyInput,
    amendDeliveryEndInput,
    amendDeliveryStartInput,
    amendEffectiveEndDateInput,
    amendEffectiveStartDateInput,
    amendExecutionTimestampInput,
    amendExternalTradeIdInput,
    amendInvoiceStatusInput,
    amendLocationInput,
    amendNominationStatusInput,
    amendOptionExpirationDateInput,
    amendOptionStrikePriceInput,
    amendOptionStyleInput,
    amendOptionTypeInput,
    amendPaymentStatusInput,
    amendPriceUnitInput,
    amendQualitySpecInput,
    amendLegs,
    amendPortfolioInput,
    amendPriceIndexInput,
    amendPriceInput,
    amendPricingStatusInput,
    amendPricingTypeInput,
    amendSettlementStatusInput,
    amendSourceSystemInput,
    amendTradeCurrencyInput,
    amendTradeDateInput,
    amendTradeInstrumentTypeInput,
    amendTradeNatureInput,
    amendTradeSideInput,
    amendTradeStructureInput,
    amendTraderUserInput,
    amendUnitInput,
    amendVolumeInput,
    selectedTrade,
    selectedTradeEvents,
  ])

  const cancelImpactSummary = useMemo(() => {
    if (!selectedTrade) {
      return ''
    }

    if (selectedTrade.trade_structure === 'SWAP') {
      return `This appends a TradeCancelled event and removes the trade's remaining leg-defined exposure from ${selectedTrade.book}.`
    }

    if (selectedTrade.volume === null) {
      return `This appends a TradeCancelled event and clears the trade from active exposure in ${selectedTrade.book}.`
    }

    return `This appends a TradeCancelled event and removes ${selectedTrade.trade_side ?? 'BUY'} ${formatNumber(Math.abs(selectedTrade.volume), 0)} ${selectedTrade.commodity} from active exposure in ${selectedTrade.book}.`
  }, [selectedTrade])

  const amendmentLockedReason = useMemo(() => {
    if (!selectedTrade || tradeStatusIsActive(selectedTrade.status)) {
      return ''
    }
    return `Trade ${selectedTrade.trade_id} is already closed as ${selectedTrade.status} and can no longer be amended or cancelled.`
  }, [selectedTrade])

  const referenceState = useReferenceDataController({
    apiBase: appConfig.apiBase,
    reloadData: loadData,
    trades,
    books,
    commodities,
    priceIndices,
    currencies,
    units,
    locations,
    counterparties,
    counterpartyCreditProfiles,
    counterpartyExternalCreditSnapshots,
    counterpartyCreditReport,
    portfolios,
    activeBooks,
    activeCommodities,
    activeCurrencies,
    activeUnits,
    activeLocations,
    locationStandards,
    counterpartyStandards,
    commodityClassOrder,
  })

  async function refreshTradeMutationData() {
    await loadData({
      groups: buildMutationRefreshGroups({
        currentView,
        groupLoaded,
        mutation: 'trade-event',
      }),
      force: true,
    })
  }

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreateError('')

    const counterpartyCreditRestriction = findCounterpartyCreditRestriction(counterpartyInput)
    if (counterpartyCreditRestriction) {
      setCreateError(counterpartyCreditRestriction)
      return
    }
    if (createCounterpartyCreditPolicyPreview?.tone === 'error') {
      setCreateError(createCounterpartyCreditPolicyPreview.message)
      return
    }

    const submission = buildCreateTradeSubmission({
      tradeId: tradeIdInput,
      externalTradeId: externalTradeIdInput,
      sourceSystem: sourceSystemInput,
      executionTimestamp: executionTimestampInput,
      tradeDate: tradeDateInput,
      effectiveStartDate: effectiveStartDateInput,
      effectiveEndDate: effectiveEndDateInput,
      qualitySpec: qualitySpecInput,
      unitOfMeasure: unitInput,
      tradeCurrencyCode: tradeCurrencyInput,
      locationCode: locationInput,
      deliveryStart: deliveryStartInput,
      deliveryEnd: deliveryEndInput,
      priceUnitCode: priceUnitInput,
      instrumentType: tradeInstrumentTypeInput,
      optionType: optionTypeInput,
      optionStyle: optionStyleInput,
      optionExpirationDate: optionExpirationDateInput,
      optionStrikePriceInput,
      tradeNature: tradeNatureInput,
      tradeStructure: tradeStructureInput,
      tradeSide: tradeSideInput,
      book: bookInput,
      portfolio: portfolioInput,
      counterparty: counterpartyInput,
      commodityClass: commodityClassInput,
      commodity: commodityInput,
      pricingType: pricingTypeInput,
      pricingStatus: pricingStatusInput,
      priceIndexCode: priceIndexInput,
      priceInput,
      volumeInput,
      settlementStatus: settlementStatusInput,
      traderUser: traderUserInput,
      legs: createLegs,
    })

    if (submission.validationError) {
      setCreateError(submission.validationError)
      return
    }

    if (!tradeIdInput.trim()) {
      setTradeIdInput(submission.tradeId)
    }

    setSubmitting(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: submission.tradeId,
        event_type: 'TradeCreated',
        payload: submission.payload,
      })

      await refreshTradeMutationData()
      navigateToTrade(submission.tradeId)
      resetCreateForm()
      setCreateError('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create trade failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDuplicateTrade() {
    if (!selectedTrade) {
      return
    }

    duplicateFromTrade(selectedTrade, selectedTradeEvents)
    setError('')
    setCreateError('')
    setAmendError('')
    navigateToView('trades')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAmendTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAmendError('')

    if (!selectedTradeId || !selectedTrade) {
      setAmendError('Select a trade first.')
      return
    }

    const counterpartyCreditRestriction = findCounterpartyCreditRestriction(amendCounterpartyInput)
    if (counterpartyCreditRestriction) {
      setAmendError(counterpartyCreditRestriction)
      return
    }
    if (amendCounterpartyCreditPolicyPreview?.tone === 'error') {
      setAmendError(amendCounterpartyCreditPolicyPreview.message)
      return
    }

    const submission = buildAmendTradeSubmission(selectedTrade, selectedTradeEvents, {
      externalTradeId: amendExternalTradeIdInput,
      sourceSystem: amendSourceSystemInput,
      executionTimestamp: amendExecutionTimestampInput,
      tradeDate: amendTradeDateInput,
      effectiveStartDate: amendEffectiveStartDateInput,
      effectiveEndDate: amendEffectiveEndDateInput,
      qualitySpec: amendQualitySpecInput,
      unitOfMeasure: amendUnitInput,
      tradeCurrencyCode: amendTradeCurrencyInput,
      locationCode: amendLocationInput,
      deliveryStart: amendDeliveryStartInput,
      deliveryEnd: amendDeliveryEndInput,
      priceUnitCode: amendPriceUnitInput,
      instrumentType: amendTradeInstrumentTypeInput,
      optionType: amendOptionTypeInput,
      optionStyle: amendOptionStyleInput,
      optionExpirationDate: amendOptionExpirationDateInput,
      optionStrikePriceInput: amendOptionStrikePriceInput,
      tradeNature: amendTradeNatureInput,
      tradeStructure: amendTradeStructureInput,
      tradeSide: amendTradeSideInput,
      book: amendBookInput,
      portfolio: amendPortfolioInput,
      counterparty: amendCounterpartyInput,
      commodityClass: amendCommodityClassInput,
      commodity: amendCommodityInput,
      pricingType: amendPricingTypeInput,
      pricingStatus: amendPricingStatusInput,
      confirmationStatus: amendConfirmationStatusInput,
      nominationStatus: amendNominationStatusInput,
      allocationStatus: amendAllocationStatusInput,
      priceIndexCode: amendPriceIndexInput,
      priceInput: amendPriceInput,
      volumeInput: amendVolumeInput,
      invoiceStatus: amendInvoiceStatusInput,
      paymentStatus: amendPaymentStatusInput,
      settlementStatus: amendSettlementStatusInput,
      traderUser: amendTraderUserInput,
      legs: amendLegs,
    })

    if (submission.validationError) {
      setAmendError(submission.validationError)
      return
    }

    setAmending(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeAmended',
        payload: submission.payload,
      })

      await refreshTradeMutationData()
      setInspectorTab('overview')
      setAmendError('')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Amend trade failed.')
    } finally {
      setAmending(false)
    }
  }

  async function handleCancelTrade(reason: string) {
    setError('')
    setAmendError('')

    if (!selectedTradeId || !selectedTrade) {
      setAmendError('Select a trade first.')
      return
    }
    if (!tradeStatusIsActive(selectedTrade.status)) {
      setAmendError(`Trade ${selectedTrade.trade_id} is already closed as ${selectedTrade.status}.`)
      return
    }

    if (!reason.trim()) {
      setAmendError('Cancellation reason is required.')
      return
    }

    setCancelling(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeCancelled',
        payload: {
          status: tradeStatusValues.cancelled,
          cancellation_reason: reason.trim(),
        },
      })

      await refreshTradeMutationData()
      setInspectorTab('overview')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Cancel trade failed.')
    } finally {
      setCancelling(false)
    }
  }

  async function handleOptionLifecycleEvent(eventType: OptionLifecycleEventType) {
    setError('')
    setAmendError('')

    if (!selectedTradeId || !selectedTrade) {
      setAmendError('Select an option trade first.')
      return
    }
    if (selectedTrade.instrument_type !== 'OPTION') {
      setAmendError(`Trade ${selectedTrade.trade_id} is not an option trade.`)
      return
    }
    if (!tradeStatusIsActive(selectedTrade.status)) {
      setAmendError(`Trade ${selectedTrade.trade_id} is already closed as ${selectedTrade.status}.`)
      return
    }

    const nextStatusByEvent: Record<OptionLifecycleEventType, string> = {
      OptionExercised: tradeStatusValues.exercised,
      OptionExpired: tradeStatusValues.expired,
      OptionAssigned: tradeStatusValues.assigned,
    }

    setOptionLifecycleSubmittingEvent(eventType)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: eventType,
        payload: {
          status: nextStatusByEvent[eventType],
        },
      })

      await refreshTradeMutationData()
      setInspectorTab('overview')
      setAmendError('')
    } catch (err) {
      const defaultMessageByEvent: Record<OptionLifecycleEventType, string> = {
        OptionExercised: 'Exercise option failed.',
        OptionExpired: 'Expire option failed.',
        OptionAssigned: 'Assign option failed.',
      }
      setAmendError(err instanceof Error ? err.message : defaultMessageByEvent[eventType])
    } finally {
      setOptionLifecycleSubmittingEvent(null)
    }
  }

  const tradeCaptureFormProps = {
    onSubmit: handleCreateTrade,
    tradeIdInput,
    setTradeIdInput,
    tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput,
    optionTypeInput,
    setOptionTypeInput,
    optionStyleInput,
    setOptionStyleInput,
    optionExpirationDateInput,
    setOptionExpirationDateInput,
    optionStrikePriceInput,
    setOptionStrikePriceInput,
    tradeNatureInput,
    setTradeNatureInput,
    tradeStructureInput,
    setTradeStructureInput,
    tradeSideInput,
    setTradeSideInput,
    bookInput,
    setBookInput,
    activeBooks,
    commodityClassInput,
    setCommodityClassInput,
    commodityClassOptions,
    commodityInput,
    setCommodityInput,
    createCommodityOptions,
    pricingTypeInput,
    setPricingTypeInput,
    pricingStatusInput,
    setPricingStatusInput,
    priceIndexInput,
    setPriceIndexInput,
    createPriceIndexOptions,
    priceInput,
    setPriceInput,
    volumeInput,
    setVolumeInput,
    qualitySpecInput,
    setQualitySpecInput,
    unitInput,
    setUnitInput,
    createUnitOptions,
    externalTradeIdInput,
    setExternalTradeIdInput,
    sourceSystemInput,
    executionTimestampInput,
    setExecutionTimestampInput,
    tradeDateInput,
    setTradeDateInput,
    effectiveStartDateInput,
    setEffectiveStartDateInput,
    effectiveEndDateInput,
    setEffectiveEndDateInput,
    portfolioInput,
    setPortfolioInput,
    createPortfolioOptions,
    counterpartyInput,
    setCounterpartyInput,
    createCounterpartyOptions,
    tradeCurrencyInput,
    setTradeCurrencyInput,
    createCurrencyOptions,
    locationInput,
    setLocationInput,
    createLocationOptions,
    deliveryStartInput,
    setDeliveryStartInput,
    deliveryEndInput,
    setDeliveryEndInput,
    priceUnitInput,
    setPriceUnitInput,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    duplicateSourceTradeId,
    createLegs,
    activeCommodities,
    addDraftLeg: addCreateDraftLeg,
    removeDraftLeg: removeCreateDraftLeg,
    updateDraftLeg: updateCreateDraftLeg,
    submitting,
    referenceDataLoading,
    hasReferenceOptions,
    createError,
    counterpartyCreditPolicyPreview: createCounterpartyCreditPolicyPreview,
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

  const heroTitle = {
    dashboard: 'Desk overview and market pulse',
    guide: 'Playbooks inside the console',
    trades: 'Trade blotter and ticket entry',
    events: 'Lifecycle tape and chronology',
    risk: 'Exposure concentration and pricing quality',
    positions: 'Risk buckets and net exposure',
    shipments: 'Cross-mode delivery obligations and execution readiness',
    scheduling: 'Scheduler board and delivery window readiness',
    operations: 'Operational control and workflow coverage',
    settlement: 'Invoice, payment, and settlement control',
    reports: 'Desk reporting and analyst outputs',
    reference: 'Reference master and mappings',
    admin: 'Operational controls and governance',
    settings: 'Runtime profile and access',
    assistant: 'Analyst copilot for the desk',
  }[currentView]

  const heroBody = {
    dashboard: 'Track the desk like a live terminal: health, market marks, positions, and operational attention stay on one screen.',
    guide: 'Keep the operating model close to the product so onboarding, runbooks, and design notes stay in flow.',
    trades: 'Enter tickets, inspect the active trade, and run lifecycle actions without losing the blotter context.',
    events: 'Read the system as a tape instead of a log table, then narrow to the trade that needs attention.',
    risk: 'Focus the desk on concentration, unpriced exposure, and the books carrying the most open risk.',
    positions: 'Scan class-level risk first, then drop straight into the exact commodity rows carrying exposure.',
    shipments:
      'Manage logistics moves, pipeline flows, and power schedules from one delivery surface that shows mode-specific blockers without forcing them into the same workflow.',
    scheduling:
      'Give commodity schedulers a dedicated screen for open windows, nomination readiness, and blocker clearing instead of burying that work in generalized delivery queues.',
    operations:
      'Run the operational control loop from workflow queues, delivery blockers, and live platform health on one surface.',
    settlement:
      'Keep invoice, payment, and settlement aging visible so post-trade cash workflow is no longer buried in raw trade rows.',
    reports:
      'Read the desk through report outputs instead of endpoints: exposure, activity, P&L, and counterparty credit in one place.',
    reference: 'Manage books, commodities, and price references from a denser master-data surface built for operators.',
    admin: 'Watch the platform as a governed system: controls, provenance, approvals, and model visibility in one place.',
    settings: 'Adjust runtime behavior, stored credentials, and client overrides without leaving the trading console.',
    assistant: 'Ask for grounded analysis with the desk state already loaded so AI stays anchored to what operations can see.',
  }[currentView]

  const {
    blockingWorkspaceError,
    workspaceLoading,
    workspaceWarning,
    systemStateLabel,
    systemStateTone,
  } = deriveWorkspaceStatus({
    appLoading,
    currentView,
    error,
    groupErrors,
    groupLoaded,
    groupLoading,
  })

  function handleRetryCurrentWorkspace() {
    void loadData({
      groups: VIEW_DATA_GROUPS[currentView],
      force: true,
    })
  }

  function renderWorkspaceContent() {
    switch (currentView) {
      case 'guide':
        return (
          <DocumentationWorkspace
            activeDocumentKey={activeDocumentationDocumentKey}
            getViewHref={hrefForView}
            onDocumentKeyChange={handleDocumentationDocumentChange}
            onOpenView={navigateToView}
            roadmapRefreshVersion={roadmapRefreshVersion}
          />
        )
      case 'dashboard':
        return (
          <DashboardWorkspace
            authSession={authSession}
            appLoading={appLoading}
            activeTrades={activeTrades}
            priceIndices={priceIndices}
            positionsWithClass={positionsWithClass}
            events={events}
            formatCommodityClass={formatCommodityClass}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatDate={formatDate}
          />
        )
      case 'trades':
        return (
          <TradingWorkspace
            authSession={authSession}
            tradeCaptureFormProps={tradeCaptureFormProps}
            trades={trades}
            tradeWorkflowItems={tradeWorkflowItems}
            selectedTrade={selectedTrade}
            selectedTradeId={selectedTradeId}
            selectedTradeEvents={selectedTradeEvents}
            inspectorTab={inspectorTab}
            setSelectedTradeId={setSelectedTradeId}
            setInspectorTab={setInspectorTab}
            handleDuplicateTrade={handleDuplicateTrade}
            handleAmendTrade={handleAmendTrade}
            handleCancelTrade={handleCancelTrade}
            handleOptionLifecycleEvent={handleOptionLifecycleEvent}
            optionLifecycleSubmittingEvent={optionLifecycleSubmittingEvent}
            amendmentPreviewFields={amendmentPreview.changedFields}
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
            amendTradeNatureInput={amendTradeNatureInput}
            setAmendTradeNatureInput={setAmendTradeNatureInput}
            amendTradeStructureInput={amendTradeStructureInput}
            setAmendTradeStructureInput={setAmendTradeStructureInput}
            amendTradeSideInput={amendTradeSideInput}
            setAmendTradeSideInput={setAmendTradeSideInput}
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
            addDraftLeg={addAmendDraftLeg}
            removeDraftLeg={removeAmendDraftLeg}
            updateDraftLeg={updateAmendDraftLeg}
            amending={amending}
            cancelling={cancelling}
            amendError={amendError}
            counterpartyCreditPolicyPreview={amendCounterpartyCreditPolicyPreview}
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
        )
      case 'events':
        return (
          <EventsWorkspace
            authSession={authSession}
            eventFilter={eventFilter}
            selectedTradeId={selectedTradeId}
            setEventFilter={setEventFilter}
            filteredEvents={filteredEvents}
            formatDate={formatDate}
            onOpenTrade={navigateToTrade}
          />
        )
      case 'risk':
        return (
          <RiskWorkspace
            authSession={authSession}
            activeTrades={activeTrades}
            positionsByClass={positionsByClass}
            positionsWithClass={positionsWithClass}
            optionExposures={optionExposures}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatMoney={formatMoney}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            onOpenTrade={navigateToTrade}
          />
        )
      case 'positions':
        return (
          <PositionsWorkspace
            activeTrades={activeTrades}
            authSession={authSession}
            onOpenRisk={() => navigateToView('risk')}
            onOpenTrade={navigateToTrade}
            positionsByClass={positionsByClass}
            positionsWithClass={positionsWithClass}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
          />
        )
      case 'shipments':
        return (
          <DeliveryWorkspace
            authSession={authSession}
            deliveries={deliveries}
            formatCommodityClass={formatCommodityClass}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            formatNumber={formatNumber}
            onOpenTrade={navigateToTrade}
          />
        )
      case 'scheduling':
        return (
          <SchedulingWorkspace
            authSession={authSession}
            deliveries={deliveries}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            onOpenTrade={navigateToTrade}
          />
        )
      case 'operations':
        return (
          <OperationsWorkspace
            authSession={authSession}
            deliveries={deliveries}
            workItems={tradeWorkflowItems}
            externalDataSyncStatus={externalDataSyncStatus}
            weatherSyncStatus={weatherSyncStatus}
            tradingSources={tradingSources}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            workflowMutationError={workflowMutationError}
            workflowMutationPendingId={workflowMutationPendingId}
            onOpenTrade={navigateToTrade}
            onSaveWorkflowItem={handleSaveWorkflowItem}
          />
        )
      case 'settlement':
        return (
          <SettlementWorkspace
            authSession={authSession}
            activeTrades={activeTrades}
            invoices={tradeInvoices}
            payments={tradePayments}
            workItems={tradeWorkflowItems}
            formatCommodityClass={formatCommodityClass}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            invoiceMutationError={invoiceMutationError}
            invoiceMutationPendingKey={invoiceMutationPendingKey}
            paymentMutationError={paymentMutationError}
            paymentMutationPendingKey={paymentMutationPendingKey}
            onOpenTrade={navigateToTrade}
            onIssueInvoice={handleIssueTradeInvoice}
            onSaveInvoice={handleUpdateTradeInvoice}
            onCreatePayment={handleCreateTradePayment}
            onSavePayment={handleUpdateTradePayment}
            onSaveWorkflowItem={handleSaveWorkflowItem}
          />
        )
      case 'reports':
        return (
          <ReportsWorkspace
            authSession={authSession}
            counterpartyCreditReport={counterpartyCreditReport}
            formatNumber={formatNumber}
            formatMoney={formatMoney}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            onOpenSettlement={() => navigateToView('settlement')}
            onOpenTrade={navigateToTrade}
          />
        )
      case 'reference':
        return (
          <ReferenceDataWorkspace
            controller={referenceState}
            formatCommodityClass={formatCommodityClass}
            formatDate={formatDate}
          />
        )
      case 'admin':
        return (
          <AdminWorkspace
            authSession={authSession}
            onOpenSettings={() => navigateToView('settings')}
            onRoadmapPublished={handleRoadmapPublished}
            selectedTrade={selectedTrade}
            selectedTradeEvents={selectedTradeEvents}
            events={events}
            trades={trades}
            positions={positions}
            activeBooks={activeBooks}
            activeCommodities={activeCommodities}
            priceIndices={priceIndices}
            externalDataRuns={externalDataRuns}
            externalDataSyncStatus={externalDataSyncStatus}
            tradingSources={tradingSources}
            weatherSyncStatus={weatherSyncStatus}
            externalDataSyncing={externalDataSyncing}
            externalDataSyncingProvider={externalDataSyncingProvider}
            externalDataError={externalDataError}
            externalDataSuccess={externalDataSuccess}
            counterpartyCreditImportDraft={counterpartyCreditImportDraft}
            counterpartyCreditPreview={counterpartyCreditPreview}
            counterpartyCreditPreviewing={counterpartyCreditPreviewing}
            counterpartyCreditPreviewError={counterpartyCreditPreviewError}
            counterpartyCreditPreviewSuccess={counterpartyCreditPreviewSuccess}
            counterpartyCreditImporting={counterpartyCreditImporting}
            counterpartyCreditImportError={counterpartyCreditImportError}
            counterpartyCreditImportSuccess={counterpartyCreditImportSuccess}
            tradingSourcesSyncing={tradingSourcesSyncing}
            tradingSourcesError={tradingSourcesError}
            tradingSourcesSuccess={tradingSourcesSuccess}
            weatherSyncing={weatherSyncing}
            weatherSyncError={weatherSyncError}
            weatherSyncSuccess={weatherSyncSuccess}
            onRunExternalDataSync={handleRunExternalDataSync}
            onCounterpartyCreditImportDraftChange={handleCounterpartyCreditImportDraftChange}
            onPreviewCounterpartyCreditImport={handlePreviewCounterpartyCreditImport}
            onImportCounterpartyCreditSnapshots={handleImportCounterpartyCreditSnapshots}
            onRunNwsWeatherSync={handleRunNwsWeatherSync}
            onSeedTradingSources={handleSeedTradingSources}
            onRefreshData={loadData}
            formatDate={formatDate}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatCommodityClass={formatCommodityClass}
          />
        )
      case 'settings':
        return (
          <SettingsWorkspace
            health={health}
            authSession={authSession}
            appearanceSettings={appearanceSettings}
            resolvedColorMode={resolvedColorMode}
            onAppearanceSettingsChange={handleAppearanceSettingsChange}
            onAppearanceSettingsReset={handleAppearanceSettingsReset}
            onSessionChange={handleSessionChange}
          />
        )
      case 'assistant':
        return (
          <AssistantWorkspace
            authSession={authSession}
            health={health}
            trades={trades}
            events={events}
            positions={positions}
            selectedTrade={selectedTrade}
            selectedTradeEvents={selectedTradeEvents}
            onOpenSettings={() => navigateToView('settings')}
            onRefreshData={loadData}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      <div className="app-aura app-aura-left" />
      <div className="app-aura app-aura-right" />

      <div className="mobile-topbar">
        <div>
          <span className="brand-mark">E/CTRM</span>
        </div>
        <div className="mobile-topbar-actions">
          <button
            type="button"
            className="appearance-toggle appearance-toggle-mobile"
            aria-label={themeToggleActionLabel}
            aria-pressed={resolvedColorMode === 'dark'}
            title={themeToggleActionLabel}
            onClick={handleToggleColorMode}
          >
            <span className="appearance-toggle-copy">
              <small>Theme</small>
              <strong>{themeToggleLabel}</strong>
            </span>
            <span className={`appearance-toggle-track appearance-toggle-track-${resolvedColorMode}`} aria-hidden="true">
              <span className="appearance-toggle-thumb" />
            </span>
          </button>
          <button
            type="button"
            className="button button-ghost mobile-nav-button"
            aria-controls={MOBILE_NAVIGATION_PANEL_ID}
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavToggleActionLabel}
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            {mobileNavOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <aside
        id={MOBILE_NAVIGATION_PANEL_ID}
        className={`side-rail ${mobileNavOpen ? 'is-open' : ''}`}
        hidden={mobileNavHidden}
        aria-hidden={mobileNavHidden ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark">E/CTRM</span>
          <h1>Operator Console</h1>
          <p>A trading operations cockpit for ticket entry, lifecycle management, and live projection views.</p>
        </div>

        <button
          type="button"
          className="appearance-toggle appearance-toggle-desktop"
          aria-label={themeToggleActionLabel}
          aria-pressed={resolvedColorMode === 'dark'}
          title={themeToggleActionLabel}
          onClick={handleToggleColorMode}
        >
          <span className="appearance-toggle-copy">
            <small>Theme</small>
            <strong>{themeToggleLabel}</strong>
          </span>
          <span className={`appearance-toggle-track appearance-toggle-track-${resolvedColorMode}`} aria-hidden="true">
            <span className="appearance-toggle-thumb" />
          </span>
        </button>

        <nav className="nav-stack" aria-label="Primary">
          {VIEWS.map((view) => (
            <a
              key={view.key}
              href={hrefForView(view.key)}
              className={`nav-item ${currentView === view.key ? 'is-active' : ''}`}
              aria-current={currentView === view.key ? 'page' : undefined}
              onClick={(event) => handleViewLinkClick(event, view.key)}
            >
              <span>{view.kicker}</span>
              <strong>{view.label}</strong>
            </a>
          ))}
        </nav>

        <div className="side-card side-card-contrast side-card-terminal">
          <div className="side-card-head">
            <div>
              <span className="eyebrow">Desk State</span>
              <strong className="side-card-title">Projection + routing</strong>
            </div>
            <Tooltip
              content={systemStateTone === 'active' ? tradeTooltipCopy.systemReady : tradeTooltipCopy.systemAttention}
              focusable
            >
              <span className={`status-pill status-pill-${systemStateTone} system-pill tooltip-trigger-hint`}>
                {systemStateLabel}
              </span>
            </Tooltip>
          </div>

          <div className="side-stat-grid">
            <article className="side-stat">
              <span>Open Trades</span>
              <strong>{activeTrades.length}</strong>
            </article>
            <article className="side-stat">
              <span>Pricing</span>
              <strong>{pricingCoverage === null ? '0%' : `${pricingCoverage}%`}</strong>
            </article>
            <article className="side-stat">
              <span>Pending Settle</span>
              <strong>{pendingSettlementTrades}</strong>
            </article>
            <article className="side-stat">
              <span>Books</span>
              <strong>{trackedBooks}</strong>
            </article>
          </div>

          <div className="side-card-section">
            <span className="side-section-title">Registry coverage</span>
            <div className="health-line">
              <span>API</span>
              <strong>{health}</strong>
            </div>
            <div className="health-line">
              <span>Books</span>
              <strong>{books.length}</strong>
            </div>
            <div className="health-line">
              <span>Commodities</span>
              <strong>{commodities.length}</strong>
            </div>
            <div className="health-line">
              <span>Price indices</span>
              <strong>{priceIndices.length}</strong>
            </div>
            <div className="health-line">
              <span>Currencies</span>
              <strong>{currencies.length}</strong>
            </div>
            <div className="health-line">
              <span>Units</span>
              <strong>{units.length}</strong>
            </div>
            <div className="health-line">
              <span>Locations</span>
              <strong>{locations.length}</strong>
            </div>
            <div className="health-line">
              <span>Counterparties</span>
              <strong>{counterparties.length}</strong>
            </div>
            <div className="health-line">
              <span>Portfolios</span>
              <strong>{portfolios.length}</strong>
            </div>
          </div>
        </div>

        {currentView !== 'guide' && (
          <div className="side-card side-card-focus">
            <div className="side-card-head">
              <span className="eyebrow">Selected Trade</span>
              {selectedTrade ? (
                <Tooltip
	                  content={
	                    tradeStatusIsActive(selectedTrade.status)
	                      ? tradeTooltipCopy.activeTrade
	                      : tradeTooltipCopy.closedTrade
	                  }
                  focusable
                >
                  <span className={`status-pill status-pill-${statusTone(selectedTrade.status)} tooltip-trigger-hint`}>
                    {selectedTrade.status}
                  </span>
                </Tooltip>
              ) : null}
            </div>
            {selectedTrade ? (
              <>
                <strong className="side-card-title">{selectedTrade.trade_id}</strong>
                <p>
                  {selectedTrade.trade_nature} • {selectedTrade.trade_structure} • {selectedTrade.book}
                </p>
                <div className="selection-pill-row">
                  <span className="entity-chip entity-chip-soft">Pricing {selectedTrade.pricing_status}</span>
                  <span className="entity-chip entity-chip-soft">Settlement {selectedTrade.settlement_status}</span>
                  {selectedTrade.credit_hold_active ? (
                    <span className="status-pill status-pill-blocked">
                      Credit {selectedTrade.credit_approval_status?.replaceAll('_', ' ') ?? 'HOLD'}
                    </span>
                  ) : null}
                </div>
                {selectedTrade.credit_hold_active ? (
                  <p className="field-error">{selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}</p>
                ) : null}
                <div className="side-selection-grid">
                  <article className="side-stat">
                    <span>Price</span>
                    <strong>{formatMoney(selectedTrade.price)}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Volume</span>
                    <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Counterparty</span>
                    <strong>{selectedTrade.counterparty ?? 'TBD'}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Updated</span>
                    <strong>{formatDate(selectedTrade.updated_at)}</strong>
                  </article>
                </div>
              </>
            ) : (
              <>
                <strong className="side-card-title">No trade selected</strong>
                <p>Pick a trade from the workspace to unlock its inspector and event trail.</p>
              </>
            )}
          </div>
        )}
      </aside>

      <main className="main-stage">
        <header className="hero">
          <div className="hero-copy">
            <div className="hero-heading-row">
              <span className="eyebrow">Workspace</span>
              <span className={`hero-session-pill hero-session-pill-${systemStateTone}`}>{systemStateLabel}</span>
            </div>
            <h2>{heroTitle}</h2>
            <p>{heroBody}</p>

            {currentView !== 'guide' && (
              <div className="hero-tape">
                <article className="hero-tape-item">
                  <span>Pricing Coverage</span>
                  <strong>{pricingCoverage === null ? '0%' : `${pricingCoverage}%`}</strong>
                  <small>
                    {pricedActiveTrades} of {activeTrades.length} active tickets priced
                  </small>
                </article>
                <article className="hero-tape-item">
                  <span>Pending Pricing</span>
                  <strong>{pendingPricingTrades}</strong>
                  <small>Trades still waiting on explicit pricing state</small>
                </article>
                <article className="hero-tape-item">
                  <span>Books in Play</span>
                  <strong>{trackedBooks}</strong>
                  <small>Distinct books carrying active exposure</small>
                </article>
                <article className="hero-tape-item">
                  <span>Largest Line</span>
                  <strong>{largestPositionRow ? formatNumber(largestPositionRow.net_volume, 0) : 'Flat'}</strong>
                  <small>{largestPositionRow ? largestPositionRow.commodity : 'Waiting for open positions'}</small>
                </article>
              </div>
            )}
          </div>

          <div className="hero-badge">
            <span>Focus</span>
            <strong>{selectedTrade ? selectedTrade.trade_id : VIEWS.find((view) => view.key === currentView)?.label}</strong>
            <small>
              {selectedTrade
                ? `${selectedTrade.commodity} • ${selectedTrade.book}`
                : `${events.length} loaded events across the current session`}
            </small>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {workspaceWarning ? <div className="error-banner">{groupErrors[workspaceWarning]}</div> : null}

        {currentView !== 'guide' && (
          <section className="metric-grid">
            <article className="metric-card">
              <span>Open Trades</span>
              <strong>{activeTrades.length}</strong>
              <p>Trades currently carrying exposure.</p>
            </article>
            <article className="metric-card">
              <span>Gross Volume</span>
              <strong>{formatNumber(totalActiveVolume, 0)}</strong>
              <p>Total active volume across uncancelled trades.</p>
            </article>
            <article className="metric-card">
              <span>Pricing Coverage</span>
              <strong>{pricingCoverage === null ? '0%' : `${pricingCoverage}%`}</strong>
              <p>
                {pricedActiveTrades} of {activeTrades.length} active trades currently carry a stored price differential.
              </p>
            </article>
            <article className="metric-card">
              <span>Open Positions</span>
              <strong>{positionsWithClass.length}</strong>
              <p>Commodity rows now contributing to the live position projection.</p>
            </article>
            <article className="metric-card">
              <span>Events Loaded</span>
              <strong>{events.length}</strong>
              <p>Recent event records available for review.</p>
            </article>
          </section>
        )}

        {blockingWorkspaceError && !workspaceLoading ? (
          <WorkspaceErrorState
            title={`${workspaceLabel(currentView)} needs attention`}
            message={groupErrors[blockingWorkspaceError]}
            onRetry={handleRetryCurrentWorkspace}
          />
        ) : workspaceLoading ? (
          <WorkspaceLoadState
            title={`Loading ${workspaceLabel(currentView)}`}
            detail="Pulling the workspace-specific datasets needed for this screen."
          />
        ) : (
          <Suspense
            fallback={
              <WorkspaceLoadState
                title={`Preparing ${workspaceLabel(currentView)}`}
                detail="Loading the workspace bundle."
              />
            }
          >
            {renderWorkspaceContent()}
          </Suspense>
        )}
      </main>
    </div>
  )
}
