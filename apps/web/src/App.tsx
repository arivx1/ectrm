import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AdminWorkspace } from './workspaces/admin/AdminWorkspace'
import { TradeCaptureForm } from './features/trades/TradeCaptureForm'
import { TradingWorkspace } from './workspaces/trading/TradingWorkspace'
import { submitTradeEvent } from './entities/trade/api'

type Trade = {
  trade_id: string
  created_at: string
  updated_at: string
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  commodity_class: string
  commodity: string
  pricing_type: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  status: string
  last_event_id: string
}

type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

type EventRow = {
  event_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  occurred_at: string
  recorded_at: string
  actor_id: string | null
  correlation_id: string | null
  causation_id: string | null
  schema_version: number
  payload: Record<string, unknown>
}

type PositionRow = {
  commodity: string
  net_volume: number
  updated_at: string
}

type ReferenceRecord = {
  code: string
  name: string
  description?: string | null
  is_active: boolean
  created_at?: string
  created_by?: string
  updated_at?: string
  updated_by?: string
  version?: number
  commodity_class?: string
}

type PriceIndexRecord = ReferenceRecord & {
  commodity_code: string
  currency_code: string
  unit_code: string
  provider: string
  market?: string | null
  location_code?: string | null
  calendar_code?: string | null
}

type CurrencyRecord = ReferenceRecord & {
  symbol?: string | null
}

type UnitRecord = ReferenceRecord & {
  commodity_class?: string | null
  dimension: string
  base_unit_code?: string | null
  conversion_factor?: number | null
  precision: number
}

type LocationRecord = ReferenceRecord & {
  location_type: string
  market?: string | null
  country_code?: string | null
  region?: string | null
  timezone?: string | null
}

type ViewKey = 'dashboard' | 'trades' | 'events' | 'positions' | 'reference' | 'admin'
type InspectorTab = 'overview' | 'events' | 'amend' | 'risk'
type ReferenceTab = 'books' | 'commodities' | 'price-indices' | 'currencies' | 'units' | 'locations'

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

function makeLegDraft(overrides: Partial<TradeLegDraft> = {}): TradeLegDraft {
  return {
    leg_no: overrides.leg_no ?? 1,
    side: overrides.side ?? 'BUY',
    commodity_class: overrides.commodity_class ?? '',
    commodity: overrides.commodity ?? '',
    volume: overrides.volume ?? '',
  }
}

function parseLegsFromPayload(payload: Record<string, unknown> | null | undefined): TradeLegDraft[] {
  const rawLegs = payload?.legs
  if (!Array.isArray(rawLegs)) {
    return []
  }

  return rawLegs
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row, index) =>
      makeLegDraft({
        leg_no: typeof row.leg_no === 'number' ? row.leg_no : index + 1,
        side: typeof row.side === 'string' ? row.side : 'BUY',
        commodity_class: typeof row.commodity_class === 'string' ? row.commodity_class : '',
        commodity: typeof row.commodity === 'string' ? row.commodity : '',
        volume:
          typeof row.volume === 'number'
            ? String(row.volume)
            : typeof row.volume === 'string'
              ? row.volume
              : '',
      }),
    )
}

