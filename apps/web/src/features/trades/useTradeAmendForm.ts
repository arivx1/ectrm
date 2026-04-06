import { useMemo, useState } from 'react'

import type {
  CounterpartyRecord,
  CurrencyRecord,
  EventRow,
  LocationRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  TradeLegDraft,
  UnitRecord,
} from '../../shared/models'
import { ensureCurrentOption } from '../../shared/reference'
import {
  pricingTypeRequiresPriceIndex,
  tradeSideOptions,
  tradeStructureSupportsLegs,
} from '../../shared/trading'
import { type AmendDraft, buildAmendDraft } from './amendDraft.ts'
import { makeLegDraft } from './tradeDraftUtils'

const EMPTY_TRADE_KEY = '__none__'

export function useTradeAmendForm(
  selectedTrade: Trade | null,
  selectedTradeEvents: EventRow[],
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
  activeCounterparties: CounterpartyRecord[],
  activePortfolios: PortfolioRecord[],
  activeUnits: UnitRecord[],
  activeCurrencies: CurrencyRecord[],
  activeLocations: LocationRecord[],
) {
  const selectedTradeKey = selectedTrade?.trade_id ?? EMPTY_TRADE_KEY
  const baseDraft = useMemo(
    () => buildAmendDraft(selectedTrade, selectedTradeEvents, activeBooks, commodityClassOptions),
    [activeBooks, commodityClassOptions, selectedTrade, selectedTradeEvents],
  )
  const [draftsByTrade, setDraftsByTrade] = useState<Record<string, AmendDraft>>({})

  const draft = draftsByTrade[selectedTradeKey] ?? baseDraft
  const resolvedBookInput = draft.bookInput || activeBooks[0]?.code || ''
  const swapPrimaryLeg = tradeStructureSupportsLegs(draft.tradeStructureInput) ? draft.legs[0] : null
  const resolvedCommodityClassInput =
    swapPrimaryLeg?.commodity_class || draft.commodityClassInput || commodityClassOptions[0] || ''

  const amendCommodityOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeCommodities.filter((commodity) => commodity.commodity_class === resolvedCommodityClassInput),
        draft.commodityInput,
        resolvedCommodityClassInput,
        'Current inactive or missing commodity',
      ),
    [activeCommodities, draft.commodityInput, resolvedCommodityClassInput],
  )

  const preferredCommodityInput = swapPrimaryLeg?.commodity || draft.commodityInput
  const resolvedCommodityInput = amendCommodityOptions.some((commodity) => commodity.code === preferredCommodityInput)
    ? preferredCommodityInput
    : amendCommodityOptions[0]?.code || ''

  const amendPriceIndexOptions = useMemo(
    () =>
      ensureCurrentOption(
        priceIndices.filter(
          (priceIndex) => priceIndex.is_active && (!resolvedCommodityInput || priceIndex.commodity_code === resolvedCommodityInput),
        ),
        draft.priceIndexInput,
        '',
        'Current inactive or missing price index',
      ),
    [draft.priceIndexInput, priceIndices, resolvedCommodityInput],
  )

  const amendBookOptions = useMemo(
    () => ensureCurrentOption(activeBooks, resolvedBookInput, '', 'Current inactive or missing book'),
    [activeBooks, resolvedBookInput],
  )

  const amendPortfolioOptions = useMemo(
    () =>
      ensureCurrentOption(
        activePortfolios.filter((portfolio) => portfolio.book_code === resolvedBookInput),
        draft.portfolioInput,
        '',
        'Current inactive or missing portfolio',
      ),
    [activePortfolios, draft.portfolioInput, resolvedBookInput],
  )

  const resolvedPortfolioInput = amendPortfolioOptions.some((portfolio) => portfolio.code === draft.portfolioInput)
    ? draft.portfolioInput
    : ''
  const amendUnitOptions = useMemo(() => {
    const matchingUnits = activeUnits.filter(
      (unit) => !unit.commodity_class || unit.commodity_class === resolvedCommodityClassInput,
    )
    return ensureCurrentOption(
      matchingUnits.length > 0 ? matchingUnits : activeUnits,
      draft.unitInput,
      resolvedCommodityClassInput,
      'Current inactive or missing unit',
    )
  }, [activeUnits, draft.unitInput, resolvedCommodityClassInput])
  const amendPriceUnitOptions = useMemo(() => {
    const matchingUnits = activeUnits.filter(
      (unit) => !unit.commodity_class || unit.commodity_class === resolvedCommodityClassInput,
    )
    return ensureCurrentOption(
      matchingUnits.length > 0 ? matchingUnits : activeUnits,
      draft.priceUnitInput,
      resolvedCommodityClassInput,
      'Current inactive or missing price unit',
    )
  }, [activeUnits, draft.priceUnitInput, resolvedCommodityClassInput])

  const amendCounterpartyOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeCounterparties,
        draft.counterpartyInput,
        '',
        'Current inactive or missing counterparty',
      ),
    [activeCounterparties, draft.counterpartyInput],
  )

  const resolvedCounterpartyInput = amendCounterpartyOptions.some(
    (counterparty) => counterparty.code === draft.counterpartyInput,
  )
    ? draft.counterpartyInput
    : ''
  const amendCurrencyOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeCurrencies,
        draft.tradeCurrencyInput,
        '',
        'Current inactive or missing currency',
      ),
    [activeCurrencies, draft.tradeCurrencyInput],
  )
  const amendLocationOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeLocations,
        draft.locationInput,
        '',
        'Current inactive or missing location',
      ),
    [activeLocations, draft.locationInput],
  )

  const resolvedPriceIndexInput =
    !pricingTypeRequiresPriceIndex(draft.pricingTypeInput)
      ? ''
      : amendPriceIndexOptions.some((priceIndex) => priceIndex.code === draft.priceIndexInput)
        ? draft.priceIndexInput
        : amendPriceIndexOptions[0]?.code || ''
  const resolvedUnitInput = amendUnitOptions.some((unit) => unit.code === draft.unitInput) ? draft.unitInput : ''
  const resolvedPriceUnitInput = amendPriceUnitOptions.some((unit) => unit.code === draft.priceUnitInput)
    ? draft.priceUnitInput
    : ''
  const resolvedTradeCurrencyInput = amendCurrencyOptions.some(
    (currency) => currency.code === draft.tradeCurrencyInput,
  )
    ? draft.tradeCurrencyInput
    : ''
  const resolvedLocationInput = amendLocationOptions.some((location) => location.code === draft.locationInput)
    ? draft.locationInput
    : ''

  function updateDraft(updater: (current: AmendDraft) => AmendDraft) {
    setDraftsByTrade((current) => ({
      ...current,
      [selectedTradeKey]: updater(current[selectedTradeKey] ?? baseDraft),
    }))
  }

  function setDraftField<Key extends keyof AmendDraft>(field: Key, value: AmendDraft[Key]) {
    updateDraft((current) => ({ ...current, [field]: value }))
  }

  function updateDraftLeg(index: number, field: keyof TradeLegDraft, value: string) {
    updateDraft((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: field === 'leg_no' ? Number(value) || leg.leg_no : value,
            }
          : leg,
      ),
    }))
  }

  function addDraftLeg() {
    updateDraft((current) => ({
      ...current,
      legs: [
        ...current.legs,
        makeLegDraft({
          leg_no: current.legs.length + 1,
          side: current.legs.length % 2 === 0 ? tradeSideOptions[0] : tradeSideOptions[1],
        }),
      ],
    }))
  }

  function removeDraftLeg(index: number) {
    updateDraft((current) => ({
      ...current,
      legs: current.legs
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, legIndex) => ({ ...leg, leg_no: legIndex + 1 })),
    }))
  }

  return {
    amendExternalTradeIdInput: draft.externalTradeIdInput,
    setAmendExternalTradeIdInput: (value: string) => setDraftField('externalTradeIdInput', value),
    amendSourceSystemInput: draft.sourceSystemInput,
    amendExecutionTimestampInput: draft.executionTimestampInput,
    setAmendExecutionTimestampInput: (value: string) => setDraftField('executionTimestampInput', value),
    amendTradeDateInput: draft.tradeDateInput,
    setAmendTradeDateInput: (value: string) => setDraftField('tradeDateInput', value),
    amendEffectiveStartDateInput: draft.effectiveStartDateInput,
    setAmendEffectiveStartDateInput: (value: string) => setDraftField('effectiveStartDateInput', value),
    amendEffectiveEndDateInput: draft.effectiveEndDateInput,
    setAmendEffectiveEndDateInput: (value: string) => setDraftField('effectiveEndDateInput', value),
    amendQualitySpecInput: draft.qualitySpecInput,
    setAmendQualitySpecInput: (value: string) => setDraftField('qualitySpecInput', value),
    amendUnitInput: resolvedUnitInput,
    setAmendUnitInput: (value: string) => setDraftField('unitInput', value),
    amendTradeCurrencyInput: resolvedTradeCurrencyInput,
    setAmendTradeCurrencyInput: (value: string) => setDraftField('tradeCurrencyInput', value),
    amendCurrencyOptions,
    amendLocationInput: resolvedLocationInput,
    setAmendLocationInput: (value: string) => setDraftField('locationInput', value),
    amendLocationOptions,
    amendDeliveryStartInput: draft.deliveryStartInput,
    setAmendDeliveryStartInput: (value: string) => setDraftField('deliveryStartInput', value),
    amendDeliveryEndInput: draft.deliveryEndInput,
    setAmendDeliveryEndInput: (value: string) => setDraftField('deliveryEndInput', value),
    amendPriceUnitInput: resolvedPriceUnitInput,
    setAmendPriceUnitInput: (value: string) => setDraftField('priceUnitInput', value),
    amendPriceUnitOptions,
    amendTradeNatureInput: draft.tradeNatureInput,
    setAmendTradeNatureInput: (value: string) => setDraftField('tradeNatureInput', value),
    amendTradeStructureInput: draft.tradeStructureInput,
    setAmendTradeStructureInput: (value: string) => setDraftField('tradeStructureInput', value),
    amendTradeSideInput: draft.tradeSideInput,
    setAmendTradeSideInput: (value: string) => setDraftField('tradeSideInput', value),
    amendBookInput: resolvedBookInput,
    setAmendBookInput: (value: string) => setDraftField('bookInput', value),
    amendPortfolioInput: resolvedPortfolioInput,
    setAmendPortfolioInput: (value: string) => setDraftField('portfolioInput', value),
    amendCounterpartyInput: resolvedCounterpartyInput,
    setAmendCounterpartyInput: (value: string) => setDraftField('counterpartyInput', value),
    amendCommodityClassInput: resolvedCommodityClassInput,
    setAmendCommodityClassInput: (value: string) => setDraftField('commodityClassInput', value),
    amendCommodityInput: resolvedCommodityInput,
    setAmendCommodityInput: (value: string) => setDraftField('commodityInput', value),
    amendPricingTypeInput: draft.pricingTypeInput,
    setAmendPricingTypeInput: (value: string) => setDraftField('pricingTypeInput', value),
    amendPricingStatusInput: draft.pricingStatusInput,
    setAmendPricingStatusInput: (value: string) => setDraftField('pricingStatusInput', value),
    amendPriceIndexInput: resolvedPriceIndexInput,
    setAmendPriceIndexInput: (value: string) => setDraftField('priceIndexInput', value),
    amendPriceInput: draft.priceInput,
    setAmendPriceInput: (value: string) => setDraftField('priceInput', value),
    amendVolumeInput: draft.volumeInput,
    setAmendVolumeInput: (value: string) => setDraftField('volumeInput', value),
    amendSettlementStatusInput: draft.settlementStatusInput,
    setAmendSettlementStatusInput: (value: string) => setDraftField('settlementStatusInput', value),
    amendTraderUserInput: draft.traderUserInput,
    setAmendTraderUserInput: (value: string) => setDraftField('traderUserInput', value),
    amendLegs: draft.legs,
    amendBookOptions,
    amendPortfolioOptions,
    amendCounterpartyOptions,
    amendCommodityOptions,
    amendPriceIndexOptions,
    amendUnitOptions,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
  }
}
