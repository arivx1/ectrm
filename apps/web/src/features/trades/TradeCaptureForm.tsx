import { TradeLegEditor } from './TradeLegEditor'
import { tradeTooltipCopy } from './tooltipCopy'
import { FieldLabel } from '../../shared/ui/Tooltip'
import { pricingTypeRequiresPriceIndex, tradeStructureSupportsLegs } from '../../shared/trading'

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

type TradeCaptureFormProps = {
  onSubmit: (event: React.FormEvent) => void
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
  formatCommodityClass: (value: string) => string
}

export function TradeCaptureForm(props: TradeCaptureFormProps) {
  const {
    onSubmit,
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
    formatCommodityClass,
  } = props

  return (
    <>
      <form className="trade-form trade-form-feature" onSubmit={onSubmit}>
        <label className="field field-wide">
          <span>External Trade ID</span>
          <input
            className="control"
            value={externalTradeIdInput}
            onChange={(event) => setExternalTradeIdInput(event.target.value)}
            placeholder="EXT-48291"
            disabled={submitting}
          />
        </label>
        <label className="field field-wide">
          <span>Trade ID</span>
          <input
            className="control"
            value={tradeIdInput}
            onChange={(event) => setTradeIdInput(event.target.value)}
            placeholder="T-1007"
            disabled={submitting || referenceDataLoading || !hasReferenceOptions}
          />
        </label>
        <label className="field">
          <span>Source System</span>
          <input
            className="control"
            value={sourceSystemInput}
            onChange={(event) => setSourceSystemInput(event.target.value.toUpperCase())}
            placeholder="ETRM"
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Execution Time</span>
          <input
            className="control"
            type="datetime-local"
            value={executionTimestampInput}
            onChange={(event) => setExecutionTimestampInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Nature</span>
          <select className="control" value={tradeNatureInput} onChange={(event) => setTradeNatureInput(event.target.value)}>
            {tradeNatureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <FieldLabel label="Structure" tooltip={tradeTooltipCopy.structure} />
          <select className="control" value={tradeStructureInput} onChange={(event) => setTradeStructureInput(event.target.value)}>
            {tradeStructureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <FieldLabel label="Side" tooltip={tradeTooltipCopy.side} />
          <select
            className="control"
            value={tradeSideInput}
            onChange={(event) => setTradeSideInput(event.target.value)}
            disabled={tradeStructureSupportsLegs(tradeStructureInput)}
          >
            {tradeSideOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Counterparty</span>
          <select
            className="control"
            value={counterpartyInput}
            onChange={(event) => setCounterpartyInput(event.target.value)}
            disabled={submitting}
          >
            <option value="">No counterparty</option>
            {createCounterpartyOptions.map((counterparty) => (
              <option key={counterparty.code} value={counterparty.code}>
                {counterparty.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Book</span>
          <select
            className="control"
            value={bookInput}
            onChange={(event) => setBookInput(event.target.value)}
            disabled={submitting || referenceDataLoading || activeBooks.length === 0}
          >
            {activeBooks.map((book) => (
              <option key={book.code} value={book.code}>
                {book.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Portfolio</span>
          <select
            className="control"
            value={portfolioInput}
            onChange={(event) => setPortfolioInput(event.target.value)}
            disabled={submitting || createPortfolioOptions.length === 0}
          >
            <option value="">No portfolio</option>
            {createPortfolioOptions.map((portfolio) => (
              <option key={portfolio.code} value={portfolio.code}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Commodity Class</span>
          <select
            className="control"
            value={commodityClassInput}
            onChange={(event) => setCommodityClassInput(event.target.value)}
            disabled={submitting || referenceDataLoading || commodityClassOptions.length === 0}
          >
            {commodityClassOptions.map((commodityClass) => (
              <option key={commodityClass} value={commodityClass}>
                {formatCommodityClass(commodityClass)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Commodity</span>
          <select
            className="control control-highlight"
            value={commodityInput}
            onChange={(event) => setCommodityInput(event.target.value)}
            disabled={submitting || referenceDataLoading || createCommodityOptions.length === 0}
          >
            {createCommodityOptions.map((commodity) => (
              <option key={commodity.code} value={commodity.code}>
                {commodity.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price</span>
          <input className="control" inputMode="decimal" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
        </label>
        <label className="field">
          <span>Volume</span>
          <input className="control" inputMode="decimal" value={volumeInput} onChange={(event) => setVolumeInput(event.target.value)} />
        </label>
        <label className="field">
          <FieldLabel label="Pricing" tooltip={tradeTooltipCopy.pricing} />
          <select className="control" value={pricingTypeInput} onChange={(event) => setPricingTypeInput(event.target.value)}>
            {pricingTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Pricing Status</span>
          <select className="control" value={pricingStatusInput} onChange={(event) => setPricingStatusInput(event.target.value)}>
            {pricingStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Settlement Status</span>
          <select className="control" value={settlementStatusInput} onChange={(event) => setSettlementStatusInput(event.target.value)}>
            {settlementStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <FieldLabel label="Price Index" tooltip={tradeTooltipCopy.priceIndex} />
          <select
            className="control"
            value={priceIndexInput}
            onChange={(event) => setPriceIndexInput(event.target.value)}
            disabled={!pricingTypeRequiresPriceIndex(pricingTypeInput) || createPriceIndexOptions.length === 0}
          >
            <option value="">No price index</option>
            {createPriceIndexOptions.map((priceIndex) => (
              <option key={priceIndex.code} value={priceIndex.code}>
                {priceIndex.code} · {priceIndex.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span>Trader User</span>
          <input
            className="control"
            value={traderUserInput}
            onChange={(event) => setTraderUserInput(event.target.value)}
            placeholder="trader.alpha"
            disabled={submitting}
          />
        </label>
        <button type="submit" className="button button-primary" disabled={submitting || referenceDataLoading || !hasReferenceOptions}>
          {submitting ? 'Submitting...' : 'Create Trade'}
        </button>
      </form>

      {tradeStructureSupportsLegs(tradeStructureInput) && (
        <TradeLegEditor
          title="Swap Legs"
          legs={createLegs}
          commodityClassOptions={commodityClassOptions}
          activeCommodities={activeCommodities}
          tradeSideOptions={tradeSideOptions}
          onAdd={addDraftLeg}
          onRemove={removeDraftLeg}
          onUpdate={updateDraftLeg}
          formatCommodityClass={formatCommodityClass}
        />
      )}

      <p className={`form-note ${createError ? 'form-note-error' : ''}`}>
        {createError || (hasReferenceOptions
          ? 'Trade capture now supports nature, structure, pricing mode, and swap legs.'
          : 'Trade entry is disabled until at least one active book and one active commodity exist in reference data.')}
      </p>
    </>
  )
}
