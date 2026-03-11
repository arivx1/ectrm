import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AdminWorkspace } from './workspaces/admin/AdminWorkspace'
import { DashboardWorkspace } from './workspaces/dashboard/DashboardWorkspace'
import { EventsWorkspace } from './workspaces/events/EventsWorkspace'
import { PositionsWorkspace } from './workspaces/positions/PositionsWorkspace'
import { ReferenceDataWorkspace } from './workspaces/reference-data/ReferenceDataWorkspace'
import { TradingWorkspace } from './workspaces/trading/TradingWorkspace'
import { loadWorkspaceBootstrap } from './entities/app/api'
import { submitTradeEvent } from './entities/trade/api'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { postJson } from './shared/api'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
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
} from './shared/models'
import { formatCommodityClass, formatDate, formatMoney, formatNumber, parseRequiredNumber, statusTone } from './shared/format'
import { classForCommodity } from './shared/reference'

const API_BASE = import.meta.env.VITE_API_BASE ?? `${window.location.protocol}//${window.location.hostname}:8000`
const USER_ID = 'anthony'
const VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> = [
  { key: 'dashboard', label: 'Dashboard', kicker: 'Today' },
  { key: 'trades', label: 'Trades', kicker: 'Capture' },
  { key: 'events', label: 'Events', kicker: 'Timeline' },
  { key: 'positions', label: 'Positions', kicker: 'Exposure' },
  { key: 'reference', label: 'Reference Data', kicker: 'Master' },
  { key: 'admin', label: 'Admin', kicker: 'Controls' },
]
const COMMODITY_CLASS_ORDER = [
  'POWER',
  'CRUDE_OIL',
  'NATURAL_GAS',
  'LNG',
  'NGL',
  'REFINED_PRODUCTS',
  'CHEMICAL',
  'BASE_METAL',
  'PRECIOUS_METAL',
  'METAL_ORE',
  'AGRICULTURE',
  'OTHER',
]
const TRADE_NATURE_OPTIONS = ['PHYSICAL', 'FINANCIAL'] as const
const TRADE_STRUCTURE_OPTIONS = ['SINGLE', 'SWAP'] as const
const TRADE_SIDE_OPTIONS = ['BUY', 'SELL'] as const
const PRICING_TYPE_OPTIONS = ['FIXED', 'INDEX', 'FORMULA', 'HYBRID'] as const

