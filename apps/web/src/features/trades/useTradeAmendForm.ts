import { useMemo, useState } from 'react'

import type { EventRow, PriceIndexRecord, ReferenceRecord, Trade, TradeLegDraft } from '../../shared/models'
import { ensureCurrentOption } from '../../shared/reference'
import {
  buildDefaultTradeLegs,
  pricingTypeRequiresPriceIndex,
  tradeFormDefaults,
  tradeSideOptions,
} from '../../shared/trading'
import { makeLegDraft, parseLegsFromPayload } from './useTradeCaptureForm'

type AmendDraft = {
  tradeNatureInput: string
  tradeStructureInput: string
  tradeSideInput: string
  bookInput: string
  commodityClassInput: string
  commodityInput: string
  pricingTypeInput: string
  priceIndexInput: string
  priceInput: string
  volumeInput: string
  legs: TradeLegDraft[]
}

const EMPTY_TRADE_KEY = '__none__'

function buildAmendDraft(
  selectedTrade: Trade | null,
  selectedTradeEvents: EventRow[],
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
): AmendDraft {
  if (selectedTrade) {
    const latestLegs =
      selectedTradeEvents.find((event) => event.event_type === 'TradeAmended' || event.event_type === 'TradeCreated')?.payload ?? null
    const parsedLegs = parseLegsFromPayload(latestLegs)

    return {
      tradeNatureInput: selectedTrade.trade_nature ?? tradeFormDefaults.nature,
      tradeStructureInput: selectedTrade.trade_structure ?? tradeFormDefaults.structure,
      tradeSideInput: selectedTrade.trade_side ?? tradeFormDefaults.side,
      bookInput: selectedTrade.book ?? '',
      commodityClassInput: selectedTrade.commodity_class ?? '',
      commodityInput: selectedTrade.commodity ?? '',
      pricingTypeInput: selectedTrade.pricing_type ?? tradeFormDefaults.pricingType,
      priceIndexInput: selectedTrade.price_index_code ?? '',
      priceInput: selectedTrade.price?.toString() ?? '',
      volumeInput: selectedTrade.volume?.toString() ?? '',
      legs:
        parsedLegs.length > 0
          ? parsedLegs
          : buildDefaultTradeLegs(makeLegDraft, {
              firstLeg: {
                side: selectedTrade.trade_side ?? tradeFormDefaults.side,
                commodity_class: selectedTrade.commodity_class,
                commodity: selectedTrade.commodity,
                volume: selectedTrade.volume?.toString() ?? '',
              },
              secondLeg: {
                commodity_class: selectedTrade.commodity_class,
              },
            }),
    }
  }

  return {
    tradeNatureInput: tradeFormDefaults.nature,
    tradeStructureInput: tradeFormDefaults.structure,
    tradeSideInput: tradeFormDefaults.side,
    bookInput: activeBooks[0]?.code ?? '',
    commodityClassInput: commodityClassOptions[0] ?? '',
    commodityInput: '',
    pricingTypeInput: tradeFormDefaults.pricingType,
    priceIndexInput: '',
    priceInput: '',
    volumeInput: '',
    legs: buildDefaultTradeLegs(makeLegDraft),
  }
}

export function useTradeAmendForm(
  selectedTrade: Trade | null,
  selectedTradeEvents: EventRow[],
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
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
    amendTradeNatureInput: draft.tradeNatureInput,
    setAmendTradeNatureInput: (value: string) => setDraftField('tradeNatureInput', value),
    amendTradeStructureInput: draft.tradeStructureInput,
    setAmendTradeStructureInput: (value: string) => setDraftField('tradeStructureInput', value),
    amendTradeSideInput: draft.tradeSideInput,
    setAmendTradeSideInput: (value: string) => setDraftField('tradeSideInput', value),
    amendBookInput: resolvedBookInput,
    setAmendBookInput: (value: string) => setDraftField('bookInput', value),
    amendCommodityClassInput: resolvedCommodityClassInput,
    setAmendCommodityClassInput: (value: string) => setDraftField('commodityClassInput', value),
    amendCommodityInput: resolvedCommodityInput,
    setAmendCommodityInput: (value: string) => setDraftField('commodityInput', value),
    amendPricingTypeInput: draft.pricingTypeInput,
    setAmendPricingTypeInput: (value: string) => setDraftField('pricingTypeInput', value),
    amendPriceIndexInput: resolvedPriceIndexInput,
    setAmendPriceIndexInput: (value: string) => setDraftField('priceIndexInput', value),
    amendPriceInput: draft.priceInput,
    setAmendPriceInput: (value: string) => setDraftField('priceInput', value),
    amendVolumeInput: draft.volumeInput,
    setAmendVolumeInput: (value: string) => setDraftField('volumeInput', value),
    amendLegs: draft.legs,
    amendBookOptions,
    amendCommodityOptions,
    amendPriceIndexOptions,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
  }
}
