import { useEffect, type ReactNode } from 'react'

import { TradeLegEditor } from './TradeLegEditor'
import { TradeFormDisclosure } from './TradeFormDisclosure'
import {
  buildCounterpartyCreditRestrictionMessage,
  type CounterpartyCreditPolicyPreview,
} from './counterpartyCredit'
import {
  CounterpartySearchField,
  ReferenceSearchField,
  useReferenceSearchDisplayState,
} from './tradeSearchFields'
import { combineLocalDateTimeInput, splitLocalDateTimeInput } from './tradeDraftUtils'
import { tradeTooltipCopy } from './tooltipCopy'
import type {
  PreTradeReviewCaptureContext,
  PreTradeReviewDriftRecord,
} from '../../shared/models'
import { FieldLabel } from '../../shared/ui/Tooltip'
import type { TradeCaptureAppliedRule } from '../../shared/tradeCaptureSettings'
import {
  defaultTradeExecutionTime,
  getQualitySpecOptionsForCommodity,
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
  onClearForm: () => void
  tradeIdInput: string
  tradeNatureInput: string
  setTradeNatureInput: (value: string) => void
  tradeStructureInput: string
  setTradeStructureInput: (value: string) => void
  tradeSideInput: string
  setTradeSideInput: (value: string) => void
  bookInput: string
  setBookInput: (value: string) => void
  bookSearchInput: string
  setBookSearchInput: (value: string) => void
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
  showPriceIndexField: boolean
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
  portfolioSearchInput: string
  setPortfolioSearchInput: (value: string) => void
  createPortfolioOptions: PortfolioRecord[]
  counterpartyInput: string
  setCounterpartyInput: (value: string) => void
  counterpartySearchInput: string
  setCounterpartySearchInput: (value: string) => void
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
  showOptionFields: boolean
  settlementStatusInput: string
  setSettlementStatusInput: (value: string) => void
  activeRuleMatches: TradeCaptureAppliedRule[]
  traderUserInput: string
  setTraderUserInput: (value: string) => void
  createLegs: TradeLegDraft[]
  activeCommodities: ReferenceRecord[]
  addDraftLeg: () => void
  removeDraftLeg: (index: number) => void
  updateDraftLeg: (index: number, field: keyof TradeLegDraft, value: string) => void
  duplicateSourceTradeId: string | null
  preTradeReviewContext: PreTradeReviewCaptureContext | null
  preTradeReviewDrift: PreTradeReviewDriftRecord | null
  preTradeReviewDriftLoading: boolean
  preTradeReviewDriftError: string
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
  pricingTypesRequiringExplicitPrice: readonly string[]
  pricingTypesRequiringPriceIndex: readonly string[]
  formatCommodityClass: (value: string) => string
}

type TradeCaptureSectionProps = {
  step: string
  title: string
  description: string
  children: ReactNode
}

function TradeCaptureSection({ step, title, description, children }: TradeCaptureSectionProps) {
  return (
    <section className="trade-form-section field-full">
      <div className="trade-form-section-head">
        <div>
          <span className="trade-form-section-step">Step {step}</span>
          <h4>{title}</h4>
        </div>
        <p>{description}</p>
      </div>
      <div className="trade-form-section-grid">{children}</div>
    </section>
  )
}

