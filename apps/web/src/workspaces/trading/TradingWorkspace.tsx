import { TradeCaptureForm } from '../../features/trades/TradeCaptureForm'
import { TradeAmendForm } from '../../features/trades/TradeAmendForm'
import type { StoredAuthSession } from '../../shared/mutation'
import { DataSheet, type DataSheetColumn } from '../../shared/ui/DataSheet'
import { TileLayout } from '../../shared/ui/TileLayout'
import { tradeTooltipCopy } from '../../features/trades/tooltipCopy'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'

type Trade = {
  trade_id: string
  external_trade_id: string | null
  source_system: string | null
  trade_date: string | null
  effective_start_date: string | null
  effective_end_date: string | null
  quality_spec: string | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
  price_unit_code: string | null
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
  authSession: StoredAuthSession | null
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
  amendTradeDateInput: string
  setAmendTradeDateInput: (value: string) => void
  amendEffectiveStartDateInput: string
  setAmendEffectiveStartDateInput: (value: string) => void
  amendEffectiveEndDateInput: string
  setAmendEffectiveEndDateInput: (value: string) => void
  amendQualitySpecInput: string
  setAmendQualitySpecInput: (value: string) => void
  amendUnitInput: string
  setAmendUnitInput: (value: string) => void
  amendUnitOptions: ReferenceRecord[]
  amendTradeCurrencyInput: string
  setAmendTradeCurrencyInput: (value: string) => void
  amendCurrencyOptions: ReferenceRecord[]
  amendLocationInput: string
  setAmendLocationInput: (value: string) => void
  amendLocationOptions: ReferenceRecord[]
  amendDeliveryStartInput: string
  setAmendDeliveryStartInput: (value: string) => void
  amendDeliveryEndInput: string
  setAmendDeliveryEndInput: (value: string) => void
  amendPriceUnitInput: string
  setAmendPriceUnitInput: (value: string) => void
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
  formatDateOnly: (value: string | null | undefined) => string
  statusTone: (status: string) => 'active' | 'cancelled'
}

