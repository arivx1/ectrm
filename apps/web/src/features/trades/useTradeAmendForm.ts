import { useEffect, useMemo, useState } from 'react'

import type { EventRow, PriceIndexRecord, ReferenceRecord, Trade, TradeLegDraft } from '../../shared/models'
import { ensureCurrentOption } from '../../shared/reference'
import { makeLegDraft, parseLegsFromPayload } from './useTradeCaptureForm'

export function useTradeAmendForm(
  selectedTrade: Trade | null,
  selectedTradeEvents: EventRow[],
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
) {
  const [amendTradeNatureInput, setAmendTradeNatureInput] = useState('PHYSICAL')
  const [amendTradeStructureInput, setAmendTradeStructureInput] = useState('SINGLE')
  const [amendTradeSideInput, setAmendTradeSideInput] = useState('BUY')
  const [amendBookInput, setAmendBookInput] = useState('')
  const [amendCommodityClassInput, setAmendCommodityClassInput] = useState('')
  const [amendCommodityInput, setAmendCommodityInput] = useState('')
  const [amendPricingTypeInput, setAmendPricingTypeInput] = useState('FIXED')
  const [amendPriceIndexInput, setAmendPriceIndexInput] = useState('')
  const [amendPriceInput, setAmendPriceInput] = useState('')
  const [amendVolumeInput, setAmendVolumeInput] = useState('')
  const [amendLegs, setAmendLegs] = useState<TradeLegDraft[]>([
    makeLegDraft({ leg_no: 1 }),
    makeLegDraft({ leg_no: 2, side: 'SELL' }),
  ])

  const amendCommodityOptions = useMemo(
    () =>
      ensureCurrentOption(
        activeCommodities.filter((commodity) => commodity.commodity_class === amendCommodityClassInput),
        amendCommodityInput,
        amendCommodityClassInput,
        'Current inactive or missing commodity',
      ),
    [activeCommodities, amendCommodityClassInput, amendCommodityInput],
  )

  const amendPriceIndexOptions = useMemo(
    () =>
      ensureCurrentOption(
        priceIndices.filter(
          (priceIndex) => priceIndex.is_active && (!amendCommodityInput || priceIndex.commodity_code === amendCommodityInput),
        ),
        amendPriceIndexInput,
        '',
        'Current inactive or missing price index',
      ),
    [amendCommodityInput, amendPriceIndexInput, priceIndices],
  )

  const amendBookOptions = useMemo(
    () => ensureCurrentOption(activeBooks, amendBookInput, '', 'Current inactive or missing book'),
    [activeBooks, amendBookInput],
  )

  useEffect(() => {
    if (selectedTrade) {
      setAmendTradeNatureInput(selectedTrade.trade_nature ?? 'PHYSICAL')
      setAmendTradeStructureInput(selectedTrade.trade_structure ?? 'SINGLE')
      setAmendTradeSideInput(selectedTrade.trade_side ?? 'BUY')
      setAmendBookInput(selectedTrade.book ?? '')
      setAmendCommodityClassInput(selectedTrade.commodity_class ?? '')
      setAmendCommodityInput(selectedTrade.commodity ?? '')
      setAmendPricingTypeInput(selectedTrade.pricing_type ?? 'FIXED')
      setAmendPriceIndexInput(selectedTrade.price_index_code ?? '')
      setAmendPriceInput(selectedTrade.price?.toString() ?? '')
      setAmendVolumeInput(selectedTrade.volume?.toString() ?? '')

      const latestLegs =
        selectedTradeEvents.find((event) => event.event_type === 'TradeAmended' || event.event_type === 'TradeCreated')?.payload ?? null
      const parsedLegs = parseLegsFromPayload(latestLegs)
      setAmendLegs(
        parsedLegs.length > 0
          ? parsedLegs
          : [
              makeLegDraft({
                leg_no: 1,
                side: selectedTrade.trade_side ?? 'BUY',
                commodity_class: selectedTrade.commodity_class,
                commodity: selectedTrade.commodity,
                volume: selectedTrade.volume?.toString() ?? '',
              }),
              makeLegDraft({ leg_no: 2, side: 'SELL', commodity_class: selectedTrade.commodity_class }),
            ],
      )
    } else if (!amendBookInput && activeBooks.length > 0) {
      setAmendBookInput(activeBooks[0].code)
      setAmendCommodityClassInput(commodityClassOptions[0] ?? '')
    }
  }, [activeBooks, amendBookInput, commodityClassOptions, selectedTrade, selectedTradeEvents])

  useEffect(() => {
    if (!amendCommodityClassInput) {
      return
    }
    if (!amendCommodityOptions.some((commodity) => commodity.code === amendCommodityInput)) {
      setAmendCommodityInput(amendCommodityOptions[0]?.code ?? '')
    }
  }, [amendCommodityClassInput, amendCommodityInput, amendCommodityOptions])

  useEffect(() => {
    if (amendPricingTypeInput === 'FIXED' || amendPricingTypeInput === 'FORMULA') {
      setAmendPriceIndexInput('')
      return
    }
    if (!amendPriceIndexOptions.some((priceIndex) => priceIndex.code === amendPriceIndexInput)) {
      setAmendPriceIndexInput(amendPriceIndexOptions[0]?.code ?? '')
    }
  }, [amendPriceIndexInput, amendPriceIndexOptions, amendPricingTypeInput])

  function updateDraftLeg(index: number, field: keyof TradeLegDraft, value: string) {
    setAmendLegs((current) =>
      current.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: field === 'leg_no' ? Number(value) || leg.leg_no : value,
            }
          : leg,
      ),
    )
  }

  function addDraftLeg() {
    setAmendLegs((current) => [
      ...current,
      makeLegDraft({ leg_no: current.length + 1, side: current.length % 2 === 0 ? 'BUY' : 'SELL' }),
    ])
  }

  function removeDraftLeg(index: number) {
    setAmendLegs((current) =>
      current
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, legIndex) => ({ ...leg, leg_no: legIndex + 1 })),
    )
  }

  return {
    amendTradeNatureInput,
    setAmendTradeNatureInput,
    amendTradeStructureInput,
    setAmendTradeStructureInput,
    amendTradeSideInput,
    setAmendTradeSideInput,
    amendBookInput,
    setAmendBookInput,
    amendCommodityClassInput,
    setAmendCommodityClassInput,
    amendCommodityInput,
    setAmendCommodityInput,
    amendPricingTypeInput,
    setAmendPricingTypeInput,
    amendPriceIndexInput,
    setAmendPriceIndexInput,
    amendPriceInput,
    setAmendPriceInput,
    amendVolumeInput,
    setAmendVolumeInput,
    amendLegs,
    amendBookOptions,
    amendCommodityOptions,
    amendPriceIndexOptions,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
  }
}
