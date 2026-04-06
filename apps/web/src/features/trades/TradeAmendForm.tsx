import { useState } from 'react'

import {
  buildCounterpartyCreditRestrictionMessage,
  type CounterpartyCreditPolicyPreview,
  formatCounterpartyOptionLabel,
} from './counterpartyCredit'
import { TradeLegEditor } from './TradeLegEditor'
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

type TradeAmendFormProps = {
  onSubmit: (event: React.FormEvent) => void
  handleCancelTrade: (reason: string) => void
  selectedTradeId: string
  amendmentPreviewFields: string[]
  cancelImpactSummary: string
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
  amendPricingStatusInput: string
  setAmendPricingStatusInput: (value: string) => void
  amendConfirmationStatusInput: string
  setAmendConfirmationStatusInput: (value: string) => void
  amendNominationStatusInput: string
  setAmendNominationStatusInput: (value: string) => void
  amendAllocationStatusInput: string
  setAmendAllocationStatusInput: (value: string) => void
  amendPriceIndexInput: string
  setAmendPriceIndexInput: (value: string) => void
  amendPriceIndexOptions: ReferenceRecord[]
  amendPriceInput: string
  setAmendPriceInput: (value: string) => void
  amendVolumeInput: string
  setAmendVolumeInput: (value: string) => void
  amendInvoiceStatusInput: string
  setAmendInvoiceStatusInput: (value: string) => void
  amendPaymentStatusInput: string
  setAmendPaymentStatusInput: (value: string) => void
  amendQualitySpecInput: string
  setAmendQualitySpecInput: (value: string) => void
  amendUnitInput: string
  setAmendUnitInput: (value: string) => void
  amendUnitOptions: ReferenceRecord[]
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
  amendPortfolioInput: string
  setAmendPortfolioInput: (value: string) => void
  amendPortfolioOptions: PortfolioRecord[]
  amendCounterpartyInput: string
  setAmendCounterpartyInput: (value: string) => void
  amendCounterpartyOptions: CounterpartyRecord[]
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
  amendPriceUnitOptions: ReferenceRecord[]
  amendTradeInstrumentTypeInput: string
  setAmendTradeInstrumentTypeInput: (value: string) => void
  amendOptionTypeInput: string
  setAmendOptionTypeInput: (value: string) => void
  amendOptionStyleInput: string
  setAmendOptionStyleInput: (value: string) => void
  amendOptionExpirationDateInput: string
  setAmendOptionExpirationDateInput: (value: string) => void
  amendOptionStrikePriceInput: string
  setAmendOptionStrikePriceInput: (value: string) => void
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
  counterpartyCreditPolicyPreview: CounterpartyCreditPolicyPreview | null
  tradeInstrumentTypeOptions: readonly string[]
  optionTypeOptions: readonly string[]
  optionStyleOptions: readonly string[]
  tradeNatureOptions: readonly string[]
  tradeStructureOptions: readonly string[]
  tradeSideOptions: readonly string[]
  pricingTypeOptions: readonly string[]
  pricingStatusOptions: readonly string[]
  confirmationStatusOptions: readonly string[]
  nominationStatusOptions: readonly string[]
  allocationStatusOptions: readonly string[]
  invoiceStatusOptions: readonly string[]
  paymentStatusOptions: readonly string[]
  settlementStatusOptions: readonly string[]
  formatCommodityClass: (value: string) => string
}

