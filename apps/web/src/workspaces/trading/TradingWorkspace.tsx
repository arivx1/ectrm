import { TradeCaptureForm } from '../../features/trades/TradeCaptureForm'
import { TradeAmendForm } from '../../features/trades/TradeAmendForm'
import type { CounterpartyCreditPolicyPreview } from '../../features/trades/counterpartyCredit'
import type { TradeCreditExceptionRecord, TradeWorkflowItemRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  calculateDaysToExpiration,
  calculatePremiumCashflow,
  calculateUnderlyingEquivalentVolume,
} from '../../shared/optionExposure'
import { DataSheet, type DataSheetColumn } from '../../shared/ui/DataSheet'
import { TileLayout } from '../../shared/ui/TileLayout'
import { tradeTooltipCopy } from '../../features/trades/tooltipCopy'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'
import {
  type OptionLifecycleEventType,
  tradeInstrumentUsesOptionFields,
  tradeStatusIsActive,
} from '../../shared/trading'

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
  instrument_type: string
  option_type: string | null
  option_style: string | null
  option_strike_price: number | null
  option_expiration_date: string | null
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
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  invoice_status: string
  payment_status: string
  execution_timestamp: string | null
  settlement_status: string
  trader_user: string | null
  status: string
  updated_at: string
  active_credit_exception?: TradeCreditExceptionRecord | null
  credit_approval_status?: string
  credit_hold_active?: boolean
  credit_hold_reason?: string | null
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

