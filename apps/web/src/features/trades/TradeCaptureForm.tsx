import { TradeLegEditor } from './TradeLegEditor'
import {
  buildCounterpartyCreditRestrictionMessage,
  type CounterpartyCreditPolicyPreview,
  formatCounterpartyOptionLabel,
} from './counterpartyCredit'
import { combineLocalDateTimeInput, splitLocalDateTimeInput } from './tradeDraftUtils'
import { tradeTooltipCopy } from './tooltipCopy'
import { FieldLabel } from '../../shared/ui/Tooltip'
import {
  defaultTradeExecutionTime,
  getQualitySpecOptionsForCommodity,
  pricingTypeRequiresExplicitPrice,
  pricingTypeRequiresPriceIndex,
  tradeInstrumentUsesOptionFields,
  tradeStructureSupportsLegs,
} from '../../shared/trading'

type ReferenceRecord = {
  code: string
  name: string
  commodity_class?: string
}

type PortfolioRecord = ReferenceRecord & {
  book_code: string
}

type CounterpartyRecord = ReferenceRecord & {
  credit_status?: string | null
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
  qualitySpecInput: string
  setQualitySpecInput: (value: string) => void
  unitInput: string
  setUnitInput: (value: string) => void
  createUnitOptions: ReferenceRecord[]
  externalTradeIdInput: string
  setExternalTradeIdInput: (value: string) => void
  sourceSystemInput: string
  executionTimestampInput: string
  setExecutionTimestampInput: (value: string) => void
  tradeDateInput: string
  setTradeDateInput: (value: string) => void
  effectiveStartDateInput: string
  setEffectiveStartDateInput: (value: string) => void
  effectiveEndDateInput: string
  setEffectiveEndDateInput: (value: string) => void
  portfolioInput: string
  setPortfolioInput: (value: string) => void
  createPortfolioOptions: PortfolioRecord[]
  counterpartyInput: string
  setCounterpartyInput: (value: string) => void
  createCounterpartyOptions: CounterpartyRecord[]
  tradeCurrencyInput: string
  setTradeCurrencyInput: (value: string) => void
  createCurrencyOptions: ReferenceRecord[]
  locationInput: string
  setLocationInput: (value: string) => void
  createLocationOptions: ReferenceRecord[]
  deliveryStartInput: string
  setDeliveryStartInput: (value: string) => void
  deliveryEndInput: string
  setDeliveryEndInput: (value: string) => void
  priceUnitInput: string
  setPriceUnitInput: (value: string) => void
  tradeInstrumentTypeInput: string
  setTradeInstrumentTypeInput: (value: string) => void
  optionTypeInput: string
  setOptionTypeInput: (value: string) => void
  optionStyleInput: string
  setOptionStyleInput: (value: string) => void
  optionExpirationDateInput: string
  setOptionExpirationDateInput: (value: string) => void
  optionStrikePriceInput: string
  setOptionStrikePriceInput: (value: string) => void
  settlementStatusInput: string
  setSettlementStatusInput: (value: string) => void
  traderUserInput: string
  setTraderUserInput: (value: string) => void
  createLegs: TradeLegDraft[]
  activeCommodities: ReferenceRecord[]
  addDraftLeg: () => void
  removeDraftLeg: (index: number) => void
  updateDraftLeg: (index: number, field: keyof TradeLegDraft, value: string) => void
  duplicateSourceTradeId: string | null
  submitting: boolean
  referenceDataLoading: boolean
  hasReferenceOptions: boolean
  createError: string
  counterpartyCreditPolicyPreview: CounterpartyCreditPolicyPreview | null
  tradeInstrumentTypeOptions: readonly string[]
  optionTypeOptions: readonly string[]
  optionStyleOptions: readonly string[]
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
    qualitySpecInput,
    setQualitySpecInput,
    unitInput,
    setUnitInput,
    createUnitOptions,
    externalTradeIdInput,
    setExternalTradeIdInput,
    sourceSystemInput,
    executionTimestampInput,
    setExecutionTimestampInput,
    tradeDateInput,
    setTradeDateInput,
    effectiveStartDateInput,
    setEffectiveStartDateInput,
    effectiveEndDateInput,
    setEffectiveEndDateInput,
    portfolioInput,
    setPortfolioInput,
    createPortfolioOptions,
    counterpartyInput,
    setCounterpartyInput,
    createCounterpartyOptions,
    tradeCurrencyInput,
    setTradeCurrencyInput,
    createCurrencyOptions,
    locationInput,
    setLocationInput,
    createLocationOptions,
    deliveryStartInput,
    setDeliveryStartInput,
    deliveryEndInput,
    setDeliveryEndInput,
    priceUnitInput,
    setPriceUnitInput,
    tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput,
    optionTypeInput,
    setOptionTypeInput,
    optionStyleInput,
    setOptionStyleInput,
    optionExpirationDateInput,
    setOptionExpirationDateInput,
    optionStrikePriceInput,
    setOptionStrikePriceInput,
    settlementStatusInput,
    setSettlementStatusInput,
    traderUserInput,
    setTraderUserInput,
    createLegs,
    activeCommodities,
    addDraftLeg,
    removeDraftLeg,
    updateDraftLeg,
    duplicateSourceTradeId,
    submitting,
    referenceDataLoading,
    hasReferenceOptions,
    createError,
    counterpartyCreditPolicyPreview,
    tradeInstrumentTypeOptions,
    optionTypeOptions,
    optionStyleOptions,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    settlementStatusOptions,
    formatCommodityClass,
  } = props
  const { date: executionDateInput, time: executionTimeInput } = splitLocalDateTimeInput(executionTimestampInput)
  const qualitySpecOptions = getQualitySpecOptionsForCommodity(commodityInput)
  const qualitySpecListId = qualitySpecOptions.length > 0 ? 'trade-quality-spec-options' : undefined
  const optionTrade = tradeInstrumentUsesOptionFields(tradeInstrumentTypeInput)
  const selectedCounterparty =
    createCounterpartyOptions.find((counterparty) => counterparty.code === counterpartyInput) ?? null
  const counterpartyCreditWarning = buildCounterpartyCreditRestrictionMessage(selectedCounterparty)

  return (
    <>
      <form className="trade-form trade-form-feature" onSubmit={onSubmit}>
        <input type="hidden" value={sourceSystemInput || ''} readOnly />
        {duplicateSourceTradeId && (
          <div className="field field-wide">
            <div className="feedback-banner feedback-banner-success trade-structure-note">
              <strong>Duplicating {duplicateSourceTradeId}</strong>
              <p>New trade and external IDs are blank, execution time is reset, and settlement starts back at PENDING.</p>
            </div>
          </div>
        )}
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
          <span>Trade ID (optional)</span>
          <input
            className="control"
            value={tradeIdInput}
            onChange={(event) => setTradeIdInput(event.target.value)}
            placeholder="Auto-generated if blank"
            disabled={submitting || referenceDataLoading || !hasReferenceOptions}
          />
        </label>
        <label className="field">
          <span>Execution Date</span>
          <input
            className="control"
            type="date"
            value={executionDateInput}
            onChange={(event) =>
              setExecutionTimestampInput(combineLocalDateTimeInput(event.target.value, executionTimeInput))
            }
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Execution Time</span>
          <input
            className="control"
            type="time"
            value={executionTimeInput || defaultTradeExecutionTime}
            onChange={(event) =>
              setExecutionTimestampInput(combineLocalDateTimeInput(executionDateInput, event.target.value))
            }
            disabled={submitting || executionDateInput === ''}
          />
        </label>
        <label className="field">
          <span>Trade Date</span>
          <input
            className="control"
            type="date"
            value={tradeDateInput}
            onChange={(event) => setTradeDateInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Effective Start</span>
          <input
            className="control"
            type="date"
            value={effectiveStartDateInput}
            onChange={(event) => setEffectiveStartDateInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Effective End</span>
          <input
            className="control"
            type="date"
            value={effectiveEndDateInput}
            onChange={(event) => setEffectiveEndDateInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <FieldLabel label="Instrument" tooltip={tradeTooltipCopy.instrument} />
          <select
            className="control"
            value={tradeInstrumentTypeInput}
            onChange={(event) => setTradeInstrumentTypeInput(event.target.value)}
            disabled={submitting}
          >
            {tradeInstrumentTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nature</span>
          <select
            className="control"
            value={tradeNatureInput}
            onChange={(event) => setTradeNatureInput(event.target.value)}
            disabled={submitting || optionTrade}
          >
            {tradeNatureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <FieldLabel label="Structure" tooltip={tradeTooltipCopy.structure} />
          <select
            className="control"
            value={tradeStructureInput}
            onChange={(event) => setTradeStructureInput(event.target.value)}
            disabled={submitting || optionTrade}
          >
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
                {formatCounterpartyOptionLabel(counterparty)}
              </option>
            ))}
          </select>
        </label>
        {counterpartyCreditWarning && (
          <div className="field field-wide">
            <div className="feedback-banner feedback-banner-error trade-structure-note">
              <strong>Counterparty blocked for trading</strong>
              <p>{counterpartyCreditWarning}</p>
            </div>
          </div>
        )}
        {counterpartyCreditPolicyPreview && (
          <div className="field field-wide">
            <div
              className={`feedback-banner ${counterpartyCreditPolicyPreview.tone === 'error' ? 'feedback-banner-error' : ''} trade-structure-note`}
            >
              <strong>{counterpartyCreditPolicyPreview.title}</strong>
              <p>{counterpartyCreditPolicyPreview.message}</p>
            </div>
          </div>
        )}
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
        {tradeStructureSupportsLegs(tradeStructureInput) ? (
          <div className="field field-wide">
            <div className="feedback-banner trade-structure-note">
              <strong>Swap trades are leg-driven.</strong>
              <p>Primary commodity now follows Leg 1 automatically, and top-level volume stays off the trade header.</p>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
        {optionTrade && (
          <div className="field field-wide">
            <div className="feedback-banner trade-structure-note">
              <strong>Option tickets are single-leg financial trades.</strong>
              <p>Premium is captured in the price field, the commodity stays as the underlying, and option tickets stay out of the net-position projection until option risk math is added.</p>
            </div>
          </div>
        )}
        <label className="field">
          <span>Quality Spec</span>
          <input
            className="control"
            list={qualitySpecListId}
            value={qualitySpecInput}
            onChange={(event) => setQualitySpecInput(event.target.value)}
            placeholder={qualitySpecOptions.length > 0 ? 'Choose or type a spec' : 'Example: 10 PPM sulfur max'}
          />
        </label>
        {qualitySpecListId && (
          <datalist id={qualitySpecListId}>
            {qualitySpecOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        )}
        <label className="field">
          <span>Quantity Unit</span>
          <select className="control" value={unitInput} onChange={(event) => setUnitInput(event.target.value)} disabled={submitting}>
            <option value="">Select unit</option>
            {createUnitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.code} · {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Option Type</span>
          <select
            className="control"
            value={optionTypeInput}
            onChange={(event) => setOptionTypeInput(event.target.value)}
            disabled={submitting || !optionTrade}
          >
            {optionTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Option Style</span>
          <select
            className="control"
            value={optionStyleInput}
            onChange={(event) => setOptionStyleInput(event.target.value)}
            disabled={submitting || !optionTrade}
          >
            {optionStyleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Expiration</span>
          <input
            className="control"
            type="date"
            value={optionExpirationDateInput}
            onChange={(event) => setOptionExpirationDateInput(event.target.value)}
            disabled={submitting || !optionTrade}
          />
        </label>
        <label className="field">
          <span>Strike Price</span>
          <input
            className="control"
            inputMode="decimal"
            value={optionStrikePriceInput}
            onChange={(event) => setOptionStrikePriceInput(event.target.value)}
            disabled={submitting || !optionTrade}
          />
        </label>
        <label className="field">
          <span>Trade Currency</span>
          <select
            className="control"
            value={tradeCurrencyInput}
            onChange={(event) => setTradeCurrencyInput(event.target.value)}
            disabled={submitting}
          >
            <option value="">No currency</option>
            {createCurrencyOptions.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} · {currency.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price Unit</span>
          <select
            className="control"
            value={priceUnitInput}
            onChange={(event) => setPriceUnitInput(event.target.value)}
            disabled={submitting}
          >
            <option value="">No price unit</option>
            {createUnitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.code} · {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <select
            className="control"
            value={locationInput}
            onChange={(event) => setLocationInput(event.target.value)}
            disabled={submitting}
          >
            <option value="">No location</option>
            {createLocationOptions.map((location) => (
              <option key={location.code} value={location.code}>
                {location.code} · {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Delivery Start</span>
          <input
            className="control"
            type="date"
            value={deliveryStartInput}
            onChange={(event) => setDeliveryStartInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Delivery End</span>
          <input
            className="control"
            type="date"
            value={deliveryEndInput}
            onChange={(event) => setDeliveryEndInput(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>{optionTrade ? 'Premium' : pricingTypeRequiresExplicitPrice(pricingTypeInput) ? 'Price Differential' : 'Price Differential (optional)'}</span>
          <input className="control" inputMode="decimal" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
        </label>
        {!tradeStructureSupportsLegs(tradeStructureInput) && (
          <label className="field">
            <span>{optionTrade ? 'Contracts' : 'Volume'}</span>
            <input className="control" inputMode="decimal" value={volumeInput} onChange={(event) => setVolumeInput(event.target.value)} />
          </label>
        )}
        <label className="field">
          <FieldLabel label="Pricing" tooltip={tradeTooltipCopy.pricing} />
          <select className="control" value={pricingTypeInput} onChange={(event) => setPricingTypeInput(event.target.value)} disabled={optionTrade}>
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
            disabled={optionTrade || !pricingTypeRequiresPriceIndex(pricingTypeInput) || createPriceIndexOptions.length === 0}
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
          ? 'Leave Trade ID blank to auto-generate it. Pick an execution date to default the time to midnight. INDEX deals can omit price differential, SWAP deals derive the trade summary from Leg 1, and the first options slice books premium plus strike and expiry on single-leg tickets.'
          : 'Trade entry is disabled until at least one active book and one active commodity exist in reference data.')}
      </p>
    </>
  )
}