function parseRequiredNumber(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatMoney(value: number | null): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatCommodityClass(value: string): string {
  return value.replaceAll('_', ' ')
}

function statusTone(status: string): 'active' | 'cancelled' {
  return status === 'CANCELLED' ? 'cancelled' : 'active'
}

function ensureCurrentOption(
  options: ReferenceRecord[],
  currentValue: string,
  currentClass: string,
  fallbackLabel: string,
): ReferenceRecord[] {
  if (!currentValue || options.some((option) => option.code === currentValue)) {
    return options
  }

  return [
    {
      code: currentValue,
      commodity_class: currentClass,
      name: fallbackLabel,
      is_active: false,
    },
    ...options,
  ]
}

function classForCommodity(commodities: ReferenceRecord[], commodity: string): string {
  return commodities.find((row) => row.code === commodity)?.commodity_class ?? 'OTHER'
}

function emptyBookForm() {
  return { code: '', name: '', description: '' }
}

function emptyCommodityForm(defaultClass = COMMODITY_CLASS_ORDER[0]) {
  return { code: '', name: '', description: '', commodity_class: defaultClass }
}

function emptyPriceIndexForm(defaultCommodityCode = '') {
  return {
    code: '',
    name: '',
    description: '',
    commodity_code: defaultCommodityCode,
    currency_code: 'USD',
    unit_code: 'BBL',
    provider: '',
    market: '',
    location_code: '',
    calendar_code: '',
  }
}

function emptyCurrencyForm() {
  return { code: '', name: '', symbol: '', description: '' }
}

function emptyUnitForm(defaultCommodityClass = COMMODITY_CLASS_ORDER[0]) {
  return {
    code: '',
    name: '',
    commodity_class: defaultCommodityClass,
    dimension: 'VOLUME',
    base_unit_code: '',
    conversion_factor: '',
    precision: '3',
    description: '',
  }
}

function emptyLocationForm() {
  return {
    code: '',
    name: '',
    location_type: 'HUB',
    market: '',
    country_code: '',
    region: '',
    timezone: '',
    description: '',
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewKey>('dashboard')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview')
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>('books')
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
  const [error, setError] = useState<string>('')
  const [createError, setCreateError] = useState<string>('')
  const [amendError, setAmendError] = useState<string>('')
  const [referenceDataError, setReferenceDataError] = useState<string>('')
  const [referenceActionError, setReferenceActionError] = useState<string>('')
  const [referenceActionSuccess, setReferenceActionSuccess] = useState<string>('')
  const [referenceDataLoading, setReferenceDataLoading] = useState(true)
  const [appLoading, setAppLoading] = useState(true)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState('ALL')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [selectedBookCode, setSelectedBookCode] = useState<string | null>(null)
  const [selectedCommodityCode, setSelectedCommodityCode] = useState<string | null>(null)
  const [selectedPriceIndexCode, setSelectedPriceIndexCode] = useState<string | null>(null)
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string | null>(null)
  const [selectedUnitCode, setSelectedUnitCode] = useState<string | null>(null)
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null)
  const [bookForm, setBookForm] = useState(emptyBookForm())
  const [commodityForm, setCommodityForm] = useState(emptyCommodityForm())
  const [priceIndexForm, setPriceIndexForm] = useState(emptyPriceIndexForm())
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm())
  const [unitForm, setUnitForm] = useState(emptyUnitForm())
  const [locationForm, setLocationForm] = useState(emptyLocationForm())
  const [bookFormMode, setBookFormMode] = useState<'create' | 'edit'>('create')
  const [commodityFormMode, setCommodityFormMode] = useState<'create' | 'edit'>('create')
  const [priceIndexFormMode, setPriceIndexFormMode] = useState<'create' | 'edit'>('create')
  const [currencyFormMode, setCurrencyFormMode] = useState<'create' | 'edit'>('create')
  const [unitFormMode, setUnitFormMode] = useState<'create' | 'edit'>('create')
  const [locationFormMode, setLocationFormMode] = useState<'create' | 'edit'>('create')
  const [savingReference, setSavingReference] = useState(false)

  const [tradeIdInput, setTradeIdInput] = useState('')
  const [tradeNatureInput, setTradeNatureInput] = useState('PHYSICAL')
  const [tradeStructureInput, setTradeStructureInput] = useState('SINGLE')
  const [tradeSideInput, setTradeSideInput] = useState('BUY')
  const [bookInput, setBookInput] = useState('')
  const [commodityClassInput, setCommodityClassInput] = useState('')
  const [commodityInput, setCommodityInput] = useState('')
  const [pricingTypeInput, setPricingTypeInput] = useState('FIXED')
  const [priceIndexInput, setPriceIndexInput] = useState('')
  const [priceInput, setPriceInput] = useState('80.00')
  const [volumeInput, setVolumeInput] = useState('1000')
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>([
    makeLegDraft({ leg_no: 1 }),
    makeLegDraft({ leg_no: 2, side: 'SELL' }),
  ])
  const [submitting, setSubmitting] = useState(false)

  const [amendTradeNatureInput, setAmendTradeNatureInput] = useState('PHYSICAL')
  const [amendTradeStructureInput, setAmendTradeStructureInput] = useState('SINGLE')
  const [amendTradeSideInput, setAmendTradeSideInput] = useState('BUY')
  const [amendBookInput, setAmendBookInput] = useState('')
  const [amendCommodityClassInput, setAmendCommodityClassInput] = useState('')
  const [amendCommodityInput, setAmendCommodityInput] = useState('')
  const [amendPricingTypeInput, setAmendPricingTypeInput] = useState('FIXED')
  const [amendPriceIndexInput, setAmendPriceIndexInput] = useState('')
  const [amendPriceInput, setAmendPriceInput] = useState('')
  const [amendVolumeInput, setAmendVolumeInput] = useState('')
  const [amendLegs, setAmendLegs] = useState<TradeLegDraft[]>([
    makeLegDraft({ leg_no: 1 }),
    makeLegDraft({ leg_no: 2, side: 'SELL' }),
  ])
  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function loadData() {
    const [healthRes, tradesRes, eventsRes, positionsRes, booksRes, commoditiesRes, priceIndicesRes, currenciesRes, unitsRes, locationsRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/trades`),
      fetch(`${API_BASE}/events?limit=100`),
      fetch(`${API_BASE}/positions`),
      fetch(`${API_BASE}/reference/books?limit=500`),
      fetch(`${API_BASE}/reference/commodities?limit=500`),
      fetch(`${API_BASE}/reference/price-indices?limit=500`),
      fetch(`${API_BASE}/reference/currencies?limit=500`),
      fetch(`${API_BASE}/reference/units?limit=500`),
      fetch(`${API_BASE}/reference/locations?limit=500`),
    ])

    if (
      !healthRes.ok ||
      !tradesRes.ok ||
      !eventsRes.ok ||
      !positionsRes.ok ||
      !booksRes.ok ||
      !commoditiesRes.ok ||
      !priceIndicesRes.ok ||
      !currenciesRes.ok ||
      !unitsRes.ok ||
      !locationsRes.ok
    ) {
      throw new Error('API request failed')
    }

    const healthJson = await healthRes.json()
    const tradesJson = await tradesRes.json()
    const eventsJson = await eventsRes.json()
    const positionsJson = await positionsRes.json()
    const booksJson = await booksRes.json()
    const commoditiesJson = await commoditiesRes.json()
    const priceIndicesJson = await priceIndicesRes.json()
    const currenciesJson = await currenciesRes.json()
    const unitsJson = await unitsRes.json()
    const locationsJson = await locationsRes.json()

    setHealth(healthJson.status ?? 'unknown')
    setTrades(tradesJson)
    setEvents(eventsJson)
    setPositions(positionsJson)
    setBooks(booksJson)
    setCommodities(commoditiesJson)
    setPriceIndices(priceIndicesJson)
    setCurrencies(currenciesJson)
    setUnits(unitsJson)
    setLocations(locationsJson)
    setReferenceDataLoading(false)
    setAppLoading(false)
    setReferenceDataError('')

    if (tradesJson.length > 0) {
      setSelectedTradeId((current) => {
        const stillExists = tradesJson.some((trade: Trade) => trade.trade_id === current)
        return stillExists ? current : tradesJson[0].trade_id
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

  const createCommodityOptions = useMemo(
    () => activeCommodities.filter((commodity) => commodity.commodity_class === commodityClassInput),
    [activeCommodities, commodityClassInput],
  )
  const createPriceIndexOptions = useMemo(
    () =>
      priceIndices.filter(
        (priceIndex) => priceIndex.is_active && (!commodityInput || priceIndex.commodity_code === commodityInput),
      ),
    [commodityInput, priceIndices],
  )

  const amendCommodityOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeCommodities.filter((commodity) => commodity.commodity_class === amendCommodityClassInput),
        amendCommodityInput,
        amendCommodityClassInput,
        'Current inactive or missing commodity',
      ),
    [activeCommodities, amendCommodityClassInput, amendCommodityInput],
  )
  const amendPriceIndexOptions = useMemo(
    () =>
      ensureCurrentOption(
        priceIndices.filter(
          (priceIndex) => priceIndex.is_active && (!amendCommodityInput || priceIndex.commodity_code === amendCommodityInput),
        ),
        amendPriceIndexInput,
        '',
        'Current inactive or missing price index',
      ),
    [amendCommodityInput, amendPriceIndexInput, priceIndices],
  )

  const amendBookOptions = useMemo(
    () => ensureCurrentOption(activeBooks, amendBookInput, '', 'Current inactive or missing book'),
    [activeBooks, amendBookInput],
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

  const selectedBook = useMemo(
    () => books.find((book) => book.code === selectedBookCode) ?? null,
    [books, selectedBookCode],
  )

  const selectedCommodity = useMemo(
    () => commodities.find((commodity) => commodity.code === selectedCommodityCode) ?? null,
    [commodities, selectedCommodityCode],
  )

  const selectedPriceIndex = useMemo(
    () => priceIndices.find((priceIndex) => priceIndex.code === selectedPriceIndexCode) ?? null,
    [priceIndices, selectedPriceIndexCode],
  )

  const selectedCurrency = useMemo(
    () => currencies.find((currency) => currency.code === selectedCurrencyCode) ?? null,
    [currencies, selectedCurrencyCode],
  )

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.code === selectedUnitCode) ?? null,
    [units, selectedUnitCode],
  )

  const selectedLocation = useMemo(
    () => locations.find((location) => location.code === selectedLocationCode) ?? null,
    [locations, selectedLocationCode],
  )

  const filteredBooks = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return books.filter((book) => {
      if (!query) {
        return true
      }

      return (
        book.code.toLowerCase().includes(query) ||
        book.name.toLowerCase().includes(query) ||
        (book.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [books, referenceSearch])

  const referenceCommodityGroups = useMemo(
    () =>
      COMMODITY_CLASS_ORDER.map((commodityClass) => ({
        commodityClass,
        items: commodities
          .filter((commodity) => commodity.commodity_class === commodityClass)
          .filter((commodity) => {
            const query = referenceSearch.trim().toLowerCase()
            if (!query) {
              return true
            }

            return (
              commodity.code.toLowerCase().includes(query) ||
              commodity.name.toLowerCase().includes(query) ||
              (commodity.description ?? '').toLowerCase().includes(query)
            )
          }),
      })).filter((group) => group.items.length > 0),
    [commodities, referenceSearch],
  )

  const filteredPriceIndices = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return priceIndices.filter((priceIndex) => {
      if (!query) {
        return true
      }

      return (
        priceIndex.code.toLowerCase().includes(query) ||
        priceIndex.name.toLowerCase().includes(query) ||
        priceIndex.provider.toLowerCase().includes(query) ||
        (priceIndex.market ?? '').toLowerCase().includes(query) ||
        priceIndex.commodity_code.toLowerCase().includes(query) ||
        (priceIndex.location_code ?? '').toLowerCase().includes(query) ||
        (priceIndex.calendar_code ?? '').toLowerCase().includes(query) ||
        (priceIndex.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [priceIndices, referenceSearch])

  const filteredCurrencies = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return currencies.filter((currency) => {
      if (!query) return true
      return (
        currency.code.toLowerCase().includes(query) ||
        currency.name.toLowerCase().includes(query) ||
        (currency.symbol ?? '').toLowerCase().includes(query) ||
        (currency.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [currencies, referenceSearch])

  const filteredUnits = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return units.filter((unit) => {
      if (!query) return true
      return (
        unit.code.toLowerCase().includes(query) ||
        unit.name.toLowerCase().includes(query) ||
        unit.dimension.toLowerCase().includes(query) ||
        (unit.commodity_class ?? '').toLowerCase().includes(query) ||
        (unit.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [units, referenceSearch])

  const filteredLocations = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase()
    return locations.filter((location) => {
      if (!query) return true
      return (
        location.code.toLowerCase().includes(query) ||
        location.name.toLowerCase().includes(query) ||
        location.location_type.toLowerCase().includes(query) ||
        (location.market ?? '').toLowerCase().includes(query) ||
        (location.region ?? '').toLowerCase().includes(query) ||
        (location.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [locations, referenceSearch])

  const selectablePriceIndexUnits = useMemo(() => {
    if (!priceIndexForm.commodity_code) {
      return activeUnits
    }

    const commodityClass = classForCommodity(commodities, priceIndexForm.commodity_code)
    const matchingUnits = activeUnits.filter((unit) => !unit.commodity_class || unit.commodity_class === commodityClass)
    return matchingUnits.length > 0 ? matchingUnits : activeUnits
  }, [activeUnits, commodities, priceIndexForm.commodity_code])

  useEffect(() => {
    if (selectedTrade) {
      setAmendTradeNatureInput(selectedTrade.trade_nature ?? 'PHYSICAL')
      setAmendTradeStructureInput(selectedTrade.trade_structure ?? 'SINGLE')
      setAmendTradeSideInput(selectedTrade.trade_side ?? 'BUY')
      setAmendBookInput(selectedTrade.book ?? '')
      setAmendCommodityClassInput(selectedTrade.commodity_class ?? '')
      setAmendCommodityInput(selectedTrade.commodity ?? '')
      setAmendPricingTypeInput(selectedTrade.pricing_type ?? 'FIXED')
      setAmendPriceIndexInput(selectedTrade.price_index_code ?? '')
      setAmendPriceInput(selectedTrade.price?.toString() ?? '')
      setAmendVolumeInput(selectedTrade.volume?.toString() ?? '')

      const latestLegs =
        selectedTradeEvents.find(
          (event) =>
            event.event_type === 'TradeAmended' || event.event_type === 'TradeCreated',
        )?.payload ?? null
      const parsedLegs = parseLegsFromPayload(latestLegs)
      setAmendLegs(
        parsedLegs.length > 0
          ? parsedLegs
          : [
              makeLegDraft({
                leg_no: 1,
                side: selectedTrade.trade_side ?? 'BUY',
                commodity_class: selectedTrade.commodity_class,
                commodity: selectedTrade.commodity,
                volume: selectedTrade.volume?.toString() ?? '',
              }),
              makeLegDraft({ leg_no: 2, side: 'SELL', commodity_class: selectedTrade.commodity_class }),
            ],
      )
    }
  }, [selectedTrade, selectedTradeEvents])

  useEffect(() => {
    if (!bookInput && activeBooks.length > 0) {
      setBookInput(activeBooks[0].code)
    }
  }, [activeBooks, bookInput])

  useEffect(() => {
    if (!commodityClassInput && commodityClassOptions.length > 0) {
      setCommodityClassInput(commodityClassOptions[0])
    }
  }, [commodityClassInput, commodityClassOptions])

  useEffect(() => {
    if (!selectedTrade && !amendBookInput && activeBooks.length > 0) {
      setAmendBookInput(activeBooks[0].code)
    }
  }, [activeBooks, amendBookInput, selectedTrade])

  useEffect(() => {
    if (!selectedTrade && !amendCommodityClassInput && commodityClassOptions.length > 0) {
      setAmendCommodityClassInput(commodityClassOptions[0])
    }
  }, [amendCommodityClassInput, commodityClassOptions, selectedTrade])

  useEffect(() => {
    if (!commodityClassInput) {
      return
    }
    if (!createCommodityOptions.some((commodity) => commodity.code === commodityInput)) {
      setCommodityInput(createCommodityOptions[0]?.code ?? '')
    }
  }, [commodityClassInput, commodityInput, createCommodityOptions])

  useEffect(() => {
    if (pricingTypeInput === 'FIXED' || pricingTypeInput === 'FORMULA') {
      setPriceIndexInput('')
      return
    }
    if (!createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)) {
      setPriceIndexInput(createPriceIndexOptions[0]?.code ?? '')
    }
  }, [createPriceIndexOptions, priceIndexInput, pricingTypeInput])

  useEffect(() => {
    if (!amendCommodityClassInput) {
      return
    }
    if (!amendCommodityOptions.some((commodity) => commodity.code === amendCommodityInput)) {
      setAmendCommodityInput(amendCommodityOptions[0]?.code ?? '')
    }
  }, [amendCommodityClassInput, amendCommodityInput, amendCommodityOptions])

  useEffect(() => {
    if (amendPricingTypeInput === 'FIXED' || amendPricingTypeInput === 'FORMULA') {
      setAmendPriceIndexInput('')
      return
    }
    if (!amendPriceIndexOptions.some((priceIndex) => priceIndex.code === amendPriceIndexInput)) {
      setAmendPriceIndexInput(amendPriceIndexOptions[0]?.code ?? '')
    }
  }, [amendPriceIndexInput, amendPriceIndexOptions, amendPricingTypeInput])

  useEffect(() => {
    if (!selectedBookCode && books.length > 0) {
      setSelectedBookCode(books[0].code)
    }
  }, [books, selectedBookCode])

  useEffect(() => {
    if (!selectedCommodityCode && commodities.length > 0) {
      setSelectedCommodityCode(commodities[0].code)
    }
  }, [commodities, selectedCommodityCode])

  useEffect(() => {
    if (!selectedPriceIndexCode && priceIndices.length > 0) {
      setSelectedPriceIndexCode(priceIndices[0].code)
    }
  }, [priceIndices, selectedPriceIndexCode])

  useEffect(() => {
    if (!selectedCurrencyCode && currencies.length > 0) {
      setSelectedCurrencyCode(currencies[0].code)
    }
  }, [currencies, selectedCurrencyCode])

  useEffect(() => {
    if (!selectedUnitCode && units.length > 0) {
      setSelectedUnitCode(units[0].code)
    }
  }, [units, selectedUnitCode])

  useEffect(() => {
    if (!selectedLocationCode && locations.length > 0) {
      setSelectedLocationCode(locations[0].code)
    }
  }, [locations, selectedLocationCode])

  useEffect(() => {
    if (!priceIndexForm.commodity_code && activeCommodities.length > 0) {
      setPriceIndexForm((current) => ({ ...current, commodity_code: activeCommodities[0].code }))
    }
  }, [activeCommodities, priceIndexForm.commodity_code])

  useEffect(() => {
    if (!activeCurrencies.some((currency) => currency.code === priceIndexForm.currency_code)) {
      setPriceIndexForm((current) => ({ ...current, currency_code: activeCurrencies[0]?.code ?? '' }))
    }
  }, [activeCurrencies, priceIndexForm.currency_code])

  useEffect(() => {
    if (!selectablePriceIndexUnits.some((unit) => unit.code === priceIndexForm.unit_code)) {
      setPriceIndexForm((current) => ({ ...current, unit_code: selectablePriceIndexUnits[0]?.code ?? '' }))
    }
  }, [priceIndexForm.unit_code, selectablePriceIndexUnits])

  useEffect(() => {
    if (priceIndexForm.location_code && !activeLocations.some((location) => location.code === priceIndexForm.location_code)) {
      setPriceIndexForm((current) => ({ ...current, location_code: '' }))
    }
  }, [activeLocations, priceIndexForm.location_code])

  useEffect(() => {
    if (bookFormMode === 'edit' && selectedBook) {
      setBookForm({
        code: selectedBook.code,
        name: selectedBook.name,
        description: selectedBook.description ?? '',
      })
    }
  }, [bookFormMode, selectedBook])

  useEffect(() => {
    if (commodityFormMode === 'edit' && selectedCommodity) {
      setCommodityForm({
        code: selectedCommodity.code,
        name: selectedCommodity.name,
        description: selectedCommodity.description ?? '',
        commodity_class: selectedCommodity.commodity_class ?? COMMODITY_CLASS_ORDER[0],
      })
    }
  }, [commodityFormMode, selectedCommodity])

  useEffect(() => {
    if (priceIndexFormMode === 'edit' && selectedPriceIndex) {
      setPriceIndexForm({
        code: selectedPriceIndex.code,
        name: selectedPriceIndex.name,
        description: selectedPriceIndex.description ?? '',
        commodity_code: selectedPriceIndex.commodity_code,
        currency_code: selectedPriceIndex.currency_code,
        unit_code: selectedPriceIndex.unit_code,
        provider: selectedPriceIndex.provider,
        market: selectedPriceIndex.market ?? '',
        location_code: selectedPriceIndex.location_code ?? '',
        calendar_code: selectedPriceIndex.calendar_code ?? '',
      })
    }
  }, [priceIndexFormMode, selectedPriceIndex])

  useEffect(() => {
    if (currencyFormMode === 'edit' && selectedCurrency) {
      setCurrencyForm({
        code: selectedCurrency.code,
        name: selectedCurrency.name,
        symbol: selectedCurrency.symbol ?? '',
        description: selectedCurrency.description ?? '',
      })
    }
  }, [currencyFormMode, selectedCurrency])

  useEffect(() => {
    if (unitFormMode === 'edit' && selectedUnit) {
      setUnitForm({
        code: selectedUnit.code,
        name: selectedUnit.name,
        commodity_class: selectedUnit.commodity_class ?? COMMODITY_CLASS_ORDER[0],
        dimension: selectedUnit.dimension,
        base_unit_code: selectedUnit.base_unit_code ?? '',
        conversion_factor: selectedUnit.conversion_factor?.toString() ?? '',
        precision: String(selectedUnit.precision),
        description: selectedUnit.description ?? '',
      })
    }
  }, [unitFormMode, selectedUnit])

  useEffect(() => {
    if (locationFormMode === 'edit' && selectedLocation) {
      setLocationForm({
        code: selectedLocation.code,
        name: selectedLocation.name,
        location_type: selectedLocation.location_type,
        market: selectedLocation.market ?? '',
        country_code: selectedLocation.country_code ?? '',
        region: selectedLocation.region ?? '',
        timezone: selectedLocation.timezone ?? '',
        description: selectedLocation.description ?? '',
      })
    }
  }, [locationFormMode, selectedLocation])

  function resetReferenceMessages() {
    setReferenceActionError('')
    setReferenceActionSuccess('')
  }

  function startCreateBook() {
    resetReferenceMessages()
    setBookFormMode('create')
    setBookForm(emptyBookForm())
  }

  function startEditBook(code: string) {
    resetReferenceMessages()
    setSelectedBookCode(code)
    setBookFormMode('edit')
  }

  function startCreateCommodity() {
    resetReferenceMessages()
    setCommodityFormMode('create')
    setCommodityForm(emptyCommodityForm(selectedCommodity?.commodity_class ?? COMMODITY_CLASS_ORDER[0]))
  }

  function startEditCommodity(code: string) {
    resetReferenceMessages()
    setSelectedCommodityCode(code)
    setCommodityFormMode('edit')
  }

  function startCreatePriceIndex() {
    resetReferenceMessages()
    setPriceIndexFormMode('create')
    setPriceIndexForm(emptyPriceIndexForm(activeCommodities[0]?.code ?? ''))
  }

  function startEditPriceIndex(code: string) {
    resetReferenceMessages()
    setSelectedPriceIndexCode(code)
    setPriceIndexFormMode('edit')
  }

  function startCreateCurrency() {
    resetReferenceMessages()
    setCurrencyFormMode('create')
    setCurrencyForm(emptyCurrencyForm())
  }

  function startEditCurrency(code: string) {
    resetReferenceMessages()
    setSelectedCurrencyCode(code)
    setCurrencyFormMode('edit')
  }

  function startCreateUnit() {
    resetReferenceMessages()
    setUnitFormMode('create')
    setUnitForm(emptyUnitForm(selectedCommodity?.commodity_class ?? COMMODITY_CLASS_ORDER[0]))
  }

  function startEditUnit(code: string) {
    resetReferenceMessages()
    setSelectedUnitCode(code)
    setUnitFormMode('edit')
  }

  function startCreateLocation() {
    resetReferenceMessages()
    setLocationFormMode('create')
    setLocationForm(emptyLocationForm())
  }

  function startEditLocation(code: string) {
    resetReferenceMessages()
    setSelectedLocationCode(code)
    setLocationFormMode('edit')
  }

  async function submitReference(
    path: string,
    method: 'POST' | 'PUT',
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingReference(true)
    resetReferenceMessages()

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Reference update failed')
      }

      await loadData()
      setReferenceActionSuccess(successMessage)
    } catch (err) {
      setReferenceActionError(err instanceof Error ? err.message : 'Reference update failed.')
    } finally {
      setSavingReference(false)
    }
  }

  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault()

    if (!bookForm.code.trim() || !bookForm.name.trim()) {
      setReferenceActionError('Book code and name are required.')
      return
    }

    if (bookFormMode === 'create') {
      await submitReference(
        '/reference/books',
        'POST',
        {
          code: bookForm.code.trim().toUpperCase(),
          name: bookForm.name.trim(),
          description: bookForm.description.trim() || null,
          created_by: USER_ID,
        },
        `Book ${bookForm.code.trim().toUpperCase()} created.`,
      )
      setSelectedBookCode(bookForm.code.trim().toUpperCase())
      setBookFormMode('edit')
    } else if (selectedBook) {
      await submitReference(
        `/reference/books/${selectedBook.code}`,
        'PUT',
        {
          name: bookForm.name.trim(),
          description: bookForm.description.trim() || null,
          updated_by: USER_ID,
        },
        `Book ${selectedBook.code} updated.`,
      )
    }
  }

  async function handleSaveCommodity(e: React.FormEvent) {
    e.preventDefault()

    if (!commodityForm.code.trim() || !commodityForm.name.trim() || !commodityForm.commodity_class) {
      setReferenceActionError('Commodity code, name, and commodity class are required.')
      return
    }

    if (commodityFormMode === 'create') {
      await submitReference(
        '/reference/commodities',
        'POST',
        {
          code: commodityForm.code.trim().toUpperCase(),
          name: commodityForm.name.trim(),
          description: commodityForm.description.trim() || null,
          commodity_class: commodityForm.commodity_class,
          created_by: USER_ID,
        },
        `Commodity ${commodityForm.code.trim().toUpperCase()} created.`,
      )
      setSelectedCommodityCode(commodityForm.code.trim().toUpperCase())
      setCommodityFormMode('edit')
    } else if (selectedCommodity) {
      await submitReference(
        `/reference/commodities/${selectedCommodity.code}`,
        'PUT',
        {
          name: commodityForm.name.trim(),
          description: commodityForm.description.trim() || null,
          commodity_class: commodityForm.commodity_class,
          updated_by: USER_ID,
        },
        `Commodity ${selectedCommodity.code} updated.`,
      )
    }
  }

  async function handleToggleBook(record: ReferenceRecord) {
    await submitReference(
      `/reference/books/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: USER_ID },
      `Book ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleToggleCommodity(record: ReferenceRecord) {
    await submitReference(
      `/reference/commodities/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: USER_ID },
      `Commodity ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSavePriceIndex(e: React.FormEvent) {
    e.preventDefault()

    if (
      !priceIndexForm.code.trim() ||
      !priceIndexForm.name.trim() ||
      !priceIndexForm.commodity_code ||
      !priceIndexForm.currency_code.trim() ||
      !priceIndexForm.unit_code.trim() ||
      !priceIndexForm.provider.trim()
    ) {
      setReferenceActionError('Price index code, name, commodity, currency, unit, and provider are required.')
      return
    }

    const payload = {
      code: priceIndexForm.code.trim().toUpperCase(),
      name: priceIndexForm.name.trim(),
      description: priceIndexForm.description.trim() || null,
      commodity_code: priceIndexForm.commodity_code,
      currency_code: priceIndexForm.currency_code.trim().toUpperCase(),
      unit_code: priceIndexForm.unit_code.trim().toUpperCase(),
      provider: priceIndexForm.provider.trim(),
      market: priceIndexForm.market.trim() || null,
      location_code: priceIndexForm.location_code.trim().toUpperCase() || null,
      calendar_code: priceIndexForm.calendar_code.trim().toUpperCase() || null,
    }

    if (priceIndexFormMode === 'create') {
      await submitReference(
        '/reference/price-indices',
        'POST',
        {
          ...payload,
          created_by: USER_ID,
        },
        `Price index ${payload.code} created.`,
      )
      setSelectedPriceIndexCode(payload.code)
      setPriceIndexFormMode('edit')
    } else if (selectedPriceIndex) {
      await submitReference(
        `/reference/price-indices/${selectedPriceIndex.code}`,
        'PUT',
        {
          ...payload,
          updated_by: USER_ID,
        },
        `Price index ${selectedPriceIndex.code} updated.`,
      )
    }
  }

  async function handleTogglePriceIndex(record: PriceIndexRecord) {
    await submitReference(
      `/reference/price-indices/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: USER_ID },
      `Price index ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveCurrency(e: React.FormEvent) {
    e.preventDefault()
    if (!currencyForm.code.trim() || !currencyForm.name.trim()) {
      setReferenceActionError('Currency code and name are required.')
      return
    }

    const payload = {
      code: currencyForm.code.trim().toUpperCase(),
      name: currencyForm.name.trim(),
      symbol: currencyForm.symbol.trim() || null,
      description: currencyForm.description.trim() || null,
    }

    if (currencyFormMode === 'create') {
      await submitReference('/reference/currencies', 'POST', { ...payload, created_by: USER_ID }, `Currency ${payload.code} created.`)
      setSelectedCurrencyCode(payload.code)
      setCurrencyFormMode('edit')
    } else if (selectedCurrency) {
      await submitReference(`/reference/currencies/${selectedCurrency.code}`, 'PUT', { ...payload, updated_by: USER_ID }, `Currency ${selectedCurrency.code} updated.`)
    }
  }

  async function handleToggleCurrency(record: CurrencyRecord) {
    await submitReference(`/reference/currencies/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`, 'POST', { updated_by: USER_ID }, `Currency ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`)
  }

  async function handleSaveUnit(e: React.FormEvent) {
    e.preventDefault()
    if (!unitForm.code.trim() || !unitForm.name.trim() || !unitForm.dimension.trim()) {
      setReferenceActionError('Unit code, name, and dimension are required.')
      return
    }

    const payload = {
      code: unitForm.code.trim().toUpperCase(),
      name: unitForm.name.trim(),
      commodity_class: unitForm.commodity_class || null,
      dimension: unitForm.dimension.trim().toUpperCase(),
      base_unit_code: unitForm.base_unit_code.trim().toUpperCase() || null,
      conversion_factor: unitForm.conversion_factor.trim() ? Number(unitForm.conversion_factor) : null,
      precision: Number(unitForm.precision || '3'),
      description: unitForm.description.trim() || null,
    }

    if (Number.isNaN(payload.precision) || (payload.conversion_factor !== null && Number.isNaN(payload.conversion_factor))) {
      setReferenceActionError('Unit precision and conversion factor must be numeric.')
      return
    }

    if (unitFormMode === 'create') {
      await submitReference('/reference/units', 'POST', { ...payload, created_by: USER_ID }, `Unit ${payload.code} created.`)
      setSelectedUnitCode(payload.code)
      setUnitFormMode('edit')
    } else if (selectedUnit) {
      await submitReference(`/reference/units/${selectedUnit.code}`, 'PUT', { ...payload, updated_by: USER_ID }, `Unit ${selectedUnit.code} updated.`)
    }
  }

  async function handleToggleUnit(record: UnitRecord) {
    await submitReference(`/reference/units/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`, 'POST', { updated_by: USER_ID }, `Unit ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`)
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!locationForm.code.trim() || !locationForm.name.trim() || !locationForm.location_type.trim()) {
      setReferenceActionError('Location code, name, and location type are required.')
      return
    }

    const payload = {
      code: locationForm.code.trim().toUpperCase(),
      name: locationForm.name.trim(),
      location_type: locationForm.location_type.trim().toUpperCase(),
      market: locationForm.market.trim() || null,
      country_code: locationForm.country_code.trim().toUpperCase() || null,
      region: locationForm.region.trim() || null,
      timezone: locationForm.timezone.trim() || null,
      description: locationForm.description.trim() || null,
    }

    if (locationFormMode === 'create') {
      await submitReference('/reference/locations', 'POST', { ...payload, created_by: USER_ID }, `Location ${payload.code} created.`)
      setSelectedLocationCode(payload.code)
      setLocationFormMode('edit')
    } else if (selectedLocation) {
      await submitReference(`/reference/locations/${selectedLocation.code}`, 'PUT', { ...payload, updated_by: USER_ID }, `Location ${selectedLocation.code} updated.`)
    }
  }

  async function handleToggleLocation(record: LocationRecord) {
    await submitReference(`/reference/locations/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`, 'POST', { updated_by: USER_ID }, `Location ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`)
  }

  function updateDraftLeg(
    mode: 'create' | 'amend',
    index: number,
    field: keyof TradeLegDraft,
    value: string,
  ) {
    const setter = mode === 'create' ? setCreateLegs : setAmendLegs
    setter((current) =>
      current.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: field === 'leg_no' ? Number(value) || leg.leg_no : value,
            }
          : leg,
      ),
    )
  }

  function addDraftLeg(mode: 'create' | 'amend') {
    const setter = mode === 'create' ? setCreateLegs : setAmendLegs
    setter((current) => [
      ...current,
      makeLegDraft({ leg_no: current.length + 1, side: current.length % 2 === 0 ? 'BUY' : 'SELL' }),
    ])
  }

  function removeDraftLeg(mode: 'create' | 'amend', index: number) {
    const setter = mode === 'create' ? setCreateLegs : setAmendLegs
    setter((current) =>
      current
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, legIndex) => ({ ...leg, leg_no: legIndex + 1 })),
    )
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
      setTradeIdInput('')
      setTradeNatureInput('PHYSICAL')
      setTradeStructureInput('SINGLE')
      setTradeSideInput('BUY')
      setBookInput(activeBooks[0]?.code ?? '')
      setCommodityClassInput(commodityClassOptions[0] ?? '')
      setCommodityInput('')
      setPricingTypeInput('FIXED')
      setPriceIndexInput('')
      setPriceInput('80.00')
      setVolumeInput('1000')
      setCreateLegs([makeLegDraft({ leg_no: 1 }), makeLegDraft({ leg_no: 2, side: 'SELL' })])
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
          <div className="dashboard-grid">
            <section className="surface feature-panel">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Capture</span>
                  <h3>Create Trade</h3>
                </div>
                <p>Get to entry quickly. The main capture flow now carries more visual priority than the page framing.</p>
              </div>

              <TradeCaptureForm
                onSubmit={handleCreateTrade}
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
                addDraftLeg={() => addDraftLeg('create')}
                removeDraftLeg={(index) => removeDraftLeg('create', index)}
                updateDraftLeg={(index, field, value) => updateDraftLeg('create', index, field, value)}
                submitting={submitting}
                referenceDataLoading={referenceDataLoading}
                hasReferenceOptions={hasReferenceOptions}
                createError={createError}
                tradeNatureOptions={TRADE_NATURE_OPTIONS}
                tradeStructureOptions={TRADE_STRUCTURE_OPTIONS}
                tradeSideOptions={TRADE_SIDE_OPTIONS}
                pricingTypeOptions={PRICING_TYPE_OPTIONS}
                formatCommodityClass={formatCommodityClass}
              />
            </section>

            <section className="stack">
              <article className="surface">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Exposure</span>
                    <h3>Position Snapshot</h3>
                  </div>
                  <p>Class-level overview first, detailed rows later.</p>
                </div>

                {appLoading ? (
                  <div className="skeleton-stack">
                    <div className="skeleton-block" />
                    <div className="skeleton-block" />
                  </div>
                ) : positionsByClass.length > 0 ? (
                  <div className="position-class-grid">
                    {positionsByClass.map((row) => (
                      <article key={row.commodityClass} className="position-class-card">
                        <span>{formatCommodityClass(row.commodityClass)}</span>
                        <strong>{formatNumber(row.netVolume, 0)}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No open exposure</strong>
                    <p>The system is healthy, but there are no active trades contributing exposure yet.</p>
                  </div>
                )}
              </article>

              <article className="surface">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Activity</span>
                    <h3>Recent Timeline</h3>
                  </div>
                  <p>The latest event flow without leaving the dashboard.</p>
                </div>
                <div className="timeline">
                  {events.slice(0, 5).length > 0 ? (
                    events.slice(0, 5).map((event) => (
                      <article key={event.event_id} className="timeline-item">
                        <div className="timeline-dot" />
                        <div className="timeline-body">
                          <div className="timeline-head">
                            <strong>{event.event_type}</strong>
                            <span>{formatDate(event.recorded_at)}</span>
                          </div>
                          <p>
                            {event.aggregate_id} • {event.aggregate_type}
                          </p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <strong>No recent events</strong>
                      <p>Create or amend a trade to start building the operational timeline.</p>
                    </div>
                  )}
                </div>
              </article>
            </section>
          </div>
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
            addDraftLeg={() => addDraftLeg('amend')}
            removeDraftLeg={(index: number) => removeDraftLeg('amend', index)}
            updateDraftLeg={(index: number, field: keyof TradeLegDraft, value: string) =>
              updateDraftLeg('amend', index, field, value)
            }
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
          <section className="surface">
            <div className="section-head section-head-control">
              <div>
                <span className="eyebrow">Timeline</span>
                <h3>Recent Events</h3>
              </div>
              <div className="toolbar">
                <select className="control control-compact" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
                  <option value="ALL">All events</option>
                  <option value="SELECTED">Selected trade</option>
                  <option value="TradeCreated">TradeCreated</option>
                  <option value="TradeAmended">TradeAmended</option>
                  <option value="TradeCancelled">TradeCancelled</option>
                </select>
              </div>
            </div>

            <div className="timeline timeline-large">
              {filteredEvents.map((event) => (
                <article key={event.event_id} className="timeline-item timeline-item-card">
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{event.event_type}</strong>
                      <span>{formatDate(event.recorded_at)}</span>
                    </div>
                    <p>
                      {event.aggregate_id} • {event.aggregate_type}
                    </p>
                    <div className="timeline-meta">
                      <span>Actor {event.actor_id ?? 'system'}</span>
                      <span>Schema v{event.schema_version}</span>
                      <span>{event.correlation_id ?? 'No correlation id'}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {currentView === 'positions' && (
          <div className="stack">
            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Grouped View</span>
                  <h3>Exposure by Commodity Class</h3>
                </div>
                <p>A top-level risk summary before you inspect exact line items.</p>
              </div>
              {positionsByClass.length > 0 ? (
                <div className="position-class-grid">
                  {positionsByClass.map((row) => (
                    <article key={row.commodityClass} className="position-class-card">
                      <span>{formatCommodityClass(row.commodityClass)}</span>
                      <strong>{formatNumber(row.netVolume, 0)}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No positions</strong>
                  <p>Create active trades to populate this risk surface.</p>
                </div>
              )}
            </section>

            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Detailed View</span>
                  <h3>Commodity Rows</h3>
                </div>
                <p>Exact commodity-level net volume currently held in the projection.</p>
              </div>
              <div className="position-list">
                {positionsWithClass.map((position) => (
                  <article key={position.commodity} className="position-card">
                    <div>
                      <strong>{position.commodity}</strong>
                      <span>{formatCommodityClass(position.commodity_class)}</span>
                    </div>
                    <div className="position-value">
                      <b>{formatNumber(position.net_volume, 0)}</b>
                      <span>{formatDate(position.updated_at)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {currentView === 'reference' && (
          <ReferenceDataWorkspace
            referenceTab={referenceTab}
            setReferenceTab={setReferenceTab}
            referenceSearch={referenceSearch}
            setReferenceSearch={setReferenceSearch}
            filteredBooks={filteredBooks}
            selectedBookCode={selectedBookCode}
            startEditBook={startEditBook}
            referenceCommodityGroups={referenceCommodityGroups}
            selectedCommodityCode={selectedCommodityCode}
            startEditCommodity={startEditCommodity}
            filteredPriceIndices={filteredPriceIndices}
            selectedPriceIndexCode={selectedPriceIndexCode}
            startEditPriceIndex={startEditPriceIndex}
            filteredCurrencies={filteredCurrencies}
            selectedCurrencyCode={selectedCurrencyCode}
            startEditCurrency={startEditCurrency}
            filteredUnits={filteredUnits}
            selectedUnitCode={selectedUnitCode}
            startEditUnit={startEditUnit}
            filteredLocations={filteredLocations}
            selectedLocationCode={selectedLocationCode}
            startEditLocation={startEditLocation}
            referenceActionError={referenceActionError}
            referenceActionSuccess={referenceActionSuccess}
            savingReference={savingReference}
            selectedBook={selectedBook}
            bookFormMode={bookFormMode}
            bookForm={bookForm}
            setBookForm={setBookForm}
            startCreateBook={startCreateBook}
            handleSaveBook={handleSaveBook}
            handleToggleBook={handleToggleBook}
            selectedCommodity={selectedCommodity}
            commodityFormMode={commodityFormMode}
            commodityForm={commodityForm}
            setCommodityForm={setCommodityForm}
            startCreateCommodity={startCreateCommodity}
            handleSaveCommodity={handleSaveCommodity}
            handleToggleCommodity={handleToggleCommodity}
            selectedPriceIndex={selectedPriceIndex}
            priceIndexFormMode={priceIndexFormMode}
            priceIndexForm={priceIndexForm}
            setPriceIndexForm={setPriceIndexForm}
            startCreatePriceIndex={startCreatePriceIndex}
            handleSavePriceIndex={handleSavePriceIndex}
            handleTogglePriceIndex={handleTogglePriceIndex}
            activeCommodities={activeCommodities}
            activeCurrencies={activeCurrencies}
            selectablePriceIndexUnits={selectablePriceIndexUnits}
            activeLocations={activeLocations}
            selectedCurrency={selectedCurrency}
            currencyFormMode={currencyFormMode}
            currencyForm={currencyForm}
            setCurrencyForm={setCurrencyForm}
            startCreateCurrency={startCreateCurrency}
            handleSaveCurrency={handleSaveCurrency}
            handleToggleCurrency={handleToggleCurrency}
            selectedUnit={selectedUnit}
            unitFormMode={unitFormMode}
            unitForm={unitForm}
            setUnitForm={setUnitForm}
            startCreateUnit={startCreateUnit}
            handleSaveUnit={handleSaveUnit}
            handleToggleUnit={handleToggleUnit}
            selectedLocation={selectedLocation}
            locationFormMode={locationFormMode}
            locationForm={locationForm}
            setLocationForm={setLocationForm}
            startCreateLocation={startCreateLocation}
            handleSaveLocation={handleSaveLocation}
            handleToggleLocation={handleToggleLocation}
            commodityClassOrder={COMMODITY_CLASS_ORDER}
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
