import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AdminWorkspace } from './workspaces/admin/AdminWorkspace'
import { DashboardWorkspace } from './workspaces/dashboard/DashboardWorkspace'
import {
  DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
  DocumentationWorkspace,
  type DocumentationDocumentKey,
} from './workspaces/docs/DocumentationWorkspace'
import { EventsWorkspace } from './workspaces/events/EventsWorkspace'
import { PositionsWorkspace } from './workspaces/positions/PositionsWorkspace'
import { ShipmentWorkspace } from './workspaces/shipments/ShipmentWorkspace'
import { ReferenceDataWorkspace } from './workspaces/reference-data/ReferenceDataWorkspace'
import { AssistantWorkspace } from './workspaces/assistant/AssistantWorkspace'
import { SettingsWorkspace } from './workspaces/settings/SettingsWorkspace'
import { TradingWorkspace } from './workspaces/trading/TradingWorkspace'
import { loadWorkspaceBootstrap } from './entities/app/api'
import { loadCurrentSession, sendSessionHeartbeat } from './entities/auth/api'
import { submitTradeEvent } from './entities/trade/api'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { ApiError, fetchJson, postJson } from './shared/api'
import { appConfig, bootstrapQueryLimits } from './shared/config'
import {
  buildMutationHeaders,
  clearStoredAuthSession,
  getMutationContext,
  getStoredAuthSession,
  saveStoredAuthSession,
  type StoredAuthSession,
} from './shared/mutation'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import {
  buildAmendTradeSubmission,
  buildCreateTradeSubmission,
  previewTradeAmendment,
} from './features/trades/tradeEventPayloads'
import { tradeTooltipCopy } from './features/trades/tooltipCopy'
import {
  DEFAULT_COUNTERPARTY_STANDARDS,
  DEFAULT_LOCATION_STANDARDS,
  type CounterpartyStandards,
  type CounterpartyRecord,
  type CurrencyRecord,
  type EventRow,
  type ExternalDataRunRecord,
  type ExternalDataSyncStatusRecord,
  type InspectorTab,
  type LocationRecord,
  type LocationStandards,
  type PositionRow,
  type ShipmentRecord,
  type PortfolioRecord,
  type PriceIndexRecord,
  type ReferenceRecord,
  type Trade,
  type TradingSourceRecord,
  type UnitRecord,
  type ViewKey,
  type WeatherSyncStatusRecord,
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
  commodityClassOrder,
  pricingTypeOptions,
  pricingStatusOptions,
  settlementStatusOptions,
  tradeAggregateType,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStatusValues,
  tradeStructureOptions,
} from './shared/trading'
import { Tooltip } from './shared/ui/Tooltip'

const VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> = [
  { key: 'dashboard', label: 'Dashboard', kicker: 'Desk' },
  { key: 'guide', label: 'Guide', kicker: 'Playbook' },
  { key: 'trades', label: 'Trades', kicker: 'Blotter' },
  { key: 'events', label: 'Events', kicker: 'Tape' },
  { key: 'positions', label: 'Positions', kicker: 'Risk' },
  { key: 'shipments', label: 'Shipments', kicker: 'Logistics' },
  { key: 'reference', label: 'Reference Data', kicker: 'Master' },
  { key: 'admin', label: 'Admin', kicker: 'Ops' },
  { key: 'settings', label: 'Settings', kicker: 'Config' },
  { key: 'assistant', label: 'Assistant', kicker: 'AI' },
]

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function sessionHeaders(session: StoredAuthSession): Headers {
  return new Headers({ Authorization: `Bearer ${session.accessToken}` })
}

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

