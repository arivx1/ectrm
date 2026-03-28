import { TradeCaptureForm } from '../../features/trades/TradeCaptureForm'
import { TradeAmendForm } from '../../features/trades/TradeAmendForm'
import { tradeTooltipCopy } from '../../features/trades/tooltipCopy'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'

type Trade = {
  trade_id: string
  external_trade_id: string | null
  source_system: string | null
  quality_spec: string | null
  unit_of_measure: string | null
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  pricing_type: string
  pricing_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  execution_timestamp: string | null
  settlement_status: string
  trader_user: string | null
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

type PortfolioRecord = ReferenceRecord & {
  book_code: string
}

type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

type InspectorTab = 'overview' | 'events' | 'amend' | 'risk'
type TradeCaptureFormProps = Parameters<typeof TradeCaptureForm>[0]

const TRADE_TABLE_HEADERS: Array<{
  label: string
  tooltip: string
  align?: 'center' | 'start' | 'end'
}> = [
  { label: 'Trade', tooltip: 'Internal trade identifier used to tie the read model back to the originating lifecycle events.', align: 'start' },
  { label: 'Nature', tooltip: 'Commercial intent of the trade, typically physical delivery or financial settlement only.' },
  { label: 'Structure', tooltip: 'Whether the trade is a single position or a swap made up of multiple legs.' },
  { label: 'Book', tooltip: 'Commercial book currently carrying the trade in the live projection.' },
  { label: 'Class', tooltip: 'Commodity family used for grouping, validation, and downstream position rollups.' },
  { label: 'Commodity', tooltip: 'Specific commodity master record linked to the trade.' },
  { label: 'Price Differential', tooltip: 'Current stored trade price differential on the read model. Index-linked deals may still settle off a market series.' },
  { label: 'Volume', tooltip: 'Projected top-level quantity for the trade. Swap legs can break this out in more detail.' },
  { label: 'Status', tooltip: 'Lifecycle state from the projection, used to decide whether the trade contributes to active exposure.' },
  { label: 'Updated', tooltip: 'Most recent time the trade projection row changed after a capture, amendment, or cancellation.', align: 'end' },
]

const INSPECTOR_TABS: Array<{ key: InspectorTab; label: string; tooltip: string }> = [
  { key: 'overview', label: 'Overview', tooltip: 'Read the current projected state for the selected trade.' },
  { key: 'events', label: 'Events', tooltip: 'Trace the lifecycle records that were loaded for the selected trade.' },
  { key: 'amend', label: 'Amend', tooltip: 'Apply an amendment or cancel the active trade from the current selection context.' },
  { key: 'risk', label: 'Risk', tooltip: 'Show quick risk-oriented calculations derived from the current trade projection.' },
]

const RISK_TOOLTIPS = {
  notional: 'Simple price-times-volume estimate using the currently loaded trade row.',
  lifecycle: 'Count of loaded event records tied to the selected trade in this session.',
  exposureSide: 'Quick directional interpretation based on the sign of the projected volume.',
  projectionState: 'Current lifecycle status on the trade read model, not the raw event stream.',
} as const

type TradingWorkspaceProps = {
  tradeCaptureFormProps: TradeCaptureFormProps
  trades: Trade[]
  selectedTrade: Trade | null
  selectedTradeId: string | null
  selectedTradeEvents: EventRow[]
  inspectorTab: InspectorTab
  setSelectedTradeId: (tradeId: string) => void
  setInspectorTab: (tab: InspectorTab) => void
  handleDuplicateTrade: () => void
  handleAmendTrade: (event: React.FormEvent) => void
  handleCancelTrade: (reason: string) => void
  amendmentPreviewFields: string[]
  cancelImpactSummary: string
  amendExternalTradeIdInput: string
  setAmendExternalTradeIdInput: (value: string) => void
  amendSourceSystemInput: string
  amendExecutionTimestampInput: string
  setAmendExecutionTimestampInput: (value: string) => void
  amendQualitySpecInput: string
  setAmendQualitySpecInput: (value: string) => void
  amendUnitInput: string
  setAmendUnitInput: (value: string) => void
  amendUnitOptions: ReferenceRecord[]
  amendBookInput: string
  setAmendBookInput: (value: string) => void
  amendBookOptions: ReferenceRecord[]
  amendPortfolioInput: string
  setAmendPortfolioInput: (value: string) => void
  amendPortfolioOptions: PortfolioRecord[]
  amendCounterpartyInput: string
  setAmendCounterpartyInput: (value: string) => void
  amendCounterpartyOptions: ReferenceRecord[]
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
  amendPricingStatusInput: string
  setAmendPricingStatusInput: (value: string) => void
  amendPriceIndexInput: string
  setAmendPriceIndexInput: (value: string) => void
  amendPriceIndexOptions: ReferenceRecord[]
  amendPriceInput: string
  setAmendPriceInput: (value: string) => void
  amendVolumeInput: string
  setAmendVolumeInput: (value: string) => void
  amendSettlementStatusInput: string
  setAmendSettlementStatusInput: (value: string) => void
  amendTraderUserInput: string
  setAmendTraderUserInput: (value: string) => void
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
  pricingStatusOptions: readonly string[]
  settlementStatusOptions: readonly string[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  statusTone: (status: string) => 'active' | 'cancelled'
}

export function TradingWorkspace(props: TradingWorkspaceProps) {
  const {
    tradeCaptureFormProps,
    trades,
    selectedTrade,
    selectedTradeId,
    selectedTradeEvents,
    inspectorTab,
    setSelectedTradeId,
    setInspectorTab,
    handleDuplicateTrade,
    handleAmendTrade,
    handleCancelTrade,
    amendmentPreviewFields,
    cancelImpactSummary,
    amendExternalTradeIdInput,
    setAmendExternalTradeIdInput,
    amendSourceSystemInput,
    amendExecutionTimestampInput,
    setAmendExecutionTimestampInput,
    amendQualitySpecInput,
    setAmendQualitySpecInput,
    amendUnitInput,
    setAmendUnitInput,
    amendUnitOptions,
    amendBookInput,
    setAmendBookInput,
    amendBookOptions,
    amendPortfolioInput,
    setAmendPortfolioInput,
    amendPortfolioOptions,
    amendCounterpartyInput,
    setAmendCounterpartyInput,
    amendCounterpartyOptions,
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
    amendPricingStatusInput,
    setAmendPricingStatusInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceIndexOptions,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendSettlementStatusInput,
    setAmendSettlementStatusInput,
    amendTraderUserInput,
    setAmendTraderUserInput,
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
    pricingStatusOptions,
    settlementStatusOptions,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
    statusTone,
  } = props

  return (
    <div className="workspace-grid">
      <section className="stack">
        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Capture</span>
              <h3>Create Trade</h3>
            </div>
            <p>New trades now start here so capture, inspection, and follow-on changes stay in one workspace.</p>
          </div>

          <TradeCaptureForm {...tradeCaptureFormProps} />
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Trade Board</span>
              <h3>Open and Historical Trades</h3>
            </div>
            <p>Select a row to open the inspector. Capture and lifecycle actions now stay in the same workspace.</p>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  {TRADE_TABLE_HEADERS.map((column) => (
                    <th key={column.label}>
                      <InlineTooltipLabel
                        tooltip={column.tooltip}
                        tooltipLabel={`More information about the ${column.label} column`}
                        placement="top"
                        align={column.align ?? 'center'}
                      >
                        {column.label}
                      </InlineTooltipLabel>
                    </th>
                  ))}
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
                      <Tooltip
                        content={trade.status === 'CANCELLED' ? tradeTooltipCopy.cancelledTrade : tradeTooltipCopy.activeTrade}
                      >
                        <span className={`status-pill status-pill-${statusTone(trade.status)} tooltip-trigger-hint`}>
                          {trade.status}
                        </span>
                      </Tooltip>
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

        {selectedTrade && (
          <div className="stack-actions">
            <button type="button" className="button button-secondary" onClick={handleDuplicateTrade}>
              Duplicate Into Form
            </button>
          </div>
        )}

        <div className="tab-row">
          {INSPECTOR_TABS.map((tab) => (
            <Tooltip key={tab.key} content={tab.tooltip} placement="bottom">
              <button
                type="button"
                className={`tab-pill ${inspectorTab === tab.key ? 'is-active' : ''}`}
                onClick={() => setInspectorTab(tab.key)}
                disabled={!selectedTrade}
              >
                {tab.label}
              </button>
            </Tooltip>
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
              <span>External Trade ID</span>
              <strong>{selectedTrade.external_trade_id ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Source System</span>
              <strong>{selectedTrade.source_system ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Execution Time</span>
              <strong>{formatDate(selectedTrade.execution_timestamp)}</strong>
            </div>
            <div className="detail-row">
              <span>Quality Spec</span>
              <strong>{selectedTrade.quality_spec ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Unit of Measure</span>
              <strong>{selectedTrade.unit_of_measure ?? '—'}</strong>
            </div>
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
              <span>Portfolio</span>
              <strong>{selectedTrade.portfolio ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Counterparty</span>
              <strong>{selectedTrade.counterparty ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Pricing Type</span>
              <strong>{selectedTrade.pricing_type}</strong>
            </div>
            <div className="detail-row">
              <span>Pricing Status</span>
              <strong>{selectedTrade.pricing_status}</strong>
            </div>
            <div className="detail-row">
              <span>Price Index</span>
              <strong>{selectedTrade.price_index_code ?? '—'}</strong>
            </div>
            <div className="detail-row">
              <span>Price Differential</span>
              <strong>{formatMoney(selectedTrade.price)}</strong>
            </div>
            <div className="detail-row">
              <span>Volume</span>
              <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
            </div>
            <div className="detail-row">
              <span>Settlement Status</span>
              <strong>{selectedTrade.settlement_status}</strong>
            </div>
            <div className="detail-row">
              <span>Trader User</span>
              <strong>{selectedTrade.trader_user ?? '—'}</strong>
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
            key={selectedTrade.trade_id}
            onSubmit={handleAmendTrade}
            handleCancelTrade={handleCancelTrade}
            selectedTradeId={selectedTrade.trade_id}
            amendmentPreviewFields={amendmentPreviewFields}
            cancelImpactSummary={cancelImpactSummary}
            amendExternalTradeIdInput={amendExternalTradeIdInput}
            setAmendExternalTradeIdInput={setAmendExternalTradeIdInput}
            amendSourceSystemInput={amendSourceSystemInput}
            amendExecutionTimestampInput={amendExecutionTimestampInput}
            setAmendExecutionTimestampInput={setAmendExecutionTimestampInput}
            amendQualitySpecInput={amendQualitySpecInput}
            setAmendQualitySpecInput={setAmendQualitySpecInput}
            amendUnitInput={amendUnitInput}
            setAmendUnitInput={setAmendUnitInput}
            amendUnitOptions={amendUnitOptions}
            amendTradeNatureInput={amendTradeNatureInput}
            setAmendTradeNatureInput={setAmendTradeNatureInput}
            amendTradeStructureInput={amendTradeStructureInput}
            setAmendTradeStructureInput={setAmendTradeStructureInput}
            amendTradeSideInput={amendTradeSideInput}
            setAmendTradeSideInput={setAmendTradeSideInput}
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
            pricingStatusOptions={pricingStatusOptions}
            settlementStatusOptions={settlementStatusOptions}
            formatCommodityClass={formatCommodityClass}
          />
        )}

        {selectedTrade && inspectorTab === 'risk' && (
          <div className="detail-list">
            <div className="detail-row">
              <InlineTooltipLabel tooltip={RISK_TOOLTIPS.notional} tooltipLabel="More information about notional">
                Notional
              </InlineTooltipLabel>
              <strong>
                {selectedTrade.price !== null && selectedTrade.volume !== null
                  ? formatMoney(selectedTrade.price * selectedTrade.volume)
                  : '—'}
              </strong>
            </div>
            <div className="detail-row">
              <InlineTooltipLabel tooltip={RISK_TOOLTIPS.lifecycle} tooltipLabel="More information about lifecycle">
                Lifecycle
              </InlineTooltipLabel>
              <strong>{selectedTradeEvents.length} events</strong>
            </div>
            <div className="detail-row">
              <InlineTooltipLabel tooltip={RISK_TOOLTIPS.exposureSide} tooltipLabel="More information about exposure side">
                Exposure Side
              </InlineTooltipLabel>
              <strong>{(selectedTrade.volume ?? 0) >= 0 ? 'Long' : 'Short'}</strong>
            </div>
            <div className="detail-row">
              <InlineTooltipLabel tooltip={RISK_TOOLTIPS.projectionState} tooltipLabel="More information about projection state">
                Projection State
              </InlineTooltipLabel>
              <strong>{selectedTrade.status}</strong>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
