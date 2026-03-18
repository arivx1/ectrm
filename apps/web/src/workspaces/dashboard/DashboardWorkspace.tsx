import { TradeCaptureForm } from '../../features/trades/TradeCaptureForm'
import { SystemStatusPanel } from './SystemStatusPanel'

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

type EventRow = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

type DashboardWorkspaceProps = {
  handleCreateTrade: (event: React.FormEvent) => void
  tradeIdInput: string
  setTradeIdInput: (value: string) => void
  tradeNatureInput: string
  setTradeNatureInput: (value: string) => void
  tradeStructureInput: string
  setTradeStructureInput: (value: string) => void
  tradeSideInput: string
  setTradeSideInput: (value: string) => void
  bookInput: string
  setBookInput: (value: string) => void
  activeBooks: ReferenceRecord[]
  commodityClassInput: string
  setCommodityClassInput: (value: string) => void
  commodityClassOptions: string[]
  commodityInput: string
  setCommodityInput: (value: string) => void
  createCommodityOptions: ReferenceRecord[]
  pricingTypeInput: string
  setPricingTypeInput: (value: string) => void
  pricingStatusInput: string
  setPricingStatusInput: (value: string) => void
  priceIndexInput: string
  setPriceIndexInput: (value: string) => void
  createPriceIndexOptions: ReferenceRecord[]
  priceInput: string
  setPriceInput: (value: string) => void
  volumeInput: string
  setVolumeInput: (value: string) => void
  externalTradeIdInput: string
  setExternalTradeIdInput: (value: string) => void
  sourceSystemInput: string
  setSourceSystemInput: (value: string) => void
  executionTimestampInput: string
  setExecutionTimestampInput: (value: string) => void
  portfolioInput: string
  setPortfolioInput: (value: string) => void
  createPortfolioOptions: PortfolioRecord[]
  counterpartyInput: string
  setCounterpartyInput: (value: string) => void
  createCounterpartyOptions: ReferenceRecord[]
  settlementStatusInput: string
  setSettlementStatusInput: (value: string) => void
  traderUserInput: string
  setTraderUserInput: (value: string) => void
  createLegs: TradeLegDraft[]
  activeCommodities: ReferenceRecord[]
  addDraftLeg: () => void
  removeDraftLeg: (index: number) => void
  updateDraftLeg: (index: number, field: keyof TradeLegDraft, value: string) => void
  submitting: boolean
  referenceDataLoading: boolean
  hasReferenceOptions: boolean
  createError: string
  tradeNatureOptions: readonly string[]
  tradeStructureOptions: readonly string[]
  tradeSideOptions: readonly string[]
  pricingTypeOptions: readonly string[]
  pricingStatusOptions: readonly string[]
  settlementStatusOptions: readonly string[]
  appLoading: boolean
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  events: EventRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const {
    handleCreateTrade,
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
    activeBooks,
    commodityClassInput,
    setCommodityClassInput,
    commodityClassOptions,
    commodityInput,
    setCommodityInput,
    createCommodityOptions,
    pricingTypeInput,
    setPricingTypeInput,
    pricingStatusInput,
    setPricingStatusInput,
    priceIndexInput,
    setPriceIndexInput,
    createPriceIndexOptions,
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
    createPortfolioOptions,
    counterpartyInput,
    setCounterpartyInput,
    createCounterpartyOptions,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    createLegs,
    activeCommodities,
    addDraftLeg,
    removeDraftLeg,
    updateDraftLeg,
    submitting,
    referenceDataLoading,
    hasReferenceOptions,
    createError,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    settlementStatusOptions,
    appLoading,
    positionsByClass,
    events,
    formatCommodityClass,
    formatNumber,
    formatDate,
  } = props

  return (
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
          addDraftLeg={addDraftLeg}
          removeDraftLeg={removeDraftLeg}
          updateDraftLeg={updateDraftLeg}
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
          formatCommodityClass={formatCommodityClass}
        />
      </section>

      <section className="stack">
        <SystemStatusPanel />

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
  )
}