export default function App() {
  const initialRoute = useMemo(() => readAppRouteState(), [])
  const [currentView, setCurrentView] = useState<ViewKey>(initialRoute.view)
  const [activeDocumentationDocumentKey, setActiveDocumentationDocumentKey] =
    useState<DocumentationDocumentKey>(initialRoute.docsDocumentKey)
  const [roadmapRefreshVersion, setRoadmapRefreshVersion] = useState(0)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [books, setBooks] = useState<ReferenceRecord[]>([])
  const [commodities, setCommodities] = useState<ReferenceRecord[]>([])
  const [priceIndices, setPriceIndices] = useState<PriceIndexRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([])
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [locationStandards, setLocationStandards] = useState<LocationStandards>(DEFAULT_LOCATION_STANDARDS)
  const [counterpartyStandards, setCounterpartyStandards] = useState<CounterpartyStandards>(
    DEFAULT_COUNTERPARTY_STANDARDS,
  )
  const [counterparties, setCounterparties] = useState<CounterpartyRecord[]>([])
  const [portfolios, setPortfolios] = useState<PortfolioRecord[]>([])
  const [externalDataRuns, setExternalDataRuns] = useState<ExternalDataRunRecord[]>([])
  const [externalDataSyncStatus, setExternalDataSyncStatus] = useState<ExternalDataSyncStatusRecord | null>(null)
  const [tradingSources, setTradingSources] = useState<TradingSourceRecord[]>([])
  const [weatherSyncStatus, setWeatherSyncStatus] = useState<WeatherSyncStatusRecord | null>(null)
  const [error, setError] = useState<string>('')
  const [createError, setCreateError] = useState<string>('')
  const [amendError, setAmendError] = useState<string>('')
  const [referenceDataError, setReferenceDataError] = useState<string>('')
  const [externalDataError, setExternalDataError] = useState<string>('')
  const [externalDataSuccess, setExternalDataSuccess] = useState<string>('')
  const [tradingSourcesError, setTradingSourcesError] = useState<string>('')
  const [tradingSourcesSuccess, setTradingSourcesSuccess] = useState<string>('')
  const [weatherSyncError, setWeatherSyncError] = useState<string>('')
  const [weatherSyncSuccess, setWeatherSyncSuccess] = useState<string>('')
  const [referenceDataLoading, setReferenceDataLoading] = useState(true)
  const [appLoading, setAppLoading] = useState(true)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(initialRoute.tradeId)
  const [selectedTradeEvents, setSelectedTradeEvents] = useState<EventRow[]>([])
  const [eventFilter, setEventFilter] = useState('ALL')
  const [externalDataSyncing, setExternalDataSyncing] = useState(false)
  const [externalDataSyncingProvider, setExternalDataSyncingProvider] = useState<string | null>(null)
  const [tradingSourcesSyncing, setTradingSourcesSyncing] = useState(false)
  const [weatherSyncing, setWeatherSyncing] = useState(false)
  const [authSession, setAuthSession] = useState<StoredAuthSession | null>(() => getStoredAuthSession())

  const [submitting, setSubmitting] = useState(false)

  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  function handleRoadmapPublished() {
    setRoadmapRefreshVersion((current) => current + 1)
  }

  async function loadData(sessionOverride?: StoredAuthSession | null) {
    const currentSession = sessionOverride ?? authSession
    const {
      health: healthJson,
      trades: tradesJson,
      events: eventsJson,
      positions: positionsJson,
      shipments: shipmentsJson,
      books: booksJson,
      commodities: commoditiesJson,
      priceIndices: priceIndicesJson,
      currencies: currenciesJson,
      units: unitsJson,
      locations: locationsJson,
      locationStandards: locationStandardsJson,
      counterparties: counterpartiesJson,
      counterpartyStandards: counterpartyStandardsJson,
      portfolios: portfoliosJson,
      externalDataRuns: externalDataRunsJson,
      externalDataSyncStatus: externalDataSyncStatusJson,
      tradingSources: tradingSourcesJson,
      weatherSyncStatus: weatherSyncStatusJson,
    } = await loadWorkspaceBootstrap(appConfig.apiBase, {
      adminHeaders:
        currentSession && hasAdministrativeAccess(currentSession)
          ? sessionHeaders(currentSession)
          : null,
    })
    const nextTrades = tradesJson as Trade[]
    const nextEvents = eventsJson as EventRow[]
    const nextPositions = positionsJson as PositionRow[]
    const nextShipments = shipmentsJson as ShipmentRecord[]
    const nextBooks = booksJson as ReferenceRecord[]
    const nextCommodities = commoditiesJson as ReferenceRecord[]
    const nextPriceIndices = priceIndicesJson as PriceIndexRecord[]
    const nextCurrencies = currenciesJson as CurrencyRecord[]
    const nextUnits = unitsJson as UnitRecord[]
    const nextLocations = locationsJson as LocationRecord[]
    const nextLocationStandards = locationStandardsJson as LocationStandards
    const nextCounterparties = counterpartiesJson as CounterpartyRecord[]
    const nextCounterpartyStandards = counterpartyStandardsJson as CounterpartyStandards
    const nextPortfolios = portfoliosJson as PortfolioRecord[]
    const nextExternalDataRuns = externalDataRunsJson as ExternalDataRunRecord[]
    const nextExternalDataSyncStatus = externalDataSyncStatusJson as ExternalDataSyncStatusRecord | null
    const nextTradingSources = tradingSourcesJson as TradingSourceRecord[]
    const nextWeatherSyncStatus = weatherSyncStatusJson as WeatherSyncStatusRecord | null

    setHealth(healthJson.status ?? 'unknown')
    setTrades(nextTrades)
    setEvents(nextEvents)
    setPositions(nextPositions)
    setShipments(nextShipments)
    setBooks(nextBooks)
    setCommodities(nextCommodities)
    setPriceIndices(nextPriceIndices)
    setCurrencies(nextCurrencies)
    setUnits(nextUnits)
    setLocations(nextLocations)
    setLocationStandards(nextLocationStandards)
    setCounterparties(nextCounterparties)
    setCounterpartyStandards(nextCounterpartyStandards)
    setPortfolios(nextPortfolios)
    setExternalDataRuns(nextExternalDataRuns)
    setExternalDataSyncStatus(nextExternalDataSyncStatus)
    setTradingSources(nextTradingSources)
    setWeatherSyncStatus(nextWeatherSyncStatus)
    setReferenceDataLoading(false)
    setAppLoading(false)
    setReferenceDataError('')

    if (nextTrades.length > 0) {
      setSelectedTradeId((current) => {
        const stillExists = nextTrades.some((trade) => trade.trade_id === current)
        return stillExists ? current : nextTrades[0].trade_id
      })
    } else {
      setSelectedTradeId(null)
    }
  }

  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  async function refreshAuthSession(): Promise<StoredAuthSession | null> {
    const storedSession = getStoredAuthSession()
    if (!storedSession) {
      setAuthSession(null)
      return null
    }

    try {
      const current = await loadCurrentSession(appConfig.apiBase)
      const nextSession: StoredAuthSession = {
        sessionId: current.session_id,
        accessToken: storedSession.accessToken,
        expiresAt: current.expires_at,
        user: current.user,
      }
      saveStoredAuthSession(nextSession)
      setAuthSession(nextSession)
      return nextSession
    } catch {
      clearStoredAuthSession()
      setAuthSession(null)
      return null
    }
  }

  async function handleSessionChange(nextSession: StoredAuthSession | null) {
    if (nextSession) {
      saveStoredAuthSession(nextSession)
    } else {
      clearStoredAuthSession()
    }
    setAuthSession(nextSession)
    await loadData(nextSession)
  }

  useEffect(() => {
    async function init() {
      try {
        const session = await refreshAuthSession()
        await loadDataRef.current(session)
      } catch (error) {
        setReferenceDataLoading(false)
        setAppLoading(false)
        if (error instanceof ApiError) {
          setError(error.message)
          return
        }

        setError(`Could not reach API. Make sure backend is running on ${appConfig.apiDisplayHost} and CORS is enabled.`)
      }
    }

    init()
  }, [])

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
    if (!authSession) {
      return
    }

    let cancelled = false

    async function heartbeat() {
      try {
        await sendSessionHeartbeat(appConfig.apiBase)
      } catch {
        if (!cancelled) {
          // Presence refresh should stay quiet; the authenticated workspace already surfaces session failures elsewhere.
        }
      }
    }

    function handleFocus() {
      void heartbeat()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void heartbeat()
      }
    }

    void heartbeat()
    const intervalId = window.setInterval(() => {
      void heartbeat()
    }, 45000)

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authSession])

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

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  useEffect(() => {
    if (currentView !== 'trades' || trades.length === 0) {
      return
    }

    if (selectedTradeId && trades.some((trade) => trade.trade_id === selectedTradeId)) {
      return
    }

    setSelectedTradeId(trades[0].trade_id)
  }, [currentView, selectedTradeId, trades])

  const activeTrades = useMemo(
    () => trades.filter((trade) => trade.status !== tradeStatusValues.cancelled),
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
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
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
    updateDraftLeg: updateAmendDraftLeg,
    addDraftLeg: addAmendDraftLeg,
    removeDraftLeg: removeAmendDraftLeg,
  } = amendForm

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
      priceIndexCode: amendPriceIndexInput,
      priceInput: amendPriceInput,
      volumeInput: amendVolumeInput,
      settlementStatus: amendSettlementStatusInput,
      traderUser: amendTraderUserInput,
      legs: amendLegs,
    })
  }, [
    amendBookInput,
    amendCommodityClassInput,
    amendCommodityInput,
    amendCounterpartyInput,
    amendDeliveryEndInput,
    amendDeliveryStartInput,
    amendEffectiveEndDateInput,
    amendEffectiveStartDateInput,
    amendExecutionTimestampInput,
    amendExternalTradeIdInput,
    amendLocationInput,
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

  async function refreshTradingSources(sessionOverride?: StoredAuthSession | null) {
    const currentSession = sessionOverride ?? authSession
    if (!currentSession || !hasAdministrativeAccess(currentSession)) {
      setTradingSources([])
      return []
    }

    const rows = await fetchJson<TradingSourceRecord[]>(
      `${appConfig.apiBase}/admin/trading-sources?limit=${bootstrapQueryLimits.tradingSources}`,
      {
        headers: sessionHeaders(currentSession),
        cache: 'no-store',
      },
    )
    setTradingSources(rows)
    return rows
  }

  async function handleRunExternalDataSync(
    provider: 'EIA' | 'EIA_FUNDAMENTALS' | 'FRED' | 'CFTC' | 'CAISO' | 'ERCOT' | 'KALSHI',
  ) {
    setExternalDataSyncing(true)
    setExternalDataSyncingProvider(provider)
    setExternalDataError('')
    setExternalDataSuccess('')
    try {
      const { actorId } = getMutationContext()
      const routeByProvider: Record<typeof provider, string> = {
        EIA: 'eia',
        EIA_FUNDAMENTALS: 'eia-fundamentals',
        FRED: 'fred',
        CFTC: 'cftc',
        CAISO: 'caiso',
        ERCOT: 'ercot',
        KALSHI: 'kalshi',
      }
      const response = await fetch(`${appConfig.apiBase}/admin/external-data/${routeByProvider[provider]}/sync`, {
        method: 'POST',
        headers: buildMutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: actorId }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Failed to run ${provider} sync.`)
      }

      const payload = (await response.json()) as ExternalDataRunRecord
      await loadData()
      setExternalDataSuccess(
        `${provider} sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.observation_count} observations.`,
      )
    } catch (err) {
      setExternalDataError(err instanceof Error ? err.message : `Failed to run ${provider} sync.`)
    } finally {
      setExternalDataSyncing(false)
      setExternalDataSyncingProvider(null)
    }
  }

  async function handleSeedTradingSources() {
    setTradingSourcesSyncing(true)
    setTradingSourcesError('')
    setTradingSourcesSuccess('')
    try {
      const { actorId } = getMutationContext()
      const payload = await postJson<{ total_rows: number; created_count: number; updated_count: number }>(
        `${appConfig.apiBase}/admin/trading-sources/seed`,
        { requested_by: actorId, replace_existing: true },
        { headers: buildMutationHeaders() },
      )
      setTradingSourcesSuccess(
        `Trading source register loaded: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.total_rows} total rows.`,
      )

      try {
        await refreshTradingSources()
      } catch (refreshError) {
        setTradingSourcesError(
          refreshError instanceof Error
            ? `Trading sources were seeded, but the follow-up refresh failed: ${refreshError.message}`
            : 'Trading sources were seeded, but the follow-up refresh failed.',
        )
      }
    } catch (err) {
      setTradingSourcesError(err instanceof Error ? err.message : 'Failed to seed trading sources.')
    } finally {
      setTradingSourcesSyncing(false)
    }
  }

  async function handleRunNwsWeatherSync() {
    setWeatherSyncing(true)
    setWeatherSyncError('')
    setWeatherSyncSuccess('')
    try {
      const { actorId } = getMutationContext()
      const response = await fetch(`${appConfig.apiBase}/admin/weather/sync/nws`, {
        method: 'POST',
        headers: buildMutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: actorId }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to run NWS weather sync.')
      }

      const payload = (await response.json()) as ExternalDataRunRecord
      await loadData()
      setWeatherSyncSuccess(
        `NWS sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.series_count} series and ${payload.observation_count} observations.`,
      )
    } catch (err) {
      setWeatherSyncError(err instanceof Error ? err.message : 'Failed to run NWS weather sync.')
    } finally {
      setWeatherSyncing(false)
    }
  }

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreateError('')
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

      await loadData()
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
      priceIndexCode: amendPriceIndexInput,
      priceInput: amendPriceInput,
      volumeInput: amendVolumeInput,
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

      await loadData()
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

    if (!selectedTradeId) {
      setAmendError('Select a trade first.')
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

      await loadData()
      setInspectorTab('overview')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Cancel trade failed.')
    } finally {
      setCancelling(false)
    }
  }

  const tradeCaptureFormProps = {
    onSubmit: handleCreateTrade,
    tradeIdInput,
    setTradeIdInput,
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
    positions: 'Risk buckets and net exposure',
    shipments: 'Logistics queue and shipment readiness',
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
    positions: 'Scan class-level risk first, then drop straight into the exact commodity rows carrying exposure.',
    shipments:
      'Work the physical queue from an operations surface that highlights blockers, readiness, and direct drill-through back to the source trade.',
    reference: 'Manage books, commodities, and price references from a denser master-data surface built for operators.',
    admin: 'Watch the platform as a governed system: controls, provenance, approvals, and model visibility in one place.',
    settings: 'Adjust runtime behavior, stored credentials, and client overrides without leaving the trading console.',
    assistant: 'Ask for grounded analysis with the desk state already loaded so AI stays anchored to what operations can see.',
  }[currentView]

  const systemStateLabel = error
    ? 'API unavailable'
    : appLoading
      ? 'Loading workspace'
      : referenceDataError
        ? 'Reference data issue'
        : 'Connected'

  const systemStateTone = error || referenceDataError ? 'cancelled' : 'active'

  return (
    <div className="app-shell">
      <div className="app-aura app-aura-left" />
      <div className="app-aura app-aura-right" />

      <div className="mobile-topbar">
        <div>
          <span className="brand-mark">E/CTRM</span>
        </div>
        <button
          type="button"
          className="button button-ghost mobile-nav-button"
          onClick={() => setMobileNavOpen((current) => !current)}
        >
          {mobileNavOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <aside className={`side-rail ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark">E/CTRM</span>
          <h1>Operator Console</h1>
          <p>A trading operations cockpit for ticket entry, lifecycle management, and live projection views.</p>
        </div>

        <nav className="nav-stack" aria-label="Primary">
          {VIEWS.map((view) => (
            <button
              key={view.key}
              type="button"
              className={`nav-item ${currentView === view.key ? 'is-active' : ''}`}
              onClick={() => {
                navigateToView(view.key)
                setMobileNavOpen(false)
              }}
            >
              <span>{view.kicker}</span>
              <strong>{view.label}</strong>
            </button>
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
                    selectedTrade.status === tradeStatusValues.cancelled
                      ? tradeTooltipCopy.cancelledTrade
                      : tradeTooltipCopy.activeTrade
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
                </div>
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

        {(error || referenceDataError) && <div className="error-banner">{error || referenceDataError}</div>}

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

        {currentView === 'guide' && (
          <DocumentationWorkspace
            activeDocumentKey={activeDocumentationDocumentKey}
            onDocumentKeyChange={handleDocumentationDocumentChange}
            onOpenView={navigateToView}
            roadmapRefreshVersion={roadmapRefreshVersion}
          />
        )}

        {currentView === 'dashboard' && (
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
        )}

        {currentView === 'trades' && (
          <TradingWorkspace
            authSession={authSession}
            tradeCaptureFormProps={tradeCaptureFormProps}
            trades={trades}
            selectedTrade={selectedTrade}
            selectedTradeId={selectedTradeId}
            selectedTradeEvents={selectedTradeEvents}
            inspectorTab={inspectorTab}
            setSelectedTradeId={setSelectedTradeId}
            setInspectorTab={setInspectorTab}
            handleDuplicateTrade={handleDuplicateTrade}
            handleAmendTrade={handleAmendTrade}
            handleCancelTrade={handleCancelTrade}
            amendmentPreviewFields={amendmentPreview.changedFields}
            cancelImpactSummary={cancelImpactSummary}
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
            amendPriceIndexInput={amendPriceIndexInput}
            setAmendPriceIndexInput={setAmendPriceIndexInput}
            amendPriceIndexOptions={amendPriceIndexOptions}
            amendPriceInput={amendPriceInput}
            setAmendPriceInput={setAmendPriceInput}
            amendVolumeInput={amendVolumeInput}
            setAmendVolumeInput={setAmendVolumeInput}
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
            tradeNatureOptions={tradeNatureOptions}
            tradeStructureOptions={tradeStructureOptions}
            tradeSideOptions={tradeSideOptions}
            pricingTypeOptions={pricingTypeOptions}
            pricingStatusOptions={pricingStatusOptions}
            settlementStatusOptions={settlementStatusOptions}
            formatCommodityClass={formatCommodityClass}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatDate={formatDate}
            formatDateOnly={formatDateOnly}
            statusTone={statusTone}
          />
        )}

        {currentView === 'events' && (
          <EventsWorkspace
            authSession={authSession}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            filteredEvents={filteredEvents}
            formatDate={formatDate}
          />
        )}

        {currentView === 'positions' && (
          <PositionsWorkspace
            authSession={authSession}
            positionsByClass={positionsByClass}
            positionsWithClass={positionsWithClass}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
          />
        )}

        {currentView === 'shipments' && (
          <ShipmentWorkspace
            authSession={authSession}
            shipments={shipments}
            formatCommodityClass={formatCommodityClass}
            formatDate={formatDate}
            formatNumber={formatNumber}
            onOpenTrade={navigateToTrade}
          />
        )}

        {currentView === 'reference' && (
          <ReferenceDataWorkspace
            controller={referenceState}
            formatCommodityClass={formatCommodityClass}
            formatDate={formatDate}
          />
        )}

        {currentView === 'admin' && (
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
            tradingSourcesSyncing={tradingSourcesSyncing}
            tradingSourcesError={tradingSourcesError}
            tradingSourcesSuccess={tradingSourcesSuccess}
            weatherSyncing={weatherSyncing}
            weatherSyncError={weatherSyncError}
            weatherSyncSuccess={weatherSyncSuccess}
            onRunExternalDataSync={handleRunExternalDataSync}
            onRunNwsWeatherSync={handleRunNwsWeatherSync}
            onSeedTradingSources={handleSeedTradingSources}
            onRefreshData={loadData}
            formatDate={formatDate}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatCommodityClass={formatCommodityClass}
          />
        )}

        {currentView === 'settings' && (
          <SettingsWorkspace
            health={health}
            authSession={authSession}
            onSessionChange={handleSessionChange}
          />
        )}

        {currentView === 'assistant' && (
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
        )}
      </main>
    </div>
  )
}
