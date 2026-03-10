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

type TradeAmendFormProps = {
  onSubmit: (event: React.FormEvent) => void
  handleCancelTrade: () => void
  amendTradeNatureInput: string
  setAmendTradeNatureInput: (value: string) => void
  amendTradeStructureInput: string
  setAmendTradeStructureInput: (value: string) => void
  amendTradeSideInput: string
  setAmendTradeSideInput: (value: string) => void
  amendBookInput: string
  setAmendBookInput: (value: string) => void
  amendBookOptions: ReferenceRecord[]
  amendCommodityClassInput: string
  setAmendCommodityClassInput: (value: string) => void
  commodityClassOptions: string[]
  amendCommodityInput: string
  setAmendCommodityInput: (value: string) => void
  amendCommodityOptions: ReferenceRecord[]
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
}

export function TradeAmendForm(props: TradeAmendFormProps) {
  const {
    onSubmit,
    handleCancelTrade,
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendBookInput,
    setAmendBookInput,
    amendBookOptions,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    commodityClassOptions,
    amendCommodityInput,
    setAmendCommodityInput,
    amendCommodityOptions,
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
  } = props

  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <div className="mini-grid">
        <label className="field">
          <span>Nature</span>
          <select className="control" value={amendTradeNatureInput} onChange={(event) => setAmendTradeNatureInput(event.target.value)} disabled={amending || cancelling}>
            {tradeNatureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Structure</span>
          <select className="control" value={amendTradeStructureInput} onChange={(event) => setAmendTradeStructureInput(event.target.value)} disabled={amending || cancelling}>
            {tradeStructureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Side</span>
          <select className="control" value={amendTradeSideInput} onChange={(event) => setAmendTradeSideInput(event.target.value)} disabled={amending || cancelling || amendTradeStructureInput === 'SWAP'}>
            {tradeSideOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Book</span>
        <select className="control" value={amendBookInput} onChange={(event) => setAmendBookInput(event.target.value)} disabled={amending || cancelling || amendBookOptions.length === 0}>
          {amendBookOptions.map((book) => (
            <option key={book.code} value={book.code}>
              {book.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mini-grid">
        <label className="field">
          <span>Commodity Class</span>
          <select className="control" value={amendCommodityClassInput} onChange={(event) => setAmendCommodityClassInput(event.target.value)} disabled={amending || cancelling || commodityClassOptions.length === 0}>
            {commodityClassOptions.map((commodityClass) => (
              <option key={commodityClass} value={commodityClass}>
                {formatCommodityClass(commodityClass)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Commodity</span>
          <select className="control control-highlight" value={amendCommodityInput} onChange={(event) => setAmendCommodityInput(event.target.value)} disabled={amending || cancelling || amendCommodityOptions.length === 0}>
            {amendCommodityOptions.map((commodity) => (
              <option key={commodity.code} value={commodity.code}>
                {commodity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mini-grid">
        <label className="field">
          <span>Pricing</span>
          <select className="control" value={amendPricingTypeInput} onChange={(event) => setAmendPricingTypeInput(event.target.value)} disabled={amending || cancelling}>
            {pricingTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price Index</span>
          <select className="control" value={amendPriceIndexInput} onChange={(event) => setAmendPriceIndexInput(event.target.value)} disabled={amending || cancelling || amendPricingTypeInput === 'FIXED' || amendPricingTypeInput === 'FORMULA' || amendPriceIndexOptions.length === 0}>
            <option value="">No price index</option>
            {amendPriceIndexOptions.map((priceIndex) => (
              <option key={priceIndex.code} value={priceIndex.code}>
                {priceIndex.code} · {priceIndex.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price</span>
          <input className="control" inputMode="decimal" value={amendPriceInput} onChange={(event) => setAmendPriceInput(event.target.value)} />
        </label>
        <label className="field">
          <span>Volume</span>
          <input className="control" inputMode="decimal" value={amendVolumeInput} onChange={(event) => setAmendVolumeInput(event.target.value)} />
        </label>
      </div>

      {amendTradeStructureInput === 'SWAP' && (
        <TradeLegEditor
          title="Swap Legs"
          legs={amendLegs}
          commodityClassOptions={commodityClassOptions}
          activeCommodities={activeCommodities}
          tradeSideOptions={tradeSideOptions}
          onAdd={addDraftLeg}
          onRemove={removeDraftLeg}
          onUpdate={updateDraftLeg}
          formatCommodityClass={formatCommodityClass}
        />
      )}

      <button type="submit" className="button button-primary" disabled={amending || cancelling}>
        {amending ? 'Applying...' : 'Apply Amendment'}
      </button>
      <button type="button" className="button button-danger" onClick={handleCancelTrade} disabled={amending || cancelling}>
        {cancelling ? 'Cancelling...' : 'Cancel Trade'}
      </button>

      <p className={`form-note ${amendError ? 'form-note-error' : ''}`}>
        {amendError || 'The amend panel now supports structure, side, pricing mode, and swap legs.'}
      </p>
    </form>
  )
}
