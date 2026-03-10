import { TradeLegEditor } from './TradeLegEditor'

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
  priceIndexInput: string
  setPriceIndexInput: (value: string) => void
  createPriceIndexOptions: ReferenceRecord[]
  priceInput: string
  setPriceInput: (value: string) => void
  volumeInput: string
  setVolumeInput: (value: string) => void
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
    priceIndexInput,
    setPriceIndexInput,
    createPriceIndexOptions,
    priceInput,
    setPriceInput,
    volumeInput,
    setVolumeInput,
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
    formatCommodityClass,
  } = props

  return (
    <>
      <form className="trade-form trade-form-feature" onSubmit={onSubmit}>
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
          <span>Structure</span>
          <select className="control" value={tradeStructureInput} onChange={(event) => setTradeStructureInput(event.target.value)}>
            {tradeStructureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Side</span>
          <select className="control" value={tradeSideInput} onChange={(event) => setTradeSideInput(event.target.value)} disabled={tradeStructureInput === 'SWAP'}>
            {tradeSideOptions.map((option) => (
              <option key={option} value={option}>
                {option}
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
          <span>Pricing</span>
          <select className="control" value={pricingTypeInput} onChange={(event) => setPricingTypeInput(event.target.value)}>
            {pricingTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span>Price Index</span>
          <select
            className="control"
            value={priceIndexInput}
            onChange={(event) => setPriceIndexInput(event.target.value)}
            disabled={pricingTypeInput === 'FIXED' || pricingTypeInput === 'FORMULA' || createPriceIndexOptions.length === 0}
          >
            <option value="">No price index</option>
            {createPriceIndexOptions.map((priceIndex) => (
              <option key={priceIndex.code} value={priceIndex.code}>
                {priceIndex.code} · {priceIndex.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button-primary" disabled={submitting || referenceDataLoading || !hasReferenceOptions}>
          {submitting ? 'Submitting...' : 'Create Trade'}
        </button>
      </form>

      {tradeStructureInput === 'SWAP' && (
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