export function TradeAmendForm(props: TradeAmendFormProps) {
  const {
    onSubmit,
    handleCancelTrade,
    selectedTradeId,
    amendmentPreviewFields,
    cancelImpactSummary,
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
    amendPricingStatusInput,
    setAmendPricingStatusInput,
    amendConfirmationStatusInput,
    setAmendConfirmationStatusInput,
    amendNominationStatusInput,
    setAmendNominationStatusInput,
    amendAllocationStatusInput,
    setAmendAllocationStatusInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceIndexOptions,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendInvoiceStatusInput,
    setAmendInvoiceStatusInput,
    amendPaymentStatusInput,
    setAmendPaymentStatusInput,
    amendQualitySpecInput,
    setAmendQualitySpecInput,
    amendUnitInput,
    setAmendUnitInput,
    amendUnitOptions,
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
    amendPortfolioInput,
    setAmendPortfolioInput,
    amendPortfolioOptions,
    amendCounterpartyInput,
    setAmendCounterpartyInput,
    amendCounterpartyOptions,
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
    amendPriceUnitOptions,
    amendTradeInstrumentTypeInput,
    setAmendTradeInstrumentTypeInput,
    amendOptionTypeInput,
    setAmendOptionTypeInput,
    amendOptionStyleInput,
    setAmendOptionStyleInput,
    amendOptionExpirationDateInput,
    setAmendOptionExpirationDateInput,
    amendOptionStrikePriceInput,
    setAmendOptionStrikePriceInput,
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
    counterpartyCreditPolicyPreview,
    tradeInstrumentTypeOptions,
    optionTypeOptions,
    optionStyleOptions,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    confirmationStatusOptions,
    nominationStatusOptions,
    allocationStatusOptions,
    invoiceStatusOptions,
    paymentStatusOptions,
    settlementStatusOptions,
    formatCommodityClass,
  } = props

  const [cancelReviewOpen, setCancelReviewOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const { date: executionDateInput, time: executionTimeInput } = splitLocalDateTimeInput(amendExecutionTimestampInput)
  const qualitySpecOptions = getQualitySpecOptionsForCommodity(amendCommodityInput)
  const qualitySpecListId = qualitySpecOptions.length > 0 ? `trade-quality-spec-options-${selectedTradeId}` : undefined
  const optionTrade = tradeInstrumentUsesOptionFields(amendTradeInstrumentTypeInput)
  const selectedCounterparty =
    amendCounterpartyOptions.find((counterparty) => counterparty.code === amendCounterpartyInput) ?? null
  const counterpartyCreditWarning = buildCounterpartyCreditRestrictionMessage(selectedCounterparty)

  return (
    <form key={selectedTradeId} className="stack-form" onSubmit={onSubmit}>
      <input type="hidden" value={amendSourceSystemInput || ''} readOnly />
      <div className="mini-grid">
        <label className="field">
          <span>External Trade ID</span>
          <input className="control" value={amendExternalTradeIdInput} onChange={(event) => setAmendExternalTradeIdInput(event.target.value)} disabled={amending || cancelling} />
        </label>
        <label className="field">
          <span>Execution Date</span>
          <input
            className="control"
            type="date"
            value={executionDateInput}
            onChange={(event) =>
              setAmendExecutionTimestampInput(combineLocalDateTimeInput(event.target.value, executionTimeInput))
            }
            disabled={amending || cancelling}
          />
        </label>
        <label className="field">
          <span>Execution Time</span>
          <input
            className="control"
            type="time"
            value={executionTimeInput || defaultTradeExecutionTime}
            onChange={(event) =>
              setAmendExecutionTimestampInput(combineLocalDateTimeInput(executionDateInput, event.target.value))
            }
            disabled={amending || cancelling || executionDateInput === ''}
          />
        </label>
        <label className="field">
          <span>Trade Date</span>
          <input
            className="control"
            type="date"
            value={amendTradeDateInput}
            onChange={(event) => setAmendTradeDateInput(event.target.value)}
            disabled={amending || cancelling}
          />
        </label>
        <label className="field">
          <span>Effective Start</span>
          <input
            className="control"
            type="date"
            value={amendEffectiveStartDateInput}
            onChange={(event) => setAmendEffectiveStartDateInput(event.target.value)}
            disabled={amending || cancelling}
          />
        </label>
        <label className="field">
          <span>Effective End</span>
          <input
            className="control"
            type="date"
            value={amendEffectiveEndDateInput}
            onChange={(event) => setAmendEffectiveEndDateInput(event.target.value)}
            disabled={amending || cancelling}
          />
        </label>
      </div>

      <div className="mini-grid">
        <label className="field">
          <FieldLabel label="Instrument" tooltip={tradeTooltipCopy.instrument} />
          <select
            className="control"
            value={amendTradeInstrumentTypeInput}
            onChange={(event) => setAmendTradeInstrumentTypeInput(event.target.value)}
            disabled={amending || cancelling}
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
          <select className="control" value={amendTradeNatureInput} onChange={(event) => setAmendTradeNatureInput(event.target.value)} disabled={amending || cancelling || optionTrade}>
            {tradeNatureOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <FieldLabel label="Structure" tooltip={tradeTooltipCopy.structure} />
          <select className="control" value={amendTradeStructureInput} onChange={(event) => setAmendTradeStructureInput(event.target.value)} disabled={amending || cancelling || optionTrade}>
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
            value={amendTradeSideInput}
            onChange={(event) => setAmendTradeSideInput(event.target.value)}
            disabled={amending || cancelling || tradeStructureSupportsLegs(amendTradeStructureInput)}
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
          <select className="control" value={amendCounterpartyInput} onChange={(event) => setAmendCounterpartyInput(event.target.value)} disabled={amending || cancelling}>
            <option value="">No counterparty</option>
            {amendCounterpartyOptions.map((counterparty) => (
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
      </div>

      <div className="mini-grid">
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
        <label className="field">
          <span>Portfolio</span>
          <select className="control" value={amendPortfolioInput} onChange={(event) => setAmendPortfolioInput(event.target.value)} disabled={amending || cancelling}>
            <option value="">No portfolio</option>
            {amendPortfolioOptions.map((portfolio) => (
              <option key={portfolio.code} value={portfolio.code}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mini-grid">
        {tradeStructureSupportsLegs(amendTradeStructureInput) ? (
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
      </div>

      <div className="mini-grid">
        <label className="field">
          <span>Quality Spec</span>
          <input
            className="control"
            list={qualitySpecListId}
            value={amendQualitySpecInput}
            onChange={(event) => setAmendQualitySpecInput(event.target.value)}
            placeholder={qualitySpecOptions.length > 0 ? 'Choose or type a spec' : 'Enter quality spec'}
            disabled={amending || cancelling}
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
          <select className="control" value={amendUnitInput} onChange={(event) => setAmendUnitInput(event.target.value)} disabled={amending || cancelling}>
            <option value="">Select unit</option>
            {amendUnitOptions.map((unit) => (
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
            value={amendOptionTypeInput}
            onChange={(event) => setAmendOptionTypeInput(event.target.value)}
            disabled={amending || cancelling || !optionTrade}
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
            value={amendOptionStyleInput}
            onChange={(event) => setAmendOptionStyleInput(event.target.value)}
            disabled={amending || cancelling || !optionTrade}
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
            value={amendOptionExpirationDateInput}
            onChange={(event) => setAmendOptionExpirationDateInput(event.target.value)}
            disabled={amending || cancelling || !optionTrade}
          />
        </label>
        <label className="field">
          <span>Strike Price</span>
          <input
            className="control"
            inputMode="decimal"
            value={amendOptionStrikePriceInput}
            onChange={(event) => setAmendOptionStrikePriceInput(event.target.value)}
            disabled={amending || cancelling || !optionTrade}
          />
        </label>
        <label className="field">
          <span>Trade Currency</span>
          <select
            className="control"
            value={amendTradeCurrencyInput}
            onChange={(event) => setAmendTradeCurrencyInput(event.target.value)}
            disabled={amending || cancelling}
          >
            <option value="">No currency</option>
            {amendCurrencyOptions.map((currency) => (
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
            value={amendPriceUnitInput}
            onChange={(event) => setAmendPriceUnitInput(event.target.value)}
            disabled={amending || cancelling}
          >
            <option value="">No price unit</option>
            {amendPriceUnitOptions.map((unit) => (
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
            value={amendLocationInput}
            onChange={(event) => setAmendLocationInput(event.target.value)}
            disabled={amending || cancelling}
          >
            <option value="">No location</option>
            {amendLocationOptions.map((location) => (
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
            value={amendDeliveryStartInput}
            onChange={(event) => setAmendDeliveryStartInput(event.target.value)}
            disabled={amending || cancelling}
          />
        </label>
        <label className="field">
          <span>Delivery End</span>
          <input
            className="control"
            type="date"
            value={amendDeliveryEndInput}
            onChange={(event) => setAmendDeliveryEndInput(event.target.value)}
            disabled={amending || cancelling}
          />
        </label>
        <label className="field">
          <FieldLabel label="Pricing" tooltip={tradeTooltipCopy.pricing} />
          <select className="control" value={amendPricingTypeInput} onChange={(event) => setAmendPricingTypeInput(event.target.value)} disabled={amending || cancelling || optionTrade}>
            {pricingTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Pricing Status</span>
          <select className="control" value={amendPricingStatusInput} onChange={(event) => setAmendPricingStatusInput(event.target.value)} disabled={amending || cancelling}>
            {pricingStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <FieldLabel label="Price Index" tooltip={tradeTooltipCopy.priceIndex} />
          <select
            className="control"
            value={amendPriceIndexInput}
            onChange={(event) => setAmendPriceIndexInput(event.target.value)}
            disabled={amending || cancelling || optionTrade || !pricingTypeRequiresPriceIndex(amendPricingTypeInput) || amendPriceIndexOptions.length === 0}
          >
            <option value="">No price index</option>
            {amendPriceIndexOptions.map((priceIndex) => (
              <option key={priceIndex.code} value={priceIndex.code}>
                {priceIndex.code} · {priceIndex.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{optionTrade ? 'Premium' : pricingTypeRequiresExplicitPrice(amendPricingTypeInput) ? 'Price Differential' : 'Price Differential (optional)'}</span>
          <input className="control" inputMode="decimal" value={amendPriceInput} onChange={(event) => setAmendPriceInput(event.target.value)} />
        </label>
        {!tradeStructureSupportsLegs(amendTradeStructureInput) && (
          <label className="field">
            <span>{optionTrade ? 'Contracts' : 'Volume'}</span>
            <input className="control" inputMode="decimal" value={amendVolumeInput} onChange={(event) => setAmendVolumeInput(event.target.value)} />
          </label>
        )}
      </div>

      <div className="mini-grid">
        <label className="field">
          <span>Confirmation</span>
          <select
            className="control"
            value={amendConfirmationStatusInput}
            onChange={(event) => setAmendConfirmationStatusInput(event.target.value)}
            disabled={amending || cancelling}
          >
            {confirmationStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nomination</span>
          <select
            className="control"
            value={amendNominationStatusInput}
            onChange={(event) => setAmendNominationStatusInput(event.target.value)}
            disabled={amending || cancelling}
          >
            {nominationStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Allocation</span>
          <select
            className="control"
            value={amendAllocationStatusInput}
            onChange={(event) => setAmendAllocationStatusInput(event.target.value)}
            disabled={amending || cancelling}
          >
            {allocationStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Invoice</span>
          <select
            className="control"
            value={amendInvoiceStatusInput}
            onChange={(event) => setAmendInvoiceStatusInput(event.target.value)}
            disabled={amending || cancelling}
          >
            {invoiceStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Payment</span>
          <select
            className="control"
            value={amendPaymentStatusInput}
            onChange={(event) => setAmendPaymentStatusInput(event.target.value)}
            disabled={amending || cancelling}
          >
            {paymentStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mini-grid">
        <label className="field">
          <span>Settlement Status</span>
          <select className="control" value={amendSettlementStatusInput} onChange={(event) => setAmendSettlementStatusInput(event.target.value)} disabled={amending || cancelling}>
            {settlementStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Trader User</span>
          <input className="control" value={amendTraderUserInput} onChange={(event) => setAmendTraderUserInput(event.target.value)} disabled={amending || cancelling} />
        </label>
      </div>

      <section className="feedback-banner trade-review-card">
        <strong>{amendmentPreviewFields.length > 0 ? `Amendment Preview (${amendmentPreviewFields.length})` : 'No changes staged yet'}</strong>
        <p>Only the fields below will be written into the `TradeAmended` event.</p>
        <div className="change-pill-row">
          {amendmentPreviewFields.length > 0 ? amendmentPreviewFields.map((field) => (
            <span key={field} className="change-pill">
              {field}
            </span>
          )) : (
            <span className="change-pill change-pill-muted">Edit one or more fields to stage an amendment.</span>
          )}
        </div>
      </section>

      {tradeStructureSupportsLegs(amendTradeStructureInput) && (
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

      <div className="stack-actions">
        <button type="submit" className="button button-primary" disabled={amending || cancelling || amendmentPreviewFields.length === 0}>
          {amending ? 'Applying...' : amendmentPreviewFields.length > 0 ? `Apply ${amendmentPreviewFields.length} Change${amendmentPreviewFields.length === 1 ? '' : 's'}` : 'Apply Amendment'}
        </button>
        <button type="button" className="button button-secondary" onClick={() => setCancelReviewOpen((current) => !current)} disabled={amending || cancelling}>
          {cancelReviewOpen ? 'Close Cancel Review' : 'Review Cancel'}
        </button>
      </div>

      {cancelReviewOpen && (
        <section className="feedback-banner feedback-banner-error trade-review-card">
          <strong>Cancel Trade</strong>
          <p>{cancelImpactSummary}</p>
          <label className="field">
            <span>Cancellation Reason</span>
            <textarea
              className="control control-textarea"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Explain why this trade should be cancelled."
              disabled={amending || cancelling}
            />
          </label>
          <div className="stack-actions">
            <button
              type="button"
              className="button button-danger"
              onClick={() => handleCancelTrade(cancelReason)}
              disabled={amending || cancelling || cancelReason.trim() === ''}
            >
              {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setCancelReviewOpen(false)} disabled={amending || cancelling}>
              Keep Trade Active
            </button>
          </div>
        </section>
      )}

      <p className={`form-note ${amendError ? 'form-note-error' : ''}`}>
        {amendError || 'Amendments now submit only changed fields, SWAP headers stay aligned to Leg 1 instead of duplicating leg economics, and option tickets keep premium plus strike and expiry on the trade header.'}
      </p>
    </form>
  )
}
