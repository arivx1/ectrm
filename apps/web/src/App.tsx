import { useEffect, useMemo, useState } from 'react'

type Trade = {
  trade_id: string
  created_at: string
  updated_at: string
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

const API_BASE = 'http://localhost:8000'

export default function App() {
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [error, setError] = useState<string>('')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)

  const [tradeIdInput, setTradeIdInput] = useState('')
  const [commodityInput, setCommodityInput] = useState('crude')
  const [priceInput, setPriceInput] = useState('80.00')
  const [volumeInput, setVolumeInput] = useState('1000')
  const [submitting, setSubmitting] = useState(false)

  async function loadData() {
    const [healthRes, tradesRes, eventsRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/trades`),
      fetch(`${API_BASE}/events?limit=50`),
    ])

    if (!healthRes.ok || !tradesRes.ok || !eventsRes.ok) {
      throw new Error('API request failed')
    }

    const healthJson = await healthRes.json()
    const tradesJson = await tradesRes.json()
    const eventsJson = await eventsRes.json()

    setHealth(healthJson.status ?? 'unknown')
    setTrades(tradesJson)
    setEvents(eventsJson)

    if (tradesJson.length > 0) {
      setSelectedTradeId((current) => current ?? tradesJson[0].trade_id)
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

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const tradeId = tradeIdInput.trim()
    const commodity = commodityInput.trim()
    const price = Number(priceInput)
    const volume = Number(volumeInput)

    if (!tradeId) {
      setError('Trade ID is required.')
      return
    }

    if (!commodity) {
      setError('Commodity is required.')
      return
    }

    if (Number.isNaN(price) || Number.isNaN(volume)) {
      setError('Price and volume must be valid numbers.')
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
          payload: {
            commodity,
            price,
            volume,
          },
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
      setCommodityInput('crude')
      setPriceInput('80.00')
      setVolumeInput('1000')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create trade failed.')
    } finally {
      setSubmitting(false)
    }
  }

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

          <div style={{ marginTop: 28, display: 'grid', gap: 10 }}>
            {['Dashboard', 'Trades', 'Events', 'Positions', 'Risk', 'Settlements'].map((item, idx) => (
              <div
                key={item}
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: idx === 0 ? '#0f172a' : 'transparent',
                  color: idx === 0 ? '#fff' : '#334155',
                  fontWeight: 500,
                }}
              >
                {item}
              </div>
            ))}
          </div>
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
            <p style={{ color: '#64748b', marginTop: 4 }}>Emit a TradeCreated event from the UI</p>

            <form
              onSubmit={handleCreateTrade}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) auto',
                gap: 12,
                marginTop: 16,
                alignItems: 'end',
              }}
            >
              <Field label="Trade ID">
                <input
                  value={tradeIdInput}
                  onChange={(e) => setTradeIdInput(e.target.value)}
                  placeholder="T-0003"
                  style={inputStyle}
                />
              </Field>

              <Field label="Commodity">
                <input
                  value={commodityInput}
                  onChange={(e) => setCommodityInput(e.target.value)}
                  placeholder="crude"
                  style={inputStyle}
                />
              </Field>

              <Field label="Price">
                <input
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="80.00"
                  style={inputStyle}
                />
              </Field>

              <Field label="Volume">
                <input
                  value={volumeInput}
                  onChange={(e) => setVolumeInput(e.target.value)}
                  placeholder="1000"
                  style={inputStyle}
                />
              </Field>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  height: 42,
                  borderRadius: 14,
                  border: 'none',
                  background: '#0f172a',
                  color: '#fff',
                  padding: '0 18px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Creating...' : 'Create Trade'}
              </button>
            </form>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              ['Trades', String(trades.length)],
              ['Events loaded', String(events.length)],
              ['Selected trade', selectedTradeId ?? 'none'],
              ['Status', health],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <div style={{ color: '#64748b', fontSize: 14 }}>{label}</div>
                <div style={{ marginTop: 8, fontSize: 32, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Trades</h2>
              <p style={{ color: '#64748b', marginTop: 4 }}>Click a row to inspect the trade</p>

              <div style={{ overflow: 'hidden', borderRadius: 18, border: '1px solid #e2e8f0', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      {['Trade ID', 'Commodity', 'Price', 'Volume', 'Status'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: 14, fontSize: 14, color: '#475569' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const selected = trade.trade_id === selectedTradeId
                      return (
                        <tr
                          key={trade.trade_id}
                          onClick={() => setSelectedTradeId(trade.trade_id)}
                          style={{
                            borderTop: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            background: selected ? '#eff6ff' : '#fff',
                          }}
                        >
                          <td style={{ padding: 14, fontWeight: 600 }}>{trade.trade_id}</td>
                          <td style={{ padding: 14 }}>{trade.commodity}</td>
                          <td style={{ padding: 14 }}>{trade.price ?? ''}</td>
                          <td style={{ padding: 14 }}>{trade.volume ?? ''}</td>
                          <td style={{ padding: 14 }}>
                            <span style={{ background: '#ecfdf5', color: '#047857', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {trades.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 18, color: '#64748b' }}>No trades yet.</td>
                      </tr>
                    ) : null}
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
                    <DetailRow label="Commodity" value={selectedTrade.commodity} />
                    <DetailRow label="Price" value={selectedTrade.price ?? ''} />
                    <DetailRow label="Volume" value={selectedTrade.volume ?? ''} />
                    <DetailRow label="Status" value={selectedTrade.status} />
                    <DetailRow label="Created" value={selectedTrade.created_at} />
                    <DetailRow label="Updated" value={selectedTrade.updated_at} />
                    <DetailRow label="Last Event ID" value={selectedTrade.last_event_id} />
                  </div>
                ) : (
                  <div style={{ color: '#64748b' }}>Select a trade.</div>
                )}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 20 }}>
                <h2 style={{ marginTop: 0 }}>Event Timeline</h2>
                <p style={{ color: '#64748b', marginTop: 4 }}>Events for the selected trade</p>

                <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                  {selectedTradeEvents.map((event) => (
                    <div key={event.event_id} style={{ border: '1px solid #e2e8f0', borderRadius: 18, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong>{event.event_type}</strong>
                        <span style={{ color: '#64748b', fontSize: 12 }}>{event.recorded_at}</span>
                      </div>
                      <div style={{ marginTop: 6, color: '#475569', fontSize: 14 }}>
                        {event.aggregate_type} / {event.aggregate_id}
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
                  {selectedTradeEvents.length === 0 ? (
                    <div style={{ color: '#64748b' }}>No events for selected trade.</div>
                  ) : null}
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 12,
        paddingBottom: 10,
        borderBottom: '1px solid #e2e8f0',
      }}
    >
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
