import { useEffect, useMemo, useState } from 'react'

import { loadPreTradeReviewDrift } from '../pretrade/api'
import { createTradeWorkflowItem } from '../operations/api'
import {
  submitAmendTradeTerms,
  submitBookTrade,
  submitCancelTrade,
  submitTradeEvent,
} from '../trade/api'
import { buildPreTradeWorkflowNote } from '../../features/trades/preTradeCapture'
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
  PreTradeReviewDriftRecord,
  Trade,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
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

type RefreshMutationData = (mutation: 'trade-event') => Promise<void>

export function useAppTradeActions(args: {
  authSession: StoredAuthSession | null
  captureForm: ReturnType<typeof useTradeCaptureForm>
  amendForm: ReturnType<typeof useTradeAmendForm>
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  refreshMutationData: RefreshMutationData
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
    authSession,
    captureForm,
    amendForm,
    counterpartyCreditProfiles,
    refreshMutationData,
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
  const [preTradeReviewDrift, setPreTradeReviewDrift] = useState<PreTradeReviewDriftRecord | null>(null)
  const [preTradeReviewDriftLoading, setPreTradeReviewDriftLoading] = useState(false)
  const [preTradeReviewDriftError, setPreTradeReviewDriftError] = useState('')
  const [optionLifecycleSubmittingEvent, setOptionLifecycleSubmittingEvent] =
    useState<OptionLifecycleEventType | null>(null)
  const [optionLifecycleSubmittingTradeId, setOptionLifecycleSubmittingTradeId] =
    useState<string | null>(null)
  const attachedPreTradeReviewId = captureForm.preTradeReviewContext?.reviewId ?? null

  useEffect(() => {
    if (!attachedPreTradeReviewId || !authSession?.accessToken) {
      setPreTradeReviewDrift(null)
      setPreTradeReviewDriftLoading(false)
      setPreTradeReviewDriftError('')
      return
    }

    let cancelled = false
    setPreTradeReviewDriftLoading(true)
    setPreTradeReviewDriftError('')

    loadPreTradeReviewDrift(appConfig.apiBase, authSession.accessToken, attachedPreTradeReviewId)
      .then((drift) => {
        if (cancelled) {
          return
        }
        setPreTradeReviewDrift(drift)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setPreTradeReviewDrift(null)
        setPreTradeReviewDriftError(
          error instanceof Error ? error.message : 'Could not verify approval drift.',
        )
      })
      .finally(() => {
        if (cancelled) {
          return
        }
        setPreTradeReviewDriftLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attachedPreTradeReviewId, authSession?.accessToken])

  async function refreshTradeMutationData() {
    await refreshMutationData('trade-event')
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

    if (attachedPreTradeReviewId) {
      if (preTradeReviewDriftLoading) {
        setCreateError(`Pre-trade review #${attachedPreTradeReviewId} is still being checked for approval drift.`)
        return
      }
      if (preTradeReviewDrift?.alignment_status === 'NOT_APPROVED') {
        setCreateError(`Pre-trade review #${attachedPreTradeReviewId} is no longer approved and must be re-approved before booking.`)
        return
      }
      if (preTradeReviewDrift?.requires_reapproval) {
        const detail = preTradeReviewDrift.reasons.map((reason) => reason.summary).join(' ')
        setCreateError(
          `Pre-trade review #${attachedPreTradeReviewId} must be re-approved before booking. ${detail}`.trim(),
        )
        return
      }
    }

    if (!captureForm.tradeIdInput.trim()) {
      captureForm.setTradeIdInput(submission.tradeId)
    }

    setSubmitting(true)

    try {
      const preTradeReviewId = captureForm.preTradeReviewContext?.reviewId ?? null
      const preTradeRecommendationRunId = captureForm.preTradeReviewContext?.recommendationRunId ?? null
      const preTradeWorkflowNote = captureForm.preTradeReviewContext
        ? buildPreTradeWorkflowNote(captureForm.preTradeReviewContext)
        : null

      await submitBookTrade(appConfig.apiBase, {
        trade_id: submission.tradeId,
        payload: preTradeReviewId
          ? {
              ...submission.payload,
              pretrade_review_id: preTradeReviewId,
              ...(preTradeRecommendationRunId ? { pretrade_recommendation_run_id: preTradeRecommendationRunId } : {}),
            }
          : submission.payload,
      })

      if (preTradeWorkflowNote) {
        try {
          await createTradeWorkflowItem(appConfig.apiBase, {
            trade_id: submission.tradeId,
            workflow_type: 'CONFIRMATION',
            notes: preTradeWorkflowNote,
          })
        } catch (noteError) {
          const detail = noteError instanceof Error ? noteError.message : 'The confirmation workflow note could not be attached.'
          setError(`Trade ${submission.tradeId} was created, but the approved pre-trade review could not be attached to Confirmation. ${detail}`)
        }
      }

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
      await submitAmendTradeTerms(appConfig.apiBase, {
        trade_id: selectedTradeId,
        payload: submission.payload,
        expected_last_event_id: selectedTrade.last_event_id,
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
      await submitCancelTrade(appConfig.apiBase, {
        trade_id: selectedTradeId,
        payload: {
          status: tradeStatusValues.cancelled,
          cancellation_reason: reason.trim(),
        },
        expected_last_event_id: selectedTrade.last_event_id,
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
    preTradeReviewDrift,
    preTradeReviewDriftError,
    preTradeReviewDriftLoading,
    submitting,
  }
}