export function TradeCaptureForm(props: TradeCaptureFormProps) {
  const {
    onSubmit,
    onClearForm,
    tradeIdInput,
    tradeNatureInput,
    setTradeNatureInput,
    tradeStructureInput,
    setTradeStructureInput,
    tradeSideInput,
    setTradeSideInput,
    bookInput,
    setBookInput,
    bookSearchInput,
    setBookSearchInput,
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
    showPriceIndexField,
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
    portfolioSearchInput,
    setPortfolioSearchInput,
    createPortfolioOptions,
    counterpartyInput,
    setCounterpartyInput,
    counterpartySearchInput,
    setCounterpartySearchInput,
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
    showOptionFields,
    settlementStatusInput,
    setSettlementStatusInput,
    activeRuleMatches,
    traderUserInput,
    setTraderUserInput,
    createLegs,
    activeCommodities,
    addDraftLeg,
    removeDraftLeg,
    updateDraftLeg,
    duplicateSourceTradeId,
    preTradeReviewContext,
    preTradeReviewDrift,
    preTradeReviewDriftLoading,
    preTradeReviewDriftError,
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
    pricingTypesRequiringExplicitPrice,
    pricingTypesRequiringPriceIndex,
    formatCommodityClass,
  } = props
  const { date: executionDateInput, time: executionTimeInput } = splitLocalDateTimeInput(executionTimestampInput)
  const qualitySpecOptions = getQualitySpecOptionsForCommodity(commodityInput)
  const qualitySpecListId = qualitySpecOptions.length > 0 ? 'trade-quality-spec-options' : undefined
  const optionTrade = tradeInstrumentUsesOptionFields(tradeInstrumentTypeInput)
  const structureUsesLegs = tradeStructureSupportsLegs(tradeStructureInput)
  const pricingTypeNeedsExplicitPrice = pricingTypesRequiringExplicitPrice.includes(pricingTypeInput)
  const pricingTypeNeedsPriceIndex = pricingTypesRequiringPriceIndex.includes(pricingTypeInput)
  const selectedCommodity =
    createCommodityOptions.find((commodity) => commodity.code === commodityInput) ?? null
  const selectedCounterparty =
    createCounterpartyOptions.find((counterparty) => counterparty.code === counterpartyInput) ?? null
  const selectedLocation = createLocationOptions.find((location) => location.code === locationInput) ?? null
  const [commoditySearchInput, setCommoditySearchInput] = useReferenceSearchDisplayState(
    selectedCommodity,
    commodityInput,
  )
  const [locationSearchInput, setLocationSearchInput] = useReferenceSearchDisplayState(
    selectedLocation,
    locationInput,
  )
  const counterpartyCreditWarning = buildCounterpartyCreditRestrictionMessage(selectedCounterparty)

  const timingSummary = executionDateInput
    ? [executionDateInput, executionTimeInput || defaultTradeExecutionTime].filter(Boolean).join(' • ')
    : 'Execution not scheduled yet'
  const productSummary = structureUsesLegs
    ? createLegs[0]?.commodity || 'Leg 1 sets the product once selected'
    : commodityInput || 'Choose a commodity to define the ticket'
  const pricingSummary = [pricingTypeInput, pricingStatusInput, `Settlement ${settlementStatusInput}`].join(' • ')
  const activeRuleCount = activeRuleMatches.length
  const showDeskMetadata = externalTradeIdInput.trim().length > 0 || traderUserInput.trim().length > 0
  const showScheduleOverrides =
    tradeDateInput.trim().length > 0 ||
    effectiveStartDateInput.trim().length > 0 ||
    effectiveEndDateInput.trim().length > 0
  const preTradeReviewExcerpt = preTradeReviewContext?.reviewNotes?.trim() || preTradeReviewContext?.reviewThesis?.trim() || ''
  const preTradeReviewBookingBlocked =
    Boolean(preTradeReviewContext) &&
    (
      preTradeReviewDriftLoading ||
      preTradeReviewDrift?.requires_reapproval === true ||
      preTradeReviewDrift?.alignment_status === 'NOT_APPROVED'
    )
  const hasAlignedPreTradeReview =
    preTradeReviewContext &&
    !preTradeReviewDriftLoading &&
    !preTradeReviewDriftError &&
    preTradeReviewDrift?.alignment_status === 'ALIGNED'
  const hasReapprovalBlockedPreTradeReview =
    preTradeReviewContext &&
    !preTradeReviewDriftLoading &&
    preTradeReviewDrift?.requires_reapproval
  const hasNotApprovedPreTradeReview =
    preTradeReviewContext &&
    !preTradeReviewDriftLoading &&
    preTradeReviewDrift?.alignment_status === 'NOT_APPROVED'

  useEffect(() => {
    if (!selectedCommodity && commodityInput.trim().length === 0) {
      setCommoditySearchInput('')
    }
  }, [commodityInput, selectedCommodity, setCommoditySearchInput])

  useEffect(() => {
    if (!selectedLocation && locationInput.trim().length === 0) {
      setLocationSearchInput('')
    }
  }, [locationInput, selectedLocation, setLocationSearchInput])

  function handleCommodityClassSelection(value: string) {
    if (value !== commodityClassInput) {
      setCommoditySearchInput('')
    }

    setCommodityClassInput(value)
  }

  return (
    <form className="trade-form trade-form-feature" onSubmit={onSubmit}>
      <input type="hidden" value={sourceSystemInput || ''} readOnly />

      <section className="trade-form-overview field-full">
        <div className="trade-form-overview-head">
          <div>
            <span className="eyebrow">Ticket Flow</span>
            <h3>{tradeIdInput}</h3>
            <p>Capture the common path first. Desk metadata, schedule overrides, and workflow defaults stay tucked away until needed.</p>
          </div>
          <div className="trade-form-overview-meta">
            <span className="entity-chip">{duplicateSourceTradeId ? `Duplicating ${duplicateSourceTradeId}` : 'New Ticket'}</span>
            <span className="entity-chip entity-chip-soft">{tradeInstrumentTypeInput}</span>
            <span className="entity-chip entity-chip-soft">{tradeStructureInput}</span>
            <span className="entity-chip entity-chip-soft">Pricing {pricingStatusInput}</span>
            <span className="entity-chip entity-chip-soft">Settlement {settlementStatusInput}</span>
          </div>
        </div>

        <div className="trade-form-overview-grid">
          <article className="trade-form-overview-card">
            <span>Ticket</span>
            <strong>{tradeIdInput}</strong>
            <p>{duplicateSourceTradeId ? 'Fresh trade number reserved for the duplicated ticket.' : 'Trade number is reserved automatically and stays read-only.'}</p>
          </article>
          <article className="trade-form-overview-card">
            <span>Structure</span>
            <strong>{[tradeInstrumentTypeInput, tradeNatureInput, tradeStructureInput].join(' • ')}</strong>
            <p>{structureUsesLegs ? 'Swap legs will drive the commodity and volume.' : `Header side is ${tradeSideInput}.`}</p>
          </article>
          <article className="trade-form-overview-card">
            <span>Timing</span>
            <strong>{timingSummary}</strong>
            <p>{locationInput || deliveryStartInput || deliveryEndInput ? [locationInput || 'Location pending', deliveryStartInput || 'Delivery start pending', deliveryEndInput || 'Delivery end pending'].filter(Boolean).join(' • ') : 'Add execution, effective, and delivery dates in the scheduling section.'}</p>
          </article>
          <article className="trade-form-overview-card">
            <span>Pricing</span>
            <strong>{pricingSummary}</strong>
            <p>{productSummary}</p>
          </article>
        </div>

        <div className="trade-form-rule-panel">
          <div className="trade-form-rule-head">
            <div>
              <span>Active Rules</span>
              <strong>
                {activeRuleCount === 0
                  ? 'Baseline defaults only'
                  : `${activeRuleCount} rule${activeRuleCount === 1 ? '' : 's'} shaping this ticket`}
              </strong>
            </div>
            <p>
              {activeRuleCount === 0
                ? 'Nothing conditional is matched right now. The form is following the baseline setup plus the built-in relevance rules for options, swaps, and pricing.'
                : 'These rules matched from Settings and explain why the form defaulted values or changed field visibility.'}
            </p>
          </div>

          {activeRuleCount === 0 ? (
            <p className="trade-form-rule-empty">
              Open Settings and add rule packs if this ticket should react to instrument, structure, pricing, commodity class, or book.
            </p>
          ) : (
            <div className="trade-form-rule-list">
              {activeRuleMatches.map((rule, index) => (
                <article key={rule.id} className="trade-form-rule-card">
                  <div className="trade-form-rule-card-head">
                    <strong>{rule.name}</strong>
                    <span className="entity-chip entity-chip-soft">Rule {index + 1}</span>
                  </div>
                  <p>{rule.reasons.join(' • ')}</p>
                  <div className="trade-form-rule-tags">
                    {rule.effects.map((effect) => (
                      <span key={`${rule.id}-${effect}`} className="entity-chip">
                        {effect}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {duplicateSourceTradeId && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-success trade-structure-note">
            <strong>Duplicating {duplicateSourceTradeId}</strong>
            <p>Trade number was regenerated, external IDs are blank, execution time is reset, and settlement starts back at PENDING.</p>
          </div>
        </div>
      )}

      {preTradeReviewContext && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-success trade-structure-note">
            <strong>Approved pre-trade review attached</strong>
            <p>
              {`Review #${preTradeReviewContext.reviewId} ${preTradeReviewContext.reviewName} is attached to this ticket and will be copied onto the confirmation workflow item when the trade is created.`}
            </p>
            {preTradeReviewContext.recommendationRunId ? (
              <p>
                {`Recommendation #${preTradeReviewContext.recommendationRunId} is attached${preTradeReviewContext.recommendationScore !== null ? ` with score ${preTradeReviewContext.recommendationScore}` : ''}.`}
              </p>
            ) : null}
            {preTradeReviewContext.recommendationRationale ? (
              <p>{`Rationale: ${preTradeReviewContext.recommendationRationale}`}</p>
            ) : null}
            {preTradeReviewContext.recommendationOverrideReason ? (
              <p>
                {`Recommendation override: ${preTradeReviewContext.recommendationOverrideReason}`}
              </p>
            ) : null}
            {preTradeReviewExcerpt ? <p>{preTradeReviewExcerpt}</p> : null}
          </div>
        </div>
      )}

      {preTradeReviewContext && preTradeReviewDriftLoading && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-success trade-structure-note">
            <strong>Checking current approval alignment</strong>
            <p>{`Review #${preTradeReviewContext.reviewId} is being checked against the latest recommendation and evidence before booking.`}</p>
          </div>
        </div>
      )}

      {hasAlignedPreTradeReview && preTradeReviewDrift && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-success trade-structure-note">
            <strong>Still Aligned</strong>
            <p>{`Review #${preTradeReviewContext.reviewId} still matches its approval-time recommendation and evidence.`}</p>
            {preTradeReviewDrift.latest_recommendation_run_id ? (
              <p>
                {`Latest live recommendation is #${preTradeReviewDrift.latest_recommendation_run_id}${preTradeReviewDrift.latest_recommendation_score !== null ? ` with score ${preTradeReviewDrift.latest_recommendation_score}` : ''}.`}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {hasReapprovalBlockedPreTradeReview && preTradeReviewDrift && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-error trade-structure-note">
            <strong>Re-Approval Required</strong>
            <p>{`Review #${preTradeReviewContext.reviewId} drifted after approval and must be approved again before this trade can be booked.`}</p>
            {preTradeReviewDrift.approved_recommendation_run_id ? (
              <p>
                {`Approved on recommendation #${preTradeReviewDrift.approved_recommendation_run_id}${preTradeReviewDrift.approved_recommendation_score !== null ? ` with score ${preTradeReviewDrift.approved_recommendation_score}` : ''}.`}
              </p>
            ) : null}
            {preTradeReviewDrift.current_recommendation_run_id ? (
              <p>
                {`Current attachment is recommendation #${preTradeReviewDrift.current_recommendation_run_id}${preTradeReviewDrift.current_recommendation_score !== null ? ` with score ${preTradeReviewDrift.current_recommendation_score}` : ''}.`}
              </p>
            ) : null}
            {preTradeReviewDrift.current_impaired_sources.length > 0 ? (
              <p>{`Impaired sources: ${preTradeReviewDrift.current_impaired_sources.join(', ')}.`}</p>
            ) : null}
            <ul>
              {preTradeReviewDrift.reasons.map((reason) => (
                <li key={reason.code}>
                  <strong>{reason.summary}</strong>
                  {` ${reason.detail}`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {hasNotApprovedPreTradeReview && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-error trade-structure-note">
            <strong>Approval No Longer Active</strong>
            <p>{`Review #${preTradeReviewContext.reviewId} is no longer approved and must be approved again before booking.`}</p>
          </div>
        </div>
      )}

      {preTradeReviewContext && preTradeReviewDriftError && !preTradeReviewDriftLoading && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-error trade-structure-note">
            <strong>Could Not Verify Approval Drift</strong>
            <p>{preTradeReviewDriftError}</p>
            <p>Booking will still be checked server-side when you submit the trade.</p>
          </div>
        </div>
      )}

      {createError && (
        <div className="field-full">
          <div className="feedback-banner feedback-banner-error trade-structure-note">
            <strong>Trade cannot be created yet</strong>
            <p>{createError}</p>
          </div>
        </div>
      )}

      <TradeCaptureSection
        step="1"
        title="Ticket Setup"
        description="Shape the ticket first, then assign the desk. Source-system linkage and trader attribution stay collapsed unless you need them."
      >
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
            disabled={structureUsesLegs}
          >
            {tradeSideOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <ReferenceSearchField
          label="Book"
          selectedCode={bookInput}
          setSelectedCode={setBookInput}
          searchInput={bookSearchInput}
          setSearchInput={setBookSearchInput}
          options={activeBooks}
          disabled={submitting || referenceDataLoading || activeBooks.length === 0}
          allowEmpty={false}
          preserveSelectionWhileSearching
          placeholder="Search by book name or code"
          idleHelperText="Search by book name or code."
          unmatchedHelperText="No exact book is selected yet. Choose a result to move the ticket."
          emptyStateText="No books match that search yet."
          selectedHelperText={(book) => `Booking into ${book.code}.`}
          searchingHelperText={(book) => `Current book stays ${book.code} until you choose a new result.`}
          buildSecondaryLabel={(book) => book.code}
        />
        <ReferenceSearchField
          label="Portfolio"
          selectedCode={portfolioInput}
          setSelectedCode={setPortfolioInput}
          searchInput={portfolioSearchInput}
          setSearchInput={setPortfolioSearchInput}
          options={createPortfolioOptions}
          disabled={submitting || createPortfolioOptions.length === 0}
          allowEmpty
          placeholder="Search by portfolio name or code"
          idleHelperText={
            createPortfolioOptions.length === 0
              ? 'No active portfolios are configured for the current book yet.'
              : 'Search by portfolio name or code. Leave blank for no portfolio.'
          }
          unmatchedHelperText="No exact portfolio is selected yet. Choose a result or clear the field for no portfolio."
          emptyStateText="No portfolios match that search yet."
          selectedHelperText={(portfolio) => `Allocating to ${portfolio.code}.`}
          buildSecondaryLabel={(portfolio) => `${portfolio.code} · ${portfolio.book_code}`}
        />
        <CounterpartySearchField
          counterpartyInput={counterpartyInput}
          setCounterpartyInput={setCounterpartyInput}
          counterpartySearchInput={counterpartySearchInput}
          setCounterpartySearchInput={setCounterpartySearchInput}
          createCounterpartyOptions={createCounterpartyOptions}
          disabled={submitting}
        />

        <TradeFormDisclosure
          title="Desk Metadata"
          summary="External linkage and trader attribution"
          description="The common path is already above. Open this only when the ticket needs a source-system ID or explicit trader ownership."
          defaultOpen={showDeskMetadata}
        >
          <label className="field">
            <div className="trade-form-field-title">
              <span>Trade #</span>
              <span className="entity-chip entity-chip-soft">Auto-generated</span>
            </div>
            <input className="control control-readonly" value={tradeIdInput} readOnly spellCheck={false} />
            <p className="trade-form-helper">A fresh trade number is created automatically whenever you start over or duplicate a ticket.</p>
          </label>
          <label className="field">
            <span>External Trade ID</span>
            <input
              className="control"
              value={externalTradeIdInput}
              onChange={(event) => setExternalTradeIdInput(event.target.value)}
              placeholder="EXT-48291"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Trader User</span>
            <input
              className="control"
              value={traderUserInput}
              onChange={(event) => setTraderUserInput(event.target.value)}
              placeholder="trader.alpha"
              disabled={submitting}
            />
          </label>
        </TradeFormDisclosure>

        {counterpartyCreditWarning && (
          <div className="field-full">
            <div className="feedback-banner feedback-banner-error trade-structure-note">
              <strong>Counterparty blocked for trading</strong>
              <p>{counterpartyCreditWarning}</p>
            </div>
          </div>
        )}
        {counterpartyCreditPolicyPreview && (
          <div className="field-full">
            <div
              className={`feedback-banner ${counterpartyCreditPolicyPreview.tone === 'error' ? 'feedback-banner-error' : ''} trade-structure-note`}
            >
              <strong>{counterpartyCreditPolicyPreview.title}</strong>
              <p>{counterpartyCreditPolicyPreview.message}</p>
            </div>
          </div>
        )}
      </TradeCaptureSection>

      <TradeCaptureSection
        step="2"
        title="Dates And Delivery"
        description="Anchor the live window here first. Trade date and effective-range overrides stay collapsed unless the default timeline needs help."
      >
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
        <ReferenceSearchField
          label="Location"
          selectedCode={locationInput}
          setSelectedCode={setLocationInput}
          searchInput={locationSearchInput}
          setSearchInput={setLocationSearchInput}
          options={createLocationOptions}
          disabled={submitting}
          allowEmpty
          preserveSelectionWhileSearching
          placeholder="Search by location name or code"
          idleHelperText="Search by location name or code. Leave blank for no location."
          unmatchedHelperText="No exact location is selected yet. Choose a result or clear the field for no location."
          emptyStateText="No locations match that search yet."
          selectedHelperText={(location) => `Delivering at ${location.code}.`}
          searchingHelperText={(location) => `Current location stays ${location.code} until you choose a new result.`}
          buildSecondaryLabel={(location) => location.code}
        />
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

        <TradeFormDisclosure
          title="Schedule Overrides"
          summary="Trade date and effective window"
          description="Execution date normally sets the trade day. Open this only when you need an explicit trade date or a separate effective range."
          defaultOpen={showScheduleOverrides}
        >
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
        </TradeFormDisclosure>
      </TradeCaptureSection>

      <TradeCaptureSection
        step="3"
        title="Market And Terms"
        description="Pick the product and contract terms here. The section still adapts when the ticket becomes a swap or an option."
      >
        {structureUsesLegs ? (
          <div className="field-full">
            <div className="feedback-banner trade-structure-note">
              <strong>Swap trades are leg-driven.</strong>
              <p>Leg 1 now defines the primary commodity automatically, and top-level volume stays off the trade header.</p>
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              <span>Commodity Class</span>
              <select
                className="control"
                value={commodityClassInput}
                onChange={(event) => handleCommodityClassSelection(event.target.value)}
                disabled={submitting || referenceDataLoading || commodityClassOptions.length === 0}
              >
                {commodityClassOptions.map((commodityClass) => (
                  <option key={commodityClass} value={commodityClass}>
                    {formatCommodityClass(commodityClass)}
                  </option>
                ))}
              </select>
            </label>
            <ReferenceSearchField
              label="Commodity"
              selectedCode={commodityInput}
              setSelectedCode={setCommodityInput}
              searchInput={commoditySearchInput}
              setSearchInput={setCommoditySearchInput}
              options={createCommodityOptions}
              disabled={submitting || referenceDataLoading || createCommodityOptions.length === 0}
              allowEmpty={false}
              preserveSelectionWhileSearching
              placeholder="Search by commodity name or code"
              idleHelperText="Search by commodity name or code."
              unmatchedHelperText="No exact commodity is selected yet. Choose a result to update the ticket."
              emptyStateText="No commodities match that search yet."
              selectedHelperText={(commodity) => `Ticketing ${commodity.code}.`}
              searchingHelperText={(commodity) => `Current commodity stays ${commodity.code} until you choose a new result.`}
              buildSecondaryLabel={(commodity) => commodity.code}
            />
          </>
        )}

        {showOptionFields && (
          <div className="field-full">
            <div className="feedback-banner trade-structure-note">
              <strong>Option tickets stay single-leg and financial.</strong>
              <p>Premium is captured in the price field, the commodity remains the underlying, and expiry plus strike stay visible in this section.</p>
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
        {showOptionFields && (
          <>
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
          </>
        )}

        {structureUsesLegs && (
          <div className="field-full">
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
          </div>
        )}
      </TradeCaptureSection>

      <TradeCaptureSection
        step="4"
        title="Pricing And Settlement"
        description="Finish the economic terms here. Workflow defaults stay collapsed until the ticket needs a non-standard pricing or settlement posture."
      >
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
          <span>{optionTrade ? 'Premium' : pricingTypeNeedsExplicitPrice ? 'Price Differential' : 'Price Differential (optional)'}</span>
          <input className="control" inputMode="decimal" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
        </label>
        {!structureUsesLegs && (
          <label className="field">
            <span>{optionTrade ? 'Contracts' : 'Volume'}</span>
            <input className="control" inputMode="decimal" value={volumeInput} onChange={(event) => setVolumeInput(event.target.value)} />
          </label>
        )}
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
        {showPriceIndexField && (
          <label className="field field-full">
            <FieldLabel label="Price Index" tooltip={tradeTooltipCopy.priceIndex} />
            <select
              className="control"
              value={priceIndexInput}
              onChange={(event) => setPriceIndexInput(event.target.value)}
              disabled={optionTrade || !pricingTypeNeedsPriceIndex || createPriceIndexOptions.length === 0}
            >
              <option value="">No price index</option>
              {createPriceIndexOptions.map((priceIndex) => (
                <option key={priceIndex.code} value={priceIndex.code}>
                  {priceIndex.code} · {priceIndex.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <TradeFormDisclosure
          title="Workflow Defaults"
          summary="Pricing and settlement status"
          description="Most tickets can keep the defaults shown in the overview. Open this only when the trade is already priced or settled on arrival."
        >
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
        </TradeFormDisclosure>
      </TradeCaptureSection>

      <section className="trade-form-actions field-full">
        <div className="trade-form-actions-copy">
          <span className="eyebrow">Finish</span>
          <strong>{hasReferenceOptions ? 'Create the trade when the ticket looks right.' : 'Trade entry is waiting on reference data.'}</strong>
          <p>
            {hasReferenceOptions
              ? 'Trade numbers are generated automatically. Pick an execution date to default the time to midnight. INDEX deals can omit price differential, SWAP deals derive the summary from Leg 1, and option tickets book premium plus strike and expiry on single-leg trades.'
              : 'Trade entry is disabled until at least one active book and one active commodity exist in reference data.'}
          </p>
        </div>
        <div className="stack-actions">
          <button type="button" className="button button-ghost" onClick={onClearForm} disabled={submitting}>
            Clear Form
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={submitting || referenceDataLoading || !hasReferenceOptions || preTradeReviewBookingBlocked}
          >
            {submitting ? 'Submitting...' : 'Create Trade'}
          </button>
        </div>
      </section>
    </form>
  )
}
