import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Trade = {
  trade_id: string
  created_at: string
  updated_at: string
  book: string
  commodity_class: string
  commodity: string
  price: number | null
  volume: number | null
  status: string
  last_event_id: string
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

type ReferenceOption = {
  code: string
  commodity_class: string
  name: string
  is_active: boolean
}

const API_BASE = 'http://localhost:8000'
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

function formatDate(value: string | null): string {
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

function statusTone(status: string): 'active' | 'cancelled' {
  return status === 'CANCELLED' ? 'cancelled' : 'active'
}

function formatCommodityClass(value: string): string {
  return value.replaceAll('_', ' ')
}

function ensureCurrentOption(
  options: ReferenceOption[],
  currentValue: string,
  currentClass: string,
  fallbackLabel: string,
): ReferenceOption[] {
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

export default function App() {
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [books, setBooks] = useState<ReferenceOption[]>([])
  const [commodities, setCommodities] = useState<ReferenceOption[]>([])
  const [error, setError] = useState<string>('')
  const [referenceDataError, setReferenceDataError] = useState<string>('')
  const [referenceDataLoading, setReferenceDataLoading] = useState(true)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)

  const [tradeIdInput, setTradeIdInput] = useState('')
  const [bookInput, setBookInput] = useState('')
  const [commodityClassInput, setCommodityClassInput] = useState('')
  const [commodityInput, setCommodityInput] = useState('')
  const [priceInput, setPriceInput] = useState('80.00')
  const [volumeInput, setVolumeInput] = useState('1000')
  const [submitting, setSubmitting] = useState(false)

  const [amendBookInput, setAmendBookInput] = useState('')
  const [amendCommodityClassInput, setAmendCommodityClassInput] = useState('')
  const [amendCommodityInput, setAmendCommodityInput] = useState('')
  const [amendPriceInput, setAmendPriceInput] = useState('')
  const [amendVolumeInput, setAmendVolumeInput] = useState('')
  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const hasReferenceOptions = books.length > 0 && commodities.length > 0

  async function loadData() {
    const [healthRes, tradesRes, eventsRes, positionsRes, booksRes, commoditiesRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/trades`),
      fetch(`${API_BASE}/events?limit=50`),
      fetch(`${API_BASE}/positions`),
      fetch(`${API_BASE}/reference/books?is_active=true&limit=500`),
      fetch(`${API_BASE}/reference/commodities?is_active=true&limit=500`),
    ])

    if (!healthRes.ok || !tradesRes.ok || !eventsRes.ok || !positionsRes.ok) {
      throw new Error('API request failed')
    }

    const healthJson = await healthRes.json()
    const tradesJson = await tradesRes.json()
    const eventsJson = await eventsRes.json()
    const positionsJson = await positionsRes.json()
    const booksJson = booksRes.ok ? await booksRes.json() : []
    const commoditiesJson = commoditiesRes.ok ? await commoditiesRes.json() : []

    setHealth(healthJson.status ?? 'unknown')
    setTrades(tradesJson)
    setEvents(eventsJson)
    setPositions(positionsJson)
    setBooks(booksJson)
    setCommodities(commoditiesJson)
    setReferenceDataLoading(false)

    if (booksRes.ok && commoditiesRes.ok) {
      setReferenceDataError('')
    } else {
      setReferenceDataError('Reference data is unavailable. Trade entry requires active books and commodities.')
    }

    if (tradesJson.length > 0) {
      setSelectedTradeId((current) => {
        const stillExists = tradesJson.some((t: Trade) => t.trade_id === current)
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
        setError('Could not reach API. Make sure backend is running on localhost:8000 and CORS is enabled.')
      }
    }

    init()
  }, [])

  const selectedTrade = useMemo(
    () => trades.find((t) => t.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  const selectedTradeEvents = useMemo(
    () =>
      events.filter(
        (e) => e.aggregate_type === 'trade' && e.aggregate_id === selectedTradeId,
      ),
    [events, selectedTradeId],
  )

  const activeTrades = useMemo(
    () => trades.filter((trade) => trade.status !== 'CANCELLED'),
    [trades],
  )

  const totalActiveVolume = useMemo(
    () =>
      activeTrades.reduce((sum, trade) => {
        return sum + (trade.volume ?? 0)
      }, 0),
    [activeTrades],
  )

  const trackedBooks = useMemo(
    () => new Set(activeTrades.map((trade) => trade.book)).size,
    [activeTrades],
  )

  const commodityClassOptions = useMemo(
    () =>
      COMMODITY_CLASS_ORDER.filter((commodityClass) =>
        commodities.some((commodity) => commodity.commodity_class === commodityClass),
      ),
    [commodities],
  )

  const createCommodityOptions = useMemo(
    () =>
      commodities.filter((commodity) => commodity.commodity_class === commodityClassInput),
    [commodities, commodityClassInput],
  )

  const amendCommodityOptions = useMemo(
    () =>
      ensureCurrentOption(
        commodities.filter((commodity) => commodity.commodity_class === amendCommodityClassInput),
        amendCommodityInput,
        amendCommodityClassInput,
        'Current inactive or missing commodity',
      ),
    [amendCommodityClassInput, amendCommodityInput, commodities],
  )

  const amendBookOptions = useMemo(
    () => ensureCurrentOption(books, amendBookInput, '', 'Current inactive or missing book'),
    [amendBookInput, books],
  )

  useEffect(() => {
    if (selectedTrade) {
      setAmendBookInput(selectedTrade.book ?? '')
      setAmendCommodityClassInput(selectedTrade.commodity_class ?? '')
      setAmendCommodityInput(selectedTrade.commodity ?? '')
      setAmendPriceInput(selectedTrade.price?.toString() ?? '')
      setAmendVolumeInput(selectedTrade.volume?.toString() ?? '')
    }
  }, [selectedTrade])

  useEffect(() => {
    if (!bookInput && books.length > 0) {
      setBookInput(books[0].code)
    }
  }, [bookInput, books])

  useEffect(() => {
    if (!commodityClassInput && commodityClassOptions.length > 0) {
      setCommodityClassInput(commodityClassOptions[0])
    }
  }, [commodityClassInput, commodityClassOptions])

  useEffect(() => {
    if (!selectedTrade && !amendBookInput && books.length > 0) {
      setAmendBookInput(books[0].code)
    }
  }, [amendBookInput, books, selectedTrade])

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
    if (!amendCommodityClassInput) {
      return
    }
    if (!amendCommodityOptions.some((commodity) => commodity.code === amendCommodityInput)) {
      setAmendCommodityInput(amendCommodityOptions[0]?.code ?? '')
    }
  }, [amendCommodityClassInput, amendCommodityInput, amendCommodityOptions])

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const tradeId = tradeIdInput.trim()
    const book = bookInput
    const commodityClass = commodityClassInput
    const commodity = commodityInput.trim()
    const price = parseRequiredNumber(priceInput)
    const volume = parseRequiredNumber(volumeInput)

    if (!tradeId || !book || !commodityClass || !commodity || price === null || volume === null) {
      setError('Trade ID, book, commodity class, commodity, price, and volume are required.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          aggregate_type: 'trade',
          aggregate_id: tradeId,
          event_type: 'TradeCreated',
          occurred_at: new Date().toISOString(),
          actor_id: 'anthony',
          payload: { book, commodity_class: commodityClass, commodity, price, volume },
          schema_version: 1,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Create trade failed')
      }

      await loadData()
      setSelectedTradeId(tradeId)
      setTradeIdInput('')
      setBookInput(books[0]?.code ?? '')
      setCommodityClassInput(commodityClassOptions[0] ?? '')
      setCommodityInput('')
      setPriceInput('80.00')
      setVolumeInput('1000')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create trade failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAmendTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!selectedTradeId) {
      setError('Select a trade first.')
      return
    }

    const book = amendBookInput
    const commodityClass = amendCommodityClassInput
    const commodity = amendCommodityInput.trim()
    const price = parseRequiredNumber(amendPriceInput)
    const volume = parseRequiredNumber(amendVolumeInput)

    if (!book || !commodityClass || !commodity || price === null || volume === null) {
      setError('Book, commodity class, commodity, price, and volume are required.')
      return
    }

    setAmending(true)

    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          aggregate_type: 'trade',
          aggregate_id: selectedTradeId,
          event_type: 'TradeAmended',
          occurred_at: new Date().toISOString(),
          actor_id: 'anthony',
          payload: { book, commodity_class: commodityClass, commodity, price, volume },
          schema_version: 1,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Amend trade failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Amend trade failed.')
    } finally {
      setAmending(false)
    }
  }

  async function handleCancelTrade() {
    setError('')

    if (!selectedTradeId) {
      setError('Select a trade first.')
      return
    }

    setCancelling(true)

    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          aggregate_type: 'trade',
          aggregate_id: selectedTradeId,
          event_type: 'TradeCancelled',
          occurred_at: new Date().toISOString(),
          actor_id: 'anthony',
          payload: { status: 'CANCELLED' },
          schema_version: 1,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Cancel trade failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel trade failed.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-orb app-orb-left" />
      <div className="app-orb app-orb-right" />

      <aside className="side-rail">
        <div className="brand-lockup">
          <span className="brand-mark">E/CTRM</span>
          <h1>Market Control</h1>
          <p>
            Event-led trade capture with a live projection view for operations,
            amendments, and cancels.
          </p>
        </div>

        <div className="side-card side-card-contrast">
          <span className="eyebrow">Selected Trade</span>
          {selectedTrade ? (
            <>
              <strong className="side-card-title">{selectedTrade.trade_id}</strong>
              <p>
                {selectedTrade.book} • {formatCommodityClass(selectedTrade.commodity_class)} • {selectedTrade.commodity}
              </p>
              <div className={`status-pill status-pill-${statusTone(selectedTrade.status)}`}>
                {selectedTrade.status}
              </div>
            </>
          ) : (
            <>
              <strong className="side-card-title">No trade selected</strong>
              <p>Create a trade or pick one from the board to inspect its event trail.</p>
            </>
          )}
        </div>

        <div className="side-card">
          <span className="eyebrow">Session</span>
          <div className="health-line">
            <span>API</span>
            <strong>{health}</strong>
          </div>
          <div className="health-line">
            <span>Events loaded</span>
            <strong>{events.length}</strong>
          </div>
          <div className="health-line">
            <span>Positions tracked</span>
            <strong>{positions.length}</strong>
          </div>
        </div>
      </aside>

      <main className="main-stage">
        <header className="hero">
          <div>
            <span className="eyebrow">Live local environment</span>
            <h2>Trading overview</h2>
            <p>
              Create, amend, and cancel trades while the read models update in
              place.
            </p>
          </div>

          <div className="hero-badge">
            <span>System health</span>
            <strong>{health}</strong>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="metric-grid">
          <MetricCard
            label="Active trades"
            value={String(activeTrades.length)}
            note={`${trades.length - activeTrades.length} cancelled`}
          />
          <MetricCard
            label="Active volume"
            value={formatNumber(totalActiveVolume, 0)}
            note="Across open trades"
          />
          <MetricCard
            label="Books online"
            value={String(trackedBooks)}
            note="Distinct active books"
          />
          <MetricCard
            label="Latest event"
            value={selectedTradeEvents[0]?.event_type ?? 'No selection'}
            note={selectedTradeEvents[0] ? formatDate(selectedTradeEvents[0].recorded_at) : 'Pick a trade'}
          />
        </section>

        <section className="surface surface-form">
          <div className="section-head">
            <div>
              <span className="eyebrow">Capture</span>
              <h3>Create trade</h3>
            </div>
            <p>Seed a trade into the event stream with a book, commodity class, commodity, price, and volume.</p>
          </div>

          <form className="trade-form" onSubmit={handleCreateTrade}>
            <Field label="Trade ID">
              <input
                value={tradeIdInput}
                onChange={(e) => setTradeIdInput(e.target.value)}
                placeholder="T-0004"
                className="control"
              />
            </Field>
            <Field label="Book">
              <select
                value={bookInput}
                onChange={(e) => setBookInput(e.target.value)}
                className="control"
                disabled={referenceDataLoading || books.length === 0}
              >
                {books.map((book) => (
                  <option key={book.code} value={book.code}>
                    {book.code} · {book.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commodity Class">
              <select
                value={commodityClassInput}
                onChange={(e) => setCommodityClassInput(e.target.value)}
                className="control"
                disabled={referenceDataLoading || commodityClassOptions.length === 0}
              >
                {commodityClassOptions.map((commodityClass) => (
                  <option key={commodityClass} value={commodityClass}>
                    {formatCommodityClass(commodityClass)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commodity">
              <select
                value={commodityInput}
                onChange={(e) => setCommodityInput(e.target.value)}
                className="control"
                disabled={referenceDataLoading || createCommodityOptions.length === 0}
              >
                {createCommodityOptions.map((commodity) => (
                  <option key={commodity.code} value={commodity.code}>
                    {commodity.code} · {commodity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Price">
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="control"
              />
            </Field>
            <Field label="Volume">
              <input
                value={volumeInput}
                onChange={(e) => setVolumeInput(e.target.value)}
                className="control"
              />
            </Field>
            <button
              type="submit"
              disabled={submitting || referenceDataLoading || !hasReferenceOptions}
              className="button button-primary"
            >
              {submitting ? 'Creating…' : 'Create Trade'}
            </button>
          </form>
          {referenceDataLoading ? (
            <p className="form-note">Loading active books and commodity hierarchy…</p>
          ) : null}
          {referenceDataError ? <p className="form-note form-note-error">{referenceDataError}</p> : null}
        </section>

        <section className="workspace-grid">
          <section className="surface">
            <div className="section-head">
              <div>
                <span className="eyebrow">Board</span>
                <h3>Trade ledger</h3>
              </div>
              <p>{trades.length === 0 ? 'No trades yet.' : 'Select a row to load its detail and timeline.'}</p>
            </div>

            <div className="table-shell">
              {trades.length === 0 ? (
                <EmptyState
                  title="No trades loaded"
                  body="Create the first trade to populate the board."
                />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Trade ID', 'Book', 'Commodity Class', 'Commodity', 'Price', 'Volume', 'Status', 'Updated'].map((heading) => (
                        <th key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const selected = trade.trade_id === selectedTradeId
                      return (
                        <tr
                          key={trade.trade_id}
                          className={selected ? 'is-selected' : undefined}
                          onClick={() => setSelectedTradeId(trade.trade_id)}
                        >
                          <td>
                            <strong>{trade.trade_id}</strong>
                          </td>
                          <td>{trade.book}</td>
                          <td>{formatCommodityClass(trade.commodity_class)}</td>
                          <td>{trade.commodity}</td>
                          <td>{formatMoney(trade.price)}</td>
                          <td>{formatNumber(trade.volume, 0)}</td>
                          <td>
                            <span className={`status-pill status-pill-${statusTone(trade.status)}`}>
                              {trade.status}
                            </span>
                          </td>
                          <td>{formatDate(trade.updated_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="stack">
            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Exposure</span>
                  <h3>Positions</h3>
                </div>
                <p>Net active volume by commodity.</p>
              </div>

              <div className="position-list">
                {positions.length === 0 ? (
                  <EmptyState
                    title="No position exposure"
                    body="Open trades will appear here once they carry active volume."
                  />
                ) : (
                  positions.map((position) => (
                    <div key={position.commodity} className="position-card">
                      <div>
                        <strong>{position.commodity}</strong>
                        <span>{formatDate(position.updated_at)}</span>
                      </div>
                      <b>{formatNumber(position.net_volume, 0)}</b>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Detail</span>
                  <h3>Trade profile</h3>
                </div>
                <p>{selectedTrade ? 'Snapshot of the currently selected trade.' : 'Select a trade to inspect it.'}</p>
              </div>

              {selectedTrade ? (
                <div className="detail-list">
                  <DetailRow label="Trade ID" value={selectedTrade.trade_id} />
                  <DetailRow label="Book" value={selectedTrade.book} />
                  <DetailRow label="Commodity Class" value={formatCommodityClass(selectedTrade.commodity_class)} />
                  <DetailRow label="Commodity" value={selectedTrade.commodity} />
                  <DetailRow label="Price" value={formatMoney(selectedTrade.price)} />
                  <DetailRow label="Volume" value={formatNumber(selectedTrade.volume, 0)} />
                  <DetailRow label="Status" value={selectedTrade.status} />
                  <DetailRow label="Updated" value={formatDate(selectedTrade.updated_at)} />
                </div>
              ) : (
                <EmptyState
                  title="No trade selected"
                  body="The detail panel activates when you click a trade in the ledger."
                />
              )}
            </section>

            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Action</span>
                  <h3>Amend trade</h3>
                </div>
                <p>Apply a new book, commodity class, commodity, price, or volume to the selected trade.</p>
              </div>

              <form className="stack-form" onSubmit={handleAmendTrade}>
                <Field label="Book">
                  <select
                    value={amendBookInput}
                    onChange={(e) => setAmendBookInput(e.target.value)}
                    className="control"
                    disabled={referenceDataLoading || books.length === 0}
                  >
                    {amendBookOptions.map((book) => (
                      <option key={book.code} value={book.code}>
                        {book.code} · {book.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Commodity Class">
                  <select
                    value={amendCommodityClassInput}
                    onChange={(e) => setAmendCommodityClassInput(e.target.value)}
                    className="control"
                    disabled={referenceDataLoading || commodityClassOptions.length === 0}
                  >
                    {commodityClassOptions.map((commodityClass) => (
                      <option key={commodityClass} value={commodityClass}>
                        {formatCommodityClass(commodityClass)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Commodity">
                  <select
                    value={amendCommodityInput}
                    onChange={(e) => setAmendCommodityInput(e.target.value)}
                    className="control"
                    disabled={referenceDataLoading || amendCommodityOptions.length === 0}
                  >
                    {amendCommodityOptions.map((commodity) => (
                      <option key={commodity.code} value={commodity.code}>
                        {commodity.code} · {commodity.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="mini-grid">
                  <Field label="Price">
                    <input
                      value={amendPriceInput}
                      onChange={(e) => setAmendPriceInput(e.target.value)}
                      className="control"
                    />
                  </Field>
                  <Field label="Volume">
                    <input
                      value={amendVolumeInput}
                      onChange={(e) => setAmendVolumeInput(e.target.value)}
                      className="control"
                    />
                  </Field>
                </div>
                <button
                  type="submit"
                  disabled={amending || !selectedTradeId || referenceDataLoading || !hasReferenceOptions}
                  className="button button-primary"
                >
                  {amending ? 'Amending…' : 'Amend Trade'}
                </button>
              </form>
              {referenceDataError ? <p className="form-note form-note-error">{referenceDataError}</p> : null}
            </section>

            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Action</span>
                  <h3>Cancel trade</h3>
                </div>
                <p>Mark the selected trade as cancelled in the event stream.</p>
              </div>

              <button
                type="button"
                onClick={handleCancelTrade}
                disabled={cancelling || !selectedTradeId || selectedTrade?.status === 'CANCELLED'}
                className="button button-danger"
              >
                {selectedTrade?.status === 'CANCELLED'
                  ? 'Trade Already Cancelled'
                  : cancelling
                    ? 'Cancelling…'
                    : 'Cancel Trade'}
              </button>
            </section>

            <section className="surface">
              <div className="section-head">
                <div>
                  <span className="eyebrow">History</span>
                  <h3>Event timeline</h3>
                </div>
                <p>Recent events for the selected trade.</p>
              </div>

              <div className="event-stack">
                {selectedTradeEvents.length === 0 ? (
                  <EmptyState
                    title="No events for this trade"
                    body="Once selected, trade history appears here in reverse chronological order."
                  />
                ) : (
                  selectedTradeEvents.map((event) => (
                    <article key={event.event_id} className="event-card">
                      <div className="event-card-header">
                        <div>
                          <strong>{event.event_type}</strong>
                          <span>{formatDate(event.recorded_at)}</span>
                        </div>
                        <span className="event-schema">v{event.schema_version}</span>
                      </div>
                      <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                    </article>
                  ))
                )}
              </div>
            </section>
          </section>
        </section>
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}
