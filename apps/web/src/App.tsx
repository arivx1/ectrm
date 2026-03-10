import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Trade = {
  trade_id: string
  created_at: string
  updated_at: string
  book: string
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

const API_BASE = 'http://localhost:8000'
const BOOK_OPTIONS = ['CRUDE_PHYS', 'CRUDE_PAPER', 'GAS_PHYS', 'GAS_PAPER']

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

export default function App() {
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [error, setError] = useState<string>('')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)

  const [tradeIdInput, setTradeIdInput] = useState('')
  const [bookInput, setBookInput] = useState('CRUDE_PHYS')
  const [commodityInput, setCommodityInput] = useState('crude')
  const [priceInput, setPriceInput] = useState('80.00')
  const [volumeInput, setVolumeInput] = useState('1000')
  const [submitting, setSubmitting] = useState(false)

  const [amendBookInput, setAmendBookInput] = useState('CRUDE_PHYS')
  const [amendCommodityInput, setAmendCommodityInput] = useState('')
  const [amendPriceInput, setAmendPriceInput] = useState('')
  const [amendVolumeInput, setAmendVolumeInput] = useState('')
  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function loadData() {
    const [healthRes, tradesRes, eventsRes, positionsRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/trades`),
      fetch(`${API_BASE}/events?limit=50`),
      fetch(`${API_BASE}/positions`),
    ])

    if (!healthRes.ok || !tradesRes.ok || !eventsRes.ok || !positionsRes.ok) {
      throw new Error('API request failed')
    }

    const healthJson = await healthRes.json()
    const tradesJson = await tradesRes.json()
    const eventsJson = await eventsRes.json()
    const positionsJson = await positionsRes.json()

    setHealth(healthJson.status ?? 'unknown')
    setTrades(tradesJson)
    setEvents(eventsJson)
    setPositions(positionsJson)

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
        setError('Could not reach API. Make sure backend is running on localhost:8000 and CORS is enabled.')
      }
    }

    init()
  }, [])

  const selectedTrade = useMemo(
    () => trades.find((t) => t.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  useEffect(() => {
    if (selectedTrade) {
      setAmendBookInput(selectedTrade.book ?? 'CRUDE_PHYS')
      setAmendCommodityInput(selectedTrade.commodity ?? '')
      setAmendPriceInput(selectedTrade.price?.toString() ?? '')
      setAmendVolumeInput(selectedTrade.volume?.toString() ?? '')
    }
  }, [selectedTrade])

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

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const tradeId = tradeIdInput.trim()
    const book = bookInput
    const commodity = commodityInput.trim()
    const price = parseRequiredNumber(priceInput)
    const volume = parseRequiredNumber(volumeInput)

    if (!tradeId || !book || !commodity || price === null || volume === null) {
      setError('Trade ID, book, commodity, price, and volume are required.')
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
          payload: { book, commodity, price, volume },
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
      setBookInput('CRUDE_PHYS')
      setCommodityInput('crude')
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
    const commodity = amendCommodityInput.trim()
    const price = parseRequiredNumber(amendPriceInput)
    const volume = parseRequiredNumber(amendVolumeInput)

    if (!book || !commodity || price === null || volume === null) {
      setError('Book, commodity, price, and volume are required.')
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
          payload: { book, commodity, price, volume },
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
                {selectedTrade.book} • {selectedTrade.commodity}
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
            <p>Seed a trade into the event stream with an initial book, price, and volume.</p>
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
              >
                {BOOK_OPTIONS.map((book) => (
                  <option key={book} value={book}>
                    {book}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commodity">
              <input
                value={commodityInput}
                onChange={(e) => setCommodityInput(e.target.value)}
                className="control"
              />
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
            <button type="submit" disabled={submitting} className="button button-primary">
              {submitting ? 'Creating…' : 'Create Trade'}
            </button>
          </form>
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
                      {['Trade ID', 'Book', 'Commodity', 'Price', 'Volume', 'Status', 'Updated'].map((heading) => (
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
                <p>Apply a new book, commodity, price, or volume to the selected trade.</p>
              </div>

              <form className="stack-form" onSubmit={handleAmendTrade}>
                <Field label="Book">
                  <select
                    value={amendBookInput}
                    onChange={(e) => setAmendBookInput(e.target.value)}
                    className="control"
                  >
                    {BOOK_OPTIONS.map((book) => (
                      <option key={book} value={book}>
                        {book}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Commodity">
                  <input
                    value={amendCommodityInput}
                    onChange={(e) => setAmendCommodityInput(e.target.value)}
                    className="control"
                  />
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
                  disabled={amending || !selectedTradeId}
                  className="button button-primary"
                >
                  {amending ? 'Amending…' : 'Amend Trade'}
                </button>
              </form>
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
