import { TradeAmendForm } from '../../features/trades/TradeAmendForm'

type Trade = {
  trade_id: string
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
  updated_at: string
}

type EventRow = {
  event_id: string
  event_type: string
  recorded_at: string
}

type ReferenceRecord = {
  code: string
  name: string
  commodity_class?: string
}

type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

type InspectorTab = 'overview' | 'events' | 'amend' | 'risk'

type TradingWorkspaceProps = {
  trades: Trade[]
  selectedTrade: Trade | null
  selectedTradeId: string | null
  selectedTradeEvents: EventRow[]
  inspectorTab: InspectorTab
  setSelectedTradeId: (tradeId: string) => void
  setInspectorTab: (tab: InspectorTab) => void
  handleAmendTrade: (event: React.FormEvent) => void
  handleCancelTrade: () => void
  amendBookInput: string
  setAmendBookInput: (value: string) => void
  amendBookOptions: ReferenceRecord[]
  amendCommodityClassInput: string
  setAmendCommodityClassInput: (value: string) => void
  commodityClassOptions: string[]
  amendCommodityInput: string
  setAmendCommodityInput: (value: string) => void
  amendCommodityOptions: ReferenceRecord[]
  amendTradeNatureInput: string
  setAmendTradeNatureInput: (value: string) => void
  amendTradeStructureInput: string
  setAmendTradeStructureInput: (value: string) => void
  amendTradeSideInput: string
  setAmendTradeSideInput: (value: string) => void
  amendPricingTypeInput: string
  setAmendPricingTypeInput: (value: string) => void
  amendPriceIndexInput: string
  setAmendPriceIndexInput: (value: string) => void
  amendPriceIndexOptions: ReferenceRecord[]
  amendPriceInput: string
  setAmendPriceInput: (value: string) => void
  amendVolumeInput: string
  setAmendVolumeInput: (value: string) => void
  amendLegs: TradeLegDraft[]
  activeCommodities: ReferenceRecord[]
  addDraftLeg: () => void
  removeDraftLeg: (index: number) => void
  updateDraftLeg: (index: number, field: keyof TradeLegDraft, value: string) => void
  amending: boolean
  cancelling: boolean
  amendError: string
  tradeNatureOptions: readonly string[]
  tradeStructureOptions: readonly string[]
  tradeSideOptions: readonly string[]
  pricingTypeOptions: readonly string[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  statusTone: (status: string) => 'active' | 'cancelled'
}

export function TradingWorkspace(props: TradingWorkspaceProps) {
  const {
    trades,
    selectedTrade,
    selectedTradeId,
    selectedTradeEvents,
    inspectorTab,
    setSelectedTradeId,
    setInspectorTab,
    handleAmendTrade,
    handleCancelTrade,
    amendBookInput,
    setAmendBookInput,
    amendBookOptions,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    commodityClassOptions,
    amendCommodityInput,
    setAmendCommodityInput,
    amendCommodityOptions,
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendPricingTypeInput,
    setAmendPricingTypeInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceIndexOptions,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendLegs,
    activeCommodities,
    addDraftLeg,
    removeDraftLeg,
    updateDraftLeg,
    amending,
    cancelling,
    amendError,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
    statusTone,
  } = props

  return (
    <div className="workspace-grid">
      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Trade Board</span>
              <h3>Open and Historical Trades</h3>
            </div>
            <p>Select a row to open the inspector. Amendments stay contextual to the active trade.</p>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Nature</th>
                  <th>Structure</th>
                  <th>Book</th>
                  <th>Class</th>
                  <th>Commodity</th>
                  <th>Price</th>
                  <th>Volume</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.trade_id}
                    className={trade.trade_id === selectedTradeId ? 'is-selected' : ''}
                    onClick={() => {
                      setSelectedTradeId(trade.trade_id)
                      setInspectorTab('overview')
                    }}
                  >
                    <td>{trade.trade_id}</td>
                    <td>{trade.trade_nature}</td>
                    <td>{trade.trade_structure}</td>
                    <td>{trade.book}</td>
                    <td>{formatCommodityClass(trade.commodity_class)}</td>
                    <td>{trade.commodity}</td>
                    <td>{formatMoney(trade.price)}</td>
                    <td>{formatNumber(trade.volume, 0)}</td>
                    <td>
                      <span className={`status-pill status-pill-${statusTone(trade.status)}`}>{trade.status}</span>
                    </td>
                    <td>{formatDate(trade.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <aside className="surface inspector-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Inspector</span>
            <h3>{selectedTrade ? selectedTrade.trade_id : 'No selection'}</h3>
          </div>
          <p>
            {selectedTrade
              ? `${selectedTrade.trade_nature} • ${selectedTrade.trade_structure} • ${selectedTrade.book}`
              : 'Pick a trade to inspect details, event history, and amendment controls.'}
          </p>
        </div>

        <div className="tab-row">
          {(['overview', 'events', 'amend', 'risk'] as InspectorTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-pill ${inspectorTab === tab ? 'is-active' : ''}`}
              onClick={() => setInspectorTab(tab)}
              disabled={!selectedTrade}
            >
              {tab === 'risk' ? 'Risk' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {!selectedTrade && (
          <div className="empty-state empty-state-tall">
            <strong>No trade selected</strong>
            <p>Use the trade board to the left to open a focused inspector.</p>
          </div>
        )}

        {selectedTrade && inspectorTab === 'overview' && (
          <div className="detail-list">
            <div className="detail-row">
              <span>Trade Nature</span>
              <strong>{selectedTrade.trade_nature}</strong>
            </div>
            <div className="detail-row">
              <span>Trade Structure</span>
              <strong>{selectedTrade.trade_structure}</strong>
            </div>
            <div className="detail-row">
              <span>Trade Side</span>
              <strong>{selectedTrade.trade_side ?? 'Leg-defined'}</strong>
            </div>
            <div className="detail-row">
              <span>Commodity Class</span>
              <strong>{formatCommodityClass(selectedTrade.commodity_class)}</strong>
            </div>
            <div className="detail-row">
              <span>Commodity</span>
              <strong>{selectedTrade.commodity}</strong>
            </div>
            <div className="detail-row">
              <span>Book</span>
              <strong>{selectedTrade.book}</strong>
            </div>
            <div className="detail-row">
              <span>Pricing Type</span>
              <strong>{selectedTrade.pricing_type}</strong>
            </div>
            <div className="detail-row">
              <span>Price Index</span>
              <strong>{selectedTrade.price_index_code ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Price</span>
              <strong>{formatMoney(selectedTrade.price)}</strong>
            </div>
            <div className="detail-row">
              <span>Volume</span>
              <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
            </div>
            <div className="detail-row">
              <span>Updated</span>
              <strong>{formatDate(selectedTrade.updated_at)}</strong>
            </div>
          </div>
        )}

        {selectedTrade && inspectorTab === 'events' && (
          <div className="timeline">
            {selectedTradeEvents.map((event) => (
              <article key={event.event_id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{event.event_type}</strong>
                    <span>{formatDate(event.recorded_at)}</span>
                  </div>
                  <p>{event.event_id}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        {selectedTrade && inspectorTab === 'amend' && (
          <TradeAmendForm
            onSubmit={handleAmendTrade}
            handleCancelTrade={handleCancelTrade}
            amendTradeNatureInput={amendTradeNatureInput}
            setAmendTradeNatureInput={setAmendTradeNatureInput}
            amendTradeStructureInput={amendTradeStructureInput}
            setAmendTradeStructureInput={setAmendTradeStructureInput}
            amendTradeSideInput={amendTradeSideInput}
            setAmendTradeSideInput={setAmendTradeSideInput}
            amendBookInput={amendBookInput}
            setAmendBookInput={setAmendBookInput}
            amendBookOptions={amendBookOptions}
            amendCommodityClassInput={amendCommodityClassInput}
            setAmendCommodityClassInput={setAmendCommodityClassInput}
            commodityClassOptions={commodityClassOptions}
            amendCommodityInput={amendCommodityInput}
            setAmendCommodityInput={setAmendCommodityInput}
            amendCommodityOptions={amendCommodityOptions}
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
            addDraftLeg={addDraftLeg}
            removeDraftLeg={removeDraftLeg}
            updateDraftLeg={updateDraftLeg}
            amending={amending}
            cancelling={cancelling}
            amendError={amendError}
            tradeNatureOptions={tradeNatureOptions}
            tradeStructureOptions={tradeStructureOptions}
            tradeSideOptions={tradeSideOptions}
            pricingTypeOptions={pricingTypeOptions}
            formatCommodityClass={formatCommodityClass}
          />
        )}

        {selectedTrade && inspectorTab === 'risk' && (
          <div className="detail-list">
            <div className="detail-row">
              <span>Notional</span>
              <strong>
                {selectedTrade.price !== null && selectedTrade.volume !== null
                  ? formatMoney(selectedTrade.price * selectedTrade.volume)
                  : '—'}
              </strong>
            </div>
            <div className="detail-row">
              <span>Lifecycle</span>
              <strong>{selectedTradeEvents.length} events</strong>
            </div>
            <div className="detail-row">
              <span>Exposure Side</span>
              <strong>{(selectedTrade.volume ?? 0) >= 0 ? 'Long' : 'Short'}</strong>
            </div>
            <div className="detail-row">
              <span>Projection State</span>
              <strong>{selectedTrade.status}</strong>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
