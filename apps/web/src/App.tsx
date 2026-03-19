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
import { ReferenceDataWorkspace } from './workspaces/reference-data/ReferenceDataWorkspace'
import { AssistantWorkspace } from './workspaces/assistant/AssistantWorkspace'
import { SettingsWorkspace } from './workspaces/settings/SettingsWorkspace'
import { TradingWorkspace } from './workspaces/trading/TradingWorkspace'
import { loadWorkspaceBootstrap } from './entities/app/api'
import { loadCurrentSession, sendSessionHeartbeat } from './entities/auth/api'
import { submitTradeEvent } from './entities/trade/api'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { fetchJson, postJson } from './shared/api'
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
import { tradeTooltipCopy } from './features/trades/tooltipCopy'
import {
  type CounterpartyRecord,
  type CurrencyRecord,
  type EventRow,
  type ExternalDataRunRecord,
  type InspectorTab,
  type LocationRecord,
  type PositionRow,
  type PortfolioRecord,
  type PriceIndexRecord,
  type ReferenceRecord,
  type Trade,
  type TradeLegDraft,
  type TradingSourceRecord,
  type UnitRecord,
  type ViewKey,
  type WeatherSyncStatusRecord,
} from './shared/models'
import { formatCommodityClass, formatDate, formatMoney, formatNumber, parseRequiredNumber, statusTone } from './shared/format'
import { classForCommodity } from './shared/reference'
import {
  commodityClassOrder,
  pricingTypeOptions,
  pricingStatusOptions,
  pricingTypeRequiresPriceIndex,
  settlementStatusOptions,
  tradeAggregateType,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStatusValues,
  tradeStructureOptions,
  tradeStructureSupportsLegs,
} from './shared/trading'
import { Tooltip } from './shared/ui/Tooltip'

const VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> = [
  { key: 'dashboard', label: 'Dashboard', kicker: 'Today' },
  { key: 'guide', label: 'Guide', kicker: 'Learn' },
  { key: 'trades', label: 'Trades', kicker: 'Capture' },
  { key: 'events', label: 'Events', kicker: 'Timeline' },
  { key: 'positions', label: 'Positions', kicker: 'Exposure' },
  { key: 'reference', label: 'Reference Data', kicker: 'Master' },
  { key: 'admin', label: 'Admin', kicker: 'Controls' },
  { key: 'settings', label: 'Settings', kicker: 'Runtime' },
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
  const [books, setBooks] = useState<ReferenceRecord[]>([])
  const [commodities, setCommodities] = useState<ReferenceRecord[]>([])
  const [priceIndices, setPriceIndices] = useState<PriceIndexRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([])
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [counterparties, setCounterparties] = useState<CounterpartyRecord[]>([])
  const [portfolios, setPortfolios] = useState<PortfolioRecord[]>([])
  const [externalDataRuns, setExternalDataRuns] = useState<ExternalDataRunRecord[]>([])
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
      books: booksJson,
      commodities: commoditiesJson,
      priceIndices: priceIndicesJson,
      currencies: currenciesJson,
      units: unitsJson,
      locations: locationsJson,
      counterparties: counterpartiesJson,
      portfolios: portfoliosJson,
      externalDataRuns: externalDataRunsJson,
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
    const nextBooks = booksJson as ReferenceRecord[]
    const nextCommodities = commoditiesJson as ReferenceRecord[]
    const nextPriceIndices = priceIndicesJson as PriceIndexRecord[]
    const nextCurrencies = currenciesJson as CurrencyRecord[]
    const nextUnits = unitsJson as UnitRecord[]
    const nextLocations = locationsJson as LocationRecord[]
    const nextCounterparties = counterpartiesJson as CounterpartyRecord[]
    const nextPortfolios = portfoliosJson as PortfolioRecord[]
    const nextExternalDataRuns = externalDataRunsJson as ExternalDataRunRecord[]
    const nextTradingSources = tradingSourcesJson as TradingSourceRecord[]
    const nextWeatherSyncStatus = weatherSyncStatusJson as WeatherSyncStatusRecord | null

    setHealth(healthJson.status ?? 'unknown')
    setTrades(nextTrades)
    setEvents(nextEvents)
    setPositions(nextPositions)
    setBooks(nextBooks)
    setCommodities(nextCommodities)
    setPriceIndices(nextPriceIndices)
    setCurrencies(nextCurrencies)
    setUnits(nextUnits)
    setLocations(nextLocations)
    setCounterparties(nextCounterparties)
    setPortfolios(nextPortfolios)
    setExternalDataRuns(nextExternalDataRuns)
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
      } catch {
        setReferenceDataLoading(false)
        setAppLoading(false)
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
    externalTradeIdInput,
    setExternalTradeIdInput,
    sourceSystemInput,
    setSourceSystemInput,
    executionTimestampInput,
    setExecutionTimestampInput,
    portfolioInput,
    setPortfolioInput,
    counterpartyInput,
    setCounterpartyInput,
    pricingStatusInput,
    setPricingStatusInput,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    createPortfolioOptions,
    createCounterpartyOptions,
    updateDraftLeg: updateCreateDraftLeg,
    addDraftLeg: addCreateDraftLeg,
    removeDraftLeg: removeCreateDraftLeg,
    reset: resetCreateForm,
  } = captureForm

  const {
    amendExternalTradeIdInput,
    setAmendExternalTradeIdInput,
    amendSourceSystemInput,
    setAmendSourceSystemInput,
    amendExecutionTimestampInput,
    setAmendExecutionTimestampInput,
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
    updateDraftLeg: updateAmendDraftLeg,
    addDraftLeg: addAmendDraftLeg,
    removeDraftLeg: removeAmendDraftLeg,
  } = amendForm

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
    commodityClassOrder,
  })

  async function handleRunEiaSync() {
    setExternalDataSyncing(true)
    setExternalDataError('')
    setExternalDataSuccess('')
    try {
      const { actorId } = getMutationContext()
      const response = await fetch(`${appConfig.apiBase}/admin/external-data/eia/sync`, {
        method: 'POST',
        headers: buildMutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: actorId }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to run EIA sync.')
      }

      const payload = (await response.json()) as ExternalDataRunRecord
      await loadData()
      setExternalDataSuccess(
        `EIA sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.observation_count} observations.`,
      )
    } catch (err) {
      setExternalDataError(err instanceof Error ? err.message : 'Failed to run EIA sync.')
    } finally {
      setExternalDataSyncing(false)
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
      await loadData()
      setTradingSourcesSuccess(
        `Trading source register loaded: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.total_rows} total rows.`,
      )
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

  function normalizeOptionalDateTimeInput(value: string): string | null {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
      return null
    }

    const parsedValue = new Date(trimmedValue)
    if (Number.isNaN(parsedValue.getTime())) {
      throw new Error('Execution timestamp must be a valid date and time.')
    }

    return parsedValue.toISOString()
  }

  function buildTradePayload(input: {
    externalTradeId: string
    sourceSystem: string
    executionTimestamp: string
    tradeNature: string
    tradeStructure: string
    tradeSide: string
    book: string
    portfolio: string
    counterparty: string
    commodityClass: string
    commodity: string
    pricingType: string
    pricingStatus: string
    priceIndexCode: string
    price: number | null
    volume: number | null
    settlementStatus: string
    traderUser: string
    legs: TradeLegDraft[]
  }) {
    const payload: Record<string, unknown> = {
      external_trade_id: input.externalTradeId.trim() || null,
      source_system: input.sourceSystem.trim() || null,
      execution_timestamp: normalizeOptionalDateTimeInput(input.executionTimestamp),
      trade_nature: input.tradeNature,
      trade_structure: input.tradeStructure,
      book: input.book,
      portfolio: input.portfolio || null,
      counterparty: input.counterparty || null,
      commodity_class: input.commodityClass,
      commodity: input.commodity,
      pricing_type: input.pricingType,
      pricing_status: input.pricingStatus,
      price: input.price,
      volume: input.volume,
      settlement_status: input.settlementStatus,
      trader_user: input.traderUser.trim() || null,
    }

    if (tradeStructureSupportsLegs(input.tradeStructure)) {
      payload.legs = input.legs.map((leg, index) => ({
        leg_no: index + 1,
        side: leg.side,
        commodity_class: leg.commodity_class,
        commodity: leg.commodity,
        volume: parseRequiredNumber(leg.volume),
      }))
    } else {
      payload.trade_side = input.tradeSide
    }

    if (pricingTypeRequiresPriceIndex(input.pricingType)) {
      payload.price_index_code = input.priceIndexCode
    }

    return payload
  }

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreateError('')

    const tradeId = tradeIdInput.trim()
    const externalTradeId = externalTradeIdInput
    const sourceSystem = sourceSystemInput
    const executionTimestamp = executionTimestampInput
    const tradeNature = tradeNatureInput
    const tradeStructure = tradeStructureInput
    const tradeSide = tradeSideInput
    const book = bookInput
    const portfolio = portfolioInput
    const counterparty = counterpartyInput
    const commodityClass = commodityClassInput
    const commodity = commodityInput.trim()
    const pricingType = pricingTypeInput
    const pricingStatus = pricingStatusInput
    const priceIndexCode = priceIndexInput
    const price = parseRequiredNumber(priceInput)
    const volume = parseRequiredNumber(volumeInput)
    const settlementStatus = settlementStatusInput
    const traderUser = traderUserInput

    if (!tradeId || !book || !commodityClass || !commodity || price === null || volume === null) {
      setCreateError('Trade ID, book, commodity class, commodity, price, and volume are required.')
      return
    }
    if (pricingTypeRequiresPriceIndex(pricingType) && !priceIndexCode) {
      setCreateError('Price index is required when pricing type is INDEX or HYBRID.')
      return
    }
    if (tradeStructureSupportsLegs(tradeStructure)) {
      const validLegs = createLegs.filter(
        (leg) =>
          leg.commodity_class &&
          leg.commodity &&
          leg.volume.trim() !== '' &&
          parseRequiredNumber(leg.volume) !== null,
      )
      if (validLegs.length < 2) {
        setCreateError('Swap trades require at least two complete legs.')
        return
      }
    }

    setSubmitting(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: tradeId,
        event_type: 'TradeCreated',
        payload: buildTradePayload({
          externalTradeId,
          sourceSystem,
          executionTimestamp,
          tradeNature,
          tradeStructure,
          tradeSide,
          book,
          portfolio,
          counterparty,
          commodityClass,
          commodity,
          pricingType,
          pricingStatus,
          priceIndexCode,
          price,
          volume,
          settlementStatus,
          traderUser,
          legs: createLegs,
        }),
      })

      await loadData()
      navigateToTrade(tradeId)
      resetCreateForm()
      setCreateError('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create trade failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAmendTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAmendError('')

    if (!selectedTradeId) {
      setAmendError('Select a trade first.')
      return
    }

    const externalTradeId = amendExternalTradeIdInput
    const sourceSystem = amendSourceSystemInput
    const executionTimestamp = amendExecutionTimestampInput
    const tradeNature = amendTradeNatureInput
    const tradeStructure = amendTradeStructureInput
    const tradeSide = amendTradeSideInput
    const book = amendBookInput
    const portfolio = amendPortfolioInput
    const counterparty = amendCounterpartyInput
    const commodityClass = amendCommodityClassInput
    const commodity = amendCommodityInput.trim()
    const pricingType = amendPricingTypeInput
    const pricingStatus = amendPricingStatusInput
    const priceIndexCode = amendPriceIndexInput
    const price = parseRequiredNumber(amendPriceInput)
    const volume = parseRequiredNumber(amendVolumeInput)
    const settlementStatus = amendSettlementStatusInput
    const traderUser = amendTraderUserInput

    if (!book || !commodityClass || !commodity || price === null || volume === null) {
      setAmendError('Book, commodity class, commodity, price, and volume are required.')
      return
    }
    if (pricingTypeRequiresPriceIndex(pricingType) && !priceIndexCode) {
      setAmendError('Price index is required when pricing type is INDEX or HYBRID.')
      return
    }
    if (tradeStructureSupportsLegs(tradeStructure)) {
      const validLegs = amendLegs.filter(
        (leg) =>
          leg.commodity_class &&
          leg.commodity &&
          leg.volume.trim() !== '' &&
          parseRequiredNumber(leg.volume) !== null,
      )
      if (validLegs.length < 2) {
        setAmendError('Swap trades require at least two complete legs.')
        return
      }
    }

    setAmending(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeAmended',
        payload: buildTradePayload({
          externalTradeId,
          sourceSystem,
          executionTimestamp,
          tradeNature,
          tradeStructure,
          tradeSide,
          book,
          portfolio,
          counterparty,
          commodityClass,
          commodity,
          pricingType,
          pricingStatus,
          priceIndexCode,
          price,
          volume,
          settlementStatus,
          traderUser,
          legs: amendLegs,
        }),
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

  async function handleCancelTrade() {
    setError('')
    setAmendError('')

    if (!selectedTradeId) {
      setAmendError('Select a trade first.')
      return
    }

    setCancelling(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeCancelled',
        payload: { status: tradeStatusValues.cancelled },
      })

      await loadData()
      setInspectorTab('overview')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Cancel trade failed.')
    } finally {
      setCancelling(false)
    }
  }

  const heroTitle = {
    dashboard: 'Commodity desk at a glance',
    guide: 'Documentation in the operator console',
    trades: 'Trade capture and lifecycle',
    events: 'Event stream and chronology',
    positions: 'Exposure by commodity',
    reference: 'Reference data maintenance',
    admin: 'Operational controls',
    settings: 'Runtime and access settings',
    assistant: 'Provider-routed operator assistant',
  }[currentView]

  const heroBody = {
    dashboard: 'Monitor capture quality, open exposure, and recent activity from a calmer operating surface.',
    guide: 'Read the semi-technical operator guide directly in the app, then jump into the workspace you need.',
    trades: 'Select a trade to inspect its state, review event history, and amend or cancel it without leaving the workspace.',
    events: 'Read the system as a timeline instead of a log table. Filter it down to the selected trade when you need detail.',
    positions: 'Scan live net exposure first, then drop to commodity-level rows when you need exact numbers.',
    reference: 'Maintain books, commodities, and pricing reference data directly in the application, with activation controls and inline editing.',
    admin: 'Use Admin as both a governance surface and a live window into the event, projection, and schema model behind the product.',
    settings: 'Review safe server runtime settings, manage browser-stored write credentials, and adjust local client overrides in one place.',
    assistant: 'Route prompts through GPT, Claude, or Gemini while grounding responses in the application state already loaded into the console.',
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
          <p>A calmer control surface for event-led trading, reference data, and live projection views.</p>
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

        <div className="side-card side-card-contrast">
          <span className="eyebrow">System</span>
          <Tooltip
            content={systemStateTone === 'active' ? tradeTooltipCopy.systemReady : tradeTooltipCopy.systemAttention}
            focusable
          >
            <span className={`status-pill status-pill-${systemStateTone} system-pill tooltip-trigger-hint`}>
              {systemStateLabel}
            </span>
          </Tooltip>
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
          <div className="health-line">
            <span>Open trades</span>
            <strong>{activeTrades.length}</strong>
          </div>
        </div>

        {currentView !== 'guide' && (
          <div className="side-card">
            <span className="eyebrow">Selected Trade</span>
            {selectedTrade ? (
              <>
                <strong className="side-card-title">{selectedTrade.trade_id}</strong>
                <p>
                  {selectedTrade.trade_nature} • {selectedTrade.trade_structure} • {selectedTrade.book}
                </p>
                <Tooltip
                  content={selectedTrade.status === tradeStatusValues.cancelled ? tradeTooltipCopy.cancelledTrade : tradeTooltipCopy.activeTrade}
                  focusable
                >
                  <span className={`status-pill status-pill-${statusTone(selectedTrade.status)} tooltip-trigger-hint`}>
                    {selectedTrade.status}
                  </span>
                </Tooltip>
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
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>{heroTitle}</h2>
            <p>{heroBody}</p>
          </div>

          <div className="hero-badge">
            <span>Mode</span>
            <strong>{VIEWS.find((view) => view.key === currentView)?.label}</strong>
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
              <span>Tracked Books</span>
              <strong>{trackedBooks}</strong>
              <p>Distinct books represented in the live book.</p>
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
            handleCreateTrade={handleCreateTrade}
            tradeIdInput={tradeIdInput}
            setTradeIdInput={setTradeIdInput}
            tradeNatureInput={tradeNatureInput}
            setTradeNatureInput={setTradeNatureInput}
            tradeStructureInput={tradeStructureInput}
            setTradeStructureInput={setTradeStructureInput}
            tradeSideInput={tradeSideInput}
            setTradeSideInput={setTradeSideInput}
            bookInput={bookInput}
            setBookInput={setBookInput}
            activeBooks={activeBooks}
            commodityClassInput={commodityClassInput}
            setCommodityClassInput={setCommodityClassInput}
            commodityClassOptions={commodityClassOptions}
            commodityInput={commodityInput}
            setCommodityInput={setCommodityInput}
            createCommodityOptions={createCommodityOptions}
          pricingTypeInput={pricingTypeInput}
          setPricingTypeInput={setPricingTypeInput}
          pricingStatusInput={pricingStatusInput}
          setPricingStatusInput={setPricingStatusInput}
          priceIndexInput={priceIndexInput}
          setPriceIndexInput={setPriceIndexInput}
          createPriceIndexOptions={createPriceIndexOptions}
          priceInput={priceInput}
          setPriceInput={setPriceInput}
          volumeInput={volumeInput}
          setVolumeInput={setVolumeInput}
          externalTradeIdInput={externalTradeIdInput}
          setExternalTradeIdInput={setExternalTradeIdInput}
          sourceSystemInput={sourceSystemInput}
          setSourceSystemInput={setSourceSystemInput}
          executionTimestampInput={executionTimestampInput}
          setExecutionTimestampInput={setExecutionTimestampInput}
          portfolioInput={portfolioInput}
          setPortfolioInput={setPortfolioInput}
          createPortfolioOptions={createPortfolioOptions}
          counterpartyInput={counterpartyInput}
          setCounterpartyInput={setCounterpartyInput}
          createCounterpartyOptions={createCounterpartyOptions}
          settlementStatusInput={settlementStatusInput}
          setSettlementStatusInput={setSettlementStatusInput}
          traderUserInput={traderUserInput}
          setTraderUserInput={setTraderUserInput}
          createLegs={createLegs}
            activeCommodities={activeCommodities}
            addDraftLeg={addCreateDraftLeg}
            removeDraftLeg={removeCreateDraftLeg}
            updateDraftLeg={updateCreateDraftLeg}
            submitting={submitting}
            referenceDataLoading={referenceDataLoading}
            hasReferenceOptions={hasReferenceOptions}
            createError={createError}
            tradeNatureOptions={tradeNatureOptions}
          tradeStructureOptions={tradeStructureOptions}
          tradeSideOptions={tradeSideOptions}
          pricingTypeOptions={pricingTypeOptions}
          pricingStatusOptions={pricingStatusOptions}
          settlementStatusOptions={settlementStatusOptions}
          appLoading={appLoading}
            positionsByClass={positionsByClass}
            events={events}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
          />
        )}

        {currentView === 'trades' && (
          <TradingWorkspace
            trades={trades}
            selectedTrade={selectedTrade}
            selectedTradeId={selectedTradeId}
            selectedTradeEvents={selectedTradeEvents}
            inspectorTab={inspectorTab}
            setSelectedTradeId={setSelectedTradeId}
            setInspectorTab={setInspectorTab}
            handleAmendTrade={handleAmendTrade}
            handleCancelTrade={handleCancelTrade}
            amendExternalTradeIdInput={amendExternalTradeIdInput}
            setAmendExternalTradeIdInput={setAmendExternalTradeIdInput}
            amendSourceSystemInput={amendSourceSystemInput}
            setAmendSourceSystemInput={setAmendSourceSystemInput}
            amendExecutionTimestampInput={amendExecutionTimestampInput}
            setAmendExecutionTimestampInput={setAmendExecutionTimestampInput}
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
            statusTone={statusTone}
          />
        )}

        {currentView === 'events' && (
          <EventsWorkspace
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            filteredEvents={filteredEvents}
            formatDate={formatDate}
          />
        )}

        {currentView === 'positions' && (
          <PositionsWorkspace
            positionsByClass={positionsByClass}
            positionsWithClass={positionsWithClass}
            formatCommodityClass={formatCommodityClass}
            formatNumber={formatNumber}
            formatDate={formatDate}
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
            tradingSources={tradingSources}
            weatherSyncStatus={weatherSyncStatus}
            externalDataSyncing={externalDataSyncing}
            externalDataError={externalDataError}
            externalDataSuccess={externalDataSuccess}
            tradingSourcesSyncing={tradingSourcesSyncing}
            tradingSourcesError={tradingSourcesError}
            tradingSourcesSuccess={tradingSourcesSuccess}
            weatherSyncing={weatherSyncing}
            weatherSyncError={weatherSyncError}
            weatherSyncSuccess={weatherSyncSuccess}
            onRunEiaSync={handleRunEiaSync}
            onRunNwsWeatherSync={handleRunNwsWeatherSync}
            onSeedTradingSources={handleSeedTradingSources}
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
          />
        )}
      </main>
    </div>
  )
}