export function TradingWorkspace(props: TradingWorkspaceProps) {
  const {
    authSession,
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
    amendUnitOptions,
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
    formatDateOnly,
    statusTone,
  } = props

  const tradeBoardColumns: DataSheetColumn<Trade>[] = [
    {
      id: 'trade',
      label: 'Trade',
      width: '12rem',
      renderCell: (trade) => trade.trade_id,
    },
    {
      id: 'nature',
      label: 'Nature',
      width: '9rem',
      renderCell: (trade) => trade.trade_nature,
    },
    {
      id: 'structure',
      label: 'Structure',
      width: '9rem',
      renderCell: (trade) => trade.trade_structure,
    },
    {
      id: 'book',
      label: 'Book',
      width: '9rem',
      renderCell: (trade) => trade.book,
    },
    {
      id: 'class',
      label: 'Class',
      width: '10rem',
      renderCell: (trade) => formatCommodityClass(trade.commodity_class),
    },
    {
      id: 'commodity',
      label: 'Commodity',
      width: '12rem',
      renderCell: (trade) => trade.commodity,
    },
    {
      id: 'price',
      label: 'Price Differential',
      align: 'end',
      width: '10rem',
      renderCell: (trade) => formatMoney(trade.price),
    },
    {
      id: 'volume',
      label: 'Volume',
      align: 'end',
      width: '8rem',
      renderCell: (trade) => formatNumber(trade.volume, 0),
    },
    {
      id: 'status',
      label: 'Status',
      width: '10rem',
      renderCell: (trade) => (
        <Tooltip content={trade.status === 'CANCELLED' ? tradeTooltipCopy.cancelledTrade : tradeTooltipCopy.activeTrade}>
          <span className={`status-pill status-pill-${statusTone(trade.status)} tooltip-trigger-hint`}>{trade.status}</span>
        </Tooltip>
      ),
    },
    {
      id: 'updated',
      label: 'Updated',
      align: 'end',
      width: '12rem',
      renderCell: (trade) => formatDate(trade.updated_at),
    },
  ]

  return (
    <TileLayout
      workspaceId="trades"
      workspaceLabel="Trading"
      authSession={authSession}
      tiles={[
        {
          id: 'create-trade',
          eyebrow: 'Ticket Entry',
          title: 'Create Trade',
          description: 'Enter a ticket on the left and keep the blotter plus inspector docked beside it while you work.',
          span: 'wide',
          availableSpans: ['full', 'wide'],
          content: <TradeCaptureForm {...tradeCaptureFormProps} />,
        },
        {
          id: 'trade-inspector',
          eyebrow: 'Inspector',
          title: selectedTrade ? selectedTrade.trade_id : 'No Selection',
          description: selectedTrade
            ? `${selectedTrade.trade_nature} • ${selectedTrade.trade_structure} • ${selectedTrade.book}`
            : 'Pick a blotter row to inspect state, event history, and amendment controls.',
          span: 'side',
          availableSpans: ['wide', 'half', 'side'],
          content: (
            <div className="workspace-tile-inspector">
              {selectedTrade && (
                <div className="stack-actions">
                  <button type="button" className="button button-secondary" onClick={handleDuplicateTrade}>
                    Duplicate Into Form
                  </button>
                </div>
              )}

              {selectedTrade && (
                <section className="trade-inspector-summary">
                  <div className="trade-inspector-summary-copy">
                    <span className="eyebrow">Active Ticket</span>
                    <strong>{selectedTrade.commodity}</strong>
                    <p>
                      {selectedTrade.trade_side ?? 'LEG-DEFINED'} • {selectedTrade.trade_nature} • {selectedTrade.book}
                    </p>
                  </div>

                  <div className="trade-inspector-pill-row">
                    <span className={`status-pill status-pill-${statusTone(selectedTrade.status)}`}>{selectedTrade.status}</span>
                    <span className="entity-chip entity-chip-soft">Pricing {selectedTrade.pricing_status}</span>
                    <span className="entity-chip entity-chip-soft">Settlement {selectedTrade.settlement_status}</span>
                  </div>

                  <div className="trade-inspector-summary-grid">
                    <article>
                      <span>Price</span>
                      <strong>{formatMoney(selectedTrade.price)}</strong>
                    </article>
                    <article>
                      <span>Volume</span>
                      <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                    </article>
                    <article>
                      <span>Notional</span>
                      <strong>
                        {selectedTrade.price !== null && selectedTrade.volume !== null
                          ? formatMoney(selectedTrade.price * selectedTrade.volume)
                          : '—'}
                      </strong>
                    </article>
                    <article>
                      <span>Trader</span>
                      <strong>{selectedTrade.trader_user ?? 'TBD'}</strong>
                    </article>
                  </div>
                </section>
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
                  <p>Use the trade board to open a focused inspector.</p>
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
                    <span>Trade Date</span>
                    <strong>{formatDateOnly(selectedTrade.trade_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Effective Start</span>
                    <strong>{formatDateOnly(selectedTrade.effective_start_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Effective End</span>
                    <strong>{formatDateOnly(selectedTrade.effective_end_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Quality Spec</span>
                    <strong>{selectedTrade.quality_spec ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Quantity Unit</span>
                    <strong>{selectedTrade.unit_of_measure ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Currency</span>
                    <strong>{selectedTrade.trade_currency_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Price Unit</span>
                    <strong>{selectedTrade.price_unit_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Location</span>
                    <strong>{selectedTrade.location_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Delivery Start</span>
                    <strong>{formatDateOnly(selectedTrade.delivery_start)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Delivery End</span>
                    <strong>{formatDateOnly(selectedTrade.delivery_end)}</strong>
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
                    <InlineTooltipLabel
                      tooltip={RISK_TOOLTIPS.exposureSide}
                      tooltipLabel="More information about exposure side"
                    >
                      Exposure Side
                    </InlineTooltipLabel>
                    <strong>{(selectedTrade.volume ?? 0) >= 0 ? 'Long' : 'Short'}</strong>
                  </div>
                  <div className="detail-row">
                    <InlineTooltipLabel
                      tooltip={RISK_TOOLTIPS.projectionState}
                      tooltipLabel="More information about projection state"
                    >
                      Projection State
                    </InlineTooltipLabel>
                    <strong>{selectedTrade.status}</strong>
                  </div>
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'trade-board',
          eyebrow: 'Blotter',
          title: 'Open and Historical Trades',
          description: 'Select a row to keep the inspector and ticket entry anchored to the same live blotter context.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <DataSheet
              label="Trade Blotter"
              description="Browse the live trade projection like a terminal blotter. Arrow between cells to keep the inspector synced to the active row."
              columns={tradeBoardColumns}
              rows={trades}
              getRowId={(trade) => trade.trade_id}
              getRowLabel={(trade) => `${trade.trade_id} ${trade.commodity} ${trade.trade_structure}`}
              selectedRowId={selectedTradeId}
              onSelectRow={(trade) => {
                setSelectedTradeId(trade.trade_id)
                setInspectorTab('overview')
              }}
              emptyMessage="Capture a trade or refresh the workspace once trade projection data is available."
            />
          ),
        },
      ]}
    />
  )
}