export default function App() {
  const [currentView, setCurrentView] = useState<ViewKey>('dashboard')
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
  const [error, setError] = useState<string>('')
  const [createError, setCreateError] = useState<string>('')
  const [amendError, setAmendError] = useState<string>('')
  const [referenceDataError, setReferenceDataError] = useState<string>('')
  const [externalDataError, setExternalDataError] = useState<string>('')
  const [externalDataSuccess, setExternalDataSuccess] = useState<string>('')
  const [tradingSourcesError, setTradingSourcesError] = useState<string>('')
  const [tradingSourcesSuccess, setTradingSourcesSuccess] = useState<string>('')
  const [referenceDataLoading, setReferenceDataLoading] = useState(true)
  const [appLoading, setAppLoading] = useState(true)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState('ALL')
  const [externalDataSyncing, setExternalDataSyncing] = useState(false)
  const [tradingSourcesSyncing, setTradingSourcesSyncing] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function loadData() {
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
    } = await loadWorkspaceBootstrap(API_BASE)
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

  useEffect(() => {
    async function init() {
      try {
        await loadData()
      } catch {
        setReferenceDataLoading(false)
        setAppLoading(false)
        setError('Could not reach API. Make sure backend is running on localhost:8000 and CORS is enabled.')
      }
    }

    init()
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [currentView])

  const activeBooks = useMemo(() => books.filter((book) => book.is_active), [books])
  const activeCommodities = useMemo(() => commodities.filter((commodity) => commodity.is_active), [commodities])
  const activeCurrencies = useMemo(() => currencies.filter((currency) => currency.is_active), [currencies])
  const activeUnits = useMemo(() => units.filter((unit) => unit.is_active), [units])
  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations])
  const hasReferenceOptions = activeBooks.length > 0 && activeCommodities.length > 0

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  const selectedTradeEvents = useMemo(
    () => events.filter((event) => event.aggregate_type === 'trade' && event.aggregate_id === selectedTradeId),
    [events, selectedTradeId],
  )

  const activeTrades = useMemo(
    () => trades.filter((trade) => trade.status !== 'CANCELLED'),
    [trades],
  )

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
      COMMODITY_CLASS_ORDER.filter((commodityClass) =>
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

    return COMMODITY_CLASS_ORDER.map((commodityClass) => ({
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

  const captureForm = useTradeCaptureForm(activeBooks, commodityClassOptions, activeCommodities, priceIndices)
  const amendForm = useTradeAmendForm(
    selectedTrade,
    selectedTradeEvents,
    activeBooks,
    commodityClassOptions,
    activeCommodities,
    priceIndices,
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
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    updateDraftLeg: updateCreateDraftLeg,
    addDraftLeg: addCreateDraftLeg,
    removeDraftLeg: removeCreateDraftLeg,
    reset: resetCreateForm,
  } = captureForm

  const {
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendBookInput,
    setAmendBookInput,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    amendCommodityInput,
    setAmendCommodityInput,
    amendPricingTypeInput,
    setAmendPricingTypeInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendLegs,
    amendBookOptions,
    amendCommodityOptions,
    amendPriceIndexOptions,
    updateDraftLeg: updateAmendDraftLeg,
    addDraftLeg: addAmendDraftLeg,
    removeDraftLeg: removeAmendDraftLeg,
  } = amendForm

  const referenceState = useReferenceDataController({
    apiBase: API_BASE,
    userId: USER_ID,
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
    commodityClassOrder: COMMODITY_CLASS_ORDER,
  })

  async function handleRunEiaSync() {
    setExternalDataSyncing(true)
    setExternalDataError('')
    setExternalDataSuccess('')
    try {
      const response = await fetch(`${API_BASE}/admin/external-data/eia/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_by: USER_ID }),
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
      const payload = await postJson<{ total_rows: number; created_count: number; updated_count: number }>(
        `${API_BASE}/admin/trading-sources/seed`,
        { requested_by: USER_ID, replace_existing: true },
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

  function buildTradePayload(input: {
    tradeNature: string
    tradeStructure: string
    tradeSide: string
    book: string
    commodityClass: string
    commodity: string
    pricingType: string
    priceIndexCode: string
    price: number | null
    volume: number | null
    legs: TradeLegDraft[]
  }) {
    const payload: Record<string, unknown> = {
      trade_nature: input.tradeNature,
      trade_structure: input.tradeStructure,
      book: input.book,
      commodity_class: input.commodityClass,
      commodity: input.commodity,
      pricing_type: input.pricingType,
      price: input.price,
      volume: input.volume,
    }

    if (input.tradeStructure === 'SINGLE') {
      payload.trade_side = input.tradeSide
    } else {
      payload.legs = input.legs.map((leg, index) => ({
        leg_no: index + 1,
        side: leg.side,
        commodity_class: leg.commodity_class,
        commodity: leg.commodity,
        volume: parseRequiredNumber(leg.volume),
      }))
    }

    if (input.pricingType === 'INDEX' || input.pricingType === 'HYBRID') {
      payload.price_index_code = input.priceIndexCode
    }

    return payload
  }

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreateError('')

    const tradeId = tradeIdInput.trim()
    const tradeNature = tradeNatureInput
    const tradeStructure = tradeStructureInput
    const tradeSide = tradeSideInput
    const book = bookInput
    const commodityClass = commodityClassInput
    const commodity = commodityInput.trim()
    const pricingType = pricingTypeInput
    const priceIndexCode = priceIndexInput
    const price = parseRequiredNumber(priceInput)
    const volume = parseRequiredNumber(volumeInput)

    if (!tradeId || !book || !commodityClass || !commodity || price === null || volume === null) {
      setCreateError('Trade ID, book, commodity class, commodity, price, and volume are required.')
      return
    }
    if ((pricingType === 'INDEX' || pricingType === 'HYBRID') && !priceIndexCode) {
      setCreateError('Price index is required when pricing type is INDEX or HYBRID.')
      return
    }
    if (tradeStructure === 'SWAP') {
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
      await submitTradeEvent(API_BASE, {
        aggregate_id: tradeId,
        event_type: 'TradeCreated',
        actor_id: USER_ID,
        payload: buildTradePayload({
          tradeNature,
          tradeStructure,
          tradeSide,
          book,
          commodityClass,
          commodity,
          pricingType,
          priceIndexCode,
          price,
          volume,
          legs: createLegs,
        }),
      })

      await loadData()
      setSelectedTradeId(tradeId)
      setCurrentView('trades')
      setInspectorTab('overview')
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

    const tradeNature = amendTradeNatureInput
    const tradeStructure = amendTradeStructureInput
    const tradeSide = amendTradeSideInput
    const book = amendBookInput
    const commodityClass = amendCommodityClassInput
    const commodity = amendCommodityInput.trim()
    const pricingType = amendPricingTypeInput
    const priceIndexCode = amendPriceIndexInput
    const price = parseRequiredNumber(amendPriceInput)
    const volume = parseRequiredNumber(amendVolumeInput)

    if (!book || !commodityClass || !commodity || price === null || volume === null) {
      setAmendError('Book, commodity class, commodity, price, and volume are required.')
      return
    }
    if ((pricingType === 'INDEX' || pricingType === 'HYBRID') && !priceIndexCode) {
      setAmendError('Price index is required when pricing type is INDEX or HYBRID.')
      return
    }
    if (tradeStructure === 'SWAP') {
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
      await submitTradeEvent(API_BASE, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeAmended',
        actor_id: USER_ID,
        payload: buildTradePayload({
          tradeNature,
          tradeStructure,
          tradeSide,
          book,
          commodityClass,
          commodity,
          pricingType,
          priceIndexCode,
          price,
          volume,
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
      await submitTradeEvent(API_BASE, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeCancelled',
        actor_id: USER_ID,
        payload: { status: 'CANCELLED' },
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
    trades: 'Trade capture and lifecycle',
    events: 'Event stream and chronology',
    positions: 'Exposure by commodity',
    reference: 'Reference data maintenance',
    admin: 'Operational controls',
  }[currentView]

  const heroBody = {
    dashboard: 'Monitor capture quality, open exposure, and recent activity from a calmer operating surface.',
    trades: 'Select a trade to inspect its state, review event history, and amend or cancel it without leaving the workspace.',
    events: 'Read the system as a timeline instead of a log table. Filter it down to the selected trade when you need detail.',
    positions: 'Scan live net exposure first, then drop to commodity-level rows when you need exact numbers.',
    reference: 'Maintain books, commodities, and pricing reference data directly in the application, with activation controls and inline editing.',
    admin: 'Use Admin as both a governance surface and a live window into the event, projection, and schema model behind the product.',
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
                setCurrentView(view.key)
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
          <div className={`status-pill status-pill-${systemStateTone} system-pill`}>
            {systemStateLabel}
          </div>
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

        <div className="side-card">
          <span className="eyebrow">Selected Trade</span>
          {selectedTrade ? (
            <>
              <strong className="side-card-title">{selectedTrade.trade_id}</strong>
              <p>
                {selectedTrade.trade_nature} • {selectedTrade.trade_structure} • {selectedTrade.book}
              </p>
              <div className={`status-pill status-pill-${statusTone(selectedTrade.status)}`}>
                {selectedTrade.status}
              </div>
            </>
          ) : (
            <>
              <strong className="side-card-title">No trade selected</strong>
              <p>Pick a trade from the workspace to unlock its inspector and event trail.</p>
            </>
          )}
        </div>
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
            priceIndexInput={priceIndexInput}
            setPriceIndexInput={setPriceIndexInput}
            createPriceIndexOptions={createPriceIndexOptions}
            priceInput={priceInput}
            setPriceInput={setPriceInput}
            volumeInput={volumeInput}
            setVolumeInput={setVolumeInput}
            createLegs={createLegs}
            activeCommodities={activeCommodities}
            addDraftLeg={addCreateDraftLeg}
            removeDraftLeg={removeCreateDraftLeg}
            updateDraftLeg={updateCreateDraftLeg}
            submitting={submitting}
            referenceDataLoading={referenceDataLoading}
            hasReferenceOptions={hasReferenceOptions}
            createError={createError}
            tradeNatureOptions={TRADE_NATURE_OPTIONS}
            tradeStructureOptions={TRADE_STRUCTURE_OPTIONS}
            tradeSideOptions={TRADE_SIDE_OPTIONS}
            pricingTypeOptions={PRICING_TYPE_OPTIONS}
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
            amendBookInput={amendBookInput}
            setAmendBookInput={setAmendBookInput}
            amendBookOptions={amendBookOptions}
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
            amendPriceIndexInput={amendPriceIndexInput}
            setAmendPriceIndexInput={setAmendPriceIndexInput}
            amendPriceIndexOptions={amendPriceIndexOptions}
            amendPriceInput={amendPriceInput}
            setAmendPriceInput={setAmendPriceInput}
            amendVolumeInput={amendVolumeInput}
            setAmendVolumeInput={setAmendVolumeInput}
            amendLegs={amendLegs}
            activeCommodities={activeCommodities}
            addDraftLeg={addAmendDraftLeg}
            removeDraftLeg={removeAmendDraftLeg}
            updateDraftLeg={updateAmendDraftLeg}
            amending={amending}
            cancelling={cancelling}
            amendError={amendError}
            tradeNatureOptions={TRADE_NATURE_OPTIONS}
            tradeStructureOptions={TRADE_STRUCTURE_OPTIONS}
            tradeSideOptions={TRADE_SIDE_OPTIONS}
            pricingTypeOptions={PRICING_TYPE_OPTIONS}
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
            externalDataSyncing={externalDataSyncing}
            externalDataError={externalDataError}
            externalDataSuccess={externalDataSuccess}
            tradingSourcesSyncing={tradingSourcesSyncing}
            tradingSourcesError={tradingSourcesError}
            tradingSourcesSuccess={tradingSourcesSuccess}
            onRunEiaSync={handleRunEiaSync}
            onSeedTradingSources={handleSeedTradingSources}
            formatDate={formatDate}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatCommodityClass={formatCommodityClass}
          />
        )}
      </main>
    </div>
  )
}