function creditApprovalLabel(value: string | undefined): string {
  return (value || 'NOT_REQUIRED').replaceAll('_', ' ')
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function snapshotNumber(snapshot: Record<string, unknown>, key: string): number | null {
  const value = snapshot[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function creditDecisionExposureSummary(decision: TradeWorkflowItemRecord['credit_decision_history'][number]): string | null {
  const currency = snapshotText(decision.breach_snapshot, 'limit_currency_code')
  const projected = snapshotNumber(decision.breach_snapshot, 'projected_exposure_amount')
  const limit = snapshotNumber(decision.breach_snapshot, 'limit_amount')
  const utilization = snapshotNumber(decision.breach_snapshot, 'projected_utilization_percent')
  if (currency && projected !== null && limit !== null) {
    const utilizationText = utilization !== null ? ` at ${utilization.toFixed(1)}% utilization` : ''
    return `Projected ${currency} ${projected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} versus limit ${currency} ${limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${utilizationText}.`
  }
  const comparisonReason = snapshotText(decision.breach_snapshot, 'comparison_reason')
  return comparisonReason ? `Snapshot basis: ${comparisonReason.replaceAll('_', ' ')}.` : null
}

function creditExceptionReasonLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized.replaceAll('_', ' ') : null
}

type TradingWorkspaceProps = {
  authSession: StoredAuthSession | null
  tradeCaptureFormProps: TradeCaptureFormProps
  trades: Trade[]
  tradeWorkflowItems: TradeWorkflowItemRecord[]
  selectedTrade: Trade | null
  selectedTradeId: string | null
  selectedTradeEvents: EventRow[]
  inspectorTab: InspectorTab
  setSelectedTradeId: (tradeId: string) => void
  setInspectorTab: (tab: InspectorTab) => void
  handleDuplicateTrade: () => void
  handleAmendTrade: (event: React.FormEvent) => void
  handleCancelTrade: (reason: string) => void
  handleOptionLifecycleEvent: (eventType: OptionLifecycleEventType) => void
  optionLifecycleSubmittingEvent: OptionLifecycleEventType | null
  amendmentPreviewFields: string[]
  cancelImpactSummary: string
  amendmentLockedReason: string
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
  amendBookInput: string
  setAmendBookInput: (value: string) => void
  amendBookOptions: ReferenceRecord[]
  amendPortfolioInput: string
  setAmendPortfolioInput: (value: string) => void
  amendPortfolioOptions: PortfolioRecord[]
  amendCounterpartyInput: string
  setAmendCounterpartyInput: (value: string) => void
  amendCounterpartyOptions: CounterpartyRecord[]
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
    tradeWorkflowItems,
    selectedTrade,
    selectedTradeId,
    selectedTradeEvents,
    inspectorTab,
    setSelectedTradeId,
    setInspectorTab,
    handleDuplicateTrade,
    handleAmendTrade,
    handleCancelTrade,
    handleOptionLifecycleEvent,
    optionLifecycleSubmittingEvent,
    amendmentPreviewFields,
    cancelImpactSummary,
    amendmentLockedReason,
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
    formatMoney,
    formatNumber,
    formatDate,
    formatDateOnly,
    statusTone,
  } = props
  const selectedTradeIsOption = selectedTrade
    ? tradeInstrumentUsesOptionFields(selectedTrade.instrument_type)
    : false
  const selectedTradeIsActive = selectedTrade ? tradeStatusIsActive(selectedTrade.status) : false
  const selectedTradePriceLabel = selectedTradeIsOption ? 'Premium' : 'Price'
  const selectedTradeVolumeLabel = selectedTradeIsOption ? 'Contracts' : 'Volume'
  const selectedTradePremiumCashflow = selectedTrade
    ? calculatePremiumCashflow(selectedTrade.trade_side, selectedTrade.price, selectedTrade.volume)
    : null
  const selectedTradeUnderlyingEquivalent = selectedTrade
    ? calculateUnderlyingEquivalentVolume(
        selectedTrade.trade_side,
        selectedTrade.option_type,
        selectedTrade.volume,
      )
    : 0
  const selectedTradeDaysToExpiration = selectedTrade
    ? calculateDaysToExpiration(selectedTrade.option_expiration_date)
    : null
  const canExpireOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTradeDaysToExpiration !== null &&
    selectedTradeDaysToExpiration <= 0
  const canExerciseOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTrade?.trade_side === 'BUY' &&
    selectedTradeDaysToExpiration !== null &&
    ((selectedTrade.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? selectedTradeDaysToExpiration === 0
      : selectedTradeDaysToExpiration >= 0)
  const canAssignOption =
    selectedTradeIsOption &&
    selectedTradeIsActive &&
    selectedTrade?.trade_side === 'SELL' &&
    selectedTradeDaysToExpiration !== null &&
    ((selectedTrade.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? selectedTradeDaysToExpiration === 0
      : selectedTradeDaysToExpiration >= 0)
  const optionLifecycleGuidance = selectedTradeIsOption
    ? (selectedTrade?.option_style ?? 'AMERICAN') === 'EUROPEAN'
      ? 'European options can only be exercised or assigned on expiration day. Expiry can be recorded once the expiration date is reached.'
      : 'American options can be exercised or assigned any time up to expiration. Expiry can be recorded once the expiration date is reached.'
    : ''
  const selectedTradeCreditWorkflowItem = selectedTrade
    ? tradeWorkflowItems.find(
        (item) => item.trade_id === selectedTrade.trade_id && item.workflow_type === 'CREDIT_APPROVAL',
      ) ?? null
    : null
  const selectedTradeOptionSettlementItem = selectedTrade
    ? tradeWorkflowItems.find(
        (item) => item.trade_id === selectedTrade.trade_id && item.workflow_type === 'OPTION_SETTLEMENT',
      ) ?? null
    : null

  const tradeBoardColumns: DataSheetColumn<Trade>[] = [
    {
      id: 'trade',
      label: 'Trade',
      width: '12rem',
      renderCell: (trade) => trade.trade_id,
    },
    {
      id: 'instrument',
      label: 'Instrument',
      width: '9rem',
      renderCell: (trade) => trade.instrument_type,
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
        <Tooltip content={tradeStatusIsActive(trade.status) ? tradeTooltipCopy.activeTrade : tradeTooltipCopy.closedTrade}>
          <span className={`status-pill status-pill-${statusTone(trade.status)} tooltip-trigger-hint`}>{trade.status}</span>
        </Tooltip>
      ),
    },
    {
      id: 'credit',
      label: 'Credit',
      width: '12rem',
      renderCell: (trade) =>
        trade.credit_hold_active ? (
          <span className="status-pill status-pill-blocked">{creditApprovalLabel(trade.credit_approval_status)}</span>
        ) : (
          <span className="entity-chip entity-chip-soft">
            {trade.credit_approval_status === 'APPROVED' ? 'APPROVED' : 'CLEAR'}
          </span>
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
            ? `${selectedTrade.instrument_type} • ${selectedTrade.trade_nature} • ${selectedTrade.trade_structure} • ${selectedTrade.book}`
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
                  {selectedTradeIsOption && selectedTradeIsActive ? (
                    <>
                      {selectedTrade.trade_side === 'BUY' ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOptionLifecycleEvent('OptionExercised')}
                          disabled={!canExerciseOption || optionLifecycleSubmittingEvent !== null}
                        >
                          {optionLifecycleSubmittingEvent === 'OptionExercised' ? 'Exercising...' : 'Exercise Option'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOptionLifecycleEvent('OptionAssigned')}
                          disabled={!canAssignOption || optionLifecycleSubmittingEvent !== null}
                        >
                          {optionLifecycleSubmittingEvent === 'OptionAssigned' ? 'Assigning...' : 'Assign Option'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleOptionLifecycleEvent('OptionExpired')}
                        disabled={!canExpireOption || optionLifecycleSubmittingEvent !== null}
                      >
                        {optionLifecycleSubmittingEvent === 'OptionExpired' ? 'Expiring...' : 'Expire Option'}
                      </button>
                    </>
                  ) : null}
                </div>
              )}

              {selectedTrade && (
                <section className="trade-inspector-summary">
                  <div className="trade-inspector-summary-copy">
                    <span className="eyebrow">Active Ticket</span>
                    <strong>{selectedTrade.commodity}</strong>
                    <p>
                      {selectedTrade.trade_side ?? 'LEG-DEFINED'} • {selectedTrade.instrument_type} • {selectedTrade.trade_nature} • {selectedTrade.book}
                    </p>
                  </div>

                  <div className="trade-inspector-pill-row">
                    <span className={`status-pill status-pill-${statusTone(selectedTrade.status)}`}>{selectedTrade.status}</span>
                    {selectedTrade.credit_hold_active ? (
                      <span className="status-pill status-pill-blocked">
                        Credit {creditApprovalLabel(selectedTrade.credit_approval_status)}
                      </span>
                    ) : null}
                    {selectedTrade.active_credit_exception ? (
                      <span className="entity-chip entity-chip-soft">
                        Exception to {formatDateOnly(selectedTrade.active_credit_exception.expires_at)}
                      </span>
                    ) : null}
                    <span className="entity-chip entity-chip-soft">Pricing {selectedTrade.pricing_status}</span>
                    <span className="entity-chip entity-chip-soft">Confirmation {selectedTrade.confirmation_status}</span>
                    <span className="entity-chip entity-chip-soft">Nomination {selectedTrade.nomination_status}</span>
                    <span className="entity-chip entity-chip-soft">Settlement {selectedTrade.settlement_status}</span>
                    <span className="entity-chip entity-chip-soft">Payment {selectedTrade.payment_status}</span>
                  </div>
                  {selectedTrade.credit_hold_active ? (
                    <p className="field-error">
                      {selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}
                    </p>
                  ) : null}
                  {selectedTrade.active_credit_exception?.revalidation_required ? (
                    <p className="field-error">
                      Credit exception needs fresh review: {creditExceptionReasonLabel(selectedTrade.active_credit_exception.revalidation_reason) ?? 'revalidation required'}.
                    </p>
                  ) : null}
                  {selectedTradeIsOption ? (
                    <p className="form-note">
                      {selectedTradeIsActive ? optionLifecycleGuidance : `This option is already closed as ${selectedTrade.status}.`}
                    </p>
                  ) : null}
                  {selectedTradeOptionSettlementItem ? (
                    <p className="form-note">
                      Operations workflow: {selectedTradeOptionSettlementItem.status.replaceAll('_', ' ')}
                      {selectedTradeOptionSettlementItem.due_at
                        ? ` due ${formatDateOnly(selectedTradeOptionSettlementItem.due_at)}.`
                        : '.'}{' '}
                      {selectedTradeOptionSettlementItem.notes ?? 'Book the resulting underlying handoff from this lifecycle event.'}
                    </p>
                  ) : null}

                  <div className="trade-inspector-summary-grid">
                    <article>
                      <span>{selectedTradePriceLabel}</span>
                      <strong>{formatMoney(selectedTrade.price)}</strong>
                    </article>
                    <article>
                      <span>{selectedTradeVolumeLabel}</span>
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
                    <span>Instrument</span>
                    <strong>{selectedTrade.instrument_type}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Nature</span>
                    <strong>{selectedTrade.trade_nature}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Trade Structure</span>
                    <strong>{selectedTrade.trade_structure}</strong>
                  </div>
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Lifecycle</span>
                      <strong>{selectedTrade.status}</strong>
                    </div>
                  )}
                  {selectedTradeOptionSettlementItem && (
                    <div className="detail-row">
                      <span>Option Settlement Workflow</span>
                      <strong>{selectedTradeOptionSettlementItem.status}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Type</span>
                      <strong>{selectedTrade.option_type ?? '—'}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Style</span>
                      <strong>{selectedTrade.option_style ?? '—'}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Option Expiration</span>
                      <strong>{formatDateOnly(selectedTrade.option_expiration_date)}</strong>
                    </div>
                  )}
                  {selectedTradeIsOption && (
                    <div className="detail-row">
                      <span>Strike Price</span>
                      <strong>{formatMoney(selectedTrade.option_strike_price)}</strong>
                    </div>
                  )}
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
                    <span>Confirmation Status</span>
                    <strong>{selectedTrade.confirmation_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Nomination Status</span>
                    <strong>{selectedTrade.nomination_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Allocation Status</span>
                    <strong>{selectedTrade.allocation_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Price Index</span>
                    <strong>{selectedTrade.price_index_code ?? '—'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{selectedTradePriceLabel}</span>
                    <strong>{formatMoney(selectedTrade.price)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{selectedTradeVolumeLabel}</span>
                    <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Invoice Status</span>
                    <strong>{selectedTrade.invoice_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Payment Status</span>
                    <strong>{selectedTrade.payment_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Settlement Status</span>
                    <strong>{selectedTrade.settlement_status}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Credit Approval</span>
                    <strong>{creditApprovalLabel(selectedTrade.credit_approval_status)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Credit Hold</span>
                    <strong>{selectedTrade.credit_hold_active ? 'ACTIVE' : 'CLEARED'}</strong>
                  </div>
                  {selectedTrade.credit_hold_active ? (
                    <div className="detail-row">
                      <span>Credit Hold Reason</span>
                      <strong>{selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}</strong>
                    </div>
                  ) : null}
                  {selectedTrade.active_credit_exception ? (
                    <>
                      <div className="detail-row">
                        <span>Credit Exception Expires</span>
                        <strong>{formatDate(selectedTrade.active_credit_exception.expires_at)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Approved Exception Ceiling</span>
                        <strong>
                          {selectedTrade.active_credit_exception.limit_currency_code}{' '}
                          {formatNumber(selectedTrade.active_credit_exception.approved_projected_exposure_amount, 2)}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Remaining Exception Headroom</span>
                        <strong>
                          {selectedTrade.active_credit_exception.remaining_headroom_amount !== null
                            ? `${selectedTrade.active_credit_exception.limit_currency_code} ${formatNumber(selectedTrade.active_credit_exception.remaining_headroom_amount, 2)}`
                            : '—'}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Exception Approved By</span>
                        <strong>{selectedTrade.active_credit_exception.approved_by}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Exception Revalidation</span>
                        <strong>
                          {selectedTrade.active_credit_exception.revalidation_required
                            ? creditExceptionReasonLabel(selectedTrade.active_credit_exception.revalidation_reason) ?? 'REQUIRED'
                            : 'WITHIN APPROVED ENVELOPE'}
                        </strong>
                      </div>
                    </>
                  ) : null}
                  {selectedTradeCreditWorkflowItem?.credit_decision_history.length ? (
                    <div className="stack">
                      <span className="eyebrow">Credit Decisions</span>
                      <div className="timeline">
                        {selectedTradeCreditWorkflowItem.credit_decision_history.map((decision) => (
                          <article key={decision.decision_id} className="timeline-item">
                            <div className="timeline-dot" />
                            <div className="timeline-body">
                              <div className="timeline-head">
                                <strong>{creditApprovalLabel(decision.decision)}</strong>
                                <span>{formatDate(decision.decided_at)}</span>
                              </div>
                              <p>{decision.decision_comment}</p>
                              <p>
                                {decision.decided_by}
                                {creditDecisionExposureSummary(decision)
                                  ? ` • ${creditDecisionExposureSummary(decision)}`
                                  : ''}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                  amendmentLockedReason={amendmentLockedReason}
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
                  amendPriceUnitOptions={amendPriceUnitOptions}
                  amendTradeInstrumentTypeInput={amendTradeInstrumentTypeInput}
                  setAmendTradeInstrumentTypeInput={setAmendTradeInstrumentTypeInput}
                  amendOptionTypeInput={amendOptionTypeInput}
                  setAmendOptionTypeInput={setAmendOptionTypeInput}
                  amendOptionStyleInput={amendOptionStyleInput}
                  setAmendOptionStyleInput={setAmendOptionStyleInput}
                  amendOptionExpirationDateInput={amendOptionExpirationDateInput}
                  setAmendOptionExpirationDateInput={setAmendOptionExpirationDateInput}
                  amendOptionStrikePriceInput={amendOptionStrikePriceInput}
                  setAmendOptionStrikePriceInput={setAmendOptionStrikePriceInput}
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
                  amendConfirmationStatusInput={amendConfirmationStatusInput}
                  setAmendConfirmationStatusInput={setAmendConfirmationStatusInput}
                  amendNominationStatusInput={amendNominationStatusInput}
                  setAmendNominationStatusInput={setAmendNominationStatusInput}
                  amendAllocationStatusInput={amendAllocationStatusInput}
                  setAmendAllocationStatusInput={setAmendAllocationStatusInput}
                  amendPriceIndexInput={amendPriceIndexInput}
                  setAmendPriceIndexInput={setAmendPriceIndexInput}
                  amendPriceIndexOptions={amendPriceIndexOptions}
                  amendPriceInput={amendPriceInput}
                  setAmendPriceInput={setAmendPriceInput}
                  amendVolumeInput={amendVolumeInput}
                  setAmendVolumeInput={setAmendVolumeInput}
                  amendInvoiceStatusInput={amendInvoiceStatusInput}
                  setAmendInvoiceStatusInput={setAmendInvoiceStatusInput}
                  amendPaymentStatusInput={amendPaymentStatusInput}
                  setAmendPaymentStatusInput={setAmendPaymentStatusInput}
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
                  counterpartyCreditPolicyPreview={counterpartyCreditPolicyPreview}
                  tradeInstrumentTypeOptions={tradeInstrumentTypeOptions}
                  optionTypeOptions={optionTypeOptions}
                  optionStyleOptions={optionStyleOptions}
                  tradeNatureOptions={tradeNatureOptions}
                  tradeStructureOptions={tradeStructureOptions}
                  tradeSideOptions={tradeSideOptions}
                  pricingTypeOptions={pricingTypeOptions}
                  pricingStatusOptions={pricingStatusOptions}
                  confirmationStatusOptions={confirmationStatusOptions}
                  nominationStatusOptions={nominationStatusOptions}
                  allocationStatusOptions={allocationStatusOptions}
                  invoiceStatusOptions={invoiceStatusOptions}
                  paymentStatusOptions={paymentStatusOptions}
                  settlementStatusOptions={settlementStatusOptions}
                  formatCommodityClass={formatCommodityClass}
                />
              )}

              {selectedTrade && inspectorTab === 'risk' && (
                <div className="detail-list">
                  {selectedTradeIsOption ? (
                    <>
                      <div className="detail-row">
                        <InlineTooltipLabel tooltip={RISK_TOOLTIPS.notional} tooltipLabel="More information about notional">
                          Premium Cashflow
                        </InlineTooltipLabel>
                        <strong>
                          {selectedTradePremiumCashflow === null
                            ? '—'
                            : `${selectedTrade.trade_side === 'SELL' ? 'Received' : 'Paid'} ${formatMoney(Math.abs(selectedTradePremiumCashflow))}`}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Contracts</span>
                        <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Underlying Equivalent</span>
                        <strong>{formatNumber(selectedTradeUnderlyingEquivalent, 0)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Strike</span>
                        <strong>{formatMoney(selectedTrade.option_strike_price)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Expiration</span>
                        <strong>
                          {selectedTrade.option_expiration_date
                            ? `${formatDateOnly(selectedTrade.option_expiration_date)}${selectedTradeDaysToExpiration === null ? '' : ` · ${selectedTradeDaysToExpiration}d`}`
                            : '—'}
                        </strong>
                      </div>
                    </>
                  ) : (
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
                  )}
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
                    <strong>
                      {selectedTradeIsOption
                        ? selectedTradeUnderlyingEquivalent >= 0
                          ? 'Long Underlying Proxy'
                          : 'Short Underlying Proxy'
                        : (selectedTrade.volume ?? 0) >= 0
                          ? 'Long'
                          : 'Short'}
                    </strong>
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
