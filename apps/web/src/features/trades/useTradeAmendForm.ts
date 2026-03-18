import { useMemo, useState } from 'react'

import type {
  CounterpartyRecord,
  EventRow,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  TradeLegDraft,
} from '../../shared/models'
import { ensureCurrentOption } from '../../shared/reference'
import {
  pricingTypeRequiresPriceIndex,
  tradeSideOptions,
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
) {
  const selectedTradeKey = selectedTrade?.trade_id ?? EMPTY_TRADE_KEY
  const baseDraft = useMemo(
    () => buildAmendDraft(selectedTrade, selectedTradeEvents, activeBooks, commodityClassOptions),
    [activeBooks, commodityClassOptions, selectedTrade, selectedTradeEvents],
  )
  const [draftsByTrade, setDraftsByTrade] = useState<Record<string, AmendDraft>>({})

  const draft = draftsByTrade[selectedTradeKey] ?? baseDraft
  const resolvedBookInput = draft.bookInput || activeBooks[0]?.code || ''
  const resolvedCommodityClassInput = draft.commodityClassInput || commodityClassOptions[0] || ''

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

  const resolvedCommodityInput = amendCommodityOptions.some((commodity) => commodity.code === draft.commodityInput)
    ? draft.commodityInput
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

  const resolvedPriceIndexInput =
    !pricingTypeRequiresPriceIndex(draft.pricingTypeInput)
      ? ''
      : amendPriceIndexOptions.some((priceIndex) => priceIndex.code === draft.priceIndexInput)
        ? draft.priceIndexInput
        : amendPriceIndexOptions[0]?.code || ''

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
    setAmendSourceSystemInput: (value: string) => setDraftField('sourceSystemInput', value),
    amendExecutionTimestampInput: draft.executionTimestampInput,
    setAmendExecutionTimestampInput: (value: string) => setDraftField('executionTimestampInput', value),
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
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
  }
}
