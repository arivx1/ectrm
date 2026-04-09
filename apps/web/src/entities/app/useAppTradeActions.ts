import { useMemo, useState } from 'react'

import { submitTradeEvent } from '../trade/api'
import { buildMutationRefreshGroups } from './workspaceRefresh'
import type { AppDataGroupFlags } from './workspaceLoading'
import type { useTradeAmendForm } from '../../features/trades/useTradeAmendForm'
import type { useTradeCaptureForm } from '../../features/trades/useTradeCaptureForm'
import {
  buildCounterpartyCreditPolicyPreview,
} from '../../features/trades/counterpartyCredit'
import {
  buildAmendTradeSubmission,
  buildCreateTradeSubmission,
  buildSuggestedTradeId,
  previewTradeAmendment,
} from '../../features/trades/tradeEventPayloads'
import { appConfig } from '../../shared/config'
import type {
  CounterpartyCreditProfileRecord,
  EventRow,
  InspectorTab,
  Trade,
  ViewKey,
} from '../../shared/models'
import { formatNumber } from '../../shared/format'
import {
  type OptionLifecycleEventType,
  tradeStatusIsActive,
  tradeStatusValues,
} from '../../shared/trading'

function parseOptionalTradeNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

type LoadData = (options?: {
  groups?: Array<keyof AppDataGroupFlags>
  force?: boolean
}) => Promise<void>

