import { useEffect, useMemo, useState } from 'react'

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

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const tradeId = tradeIdInput.trim()
    const book = bookInput
    const commodity = commodityInput.trim()
    const price = Number(priceInput)
    const volume = Number(volumeInput)

    if (!tradeId || !book || !commodity || Number.isNaN(price) || Number.isNaN(volume)) {
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
    const price = Number(amendPriceInput)
    const volume = Number(amendVolumeInput)

    if (!book || !commodity || Number.isNaN(price) || Number.isNaN(volume)) {
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside style={{ width: 260, background: '#fff', borderRight: '1px solid #e2e8f0', padding: 24 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontWeight: 700 }}>
            E/CTRM
          </div>
          <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>Control Center</div>
          <p style={{ marginTop: 10, color: '#475569', lineHeight: 1.5 }}>
            Event-sourced trading system with live backend connectivity.
          </p>
        </aside>

        <main style={{ flex: 1, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 14 }}>Live local environment</div>
              <h1 style={{ margin: '6px 0 0 0', fontSize: 34 }}>Trading Overview</h1>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '10px 14px' }}>
              API health: <strong>{health}</strong>
            </div>
          </div>

          {error ? (
            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: 16, borderRadius: 16, marginBottom: 24 }}>
              {error}
            </div>
          ) : null}

          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Create Trade</h2>
            <form onSubmit={handleCreateTrade} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) auto', gap: 12, marginTop: 16, alignItems: 'end' }}>
              <Field label="Trade ID">
                <input value={tradeIdInput} onChange={(e) => setTradeIdInput(e.target.value)} placeholder="T-0004" style={inputStyle} />
              </Field>
              <Field label="Book">
                <select value={bookInput} onChange={(e) => setBookInput(e.target.value)} style={inputStyle}>
                  {BOOK_OPTIONS.map((book) => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </select>
              </Field>
              <Field label="Commodity">
                <input value={commodityInput} onChange={(e) => setCommodityInput(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Price">
                <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Volume">
                <input value={volumeInput} onChange={(e) => setVolumeInput(e.target.value)} style={inputStyle} />
              </Field>
              <button type="submit" disabled={submitting} style={buttonStyle}>
                {submitting ? 'Creating...' : 'Create Trade'}
              </button>
            </form>
          </section>

          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Positions</h2>
            <p style={{ color: '#64748b', marginTop: 4 }}>Active net volume by commodity</p>

            <div style={{ overflow: 'hidden', borderRadius: 18, border: '1px solid #e2e8f0', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 14, fontSize: 14, color: '#475569' }}>Commodity</th>
                    <th style={{ textAlign: 'left', padding: 14, fontSize: 14, color: '#475569' }}>Net Volume</th>
                    <th style={{ textAlign: 'left', padding: 14, fontSize: 14, color: '#475569' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.commodity} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: 14, fontWeight: 600 }}>{p.commodity}</td>
                      <td style={{ padding: 14 }}>{p.net_volume}</td>
                      <td style={{ padding: 14 }}>{p.updated_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Trades</h2>
              <div style={{ overflow: 'hidden', borderRadius: 18, border: '1px solid #e2e8f0', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      {['Trade ID', 'Book', 'Commodity', 'Price', 'Volume', 'Status'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: 14, fontSize: 14, color: '#475569' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const selected = trade.trade_id === selectedTradeId
                      const cancelled = trade.status === 'CANCELLED'
                      return (
                        <tr
                          key={trade.trade_id}
                          onClick={() => setSelectedTradeId(trade.trade_id)}
                          style={{
                            borderTop: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            background: selected ? '#eff6ff' : '#fff',
                            opacity: cancelled ? 0.65 : 1,
                          }}
                        >
                          <td style={{ padding: 14, fontWeight: 600 }}>{trade.trade_id}</td>
                          <td style={{ padding: 14 }}>{trade.book}</td>
                          <td style={{ padding: 14 }}>{trade.commodity}</td>
                          <td style={{ padding: 14 }}>{trade.price ?? ''}</td>
                          <td style={{ padding: 14 }}>{trade.volume ?? ''}</td>
                          <td style={{ padding: 14 }}>
                            <span
                              style={{
                                background: cancelled ? '#fef2f2' : '#ecfdf5',
                                color: cancelled ? '#b91c1c' : '#047857',
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 24 }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <h2 style={{ marginTop: 0 }}>Trade Details</h2>
                {selectedTrade ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <DetailRow label="Trade ID" value={selectedTrade.trade_id} />
                    <DetailRow label="Book" value={selectedTrade.book} />
                    <DetailRow label="Commodity" value={selectedTrade.commodity} />
                    <DetailRow label="Price" value={selectedTrade.price ?? ''} />
                    <DetailRow label="Volume" value={selectedTrade.volume ?? ''} />
                    <DetailRow label="Status" value={selectedTrade.status} />
                  </div>
                ) : (
                  <div style={{ color: '#64748b' }}>Select a trade.</div>
                )}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <h2 style={{ marginTop: 0 }}>Amend Trade</h2>
                <form onSubmit={handleAmendTrade} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  <Field label="Book">
                    <select value={amendBookInput} onChange={(e) => setAmendBookInput(e.target.value)} style={inputStyle}>
                      {BOOK_OPTIONS.map((book) => (
                        <option key={book} value={book}>{book}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Commodity">
                    <input value={amendCommodityInput} onChange={(e) => setAmendCommodityInput(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Price">
                    <input value={amendPriceInput} onChange={(e) => setAmendPriceInput(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Volume">
                    <input value={amendVolumeInput} onChange={(e) => setAmendVolumeInput(e.target.value)} style={inputStyle} />
                  </Field>
                  <button type="submit" disabled={amending || !selectedTradeId} style={buttonStyle}>
                    {amending ? 'Amending...' : 'Amend Trade'}
                  </button>
                </form>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <h2 style={{ marginTop: 0 }}>Cancel Trade</h2>
                <button
                  type="button"
                  onClick={handleCancelTrade}
                  disabled={cancelling || !selectedTradeId || selectedTrade?.status === 'CANCELLED'}
                  style={{
                    ...buttonStyle,
                    background: selectedTrade?.status === 'CANCELLED' ? '#94a3b8' : '#991b1b',
                    width: '100%',
                  }}
                >
                  {selectedTrade?.status === 'CANCELLED'
                    ? 'Trade Already Cancelled'
                    : cancelling
                    ? 'Cancelling...'
                    : 'Cancel Trade'}
                </button>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <h2 style={{ marginTop: 0 }}>Event Timeline</h2>
                <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                  {selectedTradeEvents.map((event) => (
                    <div key={event.event_id} style={{ border: '1px solid #e2e8f0', borderRadius: 18, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong>{event.event_type}</strong>
                        <span style={{ color: '#64748b', fontSize: 12 }}>{event.recorded_at}</span>
                      </div>
                      <pre
                        style={{
                          marginTop: 10,
                          background: '#f8fafc',
                          padding: 12,
                          borderRadius: 12,
                          overflowX: 'auto',
                          fontSize: 12,
                          color: '#334155',
                        }}
                      >
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, paddingBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: 14 }}>{label}</div>
      <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{String(value)}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 14,
  border: '1px solid #cbd5e1',
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
  background: '#fff',
}

const buttonStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 14,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  padding: '0 18px',
  fontWeight: 600,
  cursor: 'pointer',
}