export function useAppTradeActions(args: {
  captureForm: ReturnType<typeof useTradeCaptureForm>
  amendForm: ReturnType<typeof useTradeAmendForm>
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  currentView: ViewKey
  groupLoaded: AppDataGroupFlags
  loadData: LoadData
  selectedTrade: Trade | null
  selectedTradeEvents: EventRow[]
  selectedTradeId: string | null
  setError: (value: string) => void
  setInspectorTab: (value: InspectorTab) => void
  trades: Trade[]
  navigateToTrade: (tradeId: string) => void
  navigateToView: (view: ViewKey) => void
  findCounterpartyCreditRestriction: (counterpartyCode: string) => string | null
}) {
  const {
    captureForm,
    amendForm,
    counterpartyCreditProfiles,
    currentView,
    groupLoaded,
    loadData,
    selectedTrade,
    selectedTradeEvents,
    selectedTradeId,
    setError,
    setInspectorTab,
    trades,
    navigateToTrade,
    navigateToView,
    findCounterpartyCreditRestriction,
  } = args

  const [createError, setCreateError] = useState('')
  const [amendError, setAmendError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [amending, setAmending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [optionLifecycleSubmittingEvent, setOptionLifecycleSubmittingEvent] =
    useState<OptionLifecycleEventType | null>(null)
  const [optionLifecycleSubmittingTradeId, setOptionLifecycleSubmittingTradeId] =
    useState<string | null>(null)

  async function refreshTradeMutationData() {
    await loadData({
      groups: buildMutationRefreshGroups({
        currentView,
        groupLoaded,
        mutation: 'trade-event',
      }),
      force: true,
    })
  }

  const createCounterpartyCreditPolicyPreview = useMemo(
    () =>
      buildCounterpartyCreditPolicyPreview({
        profiles: counterpartyCreditProfiles,
        trades,
        counterpartyCode: captureForm.counterpartyInput,
        tradeCurrencyCode: captureForm.tradeCurrencyInput,
        price: parseOptionalTradeNumber(captureForm.priceInput),
        volume: parseOptionalTradeNumber(captureForm.volumeInput),
      }),
    [
      captureForm.counterpartyInput,
      captureForm.priceInput,
      captureForm.tradeCurrencyInput,
      captureForm.volumeInput,
      counterpartyCreditProfiles,
      trades,
    ],
  )

  const amendCounterpartyCreditPolicyPreview = useMemo(
    () =>
      buildCounterpartyCreditPolicyPreview({
        profiles: counterpartyCreditProfiles,
        trades,
        tradeId: selectedTrade?.trade_id ?? null,
        counterpartyCode: amendForm.amendCounterpartyInput,
        tradeCurrencyCode: amendForm.amendTradeCurrencyInput,
        price: parseOptionalTradeNumber(amendForm.amendPriceInput),
        volume: parseOptionalTradeNumber(amendForm.amendVolumeInput),
      }),
    [
      amendForm.amendCounterpartyInput,
      amendForm.amendPriceInput,
      amendForm.amendTradeCurrencyInput,
      amendForm.amendVolumeInput,
      counterpartyCreditProfiles,
      selectedTrade?.trade_id,
      trades,
    ],
  )

  const amendmentPreview = useMemo(() => {
    if (!selectedTrade) {
      return {
        payload: {},
        changedFields: [],
        validationError: null,
      }
    }

    return previewTradeAmendment(selectedTrade, selectedTradeEvents, {
      externalTradeId: amendForm.amendExternalTradeIdInput,
      sourceSystem: amendForm.amendSourceSystemInput,
      executionTimestamp: amendForm.amendExecutionTimestampInput,
      tradeDate: amendForm.amendTradeDateInput,
      effectiveStartDate: amendForm.amendEffectiveStartDateInput,
      effectiveEndDate: amendForm.amendEffectiveEndDateInput,
      qualitySpec: amendForm.amendQualitySpecInput,
      unitOfMeasure: amendForm.amendUnitInput,
      tradeCurrencyCode: amendForm.amendTradeCurrencyInput,
      locationCode: amendForm.amendLocationInput,
      deliveryStart: amendForm.amendDeliveryStartInput,
      deliveryEnd: amendForm.amendDeliveryEndInput,
      priceUnitCode: amendForm.amendPriceUnitInput,
      instrumentType: amendForm.amendTradeInstrumentTypeInput,
      optionType: amendForm.amendOptionTypeInput,
      optionStyle: amendForm.amendOptionStyleInput,
      optionExpirationDate: amendForm.amendOptionExpirationDateInput,
      optionStrikePriceInput: amendForm.amendOptionStrikePriceInput,
      tradeNature: amendForm.amendTradeNatureInput,
      tradeStructure: amendForm.amendTradeStructureInput,
      tradeSide: amendForm.amendTradeSideInput,
      book: amendForm.amendBookInput,
      portfolio: amendForm.amendPortfolioInput,
      counterparty: amendForm.amendCounterpartyInput,
      commodityClass: amendForm.amendCommodityClassInput,
      commodity: amendForm.amendCommodityInput,
      pricingType: amendForm.amendPricingTypeInput,
      pricingStatus: amendForm.amendPricingStatusInput,
      confirmationStatus: amendForm.amendConfirmationStatusInput,
      nominationStatus: amendForm.amendNominationStatusInput,
      allocationStatus: amendForm.amendAllocationStatusInput,
      priceIndexCode: amendForm.amendPriceIndexInput,
      priceInput: amendForm.amendPriceInput,
      volumeInput: amendForm.amendVolumeInput,
      invoiceStatus: amendForm.amendInvoiceStatusInput,
      paymentStatus: amendForm.amendPaymentStatusInput,
      settlementStatus: amendForm.amendSettlementStatusInput,
      traderUser: amendForm.amendTraderUserInput,
      legs: amendForm.amendLegs,
    })
  }, [amendForm, selectedTrade, selectedTradeEvents])

  const cancelImpactSummary = useMemo(() => {
    if (!selectedTrade) {
      return ''
    }

    if (selectedTrade.trade_structure === 'SWAP') {
      return `This appends a TradeCancelled event and removes the trade's remaining leg-defined exposure from ${selectedTrade.book}.`
    }

    if (selectedTrade.volume === null) {
      return `This appends a TradeCancelled event and clears the trade from active exposure in ${selectedTrade.book}.`
    }

    return `This appends a TradeCancelled event and removes ${selectedTrade.trade_side ?? 'BUY'} ${formatNumber(Math.abs(selectedTrade.volume), 0)} ${selectedTrade.commodity} from active exposure in ${selectedTrade.book}.`
  }, [selectedTrade])

  const amendmentLockedReason = useMemo(() => {
    if (!selectedTrade || tradeStatusIsActive(selectedTrade.status)) {
      return ''
    }
    return `Trade ${selectedTrade.trade_id} is already closed as ${selectedTrade.status} and can no longer be amended or cancelled.`
  }, [selectedTrade])

  async function handleCreateTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreateError('')

    const counterpartyCreditRestriction = findCounterpartyCreditRestriction(captureForm.counterpartyInput)
    if (counterpartyCreditRestriction) {
      setCreateError(counterpartyCreditRestriction)
      return
    }
    if (createCounterpartyCreditPolicyPreview?.tone === 'error') {
      setCreateError(createCounterpartyCreditPolicyPreview.message)
      return
    }

    const submission = buildCreateTradeSubmission({
      tradeId: captureForm.tradeIdInput,
      externalTradeId: captureForm.externalTradeIdInput,
      sourceSystem: captureForm.sourceSystemInput,
      executionTimestamp: captureForm.executionTimestampInput,
      tradeDate: captureForm.tradeDateInput,
      effectiveStartDate: captureForm.effectiveStartDateInput,
      effectiveEndDate: captureForm.effectiveEndDateInput,
      qualitySpec: captureForm.qualitySpecInput,
      unitOfMeasure: captureForm.unitInput,
      tradeCurrencyCode: captureForm.tradeCurrencyInput,
      locationCode: captureForm.locationInput,
      deliveryStart: captureForm.deliveryStartInput,
      deliveryEnd: captureForm.deliveryEndInput,
      priceUnitCode: captureForm.priceUnitInput,
      instrumentType: captureForm.tradeInstrumentTypeInput,
      optionType: captureForm.optionTypeInput,
      optionStyle: captureForm.optionStyleInput,
      optionExpirationDate: captureForm.optionExpirationDateInput,
      optionStrikePriceInput: captureForm.optionStrikePriceInput,
      tradeNature: captureForm.tradeNatureInput,
      tradeStructure: captureForm.tradeStructureInput,
      tradeSide: captureForm.tradeSideInput,
      book: captureForm.bookInput,
      portfolio: captureForm.portfolioInput,
      counterparty: captureForm.counterpartyInput,
      commodityClass: captureForm.commodityClassInput,
      commodity: captureForm.commodityInput,
      pricingType: captureForm.pricingTypeInput,
      pricingStatus: captureForm.pricingStatusInput,
      priceIndexCode: captureForm.priceIndexInput,
      priceInput: captureForm.priceInput,
      volumeInput: captureForm.volumeInput,
      settlementStatus: captureForm.settlementStatusInput,
      traderUser: captureForm.traderUserInput,
      legs: captureForm.createLegs,
    })

    if (submission.validationError) {
      setCreateError(submission.validationError)
      return
    }

    if (!captureForm.tradeIdInput.trim()) {
      captureForm.setTradeIdInput(submission.tradeId)
    }

    setSubmitting(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: submission.tradeId,
        event_type: 'TradeCreated',
        payload: submission.payload,
      })

      await refreshTradeMutationData()
      navigateToTrade(submission.tradeId)
      captureForm.reset(buildSuggestedTradeId([...trades.map((trade) => trade.trade_id), submission.tradeId]))
      setCreateError('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create trade failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleResetCreateTradeForm() {
    setError('')
    setCreateError('')
    captureForm.reset()
  }

  function handleDuplicateTrade() {
    if (!selectedTrade) {
      return
    }

    captureForm.duplicateFromTrade(selectedTrade, selectedTradeEvents)
    setError('')
    setCreateError('')
    setAmendError('')
    navigateToView('trades')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAmendTrade(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAmendError('')

    if (!selectedTradeId || !selectedTrade) {
      setAmendError('Select a trade first.')
      return
    }

    const counterpartyCreditRestriction = findCounterpartyCreditRestriction(amendForm.amendCounterpartyInput)
    if (counterpartyCreditRestriction) {
      setAmendError(counterpartyCreditRestriction)
      return
    }
    if (amendCounterpartyCreditPolicyPreview?.tone === 'error') {
      setAmendError(amendCounterpartyCreditPolicyPreview.message)
      return
    }

    const submission = buildAmendTradeSubmission(selectedTrade, selectedTradeEvents, {
      externalTradeId: amendForm.amendExternalTradeIdInput,
      sourceSystem: amendForm.amendSourceSystemInput,
      executionTimestamp: amendForm.amendExecutionTimestampInput,
      tradeDate: amendForm.amendTradeDateInput,
      effectiveStartDate: amendForm.amendEffectiveStartDateInput,
      effectiveEndDate: amendForm.amendEffectiveEndDateInput,
      qualitySpec: amendForm.amendQualitySpecInput,
      unitOfMeasure: amendForm.amendUnitInput,
      tradeCurrencyCode: amendForm.amendTradeCurrencyInput,
      locationCode: amendForm.amendLocationInput,
      deliveryStart: amendForm.amendDeliveryStartInput,
      deliveryEnd: amendForm.amendDeliveryEndInput,
      priceUnitCode: amendForm.amendPriceUnitInput,
      instrumentType: amendForm.amendTradeInstrumentTypeInput,
      optionType: amendForm.amendOptionTypeInput,
      optionStyle: amendForm.amendOptionStyleInput,
      optionExpirationDate: amendForm.amendOptionExpirationDateInput,
      optionStrikePriceInput: amendForm.amendOptionStrikePriceInput,
      tradeNature: amendForm.amendTradeNatureInput,
      tradeStructure: amendForm.amendTradeStructureInput,
      tradeSide: amendForm.amendTradeSideInput,
      book: amendForm.amendBookInput,
      portfolio: amendForm.amendPortfolioInput,
      counterparty: amendForm.amendCounterpartyInput,
      commodityClass: amendForm.amendCommodityClassInput,
      commodity: amendForm.amendCommodityInput,
      pricingType: amendForm.amendPricingTypeInput,
      pricingStatus: amendForm.amendPricingStatusInput,
      confirmationStatus: amendForm.amendConfirmationStatusInput,
      nominationStatus: amendForm.amendNominationStatusInput,
      allocationStatus: amendForm.amendAllocationStatusInput,
      priceIndexCode: amendForm.amendPriceIndexInput,
      priceInput: amendForm.amendPriceInput,
      volumeInput: amendForm.amendVolumeInput,
      invoiceStatus: amendForm.amendInvoiceStatusInput,
      paymentStatus: amendForm.amendPaymentStatusInput,
      settlementStatus: amendForm.amendSettlementStatusInput,
      traderUser: amendForm.amendTraderUserInput,
      legs: amendForm.amendLegs,
    })

    if (submission.validationError) {
      setAmendError(submission.validationError)
      return
    }

    setAmending(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeAmended',
        payload: submission.payload,
      })

      await refreshTradeMutationData()
      setInspectorTab('overview')
      setAmendError('')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Amend trade failed.')
    } finally {
      setAmending(false)
    }
  }

  async function handleCancelTrade(reason: string) {
    setError('')
    setAmendError('')

    if (!selectedTradeId || !selectedTrade) {
      setAmendError('Select a trade first.')
      return
    }
    if (!tradeStatusIsActive(selectedTrade.status)) {
      setAmendError(`Trade ${selectedTrade.trade_id} is already closed as ${selectedTrade.status}.`)
      return
    }

    if (!reason.trim()) {
      setAmendError('Cancellation reason is required.')
      return
    }

    setCancelling(true)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: selectedTradeId,
        event_type: 'TradeCancelled',
        payload: {
          status: tradeStatusValues.cancelled,
          cancellation_reason: reason.trim(),
        },
      })

      await refreshTradeMutationData()
      setInspectorTab('overview')
    } catch (err) {
      setAmendError(err instanceof Error ? err.message : 'Cancel trade failed.')
    } finally {
      setCancelling(false)
    }
  }

  async function handleTradeOptionLifecycleEvent(
    tradeId: string,
    eventType: OptionLifecycleEventType,
  ) {
    setError('')
    setAmendError('')

    const trade = trades.find((candidate) => candidate.trade_id === tradeId) ?? null

    if (!trade) {
      setAmendError(`Trade ${tradeId} is not loaded.`)
      return
    }
    if (trade.instrument_type !== 'OPTION') {
      setAmendError(`Trade ${trade.trade_id} is not an option trade.`)
      return
    }
    if (!tradeStatusIsActive(trade.status)) {
      setAmendError(`Trade ${trade.trade_id} is already closed as ${trade.status}.`)
      return
    }

    const nextStatusByEvent: Record<OptionLifecycleEventType, string> = {
      OptionExercised: tradeStatusValues.exercised,
      OptionExpired: tradeStatusValues.expired,
      OptionAssigned: tradeStatusValues.assigned,
    }

    setOptionLifecycleSubmittingEvent(eventType)
    setOptionLifecycleSubmittingTradeId(tradeId)

    try {
      await submitTradeEvent(appConfig.apiBase, {
        aggregate_id: tradeId,
        event_type: eventType,
        payload: {
          status: nextStatusByEvent[eventType],
        },
      })

      await refreshTradeMutationData()
      if (selectedTradeId === tradeId) {
        setInspectorTab('overview')
      }
      setAmendError('')
    } catch (err) {
      const defaultMessageByEvent: Record<OptionLifecycleEventType, string> = {
        OptionExercised: 'Exercise option failed.',
        OptionExpired: 'Expire option failed.',
        OptionAssigned: 'Assign option failed.',
      }
      setAmendError(err instanceof Error ? err.message : defaultMessageByEvent[eventType])
    } finally {
      setOptionLifecycleSubmittingEvent(null)
      setOptionLifecycleSubmittingTradeId(null)
    }
  }

  async function handleOptionLifecycleEvent(eventType: OptionLifecycleEventType) {
    if (!selectedTradeId) {
      setAmendError('Select an option trade first.')
      return
    }

    await handleTradeOptionLifecycleEvent(selectedTradeId, eventType)
  }

  return {
    amendCounterpartyCreditPolicyPreview,
    amendError,
    amending,
    amendmentLockedReason,
    amendmentPreview,
    cancelImpactSummary,
    cancelling,
    createCounterpartyCreditPolicyPreview,
    createError,
    handleAmendTrade,
    handleCancelTrade,
    handleCreateTrade,
    handleResetCreateTradeForm,
    handleDuplicateTrade,
    handleOptionLifecycleEvent,
    handleTradeOptionLifecycleEvent,
    optionLifecycleSubmittingEvent,
    optionLifecycleSubmittingTradeId,
    submitting,
  }
}
